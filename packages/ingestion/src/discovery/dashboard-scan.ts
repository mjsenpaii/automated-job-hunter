import type { SkillEntry } from '@job-app/core';
import type { DiscoveryRequirementsExtractor } from '../controlled-job-requirements.js';
import type { GeminiRequirementsTokenUsage } from '../gemini-job-requirements.server.js';
import type {
  ControlledDiscoveryRepository,
  DiscoveryProcessingStage,
  WebDiscoveryReport,
} from './contracts.js';
import {
  DASHBOARD_PUBLIC_JOB_SCAN_TASK_ID,
  DashboardJobScanPayloadSchema,
  DashboardJobScanResultSchema,
  type DashboardJobScanFailureCode,
  type DashboardJobScanResult,
  type DashboardJobScanSourceFailure,
  type DashboardJobScanSourceSummary,
  type DashboardJobScanStage,
  type DashboardGeminiSearchMetrics,
  type DashboardTavilyMetrics,
  type DashboardWebDiscoveryMetrics,
} from './dashboard-scan-contracts.js';
import {
  ControlledPersistenceGateError,
  PUBLIC_JOB_DISCOVERY_DAILY_LIMIT,
  runDashboardPublicJobDiscoveryPersistence,
  type ControlledPublicJobDiscoveryDependencies,
  type ControlledPublicJobDiscoveryResult,
  type PublicJobDiscoverySourceStatus,
} from './orchestration.js';
import { philippineCalendarDate } from './philippine-time.js';
import { runProfileMatcherCoverageAudit } from './profile-coverage-audit.js';
import {
  createControlledDiscoveryRepositoryForRun,
  defaultDatabasePath,
  resolveWebDiscoveryDatabasePath,
} from './runtime.js';
import {
  PUBLIC_JOB_DISCOVERY_SOURCE_IDS,
  resolvePublicJobDiscoverySourceConfiguration,
} from './source-configuration.js';
import type { TavilySearchStore } from './tavily-search-store.js';
import {
  createSqliteWebDiscoveryStore,
  type WebDiscoveryStore,
} from './web-discovery-store.js';
import type { GeminiSearchClientFactory } from '../adapters/gemini-web-search.server.js';
import type { resolveHostToPublicIps } from '../adapters/url-extractor.js';

export interface DashboardJobScanDependencies {
  environmentType: string;
  killSwitchEnabled: boolean;
  taskId: string;
  runId: string;
  repository?: ControlledDiscoveryRepository;
  databasePath?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  verifiedSkills?: SkillEntry[];
  skillsPath?: string;
  requirementsExtractor?: DiscoveryRequirementsExtractor;
  now?: () => Date;
  elapsedNow?: () => number;
  onStage?: (stage: DashboardJobScanStage) => void;
  sourceEnvironment?: Readonly<Record<string, string | undefined>>;
  tavilyApiKey?: string;
  tavilySearchStore?: TavilySearchStore;
  webDiscoveryStore?: WebDiscoveryStore;
  geminiApiKey?: string;
  geminiSearchModel?: string;
  geminiSearchClientFactory?: GeminiSearchClientFactory;
  resolveHost?: typeof resolveHostToPublicIps;
}

export class DashboardJobScanGateError extends ControlledPersistenceGateError {
  constructor(
    code: 'INVALID_PAYLOAD' | 'NON_DEVELOPMENT_ENVIRONMENT' | 'KILL_SWITCH_DISABLED' | 'WRONG_TASK',
    message: string,
  ) {
    super(code, message);
    this.name = 'DashboardJobScanGateError';
  }
}

export function isDashboardJobScanKillSwitchEnabled(value: string | undefined): boolean {
  return value === 'true';
}

export interface GeminiUsageAccumulator {
  callStarted(): void;
  record(usage: GeminiRequirementsTokenUsage): void;
  result(): Pick<DashboardJobScanResult, 'geminiCalls' | 'inputTokens' | 'outputTokens' | 'totalTokens'>;
}

export function createGeminiUsageAccumulator(): GeminiUsageAccumulator {
  let calls = 0;
  let reported = 0;
  let input = 0;
  let output = 0;
  let total = 0;
  let inputAvailable = true;
  let outputAvailable = true;
  let totalAvailable = true;
  return {
    callStarted() { calls += 1; },
    record(usage) {
      reported += 1;
      if (usage.inputTokens === null) inputAvailable = false;
      else input += usage.inputTokens;
      if (usage.outputTokens === null) outputAvailable = false;
      else output += usage.outputTokens;
      if (usage.totalTokens === null) totalAvailable = false;
      else total += usage.totalTokens;
    },
    result() {
      const complete = reported === calls;
      return {
        geminiCalls: calls,
        inputTokens: calls === 0 ? 0 : complete && inputAvailable ? input : null,
        outputTokens: calls === 0 ? 0 : complete && outputAvailable ? output : null,
        totalTokens: calls === 0 ? 0 : complete && totalAvailable ? total : null,
      };
    },
  };
}

