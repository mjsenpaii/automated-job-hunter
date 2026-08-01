import { createHash } from 'node:crypto';
import type { SkillEntry } from '@job-app/core';
import { RemotiveAdapter } from '../adapters/remotive.js';
import type { GeminiSearchClientFactory } from '../adapters/gemini-web-search.server.js';
import type { resolveHostToPublicIps } from '../adapters/url-extractor.js';
import { extractFromUrl, type ExtractionResult } from '../adapters/url-extractor.js';
import { philippineCalendarDate } from '../discovery/philippine-time.js';
import type {
  WebDiscoveryQuotaCaps,
  WebDiscoveryStore,
} from '../discovery/web-discovery-store.js';
import {
  FreelanceOpportunityCandidateSchema,
  FreelanceOpportunitySchema,
  FreelancePreviewOpportunitySummarySchema,
  FreelanceScanPayloadSchema,
  FreelanceScanResultSchema,
  FreelanceSourceSummarySchema,
  FREELANCE_SCAN_TASK_ID,
  type FreelanceOpportunity,
  type FreelanceOpportunityCandidate,
  type FreelancePreviewOpportunitySummary,
  type FreelanceScanPayload,
  type FreelanceScanResult,
} from './contracts.js';
import {
  buildFreelanceOpportunity,
  diagnoseFreelanceOpportunityReadiness,
  extractFreelanceQualificationSkills,
  freelanceIdentityKey,
  freelanceSemanticIdentityKey,
  parseExplicitFreelancePayText,
} from './classification.js';
import type { FreelanceDiscoveryConfiguration } from './configuration.js';
import {
  HIMALAYAS_CACHE_TTL_MS,
  HimalayasFreelanceAdapter,
  type FreelanceAdapterResult,
} from './adapters/himalayas.js';
import { RemotiveFreelanceAdapter } from './adapters/remotive.js';
import type { FreelanceRepository } from './repository.js';
import {
  discoverFreelanceWebOpportunities,
  type FreelanceWebSourceReport,
} from './web-discovery.js';

const NO_KEY_SOURCE_CACHE_KEY = 'freelance-v1';

export interface FreelanceScanDependencies {
  environmentType: string;
  taskId: string;
  runId: string;
  configuration: FreelanceDiscoveryConfiguration;
  repository: FreelanceRepository;
  verifiedSkills: readonly SkillEntry[];
  webStore: WebDiscoveryStore;
  webCaps: WebDiscoveryQuotaCaps;
  tavilyApiKey: string;
  geminiApiKey: string;
  geminiSearchModel: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
  resolveHost?: typeof resolveHostToPublicIps;
  geminiClientFactory?: GeminiSearchClientFactory;
  himalayasAdapter?: HimalayasFreelanceAdapter;
  remotiveAdapter?: RemotiveFreelanceAdapter;
}

export class FreelanceScanGateError extends Error {
  constructor(
    readonly code:
      | 'INVALID_PAYLOAD'
      | 'NON_DEVELOPMENT_ENVIRONMENT'
      | 'KILL_SWITCH_DISABLED'
      | 'WRONG_TASK',
    message: string,
  ) {
    super(message);
    this.name = 'FreelanceScanGateError';
  }
}

function emptyAdapterResult(): FreelanceAdapterResult {
  return {
    requestsAttempted: 0,
    requestsCompleted: 0,
    recordsFetched: 0,
    invalidRecords: 0,
    rejectedNonFreelance: 0,
    candidates: [],
    failures: [],
  };
}

function emptySourceSummary(
  source: 'HIMALAYAS' | 'REMOTIVE' | 'TAVILY' | 'GEMINI_SEARCH',
  enabled: boolean,
) {
  return FreelanceSourceSummarySchema.parse({
    source,
    status: enabled ? 'ENABLED' : 'DISABLED',
    costClassification: source === 'HIMALAYAS'
      ? 'FREE_NO_API_KEY'
      : source === 'REMOTIVE'
        ? 'FREE_PUBLIC_API_NO_KEY'
        : source === 'TAVILY'
          ? 'API_CREDITS'
          : 'API_QUOTA',
    requestsAttempted: 0,
    requestsCompleted: 0,
    cacheHits: 0,
    listingsFetched: 0,
    accepted: 0,
    attributionPreserved: true,
    searchCreditsConsumed: 0,
    extractCreditsConsumed: 0,
    dailyCreditsUsed: 0,
    dailyCreditsRemaining: 0,
    monthlyCreditsUsed: 0,
    monthlyCreditsRemaining: 0,
    dailyPromptsUsed: 0,
    dailyPromptsRemaining: 0,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    providerResponseReached: null,
    quotaReservationReleased: null,
    failures: [],
  });
}

