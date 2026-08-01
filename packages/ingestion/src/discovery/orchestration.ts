import type { SkillEntry } from '@job-app/core';
import { z } from 'zod';
import {
  ArbeitnowAdapter,
  ArbeitnowDiscoveryError,
} from '../adapters/arbeitnow.js';
import {
  LeverAdapter,
  LeverDiscoveryError,
} from '../adapters/lever.js';
import {
  RemotiveAdapter,
  RemotiveDiscoveryError,
} from '../adapters/remotive.js';
import { TavilyDiscoveryError } from '../adapters/tavily.js';
import {
  CombinedWebDiscoveryAdapter,
  type CombinedWebDiscoveryOptions,
  type CombinedWebDiscoveryStage,
} from '../adapters/combined-web-discovery.js';
import type { GeminiSearchClientFactory } from '../adapters/gemini-web-search.server.js';
import type {
  ControlledDiscoveryRepository,
  ControlledPersistenceIdempotencyStatus,
  ControlledPersistenceWriteResult,
  DiscoveryPreview,
  DiscoveryPersistenceRecord,
  DiscoveryCompanyFetchFailure,
  DiscoveryDeduplicationContext,
  DiscoveryProfileStats,
  DiscoveryRepository,
  DiscoveryRunSummary,
  DiscoverySourceAdapter,
  DiscoveryProcessingStage,
  TavilyFetchReport,
  WebDiscoveryReport,
} from './contracts.js';
import type { DiscoveryDiagnosticCollector } from './profile-coverage-diagnostics.js';
import type { GeminiSearchProviderFailureCategory } from './gemini-search-contracts.js';
import {
  getEnabledJobSearchProfileIds,
  getJobSearchProfileDisplayName,
  JobSearchProfileIdListSchema,
  type JobSearchProfileId,
} from './job-search-profiles.v1.js';
import { getScheduleRetrievalHints } from './profile-retrieval-hints.v1.js';
import { resolveLeverCompanies } from './lever-selection.js';
import {
  createControlledDiscoveryRepositoryForRun,
  createDryRunRepositorySession,
  defaultDatabasePath,
  defaultSkillsPath,
  loadVerifiedSkills,
  resolveWebDiscoveryDatabasePath,
} from './runtime.js';
import {
  finalizeDiscoveryDeduplicationContext,
  materializeDiscoveryRunSummary,
  runDiscovery,
  type DiscoveryIdentityFinalization,
} from './runner.js';
import {
  enrichControlledPersistenceCandidate,
  type DiscoveryRequirementsExtractor,
} from '../controlled-job-requirements.js';
import type { GeminiRequirementsTokenUsage } from '../gemini-job-requirements.server.js';
import {
  DASHBOARD_PUBLIC_JOB_SCAN_TASK_ID,
  DashboardJobScanPayloadSchema,
} from './dashboard-scan-contracts.js';
import {
  PUBLIC_JOB_DISCOVERY_SOURCE_IDS,
  hasEnabledDiscoverySource,
  resolvePublicJobDiscoverySourceConfiguration,
  type PublicJobDiscoverySourceConfiguration,
} from './source-configuration.js';
import type { TavilySearchStore } from './tavily-search-store.js';
import {
  createSqliteWebDiscoveryStore,
  resolveWebDiscoveryQuotaCaps,
  type WebDiscoveryStore,
} from './web-discovery-store.js';
import type { resolveHostToPublicIps } from '../adapters/url-extractor.js';

const DEFAULT_LEVER_COMPANIES = ['spotify', 'highspot', 'aleph'] as const;

const LeverCompanyIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !/^https?:\/\//i.test(value) && !value.includes('/'), {
    message:
      'Lever company identifiers must not be URLs, hosts, or arbitrary paths.',
  });

export const PublicJobDiscoveryDryRunPayloadSchema = z
  .object({
    arbeitnowEnabled: z.boolean().default(true),
    remotiveEnabled: z.boolean().default(true),
    leverEnabled: z.boolean().default(true),
    query: z.string().default('developer'),
    category: z.string().default(''),
    remoteOnly: z.boolean().default(true),
    arbeitnowLimit: z.number().int().min(1).max(50).default(50),
    remotiveLimit: z.number().int().min(1).max(50).default(50),
    leverLimit: z.number().int().min(1).max(100).default(50),
    leverCompanies: z
      .array(LeverCompanyIdentifierSchema)
      .default([...DEFAULT_LEVER_COMPANIES]),
    profileIds: JobSearchProfileIdListSchema.optional(),
    scheduleGroup: z.enum(['MORNING', 'EVENING']).optional(),
    cacheStrategy: z.enum(['CACHED', 'FRESH']).default('CACHED'),
    confirmRecentlyExhausted: z.boolean().default(false),
  })
  .strict();
export type PublicJobDiscoveryDryRunPayload = z.infer<
  typeof PublicJobDiscoveryDryRunPayloadSchema
>;

export const CONTROLLED_PUBLIC_JOB_DISCOVERY_TASK_ID =
  'public-job-discovery-controlled-persistence';
export const CONTROLLED_PUBLIC_JOB_DISCOVERY_KILL_SWITCH =
  'JOB_DISCOVERY_CONTROLLED_PERSISTENCE_ENABLED';
export const SCHEDULED_MORNING_PUBLIC_JOB_DISCOVERY_TASK_ID =
  'public-job-discovery-morning-dry-run';
export const SCHEDULED_PUBLIC_JOB_DISCOVERY_KILL_SWITCH =
  'JOB_DISCOVERY_SCHEDULED_PERSISTENCE_ENABLED';
export { PUBLIC_JOB_DISCOVERY_DAILY_LIMIT } from './limits.js';
import { PUBLIC_JOB_DISCOVERY_DAILY_LIMIT } from './limits.js';
export {
  philippineCalendarDate,
  PUBLIC_JOB_DISCOVERY_TIMEZONE,
} from './philippine-time.js';
import {
  philippineCalendarDate,
  PUBLIC_JOB_DISCOVERY_TIMEZONE,
} from './philippine-time.js';

export const ControlledPublicJobDiscoveryPayloadSchema = z
  .object({
    scheduleGroup: z.enum(['MORNING', 'EVENING']),
    persistenceMode: z.literal('CONTROLLED'),
    maxJobsToPersist: z.number().int().min(1).max(5),
    idempotencyKey: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
        'Idempotency key contains unsupported characters.',
      ),
  })
  .strict();
export type ControlledPublicJobDiscoveryPayload = z.infer<
  typeof ControlledPublicJobDiscoveryPayloadSchema
>;

export type ControlledPersistenceGateErrorCode =
  | 'INVALID_PAYLOAD'
  | 'NON_DEVELOPMENT_ENVIRONMENT'
  | 'KILL_SWITCH_DISABLED'
  | 'WRONG_TASK';

export class ControlledPersistenceGateError extends Error {
  constructor(
    readonly code: ControlledPersistenceGateErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ControlledPersistenceGateError';
  }
}

export const ControlledSourceFailureCodeSchema = z.enum([
  'TIMEOUT',
  'HTTP_ERROR',
  'MALFORMED_JSON',
  'SOURCE_SCHEMA_CHANGED',
  'SERVICE_UNAVAILABLE',
  'BOARD_UNAVAILABLE',
  'INVALID_CONFIGURATION',
  'ALL_BOARDS_FAILED',
  'SOURCE_UNAVAILABLE',
  'INVALID_RESPONSE',
  'NETWORK_ERROR',
  'UNKNOWN_SAFE_ERROR',
  'MISSING_API_KEY',
  'DAILY_CREDIT_LIMIT_REACHED',
  'MONTHLY_CREDIT_LIMIT_REACHED',
  'TAVILY_DAILY_CREDIT_LIMIT_REACHED',
  'TAVILY_MONTHLY_CREDIT_LIMIT_REACHED',
  'DAILY_PROMPT_LIMIT_REACHED',
  'QUERY_GROUPS_RECENTLY_EXHAUSTED',
  'QUERY_IN_FLIGHT',
  'PROMPT_IN_FLIGHT',
  'API_ERROR',
  'INVALID_GROUNDING_RESPONSE',
  'EXTRACT_FAILED',
  'PAGE_FETCH_FAILED',
  'PAGE_REJECTED',
]);
export type ControlledSourceFailureCode = z.infer<
  typeof ControlledSourceFailureCodeSchema
>;

export interface ControlledSourceFailure {
  source: PublicJobDiscoverySourceName;
  code: ControlledSourceFailureCode;
  provider?: 'TAVILY_SEARCH' | 'GEMINI_SEARCH' | 'TAVILY_EXTRACT';
  providerCategory?: GeminiSearchProviderFailureCategory;
  providerStatus?: number | null;
  requestReachedProvider?: boolean;
  quotaReserved?: boolean;
  quotaReleased?: boolean;
  groundedUrlsReturned?: number;
  companyId?: string;
  queryId?: string;
}