const SAFE_SOURCE_FAILURE_CODES = [
  'TIMEOUT', 'HTTP_ERROR', 'MALFORMED_JSON', 'SOURCE_SCHEMA_CHANGED',
  'SERVICE_UNAVAILABLE', 'BOARD_UNAVAILABLE', 'INVALID_CONFIGURATION',
  'ALL_BOARDS_FAILED', 'SOURCE_UNAVAILABLE', 'INVALID_RESPONSE',
  'NETWORK_ERROR', 'UNKNOWN_SAFE_ERROR', 'MISSING_API_KEY',
  'DAILY_CREDIT_LIMIT_REACHED', 'QUERY_IN_FLIGHT', 'PAGE_FETCH_FAILED',
  'MONTHLY_CREDIT_LIMIT_REACHED', 'DAILY_PROMPT_LIMIT_REACHED',
  'TAVILY_DAILY_CREDIT_LIMIT_REACHED',
  'TAVILY_MONTHLY_CREDIT_LIMIT_REACHED', 'MISSING_MODEL_CONFIGURATION',
  'QUERY_GROUPS_RECENTLY_EXHAUSTED', 'PROMPT_IN_FLIGHT', 'API_ERROR',
  'INVALID_GROUNDING_RESPONSE', 'EXTRACT_FAILED', 'PAGE_REJECTED',
] as const;

function dashboardSourceStatus(
  status: PublicJobDiscoverySourceStatus,
): DashboardJobScanSourceSummary['status'] {
  switch (status) {
    case 'ENABLED': return 'ENABLED';
    case 'DISABLED': return 'DISABLED';
    case 'PARTIAL_SUCCESS': return 'PARTIAL_FAILURE';
    case 'FAILED': return 'FAILED';
    case 'DAILY_LIMIT_REACHED': return 'DAILY_LIMIT_REACHED';
    case 'MONTHLY_LIMIT_REACHED': return 'MONTHLY_LIMIT_REACHED';
    case 'CACHED': return 'CACHED';
    case 'SUCCESS': return 'COMPLETED';
  }
}

function sourceCost(
  source: DashboardJobScanSourceSummary['source'],
): DashboardJobScanSourceSummary['costClassification'] {
  if (source === 'tavily') return 'FREE_TIER_CREDITS';
  if (source === 'lever') return 'FREE_CONFIGURED_BOARDS';
  return 'FREE';
}

type WebSourceReport = {
  status: PublicJobDiscoverySourceStatus;
  hardRejectedJobs?: number;
  eligibleScoredJobs?: number;
  profileMatchedDuplicates?: number;
  jobsThatWouldBePersisted?: number;
  tavily?: {
    searchesAttempted: number;
    searchesCompleted: number;
    cacheHits: number;
    creditsConsumed: number;
    dailyCreditsRemaining: number;
    urlsDiscovered: number;
    uniqueUrls: number;
    originalPagesFetched: number;
    pagesParsedSuccessfully: number;
    pagesRejected: number;
    directEmployerOrAtsPages: number;
  };
  web?: WebDiscoveryReport;
};

function tavilyMetrics(source: WebSourceReport | undefined): DashboardTavilyMetrics {
  const report = source?.tavily;
  const web = source?.web;
  const search = web?.tavilySearch;
  const extract = web?.tavilyExtract;
  const searchCredits = search?.searchCreditsConsumed ?? report?.creditsConsumed ?? 0;
  const extractCredits = extract?.creditsConsumed ?? 0;
  return {
    enabled: search?.enabled ??
      (report !== undefined && source?.status !== 'DISABLED'),
    status: search?.status ?? (source?.status === 'DISABLED' ? 'DISABLED' : 'FAILED'),
    searchesAttempted: search?.searchRequestsAttempted ?? report?.searchesAttempted ?? 0,
    searchesCompleted: search?.searchesCompleted ?? report?.searchesCompleted ?? 0,
    cacheHits: search?.cacheHits ?? report?.cacheHits ?? 0,
    searchCreditsConsumed: searchCredits,
    extractEnabled: extract?.enabled ?? false,
    extractStatus: extract?.status ?? 'DISABLED',
    extractUrlsAttempted: extract?.urlsAttempted ?? 0,
    extractPagesRecovered: extract?.pagesRecovered ?? 0,
    extractCreditsConsumed: extractCredits,
    totalCreditsConsumed: searchCredits + extractCredits,
    dailyCreditsUsed: search?.dailyCreditsUsed ?? 0,
    dailyCreditsReserved: search?.dailyCreditsReserved ?? 0,
    dailyCreditsConfirmed: search?.dailyCreditsConfirmed ?? 0,
    dailyCreditsRemaining: search?.dailyCreditsRemaining ?? report?.dailyCreditsRemaining ?? 0,
    monthlyCreditsUsed: search?.monthlyCreditsUsed ?? 0,
    monthlyCreditsReserved: search?.monthlyCreditsReserved ?? 0,
    monthlyCreditsConfirmed: search?.monthlyCreditsConfirmed ?? 0,
    monthlyCreditsRemaining: search?.monthlyCreditsRemaining ?? 0,
    urlsDiscovered: search?.urlsDiscovered ?? report?.urlsDiscovered ?? 0,
    uniqueUrls: web?.uniqueUrls ?? report?.uniqueUrls ?? 0,
    originalPagesFetched: web?.pagesFetchedDirectly ?? report?.originalPagesFetched ?? 0,
    pagesParsedSuccessfully: (web?.pagesParsedDirectly ?? 0) + (web?.pagesRecoveredByExtract ?? 0) || (report?.pagesParsedSuccessfully ?? 0),
    pagesRejected: web?.pagesRejected ?? report?.pagesRejected ?? 0,
    directEmployerOrAtsPages: web?.directEmployerOrAtsPages ?? report?.directEmployerOrAtsPages ?? 0,
    profileMatches:
      (source?.hardRejectedJobs ?? 0) + (source?.eligibleScoredJobs ?? 0),
    existingMatches: source?.profileMatchedDuplicates ?? 0,
    newSaveableMatches: source?.jobsThatWouldBePersisted ?? 0,
  };
}