async function collectCachedSource(options: {
  source: 'HIMALAYAS' | 'REMOTIVE';
  enabled: boolean;
  cacheStrategy: 'CACHED' | 'FRESH';
  repository: FreelanceRepository;
  now: Date;
  fetchFresh(): Promise<FreelanceAdapterResult>;
}): Promise<{ result: FreelanceAdapterResult; cacheHit: boolean }> {
  if (!options.enabled) return { result: emptyAdapterResult(), cacheHit: false };
  if (options.cacheStrategy === 'CACHED') {
    const cached = await options.repository.getCandidateCache(
      options.source,
      NO_KEY_SOURCE_CACHE_KEY,
      options.now,
    );
    if (cached) {
      const candidates = FreelanceOpportunityCandidateSchema.array().safeParse(cached);
      if (candidates.success) {
        return {
          result: { ...emptyAdapterResult(), candidates: candidates.data, recordsFetched: candidates.data.length },
          cacheHit: true,
        };
      }
    }
    return { result: emptyAdapterResult(), cacheHit: false };
  }
  const fresh = await options.fetchFresh();
  if (fresh.failures.length === 0) {
    await options.repository.putCandidateCache(
      options.source,
      NO_KEY_SOURCE_CACHE_KEY,
      fresh.candidates,
      options.now,
      HIMALAYAS_CACHE_TTL_MS,
    );
  }
  return { result: fresh, cacheHit: false };
}

function sourceSummaryFromAdapter(
  source: 'HIMALAYAS' | 'REMOTIVE',
  enabled: boolean,
  result: FreelanceAdapterResult,
  cacheHit: boolean,
) {
  const base = emptySourceSummary(source, enabled);
  if (!enabled) return base;
  return FreelanceSourceSummarySchema.parse({
    ...base,
    status: cacheHit
      ? 'CACHED'
      : result.failures.length > 0
        ? result.candidates.length > 0 ? 'PARTIAL_FAILURE' : 'FAILED'
        : 'COMPLETED',
    requestsAttempted: result.requestsAttempted,
    requestsCompleted: result.requestsCompleted,
    cacheHits: cacheHit ? 1 : 0,
    listingsFetched: result.recordsFetched,
    accepted: result.candidates.length,
    failures: [...new Set(result.failures)].slice(0, 20),
  });
}