export interface ControlledPersistedJobPreview {
  title: string;
  company: string;
  source: string;
  matchedProfileIds: JobSearchProfileId[];
  status: 'DISCOVERED' | 'HARD_REJECTED';
  recommendation: string | null;
}

export interface ControlledPublicJobDiscoveryResult {
  mode: 'CONTROLLED';
  environment: 'DEVELOPMENT';
  scheduleGroup: 'MORNING' | 'EVENING';
  runKind: 'MANUAL_CONTROLLED' | 'SCHEDULED_MORNING' | 'DASHBOARD_SCAN';
  philippineDate: string;
  dailyLimit: 5;
  persistedBeforeRun: number;
  remainingBeforeRun: number;
  selected: number;
  persistedThisRun: number;
  persistedAfterRun: number;
  dailyRemaining: number;
  finalStatus:
    | 'COMPLETED'
    | 'ALREADY_COMPLETED'
    | 'DAILY_CAP_REACHED'
    | 'SOURCE_FAILED'
    | 'EXTRACTION_FAILED'
    | 'QUERY_GROUPS_RECENTLY_EXHAUSTED'
    | 'CANCELLED'
    | 'NO_DISCOVERY_SOURCES_ENABLED';
  activeProfileIds: JobSearchProfileId[];
  persistenceGates: {
    developmentEnvironment: true;
    killSwitchEnabled: true;
    controlledPayloadApproved: true;
  };
  persistenceLimit: number;
  idempotencyStatus: ControlledPersistenceIdempotencyStatus;
  sources: Partial<
    Record<PublicJobDiscoverySourceName, PublicJobDiscoverySourceResult>
  >;
  profileSummaries: PublicJobDiscoveryProfileSummary[];
  combinedTotals: PublicJobDiscoveryCombinedTotals;
  qualifiedBeforeCap: number;
  skippedBecauseOfCap: number;
  selectedForPersistence: number;
  selectedAfterExtraction: number;
  extractionSucceeded: number;
  extractionFailed: number;
  jobsPersisted: number;
  scoresPersisted: number;
  finalDatabaseDuplicates: number;
  applicationsCreated: 0;
  submissionsCreated: 0;
  sourceFailures: ControlledSourceFailure[];
  persistedJobs: ControlledPersistedJobPreview[];
  persistenceEnabled: true;
}

export class PublicJobDiscoveryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicJobDiscoveryValidationError';
  }
}

export type PublicJobDiscoverySourceName =
  | 'tavily'
  | 'arbeitnow'
  | 'remotive'
  | 'lever';

export type PublicJobDiscoverySourceStatus =
  | 'ENABLED'
  | 'SUCCESS'
  | 'PARTIAL_SUCCESS'
  | 'FAILED'
  | 'DISABLED'
  | 'CACHED'
  | 'DAILY_LIMIT_REACHED'
  | 'MONTHLY_LIMIT_REACHED';

export interface PublicJobDiscoverySourceError {
  code: string;
  message: string;
}

export interface PublicJobDiscoverySourceResult {
  status: PublicJobDiscoverySourceStatus;
  sourceRecordsFetched: number;
  acceptedRecords: number;
  invalidRecords: number;
  excludedByFilters: number;
  duplicates: number;
  profileMatchedDuplicates: number;
  hardRejectedJobs: number;
  eligibleScoredJobs: number;
  pipelineErrors: number;
  jobsThatWouldBePersisted: number;
  jobsPersisted: number;
  fetchRequests?: number;
  fetchRequestsAttempted?: number;
  fetchRequestsCompleted?: number;
  configuredCompanies?: string[];
  attemptedCompanies?: string[];
  successfulCompanies?: string[];
  failedCompanies?: DiscoveryCompanyFetchFailure[];
  untargeted?: number;
  vibeCodingRolesFound?: number;
  preview: DiscoveryPreview[];
  profileStats?: DiscoveryProfileStats[];
  tavily?: TavilyFetchReport;
  web?: WebDiscoveryReport;
  error?: PublicJobDiscoverySourceError;
}

export interface PublicJobDiscoveryCombinedTotals {
  sourceRecordsFetched: number;
  acceptedRecords: number;
  invalidRecords: number;
  excludedByFilters: number;
  duplicates: number;
  hardRejectedJobs: number;
  eligibleScoredJobs: number;
  pipelineErrors: number;
  jobsThatWouldBePersisted: number;
  jobsPersisted: number;
  untargeted: number;
  vibeCodingRolesFound: number;
}

export interface PublicJobDiscoveryProfileSummary {
  profileId: JobSearchProfileId;
  profileLabel: string;
  recordsMatched: number;
  hardRejectedJobs: number;
  eligibleScoredJobs: number;
  jobsThatWouldBePersisted: number;
  duplicates: number;
  preview: DiscoveryPreview[];
}

export interface PublicJobDiscoveryDryRunResult {
  mode: 'DRY_RUN';
  finalStatus: 'COMPLETED' | 'NO_DISCOVERY_SOURCES_ENABLED';
  startedAt: string;
  completedAt: string;
  query: string;
  activeProfileIds: JobSearchProfileId[];
  sources: Partial<
    Record<PublicJobDiscoverySourceName, PublicJobDiscoverySourceResult>
  >;
  profileSummaries: PublicJobDiscoveryProfileSummary[];
  combinedTotals: PublicJobDiscoveryCombinedTotals;
  combinedPreview: DiscoveryPreview[];
  persistenceEnabled: false;
  applicationsCreated: 0;
  submissionsCreated: 0;
}

export interface PublicJobDiscoveryDryRunDependencies {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  repository?: DiscoveryRepository;
  verifiedSkills?: SkillEntry[];
  databasePath?: string;
  skillsPath?: string;
  now?: () => Date;
  onSourceStart?: (source: PublicJobDiscoverySourceName) => void;
  diagnosticCollector?: DiscoveryDiagnosticCollector;
  onProcessingStage?: (stage: DiscoveryProcessingStage) => void;
  sourceEnvironment?: Readonly<Record<string, string | undefined>>;
  tavilyApiKey?: string;
  geminiApiKey?: string;
  geminiSearchModel?: string;
  tavilySearchStore?: TavilySearchStore;
  webDiscoveryStore?: WebDiscoveryStore;
  webScanOptions?: Partial<CombinedWebDiscoveryOptions>;
  geminiSearchClientFactory?: GeminiSearchClientFactory;
  onWebDiscoveryStage?: (stage: CombinedWebDiscoveryStage) => void;
  resolveHost?: typeof resolveHostToPublicIps;
}

export interface ControlledPublicJobDiscoveryDependencies
  extends Omit<PublicJobDiscoveryDryRunDependencies, 'repository'> {
  environmentType: string;
  killSwitchEnabled: boolean;
  taskId: string;
  repository?: ControlledDiscoveryRepository;
  requirementsExtractor?: DiscoveryRequirementsExtractor;
  onRequirementsExtractionStart?: () => void;
  onGeminiUsage?: (usage: GeminiRequirementsTokenUsage) => void;
  onPersistenceStart?: () => void;
}

export interface ScheduledMorningPublicJobDiscoveryDependencies
  extends Omit<ControlledPublicJobDiscoveryDependencies, 'taskId'> {
  taskId?: string;
}

interface PublicJobDiscoveryEvaluation {
  result: PublicJobDiscoveryDryRunResult;
  finalization: DiscoveryIdentityFinalization;
}

const fixedDiscoveryBasePayload = {
  arbeitnowEnabled: true,
  remotiveEnabled: true,
  leverEnabled: true,
  query: '',
  category: '',
  remoteOnly: true,
  arbeitnowLimit: 50,
  remotiveLimit: 50,
  leverLimit: 50,
  leverCompanies: [...DEFAULT_LEVER_COMPANIES],
  cacheStrategy: 'FRESH',
  confirmRecentlyExhausted: false,
} satisfies PublicJobDiscoveryDryRunPayload;

export function fixedPublicJobDiscoveryPayloadForSchedule(
  scheduleGroup: 'MORNING' | 'EVENING',
): PublicJobDiscoveryDryRunPayload {
  return scheduleGroup === 'MORNING'
    ? {
        ...fixedDiscoveryBasePayload,
        scheduleGroup,
        category: 'software-dev',
        profileIds: ['software_development', 'ai_automation'],
      }
    : {
        ...fixedDiscoveryBasePayload,
        scheduleGroup,
        profileIds: [
          'ai_augmented_development',
          'low_code_no_code',
        ],
      };
}

export function isControlledPersistenceKillSwitchEnabled(
  value: string | undefined,
): boolean {
  return value === 'true';
}