function geminiSearchMetrics(source: WebSourceReport | undefined): DashboardGeminiSearchMetrics {
  const report = source?.web?.geminiSearch;
  return {
    enabled: report?.enabled ?? false,
    status: report?.status ?? 'DISABLED',
    promptsAttempted: report?.promptsAttempted ?? 0,
    promptsCompleted: report?.promptsCompleted ?? 0,
    cacheHits: report?.cacheHits ?? 0,
    groundedResponses: report?.groundedResponses ?? 0,
    groundedUrlsFound: report?.groundedUrlsFound ?? 0,
    uniqueUrlsContributed: report?.uniqueUrlsContributed ?? 0,
    dailyPromptsUsed: report?.dailyPromptsUsed ?? 0,
    dailyPromptsRemaining: report?.dailyPromptsRemaining ?? 0,
    inputTokens: report ? report.inputTokens : 0,
    outputTokens: report ? report.outputTokens : 0,
    totalTokens: report ? report.totalTokens : 0,
  };
}

function webDiscoveryMetrics(source: WebSourceReport | undefined): DashboardWebDiscoveryMetrics | null {
  const report = source?.web;
  return report ? {
    scanMode: report.scanMode,
    cacheStrategy: report.cacheStrategy,
    selectedQueryGroup: report.selectedQueryGroup,
    queryGroupsAttempted: [...report.queryGroupsAttempted],
    uniqueUrlCap: report.uniqueUrlCap,
    stoppingReason: report.stoppingReason,
    urlsBeforeDeduplication: report.urlsBeforeDeduplication,
    crossSourceDuplicates: report.crossSourceDuplicates,
    uniqueUrls: report.uniqueUrls,
    urlsFoundByBothSources: report.urlsFoundByBothSources,
    urlsQueuedForFetch: report.urlsQueuedForFetch,
    uniqueUrlCapReached: report.uniqueUrlCapReached,
    pagesFetchAttempted: report.pagesFetchAttempted,
    pagesFetchedDirectly: report.pagesFetchedDirectly,
    pagesParsedDirectly: report.pagesParsedDirectly,
    pagesSentToExtract: report.pagesSentToExtract,
    pagesRecoveredByExtract: report.pagesRecoveredByExtract,
    pagesRejected: report.pagesRejected,
    batchesCompleted: report.batchesCompleted,
  } : null;
}

function sourceFailureCode(value: string): DashboardJobScanSourceFailure['code'] {
  return SAFE_SOURCE_FAILURE_CODES.find((code) => code === value) ?? 'UNKNOWN_SAFE_ERROR';
}

function controlledSourceSummaries(result: ControlledPublicJobDiscoveryResult): DashboardJobScanSourceSummary[] {
  return PUBLIC_JOB_DISCOVERY_SOURCE_IDS.flatMap((source) => {
    const summary = result.sources[source];
    return summary ? [{
      source,
      status: dashboardSourceStatus(summary.status),
      costClassification: sourceCost(source),
      fetched: summary.sourceRecordsFetched,
      accepted: summary.acceptedRecords,
      invalid: summary.invalidRecords,
      duplicates: summary.duplicates,
      exclusions: summary.excludedByFilters,
      profileMatches: summary.hardRejectedJobs + summary.eligibleScoredJobs,
    }] : [];
  });
}

function controlledFailureCode(result: ControlledPublicJobDiscoveryResult): DashboardJobScanFailureCode | null {
  if (result.finalStatus === 'SOURCE_FAILED') return 'SOURCE_FAILED';
  if (result.finalStatus === 'EXTRACTION_FAILED') return 'EXTRACTION_FAILED';
  if (result.finalStatus === 'QUERY_GROUPS_RECENTLY_EXHAUSTED') {
    return 'QUERY_GROUPS_RECENTLY_EXHAUSTED';
  }
  if (result.finalStatus === 'CANCELLED') return 'CANCELLED';
  if (result.finalStatus === 'NO_DISCOVERY_SOURCES_ENABLED') {
    return 'NO_DISCOVERY_SOURCES_ENABLED';
  }
  return null;
}