function webSummaries(
  configuration: FreelanceDiscoveryConfiguration,
  report: FreelanceWebSourceReport | null,
) {
  const tavilyBase = emptySourceSummary('TAVILY', configuration.sources.tavily);
  const geminiBase = emptySourceSummary('GEMINI_SEARCH', configuration.sources.geminiSearch);
  if (!report) return [tavilyBase, geminiBase] as const;
  return [
    FreelanceSourceSummarySchema.parse({
      ...tavilyBase,
      status: report.tavily.status,
      requestsAttempted: report.tavily.requestsAttempted,
      requestsCompleted: report.tavily.requestsCompleted,
      cacheHits: report.tavily.cacheHits,
      listingsFetched: report.tavily.urlsDiscovered,
      accepted: report.tavily.pagesParsed,
      originalPagesFetched: report.tavily.originalPagesFetched,
      validOpportunityPages: report.tavily.validOpportunityPages,
      nonOpportunityPages: report.tavily.nonOpportunityPages,
      duplicateOrRepostPages: report.tavily.duplicateOrRepostPages,
      pagesRecoveredByExtract: report.tavily.pagesRecoveredByExtract,
      pagesWithSufficientTaskScope: report.tavily.pagesWithSufficientTaskScope,
      pagesWithInsufficientTaskScope: report.tavily.pagesWithInsufficientTaskScope,
      queriesUsed: report.tavily.queriesUsed,
      queryYields: report.tavily.queryYields,
      searchCreditsConsumed: report.tavily.searchCredits,
      extractCreditsConsumed: report.tavily.extractCredits,
      dailyCreditsUsed: report.usage.tavilyDailyUsed,
      dailyCreditsRemaining: report.usage.tavilyDailyRemaining,
      monthlyCreditsUsed: report.usage.tavilyMonthlyUsed,
      monthlyCreditsRemaining: report.usage.tavilyMonthlyRemaining,
      failures: [...new Set(report.tavily.failures)].slice(0, 20),
    }),
    FreelanceSourceSummarySchema.parse({
      ...geminiBase,
      status: report.geminiSearch.status,
      requestsAttempted: report.geminiSearch.promptsAttempted,
      requestsCompleted: report.geminiSearch.promptsCompleted,
      cacheHits: report.geminiSearch.cacheHits,
      listingsFetched: report.geminiSearch.groundedUrlsFound,
      accepted: report.geminiSearch.uniqueUrlsContributed,
      dailyPromptsUsed: report.geminiSearch.dailyPromptsUsed,
      dailyPromptsRemaining: report.geminiSearch.dailyPromptsRemaining,
      inputTokens: report.geminiSearch.inputTokens,
      outputTokens: report.geminiSearch.outputTokens,
      totalTokens: report.geminiSearch.totalTokens,
      providerResponseReached: report.geminiSearch.promptsCompleted > 0
        ? true
        : report.geminiSearch.sourceFailures.length > 0
          ? report.geminiSearch.sourceFailures.some((failure) => failure.requestReachedProvider)
          : null,
      quotaReservationReleased: report.geminiSearch.sourceFailures.length > 0
        ? report.geminiSearch.sourceFailures.every((failure) => failure.quotaReleased)
        : null,
      failures: [...new Set(report.geminiSearch.sourceFailures.map(
        (failure) => failure.providerCategory,
      ))].slice(0, 20),
    }),
  ] as const;
}

function deduplicateCandidates(
  candidates: readonly FreelanceOpportunityCandidate[],
): FreelanceOpportunityCandidate[] {
  const unique = new Map<string, FreelanceOpportunityCandidate>();
  const semanticKeys = new Map<string, string>();
  for (const candidate of candidates) {
    const canonicalKey = freelanceIdentityKey(candidate);
    const semanticKey = freelanceSemanticIdentityKey(candidate);
    const key = unique.has(canonicalKey)
      ? canonicalKey
      : semanticKeys.get(semanticKey) ?? canonicalKey;
    const existing = unique.get(key);
    if (!existing) {
      unique.set(key, candidate);
      semanticKeys.set(semanticKey, key);
      continue;
    }
    const sourceAttributions = [...existing.sourceAttributions];
    for (const attribution of candidate.sourceAttributions) {
      if (!sourceAttributions.some((item) =>
        item.source === attribution.source &&
        item.sourceIdentifier === attribution.sourceIdentifier)) {
        sourceAttributions.push(attribution);
      }
    }
    unique.set(key, {
      ...(candidate.publicDescription.length > existing.publicDescription.length
        ? candidate
        : existing),
      sourceAttributions,
    });
    semanticKeys.set(semanticKey, key);
  }
  return [...unique.values()];
}

function resultCounts(opportunities: readonly FreelanceOpportunity[]) {
  return {
    aboveMinimum: opportunities.filter((item) => item.pay.classification === 'ABOVE_MINIMUM').length,
    unknownPay: opportunities.filter((item) => ['UNKNOWN', 'FIXED_PRICE_SCOPE_REQUIRED', 'NON_USD_UNCONVERTED'].includes(item.pay.classification)).length,
    readyNow: opportunities.filter((item) => item.readiness.classification === 'READY_NOW').length,
    learnableFast: opportunities.filter((item) => item.readiness.classification === 'LEARNABLE_FAST_WITH_AI').length,
    notReady: opportunities.filter((item) => item.readiness.classification === 'NOT_READY').length,
    hardRejected: opportunities.filter((item) => item.risk.level === 'HARD_REJECTED').length,
  };
}