export function isScheduledPersistenceKillSwitchEnabled(
  value: string | undefined,
): boolean {
  return value === 'true';
}

export function scheduledMorningPersistenceIdempotencyKey(
  philippineDate: string,
): string {
  return `${SCHEDULED_MORNING_PUBLIC_JOB_DISCOVERY_TASK_ID}:MORNING:${philippineDate}`;
}

function parsePayload(
  payload: unknown,
): PublicJobDiscoveryDryRunPayload {
  const parsed = PublicJobDiscoveryDryRunPayloadSchema.safeParse(
    payload ?? {},
  );
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new PublicJobDiscoveryValidationError(
      issue?.message ?? 'Invalid public job discovery payload.',
    );
  }
  return parsed.data;
}

function resolveActiveProfileIds(
  payload: PublicJobDiscoveryDryRunPayload,
): JobSearchProfileId[] {
  return payload.profileIds ?? getEnabledJobSearchProfileIds();
}

function resolveLeverCompanySelection(
  payload: PublicJobDiscoveryDryRunPayload,
): ReturnType<typeof resolveLeverCompanies> {
  try {
    return resolveLeverCompanies(payload.leverCompanies);
  } catch (error) {
    if (error instanceof Error) {
      throw new PublicJobDiscoveryValidationError(error.message);
    }
    throw new PublicJobDiscoveryValidationError(
      'Invalid Lever company selection.',
    );
  }
}

function effectiveSourceConfiguration(
  payload: PublicJobDiscoveryDryRunPayload,
  dependencies: PublicJobDiscoveryDryRunDependencies,
): PublicJobDiscoverySourceConfiguration {
  const configured = resolvePublicJobDiscoverySourceConfiguration(
    dependencies.sourceEnvironment,
  );
  return {
    tavily: configured.tavily,
    geminiSearch: configured.geminiSearch,
    tavilyExtract: configured.tavilyExtract,
    deepScan: configured.deepScan,
    arbeitnow: configured.arbeitnow && payload.arbeitnowEnabled,
    remotive: configured.remotive && payload.remotiveEnabled,
    lever: configured.lever && payload.leverEnabled,
  };
}

function emptySourceResult(
  status: PublicJobDiscoverySourceStatus,
  error?: PublicJobDiscoverySourceError,
): PublicJobDiscoverySourceResult {
  return {
    status,
    sourceRecordsFetched: 0,
    acceptedRecords: 0,
    invalidRecords: 0,
    excludedByFilters: 0,
    duplicates: 0,
    profileMatchedDuplicates: 0,
    hardRejectedJobs: 0,
    eligibleScoredJobs: 0,
    pipelineErrors: 0,
    jobsThatWouldBePersisted: 0,
    jobsPersisted: 0,
    fetchRequests: 0,
    fetchRequestsAttempted: 0,
    fetchRequestsCompleted: 0,
    untargeted: 0,
    vibeCodingRolesFound: 0,
    preview: [],
    profileStats: [],
    ...(error ? { error } : {}),
  };
}

function mapSourceError(error: unknown): PublicJobDiscoverySourceError {
  if (error instanceof ArbeitnowDiscoveryError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof RemotiveDiscoveryError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof LeverDiscoveryError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof TavilyDiscoveryError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: 'SOURCE_UNAVAILABLE',
    message: 'The discovery source failed safely. No jobs were persisted.',
  };
}

function mapSummaryToSourceResult(
  summary: DiscoveryRunSummary,
): PublicJobDiscoverySourceResult {
  const companyReport = summary.companyFetchReport;
  const tavilyReport = summary.tavilyFetchReport;
  const webReport = summary.webDiscoveryReport;
  const webProviderStatuses = webReport
    ? [webReport.tavilySearch.status, webReport.geminiSearch.status].filter(
        (candidate) => candidate !== 'DISABLED',
      )
    : [];
  const webAllUnavailable = webProviderStatuses.length > 0 &&
    webProviderStatuses.every((candidate) =>
      ['FAILED', 'DAILY_LIMIT_REACHED', 'MONTHLY_LIMIT_REACHED'].includes(candidate),
    );
  const status: PublicJobDiscoverySourceStatus = companyReport
    ? companyReport.failedCompanies.length === 0
      ? 'SUCCESS'
      : companyReport.successfulCompanies.length > 0
        ? 'PARTIAL_SUCCESS'
        : 'FAILED'
    : webReport
      ? webAllUnavailable
        ? webProviderStatuses.includes('MONTHLY_LIMIT_REACHED')
          ? 'MONTHLY_LIMIT_REACHED'
          : webProviderStatuses.every((candidate) => candidate === 'DAILY_LIMIT_REACHED')
            ? 'DAILY_LIMIT_REACHED'
            : 'FAILED'
        : webReport.tavilySearch.status === 'CACHED' &&
            webReport.geminiSearch.status === 'CACHED'
          ? 'CACHED'
          : webReport.tavilySearch.sourceFailures.length > 0 ||
                webReport.geminiSearch.sourceFailures.length > 0 ||
                webReport.tavilyExtract.sourceFailures.length > 0
              ? 'PARTIAL_SUCCESS'
              : 'SUCCESS'
    : tavilyReport
      ? tavilyReport.searchesCompleted > 0
        ? tavilyReport.sourceFailures.length > 0
          ? 'PARTIAL_SUCCESS'
          : tavilyReport.cacheHits > 0 && tavilyReport.creditsConsumed === 0
            ? 'CACHED'
            : 'SUCCESS'
        : tavilyReport.dailyLimitReached
          ? 'DAILY_LIMIT_REACHED'
          : 'FAILED'
      : 'SUCCESS';
  return {
    status,
    sourceRecordsFetched: summary.sourceRecordsFetched,
    acceptedRecords: summary.acceptedRecords,
    invalidRecords: summary.invalidRecords,
    excludedByFilters: summary.excludedByFilters,
    duplicates: summary.duplicates,
    profileMatchedDuplicates: summary.profileMatchedDuplicates ?? 0,
    hardRejectedJobs: summary.hardRejectedJobs,
    eligibleScoredJobs: summary.eligibleScoredJobs,
    pipelineErrors: summary.pipelineErrors,
    jobsThatWouldBePersisted: summary.jobsThatWouldBePersisted,
    jobsPersisted: 0,
    fetchRequests: summary.pagesFetched,
    fetchRequestsAttempted:
      companyReport?.fetchRequestsAttempted ?? summary.pagesFetched,
    fetchRequestsCompleted:
      companyReport?.fetchRequestsCompleted ?? summary.pagesFetched,
    ...(companyReport
      ? {
          configuredCompanies: companyReport.configuredCompanies,
          attemptedCompanies: companyReport.attemptedCompanies,
          successfulCompanies: companyReport.successfulCompanies,
          failedCompanies: companyReport.failedCompanies,
        }
      : {}),
    ...(tavilyReport ? { tavily: { ...tavilyReport } } : {}),
    ...(webReport ? { web: webReport } : {}),
    untargeted: summary.untargeted,
    vibeCodingRolesFound: summary.vibeCodingRolesFound,
    preview: summary.preview.slice(0, 5),
    profileStats: summary.profileStats.map((stats) => ({
      ...stats,
      preview: stats.preview.slice(0, 5),
    })),
    ...(status === 'FAILED' && companyReport
      ? {
          error: {
            code: 'ALL_BOARDS_FAILED',
            message: 'All configured Lever boards failed safely.',
          },
        }
      : status === 'FAILED' && tavilyReport
        ? {
            error: {
              code: tavilyReport.sourceFailures[0]?.code ?? 'SOURCE_UNAVAILABLE',
              message: 'Tavily discovery failed safely.',
            },
          }
        : {}),
  };
}