function assertDashboardGates(payload: unknown, dependencies: DashboardJobScanDependencies) {
  const parsed = DashboardJobScanPayloadSchema.safeParse(payload);
  if (!parsed.success) throw new DashboardJobScanGateError('INVALID_PAYLOAD', 'Dashboard scan payload is invalid.');
  if (dependencies.taskId !== DASHBOARD_PUBLIC_JOB_SCAN_TASK_ID) {
    throw new DashboardJobScanGateError('WRONG_TASK', 'Dashboard scans are available only from the dedicated task.');
  }
  if (dependencies.environmentType !== 'DEVELOPMENT') {
    throw new DashboardJobScanGateError('NON_DEVELOPMENT_ENVIRONMENT', 'Dashboard scans are restricted to DEVELOPMENT.');
  }
  if (!dependencies.killSwitchEnabled) {
    throw new DashboardJobScanGateError('KILL_SWITCH_DISABLED', 'Dashboard scans are disabled.');
  }
  return parsed.data;
}

export async function getDashboardJobScanCapacity(options: {
  repository?: ControlledDiscoveryRepository;
  databasePath?: string;
  now?: () => Date;
  webDiscoveryStore?: WebDiscoveryStore;
  sourceEnvironment?: Readonly<Record<string, string | undefined>>;
} = {}) {
  const instant = (options.now ?? (() => new Date()))();
  const philippineDate = philippineCalendarDate(instant);
  const repository = options.repository ?? createControlledDiscoveryRepositoryForRun(
    options.databasePath ?? defaultDatabasePath(),
  );
  const state = await repository.getDailyPersistenceState({
    philippineDate,
    idempotencyKey: `dashboard-capacity:${philippineDate}`,
  });
  const sourceConfiguration = resolvePublicJobDiscoverySourceConfiguration(
    options.sourceEnvironment,
  );
  const ownedWebStore = options.webDiscoveryStore
    ? null
    : createSqliteWebDiscoveryStore(options.databasePath ?? defaultDatabasePath());
  const webStore = options.webDiscoveryStore ?? ownedWebStore;
  const deep = sourceConfiguration.deepScan && webStore
    ? await webStore.getDeepScanEligibility(instant)
    : { eligible: false, eligibleAgainAt: null };
  ownedWebStore?.close?.();
  return {
    philippineDate,
    dailyLimit: PUBLIC_JOB_DISCOVERY_DAILY_LIMIT,
    savedToday: state.persistedCount,
    remaining: state.remaining,
    deepScanEnabled: sourceConfiguration.deepScan,
    deepScanEligible: deep.eligible,
    deepScanEligibleAgainAt: deep.eligibleAgainAt,
  } as const;
}

export async function requestDashboardJobScanCancellation(options: {
  runId: string;
  databasePath?: string;
  webDiscoveryStore?: WebDiscoveryStore;
}): Promise<boolean> {
  const parsedRunId = /^run_[A-Za-z0-9]+$/.test(options.runId);
  if (!parsedRunId) return false;
  const ownedStore = options.webDiscoveryStore
    ? undefined
    : createSqliteWebDiscoveryStore(
        options.databasePath ?? defaultDatabasePath(),
      );
  const store = options.webDiscoveryStore ?? ownedStore;
  if (!store) return false;
  const cancelled = await store.requestDeepScanCancellation(options.runId);
  ownedStore?.close?.();
  return cancelled;
}