function readinessDiagnostics(
  opportunities: readonly FreelanceOpportunity[],
  verifiedSkills: readonly SkillEntry[],
) {
  const diagnostics = opportunities.map((opportunity) =>
    diagnoseFreelanceOpportunityReadiness(opportunity, verifiedSkills),
  );
  const blockerCounts = new Map<NonNullable<(typeof diagnostics)[number]['primaryBlocker']>, number>();
  for (const diagnostic of diagnostics) {
    if (diagnostic.primaryBlocker === null) continue;
    blockerCounts.set(
      diagnostic.primaryBlocker,
      (blockerCounts.get(diagnostic.primaryBlocker) ?? 0) + 1,
    );
  }
  const requiresReview = diagnostics.filter((diagnostic) =>
    diagnostic.scamRisk !== 'HARD_REJECTED' && (
      diagnostic.complianceStatus === 'REQUIRES_REVIEW' ||
      diagnostic.geographicEligibility === 'REQUIRES_REVIEW' ||
      diagnostic.blockerCodes.includes('PAY_UNKNOWN')
    ),
  ).length;
  return {
    requiresReview,
    reviewScopeManually: diagnostics.filter(
      (diagnostic) => diagnostic.resultState === 'REVIEW_SCOPE_MANUALLY',
    ).length,
    validIndividualOpportunities: diagnostics.filter(
      (diagnostic) => diagnostic.individualOpportunityPage,
    ).length,
    duplicateOrRepostPages: diagnostics.filter(
      (diagnostic) => diagnostic.pageType === 'REPOST_OR_AGGREGATOR',
    ).length,
    pagesWithSufficientTaskScope: diagnostics.filter(
      (diagnostic) => diagnostic.taskScopeEvidenceCount > 0,
    ).length,
    pagesWithInsufficientTaskScope: diagnostics.filter(
      (diagnostic) => diagnostic.taskScopeEvidenceCount === 0,
    ).length,
    readinessBlockers: [...blockerCounts]
      .map(([code, count]) => ({ code, count }))
      .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code)),
    readinessDiagnostics: diagnostics.slice(0, 20),
  };
}

function previewPublicUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function buildFreelancePreviewOpportunitySummaries(
  opportunities: readonly FreelanceOpportunity[],
  verifiedSkills: readonly SkillEntry[],
  now = new Date(),
): { total: number; items: FreelancePreviewOpportunitySummary[] } {
  const eligible: FreelancePreviewOpportunitySummary[] = [];
  for (const opportunity of opportunities) {
    const url = previewPublicUrl(opportunity.canonicalUrl);
    if (!url) continue;
    const diagnostic = diagnoseFreelanceOpportunityReadiness(opportunity, verifiedSkills);
    if (!diagnostic.individualOpportunityPage) continue;
    eligible.push(FreelancePreviewOpportunitySummarySchema.parse({
      temporaryResultId: opportunity.id,
      title: opportunity.title,
      clientOrCompany: opportunity.clientOrCompany || null,
      source: opportunity.source,
      sourceDomain: url.hostname.toLocaleLowerCase(),
      originalUrl: url.toString(),
      publishedAt: opportunity.publishedAt,
      contractType: opportunity.contractType,
      remote: opportunity.remote,
      geographicEligibility: diagnostic.geographicEligibility,
      views: opportunity.views,
      originalPayText: opportunity.pay.evidenceLabel,
      payClassification: opportunity.pay.classification,
      readiness: opportunity.readiness.classification,
      resultState: diagnostic.resultState,
      primaryBlocker: diagnostic.primaryBlocker,
      matchedCategories: opportunity.opportunityCategories,
      transferableSkills: opportunity.readiness.transferableSkills.slice(0, 5),
      missingSkills: opportunity.readiness.missingSkills.slice(0, 5),
      taskScope: {
        status: diagnostic.taskScopeEvidenceCount > 0 ? 'SUFFICIENT' : 'INSUFFICIENT',
        evidenceCount: diagnostic.taskScopeEvidenceCount,
        requiredSkillEvidenceCount: diagnostic.requiredSkillEvidenceCount,
      },
      learning: opportunity.readiness.classification === 'LEARNABLE_FAST_WITH_AI'
        ? {
            minimumHours: opportunity.readiness.learningHoursMinimum,
            maximumHours: opportunity.readiness.learningHoursMaximum,
            timeUncertain: opportunity.readiness.learningTimeUncertain,
            practiceRequirements: opportunity.readiness.practiceBeforeApplying.slice(0, 3),
            suggestedSampleProject: opportunity.readiness.suggestedSampleProject,
            deliveryRisks: opportunity.readiness.deliveryRisks.slice(0, 3),
          }
        : null,
      scamRisk: opportunity.risk.level,
      riskIndicators: opportunity.risk.reasons.slice(0, 3),
      aggregatorOrRepost: diagnostic.pageType === 'REPOST_OR_AGGREGATOR',
      recommendedAction: opportunity.readiness.recommendedAction,
      expired: opportunity.status === 'EXPIRED' || (
        opportunity.expiresAt !== null && Date.parse(opportunity.expiresAt) < now.getTime()
      ),
    }));
  }
  return { total: eligible.length, items: eligible.slice(0, 20) };
}