export function combinePublicJobDiscoveryTotals(
  sources: Partial<
    Record<PublicJobDiscoverySourceName, PublicJobDiscoverySourceResult>
  >,
  finalization?: DiscoveryIdentityFinalization,
): PublicJobDiscoveryCombinedTotals {
  const totals: PublicJobDiscoveryCombinedTotals = {
    sourceRecordsFetched: 0,
    acceptedRecords: 0,
    invalidRecords: 0,
    excludedByFilters: 0,
    duplicates: 0,
    hardRejectedJobs: 0,
    eligibleScoredJobs: 0,
    pipelineErrors: 0,
    jobsThatWouldBePersisted: 0,
    jobsPersisted: 0,
    untargeted: 0,
    vibeCodingRolesFound: 0,
  };

  for (const source of Object.values(sources)) {
    if (!source) continue;
    totals.sourceRecordsFetched += source.sourceRecordsFetched;
    totals.acceptedRecords += source.acceptedRecords;
    totals.invalidRecords += source.invalidRecords;
    totals.excludedByFilters += source.excludedByFilters;
    totals.duplicates += source.duplicates;
    totals.hardRejectedJobs += source.hardRejectedJobs;
    totals.eligibleScoredJobs += source.eligibleScoredJobs;
    totals.pipelineErrors += source.pipelineErrors;
    totals.jobsThatWouldBePersisted += source.jobsThatWouldBePersisted;
    totals.jobsPersisted += source.jobsPersisted;
    totals.untargeted += source.untargeted ?? 0;
    totals.vibeCodingRolesFound += source.vibeCodingRolesFound ?? 0;
  }

  // Source summaries retain raw source-validation counts. The combined
  // accepted count represents unique candidates after persisted, same-source,
  // and cross-source identity duplicates are removed.
  if (finalization) {
    totals.acceptedRecords = finalization.acceptedRecords;
    totals.hardRejectedJobs = finalization.hardRejectedJobs;
    totals.eligibleScoredJobs = finalization.eligibleScoredJobs;
    totals.jobsThatWouldBePersisted =
      finalization.jobsThatWouldBePersisted;
    totals.untargeted = finalization.untargeted;
    totals.vibeCodingRolesFound =
      finalization.vibeCodingRolesFound;
  } else {
    totals.acceptedRecords = Math.max(
      0,
      totals.acceptedRecords - totals.duplicates,
    );
  }

  return totals;
}

function combineProfileSummaries(
  activeProfileIds: JobSearchProfileId[],
  sources: Partial<
    Record<PublicJobDiscoverySourceName, PublicJobDiscoverySourceResult>
  >,
  finalization?: DiscoveryIdentityFinalization,
): PublicJobDiscoveryProfileSummary[] {
  if (finalization) {
    return activeProfileIds.map((profileId) => {
      const stats = finalization.profileStats.find(
        (candidate) => candidate.profileId === profileId,
      );
      return {
        profileId,
        profileLabel: getJobSearchProfileDisplayName(profileId),
        recordsMatched: stats?.recordsMatched ?? 0,
        hardRejectedJobs: stats?.hardRejectedJobs ?? 0,
        eligibleScoredJobs: stats?.eligibleScoredJobs ?? 0,
        jobsThatWouldBePersisted:
          stats?.jobsThatWouldBePersisted ?? 0,
        duplicates: stats?.duplicates ?? 0,
        preview: stats?.preview.slice(0, 5) ?? [],
      };
    });
  }
  const aggregate = new Map<JobSearchProfileId, PublicJobDiscoveryProfileSummary>();
  for (const profileId of activeProfileIds) {
    aggregate.set(profileId, {
      profileId,
      profileLabel: getJobSearchProfileDisplayName(profileId),
      recordsMatched: 0,
      hardRejectedJobs: 0,
      eligibleScoredJobs: 0,
      jobsThatWouldBePersisted: 0,
      duplicates: 0,
      preview: [],
    });
  }

  for (const source of Object.values(sources)) {
    if (!source) continue;
    for (const stats of source.profileStats ?? []) {
      const current = aggregate.get(stats.profileId);
      if (!current) continue;
      current.recordsMatched += stats.recordsMatched;
      current.hardRejectedJobs += stats.hardRejectedJobs;
      current.eligibleScoredJobs += stats.eligibleScoredJobs;
      current.jobsThatWouldBePersisted += stats.jobsThatWouldBePersisted;
      current.duplicates += stats.duplicates;
      for (const preview of stats.preview) {
        if (current.preview.length >= 5) break;
        current.preview.push(preview);
      }
    }
  }

  return activeProfileIds
    .map((profileId) => aggregate.get(profileId))
    .filter(
      (value): value is PublicJobDiscoveryProfileSummary => value !== undefined,
    );
}

export function formatPublicJobDiscoveryDryRunForLog(
  result: PublicJobDiscoveryDryRunResult,
): string {
  const lines = [
    `Public job discovery ${result.mode}`,
    `Query: ${result.query}`,
    `Active profiles: ${result.activeProfileIds.join(', ')}`,
    `Started: ${result.startedAt}`,
    `Completed: ${result.completedAt}`,
    `Persistence enabled: ${result.persistenceEnabled}`,
    `Applications created: ${result.applicationsCreated}`,
    `Submissions created: ${result.submissionsCreated}`,
    '',
    'Combined totals:',
    `Source records fetched: ${result.combinedTotals.sourceRecordsFetched}`,
    `Unique accepted candidates: ${result.combinedTotals.acceptedRecords}`,
    `Rejected as invalid: ${result.combinedTotals.invalidRecords}`,
    `Excluded by local filters: ${result.combinedTotals.excludedByFilters}`,
    `Duplicates: ${result.combinedTotals.duplicates}`,
    `Hard-rejected jobs: ${result.combinedTotals.hardRejectedJobs}`,
    `Eligible/scored jobs: ${result.combinedTotals.eligibleScoredJobs}`,
    `Pipeline errors: ${result.combinedTotals.pipelineErrors}`,
    `Jobs that would be persisted: ${result.combinedTotals.jobsThatWouldBePersisted}`,
    `Jobs persisted: ${result.combinedTotals.jobsPersisted}`,
    `Untargeted: ${result.combinedTotals.untargeted}`,
    `Vibe-coding roles found: ${result.combinedTotals.vibeCodingRolesFound}`,
  ];

  if (result.profileSummaries.length > 0) {
    lines.push('', 'Per-profile totals:');
    for (const profile of result.profileSummaries) {
      lines.push(
        `${profile.profileId} (${profile.profileLabel}): matched=${profile.recordsMatched}, hardRejected=${profile.hardRejectedJobs}, scored=${profile.eligibleScoredJobs}, wouldPersist=${profile.jobsThatWouldBePersisted}, duplicates=${profile.duplicates}`,
      );
    }
  }

  for (const [sourceName, sourceResult] of Object.entries(result.sources)) {
    if (!sourceResult) continue;
    lines.push(
      '',
      `${sourceName}:`,
      `Status: ${sourceResult.status}`,
      `Source records fetched: ${sourceResult.sourceRecordsFetched}`,
      `Accepted by source validation: ${sourceResult.acceptedRecords}`,
      `Rejected as invalid: ${sourceResult.invalidRecords}`,
      `Excluded by local filters: ${sourceResult.excludedByFilters}`,
      `Duplicates: ${sourceResult.duplicates}`,
      `Hard-rejected jobs: ${sourceResult.hardRejectedJobs}`,
      `Eligible/scored jobs: ${sourceResult.eligibleScoredJobs}`,
      `Pipeline errors: ${sourceResult.pipelineErrors}`,
      `Jobs that would be persisted: ${sourceResult.jobsThatWouldBePersisted}`,
      `Jobs persisted: ${sourceResult.jobsPersisted}`,
      `Fetch requests: ${sourceResult.fetchRequests ?? 0}`,
      `Fetch requests attempted: ${sourceResult.fetchRequestsAttempted ?? sourceResult.fetchRequests ?? 0}`,
      `Fetch requests completed: ${sourceResult.fetchRequestsCompleted ?? sourceResult.fetchRequests ?? 0}`,
      `Untargeted: ${sourceResult.untargeted ?? 0}`,
      `Vibe-coding roles found: ${sourceResult.vibeCodingRolesFound ?? 0}`,
    );
    if (sourceResult.configuredCompanies) {
      lines.push(
        `Configured companies: ${sourceResult.configuredCompanies.join(', ')}`,
        `Attempted companies: ${(sourceResult.attemptedCompanies ?? []).join(', ')}`,
        `Successful companies: ${(sourceResult.successfulCompanies ?? []).join(', ')}`,
        `Failed companies: ${(sourceResult.failedCompanies ?? [])
          .map((failure) => `${failure.companyId}:${failure.errorCode}`)
          .join(', ')}`,
      );
    }
    if (sourceResult.error) {
      lines.push(
        `Error code: ${sourceResult.error.code}`,
        `Error message: ${sourceResult.error.message}`,
      );
    }
    if (sourceResult.preview.length > 0) {
      lines.push('Preview (descriptions omitted):');
      sourceResult.preview.forEach((job, index) => {
        const evidence = job.matchedProfileEvidence
          .map(
            (match) =>
              `${match.profileId}=[${match.evidence
                .map((item) => `${item.type}:${item.value}`)
                .join(', ')}]`,
          )
          .join('; ');
        lines.push(
          `${index + 1}. [${job.status}] ${job.title} — ${job.company} | ${job.location ?? 'Location unknown'} | Score: ${job.score ?? 'Not scored'} | ${job.recommendation ?? 'No recommendation'} | ${job.sourceUrl} | Source: ${job.sourceName}${job.additionalSourceNames.length > 0 ? ` (+ ${job.additionalSourceNames.join(', ')})` : ''} | Matched profile evidence: ${evidence}`,
        );
      });
    }
  }

  return lines.join('\n');
}