export async function runDashboardJobScan(
  unvalidatedPayload: unknown,
  dependencies: DashboardJobScanDependencies,
): Promise<DashboardJobScanResult> {
  const payload = assertDashboardGates(unvalidatedPayload, dependencies);
  const clock = dependencies.elapsedNow ?? Date.now;
  const startedAt = clock();
  const now = dependencies.now ?? (() => new Date());
  const philippineDate = philippineCalendarDate(now());
  const repository = dependencies.repository ?? createControlledDiscoveryRepositoryForRun(
    dependencies.databasePath ?? defaultDatabasePath(),
  );
  const ownedWebStore = dependencies.webDiscoveryStore
    ? undefined
    : createSqliteWebDiscoveryStore(
        resolveWebDiscoveryDatabasePath({
          databasePath: dependencies.databasePath,
          repositoryInjected: Boolean(dependencies.repository),
        }),
      );
  const webDiscoveryStore = dependencies.webDiscoveryStore ?? ownedWebStore;
  if (!webDiscoveryStore) {
    throw new DashboardJobScanGateError(
      'INVALID_PAYLOAD',
      'Web discovery storage could not initialize.',
    );
  }
  const capacity = await getDashboardJobScanCapacity({
    repository,
    now,
    webDiscoveryStore,
    sourceEnvironment: dependencies.sourceEnvironment,
  });
  const usage = createGeminiUsageAccumulator();
  let currentStage: DashboardJobScanStage = 'STARTING_SCAN';
  const emitStage = (stage: DashboardJobScanStage) => {
    currentStage = stage;
    dependencies.onStage?.(stage);
  };
  emitStage('STARTING_SCAN');

  const deep = payload.mode === 'DEEP';
  let deepStarted = false;
  if (deep) {
    if (!capacity.deepScanEnabled) {
      ownedWebStore?.close?.();
      throw new DashboardJobScanGateError(
        'KILL_SWITCH_DISABLED',
        'Deep Web Scan is disabled.',
      );
    }
    const start = await webDiscoveryStore.beginDeepScan({
      idempotencyKey: payload.idempotencyKey,
      triggerRunId: dependencies.runId,
      philippineDate,
      verifyAndSave: payload.verifyAndSave,
      now: now(),
    });
    if (start.status !== 'STARTED') {
      const already = start.status === 'ALREADY_COMPLETED' || start.status === 'ALREADY_ACTIVE';
      const early = DashboardJobScanResultSchema.parse({
        runId: dependencies.runId,
        mode: payload.mode,
        cacheStrategy: payload.cacheStrategy,
        environment: 'DEVELOPMENT',
        philippineDate,
        stage: 'COMPLETED',
        status: already ? 'ALREADY_COMPLETED' : 'DEEP_SCAN_COOLDOWN',
        activeProfileIds: ['software_development', 'ai_automation'],
        sourceSummaries: [],
        sourceFailures: [],
        tavily: tavilyMetrics(undefined),
        geminiSearch: geminiSearchMetrics(undefined),
        webDiscovery: null,
        deepScanEligibleAgainAt: start.eligibleAgainAt,
        fetched: 0,
        uniqueAccepted: 0,
        duplicates: 0,
        exclusions: 0,
        profileMatches: 0,
        existingMatches: 0,
        newSaveableMatches: 0,
        nearMatches: 0,
        selected: 0,
        selectedForGemini: 0,
        ...usage.result(),
        persistedBeforeRun: capacity.savedToday,
        persistedThisRun: 0,
        persistedAfterRun: capacity.savedToday,
        dailyRemaining: capacity.remaining,
        extractionSucceeded: 0,
        extractionFailed: 0,
        persistedJobs: [],
        idempotencyStatus: already ? 'ALREADY_COMPLETED' : 'NOT_STARTED',
        failureCode: already ? null : 'DEEP_SCAN_COOLDOWN',
        failedStage: null,
        elapsedMs: Math.max(0, clock() - startedAt),
        applicationsCreated: 0,
        submissionsCreated: 0,
      });
      ownedWebStore?.close?.();
      return early;
    }
    deepStarted = true;
  }

  const previewOnly = payload.mode === 'PREVIEW' ||
    (payload.mode === 'DEEP' && !payload.verifyAndSave);
  if (previewOnly) {
    emitStage('FETCHING_JOBS');
    let audit: Awaited<ReturnType<typeof runProfileMatcherCoverageAudit>>;
    try {
      audit = await runProfileMatcherCoverageAudit({
      repository,
      fetchImpl: dependencies.fetchImpl,
      timeoutMs: dependencies.timeoutMs,
      verifiedSkills: dependencies.verifiedSkills,
      skillsPath: dependencies.skillsPath,
      now,
      sourceEnvironment: dependencies.sourceEnvironment,
      tavilyApiKey: dependencies.tavilyApiKey,
      tavilySearchStore: dependencies.tavilySearchStore,
      webDiscoveryStore,
      geminiApiKey: dependencies.geminiApiKey,
      geminiSearchModel: dependencies.geminiSearchModel,
      geminiSearchClientFactory: dependencies.geminiSearchClientFactory,
      webScanOptions: {
        scanMode: deep ? 'DEEP' : 'NORMAL',
        cacheStrategy: deep ? 'FRESH' : payload.cacheStrategy,
        confirmRecentlyExhausted: payload.confirmRecentlyExhausted,
        runKey: dependencies.runId,
        deepScanIdempotencyKey: deep ? payload.idempotencyKey : undefined,
      },
      onWebDiscoveryStage: (stage) => emitStage(stage),
      resolveHost: dependencies.resolveHost,
      onSourceStart: () => emitStage('FETCHING_JOBS'),
      onProcessingStage: (stage: DiscoveryProcessingStage) => emitStage(stage),
      });
    } catch (error) {
      if (deepStarted) {
        await webDiscoveryStore.completeDeepScan({
          idempotencyKey: payload.idempotencyKey,
          state: 'FAILED',
          stoppingReason: 'SAFETY_LIMIT_REACHED',
          now: now(),
        });
      }
      ownedWebStore?.close?.();
      throw error;
    }
    const sourceSummaries = PUBLIC_JOB_DISCOVERY_SOURCE_IDS.flatMap((source) => {
      const summary = audit.sources[source];
      return summary ? [{
        source,
        status: dashboardSourceStatus(summary.status),
        costClassification: sourceCost(source),
        fetched: summary.sourceRecordsFetched,
        accepted: summary.acceptedRecords,
        invalid: summary.invalidRecords,
        duplicates: summary.duplicates,
        exclusions: summary.excludedByFilters,
        profileMatches: summary.profileMatches,
      }] : [];
    });
    const sourceFailures = PUBLIC_JOB_DISCOVERY_SOURCE_IDS.flatMap((source) => {
      const report = audit.sources[source];
      if (!report) return [];
      return [
        ...(report.safeFailureCode && !report.tavily
          ? [{ source, code: sourceFailureCode(report.safeFailureCode) }]
          : []),
        ...report.safeCompanyFailures.map((failure) => ({
          source,
          companyId: failure.companyId,
          code: sourceFailureCode(failure.code),
        })),
        ...((report.web
          ? report.web.tavilySearch.sourceFailures
          : report.tavily?.sourceFailures ?? [])).map((failure) => ({
          source,
          provider: 'TAVILY_SEARCH' as const,
          code: sourceFailureCode(failure.code),
          ...(failure.queryId ? { queryId: failure.queryId } : {}),
        })),
        ...(report.web?.geminiSearch.sourceFailures ?? []).map((failure) => ({
          source,
          provider: 'GEMINI_SEARCH' as const,
          code: sourceFailureCode(failure.code),
          queryId: failure.promptId,
          providerCategory: failure.providerCategory,
          providerStatus: failure.providerStatus,
          requestReachedProvider: failure.requestReachedProvider,
          quotaReserved: failure.quotaReserved,
          quotaReleased: failure.quotaReleased,
          groundedUrlsReturned: failure.groundedUrlsReturned,
        })),
        ...(report.web?.tavilyExtract.sourceFailures ?? []).map((failure) => ({
          source,
          provider: 'TAVILY_EXTRACT' as const,
          code: sourceFailureCode(failure.code),
        })),
      ];
    });
    const enabledSourceSummaries = sourceSummaries.filter(
      (source) => source.status !== 'DISABLED',
    );
    const noSourcesEnabled = audit.finalStatus === 'NO_DISCOVERY_SOURCES_ENABLED';
    const allSourcesFailed = enabledSourceSummaries.length > 0 &&
      enabledSourceSummaries.every((source) =>
        ['FAILED', 'DAILY_LIMIT_REACHED', 'MONTHLY_LIMIT_REACHED'].includes(source.status),
      );
    const web = audit.sources.tavily?.web;
    const cancelled = web?.stoppingReason === 'CANCELLED';
    const exhausted = web?.stoppingReason === 'QUERY_GROUPS_RECENTLY_EXHAUSTED';
    const warnings = sourceFailures.length > 0 && !allSourcesFailed;
    const finalStage: DashboardJobScanStage = cancelled
      ? 'CANCELLED'
      : allSourcesFailed
        ? 'FAILED'
        : warnings ? 'COMPLETED_WITH_SOURCE_WARNINGS' : 'COMPLETED';
    emitStage(finalStage);
    const previewResult = DashboardJobScanResultSchema.parse({
      runId: dependencies.runId,
      mode: payload.mode,
      cacheStrategy: deep ? 'FRESH' : payload.cacheStrategy,
      environment: 'DEVELOPMENT',
      philippineDate,
      stage: finalStage,
      status: cancelled
        ? 'CANCELLED'
        : exhausted
          ? 'QUERY_GROUPS_RECENTLY_EXHAUSTED'
      : noSourcesEnabled
        ? 'NO_DISCOVERY_SOURCES_ENABLED'
        : allSourcesFailed
        ? 'FAILED'
        : warnings
        ? 'COMPLETED_WITH_SOURCE_WARNINGS'
        : audit.combinedTotals.profileMatches === 0 ? 'NO_MATCHES' : 'COMPLETED',
      activeProfileIds: audit.activeProfileIds,
      sourceSummaries,
      sourceFailures,
      tavily: tavilyMetrics(audit.sources.tavily),
      geminiSearch: geminiSearchMetrics(audit.sources.tavily),
      webDiscovery: webDiscoveryMetrics(audit.sources.tavily),
      deepScanEligibleAgainAt: deep
        ? new Date(now().getTime() + 7 * 24 * 60 * 60 * 1_000).toISOString()
        : capacity.deepScanEligibleAgainAt,
      fetched: audit.combinedTotals.sourceRecordsFetched,
      uniqueAccepted: audit.combinedTotals.uniqueAccepted,
      duplicates: audit.combinedTotals.duplicates,
      exclusions: audit.combinedTotals.excludedByFilters,
      profileMatches: audit.combinedTotals.profileMatches,
      existingMatches: audit.combinedTotals.existingMatches,
      newSaveableMatches: audit.combinedTotals.newSaveableMatches,
      nearMatches: audit.combinedTotals.nearMatches,
      selected: 0,
      selectedForGemini: 0,
      ...usage.result(),
      persistedBeforeRun: capacity.savedToday,
      persistedThisRun: 0,
      persistedAfterRun: capacity.savedToday,
      dailyRemaining: capacity.remaining,
      extractionSucceeded: 0,
      extractionFailed: 0,
      persistedJobs: [],
      idempotencyStatus: 'NOT_STARTED',
      failureCode: exhausted
        ? 'QUERY_GROUPS_RECENTLY_EXHAUSTED'
        : cancelled
          ? 'CANCELLED'
      : noSourcesEnabled
        ? 'NO_DISCOVERY_SOURCES_ENABLED'
        : allSourcesFailed ? 'SOURCE_FAILED' : null,
      failedStage: allSourcesFailed ? 'FETCHING_JOBS' : null,
      elapsedMs: Math.max(0, clock() - startedAt),
      applicationsCreated: 0,
      submissionsCreated: 0,
    });
    if (deepStarted) {
      await webDiscoveryStore.completeDeepScan({
        idempotencyKey: payload.idempotencyKey,
        state: cancelled ? 'CANCELLED' : allSourcesFailed ? 'FAILED' : 'COMPLETED',
        stoppingReason: web?.stoppingReason ?? (allSourcesFailed ? 'NO_SOURCES_AVAILABLE' : 'COMPLETED'),
        now: now(),
      });
    }
    ownedWebStore?.close?.();
    return previewResult;
  }

  const nearMatchIdentities = new Set<string>();
  const controlledDependencies: ControlledPublicJobDiscoveryDependencies = {
    environmentType: dependencies.environmentType,
    killSwitchEnabled: dependencies.killSwitchEnabled,
    taskId: dependencies.taskId,
    repository,
    fetchImpl: dependencies.fetchImpl,
    timeoutMs: dependencies.timeoutMs,
    verifiedSkills: dependencies.verifiedSkills,
    skillsPath: dependencies.skillsPath,
    requirementsExtractor: dependencies.requirementsExtractor,
    now,
    sourceEnvironment: dependencies.sourceEnvironment,
    tavilyApiKey: dependencies.tavilyApiKey,
    tavilySearchStore: dependencies.tavilySearchStore,
    webDiscoveryStore,
    geminiApiKey: dependencies.geminiApiKey,
    geminiSearchModel: dependencies.geminiSearchModel,
    geminiSearchClientFactory: dependencies.geminiSearchClientFactory,
    webScanOptions: {
      scanMode: deep ? 'DEEP' : 'NORMAL',
      cacheStrategy: deep ? 'FRESH' : payload.cacheStrategy,
      confirmRecentlyExhausted: payload.confirmRecentlyExhausted,
      runKey: dependencies.runId,
      deepScanIdempotencyKey: deep ? payload.idempotencyKey : undefined,
    },
    onWebDiscoveryStage: (stage) => emitStage(stage),
    resolveHost: dependencies.resolveHost,
    onSourceStart: () => emitStage('FETCHING_JOBS'),
    onProcessingStage: (stage) => emitStage(stage),
    diagnosticCollector: {
      record(event) {
        const hasSignals = event.profileDecisions.some(
          (decision) => decision.positiveSignals.length > 0,
        );
        const hasMatch = event.profileDecisions.some(
          (decision) => decision.matched,
        );
        if (hasSignals && (event.stage === 'LOCAL_FILTER' || !hasMatch)) {
          nearMatchIdentities.add(
            event.normalizedId ?? `${event.sourceName}:${event.sourceJobId}`,
          );
        }
      },
    },
    onRequirementsExtractionStart: () => {
      usage.callStarted();
      emitStage('VERIFYING_WITH_GEMINI');
    },
    onGeminiUsage: (value) => usage.record(value),
    onPersistenceStart: () => emitStage('SAVING_VERIFIED_JOBS'),
  };
  let result: ControlledPublicJobDiscoveryResult;
  try {
    result = await runDashboardPublicJobDiscoveryPersistence(
      payload,
      controlledDependencies,
    );
  } catch (error) {
    if (deepStarted) {
      await webDiscoveryStore.completeDeepScan({
        idempotencyKey: payload.idempotencyKey,
        state: 'FAILED',
        stoppingReason: 'SAFETY_LIMIT_REACHED',
        now: now(),
      });
    }
    ownedWebStore?.close?.();
    throw error;
  }
  const sourceWeb = result.sources.tavily;
  const web = sourceWeb?.web;
  const cancelled = result.finalStatus === 'CANCELLED' ||
    web?.stoppingReason === 'CANCELLED';
  const exhausted = result.finalStatus === 'QUERY_GROUPS_RECENTLY_EXHAUSTED' ||
    web?.stoppingReason === 'QUERY_GROUPS_RECENTLY_EXHAUSTED';
  const failed = result.finalStatus === 'SOURCE_FAILED' || result.finalStatus === 'EXTRACTION_FAILED';
  const warnings = result.sourceFailures.length > 0 && !failed;
  const status = cancelled ? 'CANCELLED'
    : exhausted ? 'QUERY_GROUPS_RECENTLY_EXHAUSTED'
    : failed ? 'FAILED'
    : result.finalStatus === 'DAILY_CAP_REACHED' ? 'DAILY_CAP_REACHED'
      : result.finalStatus === 'ALREADY_COMPLETED' ? 'ALREADY_COMPLETED'
        : result.finalStatus === 'NO_DISCOVERY_SOURCES_ENABLED'
          ? 'NO_DISCOVERY_SOURCES_ENABLED'
        : warnings ? 'COMPLETED_WITH_SOURCE_WARNINGS'
        : result.selectedForPersistence === 0 ? 'NO_MATCHES' : 'COMPLETED';
  const finalStage: DashboardJobScanStage = cancelled
    ? 'CANCELLED'
    : failed
      ? 'FAILED'
      : warnings
        ? 'COMPLETED_WITH_SOURCE_WARNINGS'
        : 'COMPLETED';
  const failedStage = failed ? currentStage : null;
  emitStage(finalStage);
  const dashboardResult = DashboardJobScanResultSchema.parse({
    runId: dependencies.runId,
    mode: payload.mode,
    cacheStrategy: deep ? 'FRESH' : payload.cacheStrategy,
    environment: 'DEVELOPMENT',
    philippineDate,
    stage: finalStage,
    status,
    activeProfileIds: result.activeProfileIds,
    sourceSummaries: controlledSourceSummaries(result),
    sourceFailures: result.sourceFailures.map((failure) => ({
      source: failure.source,
      code: sourceFailureCode(failure.code),
      ...(failure.provider ? { provider: failure.provider } : {}),
      ...(failure.providerCategory
        ? { providerCategory: failure.providerCategory }
        : {}),
      ...(failure.providerStatus !== undefined
        ? { providerStatus: failure.providerStatus }
        : {}),
      ...(failure.requestReachedProvider !== undefined
        ? { requestReachedProvider: failure.requestReachedProvider }
        : {}),
      ...(failure.quotaReserved !== undefined
        ? { quotaReserved: failure.quotaReserved }
        : {}),
      ...(failure.quotaReleased !== undefined
        ? { quotaReleased: failure.quotaReleased }
        : {}),
      ...(failure.groundedUrlsReturned !== undefined
        ? { groundedUrlsReturned: failure.groundedUrlsReturned }
        : {}),
      ...(failure.companyId ? { companyId: failure.companyId } : {}),
      ...(failure.queryId ? { queryId: failure.queryId } : {}),
    })),
    tavily: tavilyMetrics(result.sources.tavily),
    geminiSearch: geminiSearchMetrics(result.sources.tavily),
    webDiscovery: webDiscoveryMetrics(result.sources.tavily),
    deepScanEligibleAgainAt: deep
      ? new Date(now().getTime() + 7 * 24 * 60 * 60 * 1_000).toISOString()
      : capacity.deepScanEligibleAgainAt,
    fetched: result.combinedTotals.sourceRecordsFetched,
    uniqueAccepted: result.combinedTotals.acceptedRecords,
    duplicates: result.combinedTotals.duplicates,
    exclusions: result.combinedTotals.excludedByFilters,
    profileMatches: result.combinedTotals.hardRejectedJobs + result.combinedTotals.eligibleScoredJobs,
    existingMatches: Object.values(result.sources).reduce(
      (total, source) => total + (source?.profileMatchedDuplicates ?? 0),
      0,
    ),
    newSaveableMatches: result.qualifiedBeforeCap,
    nearMatches: nearMatchIdentities.size,
    selected: result.selectedForPersistence,
    selectedForGemini: result.selectedForPersistence,
    ...usage.result(),
    persistedBeforeRun: result.persistedBeforeRun,
    persistedThisRun: result.jobsPersisted,
    persistedAfterRun: result.persistedAfterRun,
    dailyRemaining: result.dailyRemaining,
    extractionSucceeded: result.extractionSucceeded,
    extractionFailed: result.extractionFailed,
    persistedJobs: result.persistedJobs,
    idempotencyStatus: result.idempotencyStatus,
    failureCode: controlledFailureCode(result),
    failedStage,
    elapsedMs: Math.max(0, clock() - startedAt),
    applicationsCreated: 0,
    submissionsCreated: 0,
  });
  if (deepStarted) {
    await webDiscoveryStore.completeDeepScan({
      idempotencyKey: payload.idempotencyKey,
      state: failed ? 'FAILED' : web?.stoppingReason === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED',
      stoppingReason: web?.stoppingReason ?? (failed ? 'NO_SOURCES_AVAILABLE' : 'COMPLETED'),
      now: now(),
    });
  }
  ownedWebStore?.close?.();
  return dashboardResult;
}