function validateGate(payload: unknown, dependencies: FreelanceScanDependencies): FreelanceScanPayload {
  const parsed = FreelanceScanPayloadSchema.safeParse(payload);
  if (!parsed.success) throw new FreelanceScanGateError('INVALID_PAYLOAD', 'Freelance scan payload is invalid.');
  if (dependencies.environmentType !== 'DEVELOPMENT') {
    throw new FreelanceScanGateError('NON_DEVELOPMENT_ENVIRONMENT', 'Freelance scans are development-only.');
  }
  if (!dependencies.configuration.enabled) {
    throw new FreelanceScanGateError('KILL_SWITCH_DISABLED', 'Freelance discovery is disabled.');
  }
  if (dependencies.taskId !== FREELANCE_SCAN_TASK_ID) {
    throw new FreelanceScanGateError('WRONG_TASK', 'Freelance scan used an unsupported task.');
  }
  return parsed.data;
}

export async function runFreelanceOpportunityScan(
  payloadInput: unknown,
  dependencies: FreelanceScanDependencies,
): Promise<FreelanceScanResult> {
  const payload = validateGate(payloadInput, dependencies);
  const nowFn = dependencies.now ?? (() => new Date());
  const startedAt = nowFn();
  const philippineDate = philippineCalendarDate(startedAt);
  const sourceFlags = dependencies.configuration.sources;
  const noSources = !sourceFlags.himalayas && !sourceFlags.remotive &&
    !sourceFlags.tavily && !sourceFlags.geminiSearch;
  const baseSources = [
    emptySourceSummary('HIMALAYAS', sourceFlags.himalayas),
    emptySourceSummary('REMOTIVE', sourceFlags.remotive),
    emptySourceSummary('TAVILY', sourceFlags.tavily),
    emptySourceSummary('GEMINI_SEARCH', sourceFlags.geminiSearch),
  ];
  const daily = await dependencies.repository.getDailyState(
    philippineDate,
    payload.idempotencyKey,
    dependencies.configuration.dailySaveCap,
  );
  if (await dependencies.repository.isScanCompleted(payload.idempotencyKey)) {
    return FreelanceScanResultSchema.parse({
      runId: dependencies.runId, mode: payload.mode, environment: 'DEVELOPMENT',
      philippineDate, status: 'ALREADY_COMPLETED', sourceSummaries: baseSources,
      fetched: 0, unique: 0, aboveMinimum: 0, unknownPay: 0,
      readyNow: 0, learnableFast: 0, notReady: 0, hardRejected: 0,
      selected: 0, savedThisRun: 0, savedBeforeRun: daily.savedToday,
      savedAfterRun: daily.savedToday, dailyRemaining: daily.remaining,
      geminiSearchPrompts: 0, geminiVerificationCalls: 0,
      applicationsCreated: 0, submissionsCreated: 0, proposalsSent: 0,
      bidsPlaced: 0, messagesSent: 0, idempotencyStatus: 'ALREADY_COMPLETED',
      elapsedMs: Math.max(0, nowFn().getTime() - startedAt.getTime()),
    });
  }
  if (payload.mode === 'SAVE' && (daily.remaining === 0 || daily.idempotencyStatus === 'ALREADY_COMPLETED')) {
    return FreelanceScanResultSchema.parse({
      runId: dependencies.runId, mode: payload.mode, environment: 'DEVELOPMENT',
      philippineDate, status: daily.remaining === 0 ? 'DAILY_CAP_REACHED' : 'ALREADY_COMPLETED', sourceSummaries: baseSources,
      fetched: 0, unique: 0, aboveMinimum: 0, unknownPay: 0,
      readyNow: 0, learnableFast: 0, notReady: 0, hardRejected: 0,
      selected: 0, savedThisRun: 0, savedBeforeRun: daily.savedToday,
      savedAfterRun: daily.savedToday, dailyRemaining: daily.remaining,
      geminiSearchPrompts: 0, geminiVerificationCalls: 0,
      applicationsCreated: 0, submissionsCreated: 0, proposalsSent: 0,
      bidsPlaced: 0, messagesSent: 0,
      idempotencyStatus: daily.idempotencyStatus,
      elapsedMs: Math.max(0, nowFn().getTime() - startedAt.getTime()),
    });
  }
  if (noSources) {
    return FreelanceScanResultSchema.parse({
      runId: dependencies.runId, mode: payload.mode, environment: 'DEVELOPMENT',
      philippineDate, status: 'NO_SOURCES_ENABLED', sourceSummaries: baseSources,
      fetched: 0, unique: 0, aboveMinimum: 0, unknownPay: 0,
      readyNow: 0, learnableFast: 0, notReady: 0, hardRejected: 0,
      selected: 0, savedThisRun: 0, savedBeforeRun: daily.savedToday,
      savedAfterRun: daily.savedToday, dailyRemaining: daily.remaining,
      geminiSearchPrompts: 0, geminiVerificationCalls: 0,
      applicationsCreated: 0, submissionsCreated: 0, proposalsSent: 0,
      bidsPlaced: 0, messagesSent: 0, idempotencyStatus: 'NOT_STARTED',
      elapsedMs: Math.max(0, nowFn().getTime() - startedAt.getTime()),
    });
  }

  const himalayasAdapter = sourceFlags.himalayas
    ? dependencies.himalayasAdapter ?? new HimalayasFreelanceAdapter({
        fetchImpl: dependencies.fetchImpl,
        timeoutMs: dependencies.timeoutMs,
      })
    : null;
  const remotiveAdapter = sourceFlags.remotive
    ? dependencies.remotiveAdapter ?? new RemotiveFreelanceAdapter(
        new RemotiveAdapter({
          fetchImpl: dependencies.fetchImpl,
          timeoutMs: dependencies.timeoutMs,
        }),
      )
    : null;
  const [himalayas, remotive] = await Promise.all([
    collectCachedSource({
      source: 'HIMALAYAS', enabled: sourceFlags.himalayas,
      cacheStrategy: payload.cacheStrategy, repository: dependencies.repository,
      now: startedAt,
      fetchFresh: () => himalayasAdapter!.fetchOpportunities({ pages: 2, pageSize: 20, sort: 'recent' }),
    }).catch(() => ({ result: { ...emptyAdapterResult(), failures: ['SOURCE_UNAVAILABLE'] }, cacheHit: false })),
    collectCachedSource({
      source: 'REMOTIVE', enabled: sourceFlags.remotive,
      cacheStrategy: payload.cacheStrategy, repository: dependencies.repository,
      now: startedAt,
      fetchFresh: () => remotiveAdapter!.fetchOpportunities(50),
    }).catch(() => ({ result: { ...emptyAdapterResult(), failures: ['SOURCE_UNAVAILABLE'] }, cacheHit: false })),
  ]);

  let web: Awaited<ReturnType<typeof discoverFreelanceWebOpportunities>> | null = null;
  if (sourceFlags.tavily || sourceFlags.geminiSearch) {
    try {
      web = await discoverFreelanceWebOpportunities({
        tavilyEnabled: sourceFlags.tavily,
        geminiSearchEnabled: sourceFlags.geminiSearch,
        tavilyExtractEnabled: dependencies.configuration.tavilyExtractEnabled,
        tavilyApiKey: dependencies.tavilyApiKey,
        geminiApiKey: dependencies.geminiApiKey,
        geminiSearchModel: dependencies.geminiSearchModel,
        store: dependencies.webStore,
        caps: dependencies.webCaps,
        philippineDate,
        cacheStrategy: payload.cacheStrategy,
        mostRecentGroupId: await dependencies.repository.mostRecentQueryGroup(),
        fetchImpl: dependencies.fetchImpl,
        timeoutMs: dependencies.timeoutMs,
        now: nowFn,
        resolveHost: dependencies.resolveHost,
        geminiClientFactory: dependencies.geminiClientFactory,
      });
    } catch {
      web = null;
    }
  }

  const sourceCandidates = [
    ...himalayas.result.candidates,
    ...remotive.result.candidates,
    ...(web?.candidates ?? []),
  ];
  const candidates = deduplicateCandidates(sourceCandidates);
  const opportunities = candidates.map((candidate) => buildFreelanceOpportunity({
    candidate,
    verifiedSkills: dependencies.verifiedSkills,
    minimumHourlyUsd: dependencies.configuration.minimumHourlyUsd,
    maxLearningHours: dependencies.configuration.fastLearningMaxHours,
    now: startedAt,
  })).sort((left, right) => right.rankingScore - left.rankingScore || left.identityKey.localeCompare(right.identityKey));
  const counts = resultCounts(opportunities);
  const diagnostics = readinessDiagnostics(opportunities, dependencies.verifiedSkills);
  const preview = payload.mode === 'PREVIEW'
    ? buildFreelancePreviewOpportunitySummaries(
        opportunities,
        dependencies.verifiedSkills,
        startedAt,
      )
    : { total: 0, items: [] };
  const sourceSummaries = [
    sourceSummaryFromAdapter('HIMALAYAS', sourceFlags.himalayas, himalayas.result, himalayas.cacheHit),
    sourceSummaryFromAdapter('REMOTIVE', sourceFlags.remotive, remotive.result, remotive.cacheHit),
    ...webSummaries(dependencies.configuration, web?.report ?? null),
  ];
  let savedThisRun = 0;
  let savedAfterRun = daily.savedToday;
  let dailyRemaining = daily.remaining;
  let idempotencyStatus: FreelanceScanResult['idempotencyStatus'] = 'NOT_STARTED';
  let selected = 0;
  if (payload.mode === 'SAVE') {
    const eligible = opportunities.filter((item) =>
      ['LOW', 'MEDIUM'].includes(item.risk.level) &&
      !['HARD_REJECTED', 'EXPIRED'].includes(item.status) &&
      ['READY_NOW', 'LEARNABLE_FAST_WITH_AI'].includes(item.readiness.classification));
    selected = Math.min(daily.remaining, eligible.length);
    const persisted = await dependencies.repository.persistBatch({
      opportunities: eligible,
      philippineDate,
      idempotencyKey: payload.idempotencyKey,
      taskId: dependencies.taskId,
      dailyLimit: dependencies.configuration.dailySaveCap,
    });
    savedThisRun = persisted.savedThisRun;
    savedAfterRun = persisted.savedAfterRun;
    dailyRemaining = persisted.remaining;
    idempotencyStatus = persisted.idempotencyStatus;
  }
  const warnings = sourceSummaries.some((source) =>
    ['FAILED', 'PARTIAL_FAILURE', 'DAILY_LIMIT_REACHED', 'MONTHLY_LIMIT_REACHED'].includes(source.status));
  const completedAt = nowFn();
  await dependencies.repository.recordScan({
    payload,
    runId: dependencies.runId,
    philippineDate,
    queryGroupId: web?.report.queryGroupId ?? null,
    state: 'COMPLETED',
    savedCount: savedThisRun,
    startedAt,
    completedAt,
  });
  return FreelanceScanResultSchema.parse({
    runId: dependencies.runId,
    mode: payload.mode,
    environment: 'DEVELOPMENT',
    philippineDate,
    status: opportunities.length === 0
      ? warnings ? 'COMPLETED_WITH_SOURCE_WARNINGS' : 'NO_RESULTS'
      : warnings ? 'COMPLETED_WITH_SOURCE_WARNINGS' : 'COMPLETED',
    sourceSummaries,
    fetched: himalayas.result.recordsFetched + remotive.result.recordsFetched + (web?.report.urlsBeforeDeduplication ?? 0),
    sourceCandidatesBeforeDedup: sourceCandidates.length,
    candidatesMergedByDedup: Math.max(0, sourceCandidates.length - candidates.length),
    unique: opportunities.length,
    nonOpportunityPagesRejected: web?.report.nonOpportunityPages ?? 0,
    ...counts,
    ...diagnostics,
    previewOpportunityTotal: preview.total,
    previewOpportunities: preview.items,
    selected,
    savedThisRun,
    savedBeforeRun: daily.savedToday,
    savedAfterRun,
    dailyRemaining,
    geminiSearchPrompts: web?.report.geminiSearch.promptsAttempted ?? 0,
    geminiVerificationCalls: 0,
    applicationsCreated: 0,
    submissionsCreated: 0,
    proposalsSent: 0,
    bidsPlaced: 0,
    messagesSent: 0,
    idempotencyStatus,
    elapsedMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
  });
}