async function runSourceDiscovery(
  adapter: DiscoverySourceAdapter,
  options: {
    limit: number;
    pages: number;
    remoteOnly: boolean;
    query: string;
    category: string;
    apply: false;
    activeProfileIds: JobSearchProfileId[];
  },
  repository: DiscoveryRepository,
  verifiedSkills: SkillEntry[],
  deduplicationContext: DiscoveryDeduplicationContext,
  diagnosticCollector?: DiscoveryDiagnosticCollector,
  onProcessingStage?: (stage: DiscoveryProcessingStage) => void,
): Promise<DiscoveryRunSummary> {
  return runDiscovery(options, {
    adapter,
    repository,
    verifiedSkills,
    deduplicationContext,
    diagnosticCollector,
    onProcessingStage,
  });
}

async function evaluatePublicJobDiscovery(
  payload: PublicJobDiscoveryDryRunPayload,
  dependencies: PublicJobDiscoveryDryRunDependencies,
  repository: DiscoveryRepository,
): Promise<PublicJobDiscoveryEvaluation> {
  const activeProfileIds = resolveActiveProfileIds(payload);
  const sourceConfiguration = effectiveSourceConfiguration(
    payload,
    dependencies,
  );
  const retrievalHints = payload.scheduleGroup
    ? getScheduleRetrievalHints(payload.scheduleGroup)
    : null;
  const startedAt = (dependencies.now ?? (() => new Date()))().toISOString();
  const now = dependencies.now ?? (() => new Date());
  const skillsPath = dependencies.skillsPath ?? defaultSkillsPath();
  const verifiedSkills =
    dependencies.verifiedSkills ?? loadVerifiedSkills(skillsPath);
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const timeoutMs = dependencies.timeoutMs ?? 10_000;
  const sources: Partial<
    Record<PublicJobDiscoverySourceName, PublicJobDiscoverySourceResult>
  > = {};
  const sourceSummaries: Partial<
    Record<PublicJobDiscoverySourceName, DiscoveryRunSummary>
  > = {};

  for (const sourceName of PUBLIC_JOB_DISCOVERY_SOURCE_IDS) {
    const enabled = sourceName === 'tavily'
      ? sourceConfiguration.tavily || sourceConfiguration.geminiSearch
      : sourceConfiguration[sourceName];
    if (!enabled) {
      sources[sourceName] = emptySourceResult('DISABLED');
    }
  }
  const anySourceEnabled = hasEnabledDiscoverySource(sourceConfiguration);
  const deduplicationContext: DiscoveryDeduplicationContext = {
    knownJobs: anySourceEnabled
      ? [...(await repository.loadExistingJobs())]
      : [],
  };
    const sharedOptions = {
      remoteOnly: payload.remoteOnly,
      query: payload.query,
      category: '',
      apply: false as const,
      pages: 1,
      activeProfileIds,
    };

    if (sourceConfiguration.tavily || sourceConfiguration.geminiSearch) {
      dependencies.onSourceStart?.('tavily');
      const ownedStore = dependencies.webDiscoveryStore
        ? null
        : createSqliteWebDiscoveryStore(
            resolveWebDiscoveryDatabasePath({
              databasePath: dependencies.databasePath,
              repositoryInjected: Boolean(dependencies.repository),
            }),
          );
      const webStore = dependencies.webDiscoveryStore ?? ownedStore;
      if (!webStore) {
        sources.tavily = emptySourceResult('FAILED', {
          code: 'SOURCE_UNAVAILABLE',
          message: 'Public web discovery could not initialize safely.',
        });
      } else {
        try {
          const requestedScan = dependencies.webScanOptions;
          const scanMode = requestedScan?.scanMode ?? 'NORMAL';
          const cacheStrategy = requestedScan?.cacheStrategy ??
            payload.cacheStrategy;
          const runKey = requestedScan?.runKey ??
            `discovery:${payload.scheduleGroup ?? 'MANUAL'}:${startedAt}`;
          const scan: CombinedWebDiscoveryOptions = {
            scanMode,
            cacheStrategy,
            confirmRecentlyExhausted:
              requestedScan?.confirmRecentlyExhausted ??
              payload.confirmRecentlyExhausted,
            runKey,
            activeProfileIds,
            ...(requestedScan?.deepScanIdempotencyKey
              ? {
                  deepScanIdempotencyKey:
                    requestedScan.deepScanIdempotencyKey,
                }
              : {}),
          };
          if (scanMode === 'DEEP' && !sourceConfiguration.deepScan) {
            throw new PublicJobDiscoveryValidationError(
              'Deep Web Scan is disabled.',
            );
          }
          sourceSummaries.tavily = await runSourceDiscovery(
            new CombinedWebDiscoveryAdapter({
              tavilyEnabled: sourceConfiguration.tavily,
              geminiSearchEnabled: sourceConfiguration.geminiSearch,
              tavilyExtractEnabled: sourceConfiguration.tavilyExtract,
              tavilyApiKey:
                dependencies.tavilyApiKey ?? process.env.TAVILY_API_KEY ?? '',
              geminiApiKey:
                dependencies.geminiApiKey ?? process.env.GEMINI_API_KEY ?? '',
              geminiSearchModel:
                dependencies.geminiSearchModel ??
                process.env.GEMINI_SEARCH_MODEL?.trim() ?? null,
              store: webStore,
              caps: resolveWebDiscoveryQuotaCaps(
                dependencies.sourceEnvironment,
              ),
              philippineDate: philippineCalendarDate(now()),
              scan,
              fetchImpl,
              timeoutMs,
              now,
              resolveHost: dependencies.resolveHost,
              geminiClientFactory: dependencies.geminiSearchClientFactory,
              onStage: dependencies.onWebDiscoveryStage,
            }),
            {
              ...sharedOptions,
              limit: scanMode === 'DEEP' ? 1000 : 250,
            },
            repository,
            verifiedSkills,
            deduplicationContext,
            dependencies.diagnosticCollector,
            dependencies.onProcessingStage,
          );
        } catch (error) {
          if (error instanceof PublicJobDiscoveryValidationError) throw error;
          sources.tavily = emptySourceResult('FAILED', mapSourceError(error));
        } finally {
          ownedStore?.close?.();
        }
      }
    }

    if (sourceConfiguration.arbeitnow) {
      dependencies.onSourceStart?.('arbeitnow');
      try {
        sourceSummaries.arbeitnow = await runSourceDiscovery(
          new ArbeitnowAdapter({ fetchImpl, timeoutMs }),
          {
            ...sharedOptions,
            // Arbeitnow has no server-side category/query parameter.
            limit: payload.arbeitnowLimit,
          },
          repository,
          verifiedSkills,
          deduplicationContext,
          dependencies.diagnosticCollector,
          dependencies.onProcessingStage,
        );
      } catch (error) {
        sources.arbeitnow = emptySourceResult('FAILED', mapSourceError(error));
      }
    }

    if (sourceConfiguration.remotive) {
      dependencies.onSourceStart?.('remotive');
      try {
        sourceSummaries.remotive = await runSourceDiscovery(
          new RemotiveAdapter({
            fetchImpl,
            timeoutMs,
            category:
              payload.category.trim() ||
              retrievalHints?.remotive.category ||
              undefined,
            search:
              payload.query.trim() ||
              retrievalHints?.remotive.query ||
              undefined,
          }),
          {
            ...sharedOptions,
            limit: payload.remotiveLimit,
            category: payload.category,
          },
          repository,
          verifiedSkills,
          deduplicationContext,
          dependencies.diagnosticCollector,
          dependencies.onProcessingStage,
        );
      } catch (error) {
        sources.remotive = emptySourceResult('FAILED', mapSourceError(error));
      }
    }

    if (sourceConfiguration.lever) {
      dependencies.onSourceStart?.('lever');
      try {
        const companies = resolveLeverCompanySelection(payload);
        sourceSummaries.lever = await runSourceDiscovery(
          new LeverAdapter({
            companies,
            fetchImpl,
            timeoutMs,
            // Trigger orchestration intentionally fetches each configured
            // board once; local matching is authoritative over that bounded
            // result set.
            maxRequestsPerCompany: 1,
          }),
          {
            ...sharedOptions,
            // Lever has no supported server-side search parameter.
            limit: payload.leverLimit,
          },
          repository,
          verifiedSkills,
          deduplicationContext,
          dependencies.diagnosticCollector,
          dependencies.onProcessingStage,
        );
      } catch (error) {
        if (error instanceof PublicJobDiscoveryValidationError) {
          throw error;
        }
        sources.lever = emptySourceResult('FAILED', mapSourceError(error));
      }
    }

    for (const sourceName of PUBLIC_JOB_DISCOVERY_SOURCE_IDS) {
      const summary = sourceSummaries[sourceName];
      if (summary) {
        sources[sourceName] = mapSummaryToSourceResult(
          materializeDiscoveryRunSummary(summary),
        );
      }
    }

    const finalization = finalizeDiscoveryDeduplicationContext(
      deduplicationContext,
      activeProfileIds,
    );
    const completedAt = (dependencies.now ?? (() => new Date()))().toISOString();

    return {
      result: {
      mode: 'DRY_RUN',
      finalStatus: anySourceEnabled
        ? 'COMPLETED'
        : 'NO_DISCOVERY_SOURCES_ENABLED',
      startedAt,
      completedAt,
      query: payload.query,
      activeProfileIds,
      sources,
      profileSummaries: combineProfileSummaries(
        activeProfileIds,
        sources,
        finalization,
      ),
      combinedTotals: combinePublicJobDiscoveryTotals(
        sources,
        finalization,
      ),
      combinedPreview: finalization.preview,
      persistenceEnabled: false,
      applicationsCreated: 0,
      submissionsCreated: 0,
      },
      finalization,
    };
}