export interface ManualFreelanceImportDependencies {
  extractor?: (url: string) => Promise<ExtractionResult>;
  verifiedSkills: readonly SkillEntry[];
  minimumHourlyUsd?: number;
  maxLearningHours?: number;
  now?: Date;
}

const PREVIEW_SOURCE_COST = {
  HIMALAYAS: 'FREE_NO_API_KEY',
  REMOTIVE: 'FREE_PUBLIC_API_NO_KEY',
  TAVILY: 'API_CREDITS',
  GEMINI_SEARCH: 'API_QUOTA',
  MANUAL: 'MANUAL_PUBLIC_URL',
} as const;

export function preparePreviewOpportunityForReview(
  imported: FreelanceOpportunity,
  summaryInput: unknown,
): FreelanceOpportunity {
  const summary = FreelancePreviewOpportunitySummarySchema.parse(summaryInput);
  if (summary.resultState === 'HARD_REJECTED' || summary.expired) {
    throw new Error('PREVIEW_OPPORTUNITY_NOT_SAVEABLE');
  }
  const sourceIdentifier = `preview:${summary.temporaryResultId}`;
  return FreelanceOpportunitySchema.parse({
    ...imported,
    source: summary.source,
    sourceIdentifier,
    publishedAt: imported.publishedAt ?? summary.publishedAt,
    sourceAttributions: [{
      source: summary.source,
      sourceIdentifier,
      sourceUrl: summary.originalUrl,
      costClassification: PREVIEW_SOURCE_COST[summary.source],
    }],
  });
}