export async function runPublicJobDiscoveryDryRun(
  unvalidatedPayload: unknown,
  dependencies: PublicJobDiscoveryDryRunDependencies = {},
): Promise<PublicJobDiscoveryDryRunResult> {
  const payload = parsePayload(unvalidatedPayload);
  const noSourcesEnabled = !hasEnabledDiscoverySource(
    effectiveSourceConfiguration(payload, dependencies),
  );
  const databasePath =
    dependencies.databasePath ?? defaultDatabasePath();
  const dryRunSession = dependencies.repository
    ? {
        repository: dependencies.repository,
        cleanup() {},
      }
    : noSourcesEnabled
      ? {
          repository: {
            async loadExistingJobs() { return []; },
            async persistBatch() {
              throw new Error('No-source dry runs cannot persist.');
            },
          },
          cleanup() {},
        }
      : createDryRunRepositorySession(databasePath);
  try {
    return (
      await evaluatePublicJobDiscovery(
        payload,
        dependencies,
        dryRunSession.repository,
      )
    ).result;
  } finally {
    dryRunSession.cleanup();
  }
}

function controlledSourceFailureCode(
  value: string,
): ControlledSourceFailureCode {
  const parsed = ControlledSourceFailureCodeSchema.safeParse(value);
  return parsed.success ? parsed.data : 'UNKNOWN_SAFE_ERROR';
}

function collectControlledSourceFailures(
  sources: ControlledPublicJobDiscoveryResult['sources'],
): ControlledSourceFailure[] {
  const failures: ControlledSourceFailure[] = [];
  for (const sourceName of PUBLIC_JOB_DISCOVERY_SOURCE_IDS) {
    const source = sources[sourceName];
    if (!source) continue;
    if (source.error && !source.tavily) {
      failures.push({
        source: sourceName,
        code: controlledSourceFailureCode(source.error.code),
      });
    }
    for (const failure of source.failedCompanies ?? []) {
      failures.push({
        source: sourceName,
        companyId: failure.companyId,
        code: controlledSourceFailureCode(failure.errorCode),
      });
    }
    const tavilyFailures = source.web
      ? source.web.tavilySearch.sourceFailures
      : source.tavily?.sourceFailures ?? [];
    for (const failure of tavilyFailures) {
      failures.push({
        source: sourceName,
        provider: 'TAVILY_SEARCH',
        code: controlledSourceFailureCode(failure.code),
        ...(failure.queryId ? { queryId: failure.queryId } : {}),
      });
    }
    for (const failure of source.web?.geminiSearch.sourceFailures ?? []) {
      failures.push({
        source: sourceName,
        provider: 'GEMINI_SEARCH',
        code: controlledSourceFailureCode(failure.code),
        queryId: failure.promptId,
        providerCategory: failure.providerCategory,
        providerStatus: failure.providerStatus,
        requestReachedProvider: failure.requestReachedProvider,
        quotaReserved: failure.quotaReserved,
        quotaReleased: failure.quotaReleased,
        groundedUrlsReturned: failure.groundedUrlsReturned,
      });
    }
    for (const failure of source.web?.tavilyExtract.sourceFailures ?? []) {
      failures.push({
        source: sourceName,
        provider: 'TAVILY_EXTRACT',
        code: controlledSourceFailureCode(failure.code),
      });
    }
  }
  return failures;
}

function sourceNameKey(
  sourceName: string,
): PublicJobDiscoverySourceName | null {
  const normalized = sourceName.trim().toLowerCase();
  if (normalized.includes('tavily')) return 'tavily';
  if (normalized.includes('gemini search')) return 'tavily';
  if (normalized.includes('arbeitnow')) return 'arbeitnow';
  if (normalized.includes('remotive')) return 'remotive';
  if (normalized.includes('lever')) return 'lever';
  return null;
}

function sanitizeControlledSources(
  sources: PublicJobDiscoveryDryRunResult['sources'],
): ControlledPublicJobDiscoveryResult['sources'] {
  const sanitized: ControlledPublicJobDiscoveryResult['sources'] = {};
  for (const sourceName of PUBLIC_JOB_DISCOVERY_SOURCE_IDS) {
    const source = sources[sourceName];
    if (source) {
      const { error: _internalError, ...safeSource } = source;
      sanitized[sourceName] = {
        ...safeSource,
        preview: source.preview.map((preview) => ({
          ...preview,
          additionalSourceNames: [
            ...preview.additionalSourceNames,
          ],
          matchedProfileIds: [...preview.matchedProfileIds],
          matchedProfileEvidence:
            preview.matchedProfileEvidence.map((match) => ({
              profileId: match.profileId,
              evidence: match.evidence.map((item) => ({ ...item })),
            })),
        })),
      };
    }
  }
  return sanitized;
}

function controlledPersistedPreview(
  record: ControlledPersistenceWriteResult['persistedRecords'][number],
): ControlledPersistedJobPreview {
  return {
    title: record.discovered.title,
    company: record.discovered.company,
    source: record.discovered.sourceName,
    matchedProfileIds: [...record.matchedProfileIds],
    status: record.persistedStatus,
    recommendation: record.result.recommendation ?? null,
  };
}

function emptyControlledCombinedTotals(): PublicJobDiscoveryCombinedTotals {
  return {
    sourceRecordsFetched: 0,
    acceptedRecords: 0,
    invalidRecords: 0,
    excludedByFilters: 0,
    duplicates: 0,
    hardRejectedJobs: 0,
    eligibleScoredJobs: 0,
    pipelineErrors: 0,
    jobsThatWouldBePersisted: 0,
    jobsPersisted: 0,
    untargeted: 0,
    vibeCodingRolesFound: 0,
  };
}

function emptyControlledProfileSummaries(
  profileIds: readonly JobSearchProfileId[],
): PublicJobDiscoveryProfileSummary[] {
  return profileIds.map((profileId) => ({
    profileId,
    profileLabel: getJobSearchProfileDisplayName(profileId),
    recordsMatched: 0,
    hardRejectedJobs: 0,
    eligibleScoredJobs: 0,
    jobsThatWouldBePersisted: 0,
    duplicates: 0,
    preview: [],
  }));
}

interface AuthorizedPersistenceRun {
  runKind: 'MANUAL_CONTROLLED' | 'SCHEDULED_MORNING' | 'DASHBOARD_SCAN';
  taskId: string;
  philippineDate: string;
}

async function runAuthorizedPublicJobDiscoveryPersistence(
  payload: ControlledPublicJobDiscoveryPayload,
  dependencies: ControlledPublicJobDiscoveryDependencies,
  run: AuthorizedPersistenceRun,
): Promise<ControlledPublicJobDiscoveryResult> {
  const discoveryPayload = fixedPublicJobDiscoveryPayloadForSchedule(
    payload.scheduleGroup,
  );
  const databasePath =
    dependencies.databasePath ?? defaultDatabasePath();
  const repository =
    dependencies.repository ??
    createControlledDiscoveryRepositoryForRun(databasePath);
  const dailyState = await repository.getDailyPersistenceState({
    philippineDate: run.philippineDate,
    idempotencyKey: payload.idempotencyKey,
  });
  const activeProfileIds = [...(discoveryPayload.profileIds ?? [])];
  const earlyResult = (
    finalStatus:
      | 'ALREADY_COMPLETED'
      | 'DAILY_CAP_REACHED'
      | 'NO_DISCOVERY_SOURCES_ENABLED',
  ): ControlledPublicJobDiscoveryResult => ({
    mode: 'CONTROLLED',
    environment: 'DEVELOPMENT',
    scheduleGroup: payload.scheduleGroup,
    runKind: run.runKind,
    philippineDate: run.philippineDate,
    dailyLimit: PUBLIC_JOB_DISCOVERY_DAILY_LIMIT,
    persistedBeforeRun: dailyState.persistedCount,
    remainingBeforeRun: dailyState.remaining,
    selected: 0,
    persistedThisRun: 0,
    persistedAfterRun: dailyState.persistedCount,
    dailyRemaining: dailyState.remaining,
    finalStatus,
    activeProfileIds,
    persistenceGates: {
      developmentEnvironment: true,
      killSwitchEnabled: true,
      controlledPayloadApproved: true,
    },
    persistenceLimit: payload.maxJobsToPersist,
    idempotencyStatus: dailyState.idempotencyStatus,
    sources: Object.fromEntries(
      PUBLIC_JOB_DISCOVERY_SOURCE_IDS.map((source) => [
        source,
        emptySourceResult(
          effectiveSourceConfiguration(discoveryPayload, dependencies)[source]
            ? 'ENABLED'
            : 'DISABLED',
        ),
      ]),
    ) as ControlledPublicJobDiscoveryResult['sources'],
    profileSummaries: emptyControlledProfileSummaries(activeProfileIds),
    combinedTotals: emptyControlledCombinedTotals(),
    qualifiedBeforeCap: 0,
    skippedBecauseOfCap: 0,
    selectedForPersistence: 0,
    selectedAfterExtraction: 0,
    extractionSucceeded: 0,
    extractionFailed: 0,
    jobsPersisted: 0,
    scoresPersisted: 0,
    finalDatabaseDuplicates: 0,
    applicationsCreated: 0,
    submissionsCreated: 0,
    sourceFailures: [],
    persistedJobs: [],
    persistenceEnabled: true,
  });
  if (
    !hasEnabledDiscoverySource(
      effectiveSourceConfiguration(discoveryPayload, dependencies),
    )
  ) {
    return earlyResult('NO_DISCOVERY_SOURCES_ENABLED');
  }
  if (dailyState.idempotencyStatus === 'ALREADY_COMPLETED') {
    return earlyResult('ALREADY_COMPLETED');
  }
  if (dailyState.remaining === 0) {
    return earlyResult('DAILY_CAP_REACHED');
  }

  const evaluation = await evaluatePublicJobDiscovery(
    discoveryPayload,
    dependencies,
    repository,
  );
  const qualifiedBeforeCap =
    evaluation.finalization.persistenceCandidates.length;
  const persistenceLimit = Math.min(
    payload.maxJobsToPersist,
    dailyState.remaining,
  );
  const selected = evaluation.finalization.persistenceCandidates.slice(
    0,
    persistenceLimit,
  );
  const sourceFailures = collectControlledSourceFailures(
    evaluation.result.sources,
  );
  const sources = sanitizeControlledSources(evaluation.result.sources);
  for (const source of Object.values(sources)) {
    if (source) source.jobsPersisted = 0;
  }

  const stoppedResult = (
    finalStatus:
      | 'SOURCE_FAILED'
      | 'EXTRACTION_FAILED'
      | 'QUERY_GROUPS_RECENTLY_EXHAUSTED'
      | 'CANCELLED'
      | 'NO_DISCOVERY_SOURCES_ENABLED',
    extractionSucceeded: number,
    extractionFailed: number,
  ): ControlledPublicJobDiscoveryResult => ({
    mode: 'CONTROLLED',
    environment: 'DEVELOPMENT',
    scheduleGroup: payload.scheduleGroup,
    runKind: run.runKind,
    philippineDate: run.philippineDate,
    dailyLimit: PUBLIC_JOB_DISCOVERY_DAILY_LIMIT,
    persistedBeforeRun: dailyState.persistedCount,
    remainingBeforeRun: dailyState.remaining,
    selected: selected.length,
    persistedThisRun: 0,
    persistedAfterRun: dailyState.persistedCount,
    dailyRemaining: dailyState.remaining,
    finalStatus,
    activeProfileIds: [...evaluation.result.activeProfileIds],
    persistenceGates: {
      developmentEnvironment: true,
      killSwitchEnabled: true,
      controlledPayloadApproved: true,
    },
    persistenceLimit: payload.maxJobsToPersist,
    idempotencyStatus: 'NOT_STARTED',
    sources,
    profileSummaries: evaluation.result.profileSummaries,
    combinedTotals: {
      ...evaluation.result.combinedTotals,
      jobsPersisted: 0,
    },
    qualifiedBeforeCap,
    skippedBecauseOfCap: Math.max(
      0,
      qualifiedBeforeCap - selected.length,
    ),
    selectedForPersistence: selected.length,
    selectedAfterExtraction: extractionSucceeded,
    extractionSucceeded,
    extractionFailed,
    jobsPersisted: 0,
    scoresPersisted: 0,
    finalDatabaseDuplicates: 0,
    applicationsCreated: 0,
    submissionsCreated: 0,
    sourceFailures,
    persistedJobs: [],
    persistenceEnabled: true,
  });
  if (evaluation.result.finalStatus === 'NO_DISCOVERY_SOURCES_ENABLED') {
    return stoppedResult('NO_DISCOVERY_SOURCES_ENABLED', 0, 0);
  }
  const webStoppingReason =
    evaluation.result.sources.tavily?.web?.stoppingReason;
  if (webStoppingReason === 'QUERY_GROUPS_RECENTLY_EXHAUSTED') {
    return stoppedResult('QUERY_GROUPS_RECENTLY_EXHAUSTED', 0, 0);
  }
  if (webStoppingReason === 'CANCELLED') {
    return stoppedResult('CANCELLED', 0, 0);
  }
  const enabledSourceResults = Object.values(evaluation.result.sources).filter(
    (source): source is PublicJobDiscoverySourceResult =>
      source !== undefined && source.status !== 'DISABLED',
  );
  const everyEnabledSourceUnavailable =
    enabledSourceResults.length > 0 &&
    enabledSourceResults.every((source) =>
      ['FAILED', 'DAILY_LIMIT_REACHED', 'MONTHLY_LIMIT_REACHED'].includes(source.status),
    );
  if (sourceFailures.length > 0 && everyEnabledSourceUnavailable) {
    return stoppedResult('SOURCE_FAILED', 0, 0);
  }

  const verifiedSkills =
    dependencies.verifiedSkills ??
    loadVerifiedSkills(dependencies.skillsPath ?? defaultSkillsPath());
  const enrichedSelected: DiscoveryPersistenceRecord[] = [];
  let extractionFailed = 0;
  for (const record of selected) {
    try {
      dependencies.onRequirementsExtractionStart?.();
      enrichedSelected.push(
        await enrichControlledPersistenceCandidate(
          record,
          verifiedSkills,
          dependencies.requirementsExtractor,
          { onUsage: dependencies.onGeminiUsage },
        ),
      );
    } catch {
      extractionFailed += 1;
    }
  }
  if (extractionFailed > 0) {
    return stoppedResult(
      'EXTRACTION_FAILED',
      enrichedSelected.length,
      extractionFailed,
    );
  }

  dependencies.onPersistenceStart?.();
  const writeResult = await repository.persistControlledBatch(enrichedSelected, {
    idempotencyKey: payload.idempotencyKey,
    maxJobsToPersist: persistenceLimit,
    philippineDate: run.philippineDate,
    taskId: run.taskId,
    runKind: run.runKind,
  });
  for (const record of writeResult.persistedRecords) {
    const sourceKey = sourceNameKey(record.discovered.sourceName);
    const source = sourceKey ? sources[sourceKey] : undefined;
    if (source) source.jobsPersisted += 1;
  }
  const combinedTotals = {
    ...evaluation.result.combinedTotals,
    jobsPersisted: writeResult.jobsPersisted,
  };

  return {
    mode: 'CONTROLLED',
    environment: 'DEVELOPMENT',
    scheduleGroup: payload.scheduleGroup,
    runKind: run.runKind,
    philippineDate: run.philippineDate,
    dailyLimit: PUBLIC_JOB_DISCOVERY_DAILY_LIMIT,
    persistedBeforeRun: writeResult.persistedBeforeRun,
    remainingBeforeRun: writeResult.remainingBeforeRun,
    selected: selected.length,
    persistedThisRun: writeResult.jobsPersisted,
    persistedAfterRun: writeResult.persistedAfterRun,
    dailyRemaining: writeResult.dailyRemaining,
    finalStatus:
      writeResult.idempotencyStatus === 'ALREADY_COMPLETED'
        ? 'ALREADY_COMPLETED'
        : writeResult.idempotencyStatus === 'NOT_STARTED'
          ? 'DAILY_CAP_REACHED'
          : 'COMPLETED',
    activeProfileIds: [...evaluation.result.activeProfileIds],
    persistenceGates: {
      developmentEnvironment: true,
      killSwitchEnabled: true,
      controlledPayloadApproved: true,
    },
    persistenceLimit: payload.maxJobsToPersist,
    idempotencyStatus: writeResult.idempotencyStatus,
    sources,
    profileSummaries: evaluation.result.profileSummaries,
    combinedTotals,
    qualifiedBeforeCap,
    skippedBecauseOfCap:
      Math.max(0, qualifiedBeforeCap - selected.length) +
      writeResult.skippedBecauseOfDailyCap,
    selectedForPersistence: selected.length,
    selectedAfterExtraction: enrichedSelected.length,
    extractionSucceeded: enrichedSelected.length,
    extractionFailed,
    jobsPersisted: writeResult.jobsPersisted,
    scoresPersisted: writeResult.scoresPersisted,
    finalDatabaseDuplicates:
      writeResult.finalDatabaseDuplicates,
    applicationsCreated: 0,
    submissionsCreated: 0,
    sourceFailures,
    persistedJobs: writeResult.persistedRecords
      .slice(0, 5)
      .map(controlledPersistedPreview),
    persistenceEnabled: true,
  };
}