export async function prepareManualFreelanceImport(
  url: string,
  dependencies: ManualFreelanceImportDependencies,
): Promise<FreelanceOpportunity> {
  const extracted = await (dependencies.extractor ?? extractFromUrl)(url);
  if (!extracted.success || !extracted.data?.title || !extracted.data.company ||
      !extracted.data.description || extracted.data.description.trim().length < 80) {
    throw new Error('MANUAL_FREELANCE_PAGE_UNPARSEABLE');
  }
  const text = extracted.data.description;
  const employment = extracted.data.employment_type ?? '';
  if (!/\b(freelance|contract|part[- ]time|temporary|project[- ]based|independent contractor)\b/i.test(`${employment}\n${text}`)) {
    throw new Error('MANUAL_URL_NOT_CLEAR_FREELANCE');
  }
  const canonicalUrl = extracted.data.application_url ?? url;
  const sourceIdentifier = createHash('sha256').update(canonicalUrl).digest('hex');
  const skills = extractFreelanceQualificationSkills(text);
  const candidate = FreelanceOpportunityCandidateSchema.parse({
    source: 'MANUAL',
    sourceIdentifier,
    canonicalUrl,
    title: extracted.data.title,
    clientOrCompany: extracted.data.company,
    publicDescription: text,
    publishedAt: null,
    expiresAt: null,
    clientCountry: extracted.data.country,
    applicantGeographicRestrictions: extracted.data.allowed_regions ?? extracted.data.allowed_countries ?? [],
    timezoneRestrictions: [],
    remote: extracted.data.work_setup === 'REMOTE' ? true : null,
    contractType: /part[- ]time/i.test(employment) ? 'PART_TIME'
      : /temporary/i.test(employment) ? 'TEMPORARY'
        : /contract/i.test(employment) ? 'CONTRACTOR'
          : 'PROJECT',
    pay: parseExplicitFreelancePayText(extracted.data.salary_text),
    requiredSkills: skills.required,
    preferredSkills: skills.preferred,
    minimumExperienceYears: null,
    seniority: extracted.data.seniority ? [extracted.data.seniority] : [],
    categoryHints: [],
    sourceAttributions: [{
      source: 'MANUAL', sourceIdentifier, sourceUrl: canonicalUrl,
      costClassification: 'MANUAL_PUBLIC_URL',
    }],
  });
  return buildFreelanceOpportunity({
    candidate,
    verifiedSkills: dependencies.verifiedSkills,
    minimumHourlyUsd: dependencies.minimumHourlyUsd,
    maxLearningHours: dependencies.maxLearningHours,
    now: dependencies.now,
  });
}