export async function runControlledPublicJobDiscovery(
  unvalidatedPayload: unknown,
  dependencies: ControlledPublicJobDiscoveryDependencies,
): Promise<ControlledPublicJobDiscoveryResult> {
  const parsed = ControlledPublicJobDiscoveryPayloadSchema.safeParse(
    unvalidatedPayload,
  );
  if (!parsed.success) {
    throw new ControlledPersistenceGateError(
      'INVALID_PAYLOAD',
      parsed.error.issues[0]?.message ??
        'Invalid controlled discovery payload.',
    );
  }
  if (dependencies.taskId !== CONTROLLED_PUBLIC_JOB_DISCOVERY_TASK_ID) {
    throw new ControlledPersistenceGateError(
      'WRONG_TASK',
      'Controlled persistence is available only from its dedicated task.',
    );
  }
  if (dependencies.environmentType !== 'DEVELOPMENT') {
    throw new ControlledPersistenceGateError(
      'NON_DEVELOPMENT_ENVIRONMENT',
      'Controlled persistence is restricted to DEVELOPMENT.',
    );
  }
  if (!dependencies.killSwitchEnabled) {
    throw new ControlledPersistenceGateError(
      'KILL_SWITCH_DISABLED',
      'Controlled persistence is disabled.',
    );
  }

  const payload = parsed.data;
  const philippineDate = philippineCalendarDate(
    (dependencies.now ?? (() => new Date()))(),
  );
  return runAuthorizedPublicJobDiscoveryPersistence(
    payload,
    dependencies,
    {
      runKind: 'MANUAL_CONTROLLED',
      taskId: CONTROLLED_PUBLIC_JOB_DISCOVERY_TASK_ID,
      philippineDate,
    },
  );
}

export async function runDashboardPublicJobDiscoveryPersistence(
  unvalidatedPayload: unknown,
  dependencies: ControlledPublicJobDiscoveryDependencies,
): Promise<ControlledPublicJobDiscoveryResult> {
  const parsed = DashboardJobScanPayloadSchema.safeParse(unvalidatedPayload);
  if (
    !parsed.success ||
    (parsed.data.mode !== 'SAVE' &&
      !(parsed.data.mode === 'DEEP' && parsed.data.verifyAndSave))
  ) {
    throw new ControlledPersistenceGateError(
      'INVALID_PAYLOAD',
      'Dashboard persistence payload is invalid.',
    );
  }
  if (dependencies.taskId !== DASHBOARD_PUBLIC_JOB_SCAN_TASK_ID) {
    throw new ControlledPersistenceGateError(
      'WRONG_TASK',
      'Dashboard persistence is available only from its dedicated task.',
    );
  }
  if (dependencies.environmentType !== 'DEVELOPMENT') {
    throw new ControlledPersistenceGateError(
      'NON_DEVELOPMENT_ENVIRONMENT',
      'Dashboard persistence is restricted to DEVELOPMENT.',
    );
  }
  if (!dependencies.killSwitchEnabled) {
    throw new ControlledPersistenceGateError(
      'KILL_SWITCH_DISABLED',
      'Dashboard persistence is disabled.',
    );
  }
  const philippineDate = philippineCalendarDate(
    (dependencies.now ?? (() => new Date()))(),
  );
  return runAuthorizedPublicJobDiscoveryPersistence(
    {
      scheduleGroup: 'MORNING',
      persistenceMode: 'CONTROLLED',
      maxJobsToPersist: PUBLIC_JOB_DISCOVERY_DAILY_LIMIT,
      idempotencyKey: parsed.data.idempotencyKey,
    },
    dependencies,
    {
      runKind: 'DASHBOARD_SCAN',
      taskId: DASHBOARD_PUBLIC_JOB_SCAN_TASK_ID,
      philippineDate,
    },
  );
}

export async function runScheduledMorningPublicJobDiscoveryPersistence(
  dependencies: ScheduledMorningPublicJobDiscoveryDependencies,
): Promise<ControlledPublicJobDiscoveryResult> {
  const taskId =
    dependencies.taskId ?? SCHEDULED_MORNING_PUBLIC_JOB_DISCOVERY_TASK_ID;
  if (taskId !== SCHEDULED_MORNING_PUBLIC_JOB_DISCOVERY_TASK_ID) {
    throw new ControlledPersistenceGateError(
      'WRONG_TASK',
      'Scheduled morning persistence is available only from its fixed task.',
    );
  }
  if (dependencies.environmentType !== 'DEVELOPMENT') {
    throw new ControlledPersistenceGateError(
      'NON_DEVELOPMENT_ENVIRONMENT',
      'Scheduled morning persistence is restricted to DEVELOPMENT.',
    );
  }
  if (!dependencies.killSwitchEnabled) {
    throw new ControlledPersistenceGateError(
      'KILL_SWITCH_DISABLED',
      'Scheduled morning persistence is disabled.',
    );
  }
  const philippineDate = philippineCalendarDate(
    (dependencies.now ?? (() => new Date()))(),
  );
  const payload: ControlledPublicJobDiscoveryPayload = {
    scheduleGroup: 'MORNING',
    persistenceMode: 'CONTROLLED',
    maxJobsToPersist: PUBLIC_JOB_DISCOVERY_DAILY_LIMIT,
    idempotencyKey:
      scheduledMorningPersistenceIdempotencyKey(philippineDate),
  };
  return runAuthorizedPublicJobDiscoveryPersistence(
    payload,
    { ...dependencies, taskId },
    {
      runKind: 'SCHEDULED_MORNING',
      taskId,
      philippineDate,
    },
  );
}

export function formatControlledPublicJobDiscoveryForLog(
  result: ControlledPublicJobDiscoveryResult,
): string {
  return [
    `Public job discovery ${result.mode}`,
    `Environment: ${result.environment}`,
    `Schedule group: ${result.scheduleGroup}`,
    `Run kind: ${result.runKind}`,
    `Philippine date: ${result.philippineDate}`,
    `Active profiles: ${result.activeProfileIds.join(', ')}`,
    `Daily limit: ${result.dailyLimit}`,
    `Persisted before run: ${result.persistedBeforeRun}`,
    `Remaining before run: ${result.remainingBeforeRun}`,
    `Persistence limit: ${result.persistenceLimit}`,
    `Idempotency status: ${result.idempotencyStatus}`,
    `Final status: ${result.finalStatus}`,
    `Qualified before cap: ${result.qualifiedBeforeCap}`,
    `Skipped because of cap: ${result.skippedBecauseOfCap}`,
    `Selected for persistence: ${result.selectedForPersistence}`,
    `Selected after verified extraction: ${result.selectedAfterExtraction}`,
    `Extraction failed: ${result.extractionFailed}`,
    `Jobs persisted: ${result.jobsPersisted}`,
    `Persisted after run: ${result.persistedAfterRun}`,
    `Daily remaining: ${result.dailyRemaining}`,
    `Scores persisted: ${result.scoresPersisted}`,
    `Final database duplicates: ${result.finalDatabaseDuplicates}`,
    `Applications created: ${result.applicationsCreated}`,
    `Submissions created: ${result.submissionsCreated}`,
    `Source failures: ${result.sourceFailures
      .map(
        (failure) =>
          `${failure.source}${failure.companyId ? `/${failure.companyId}` : ''}:${failure.code}`,
      )
      .join(', ')}`,
    ...result.persistedJobs.map(
      (job, index) =>
        `${index + 1}. [${job.status}] ${job.title} — ${job.company} | ${job.source} | ${job.matchedProfileIds.join(', ')} | ${job.recommendation ?? 'No recommendation'}`,
    ),
  ].join('\n');
}
