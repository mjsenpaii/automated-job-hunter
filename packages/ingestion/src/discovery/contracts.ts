import type { NormalizedJob, SkillEntry } from '@job-app/core';
import { z } from 'zod';
import type {
  IngestionResult,
  RawJobInput,
} from '../types.js';
import {
  JobSearchProfileIdListSchema,
  type JobSearchProfileMatch,
  type JobSearchProfileId,
} from './job-search-profiles.v1.js';
import type { VerifiedJobRequirementsExtraction } from '../job-requirements-contracts.js';
import type { DiscoveryDiagnosticCollector } from './profile-coverage-diagnostics.js';
import type { GeminiSearchReport } from '../adapters/gemini-web-search.server.js';
import type { TavilyExtractReport } from '../adapters/tavily-extract.js';
import type { WebSearchQueryGroupId } from './web-search-query-groups.v1.js';

export const DiscoveryOptionsSchema = z.object({
  limit: z.number().int().min(1).max(1000),
  pages: z.number().int().min(1).max(3),
  remoteOnly: z.boolean(),
  query: z.string(),
  category: z.string().default(''),
  apply: z.boolean(),
  activeProfileIds: JobSearchProfileIdListSchema.optional(),
});
export type DiscoveryOptions = z.infer<typeof DiscoveryOptionsSchema>;

export const ForumListingUpdateTypeSchema = z.enum([
  'GEOGRAPHY',
  'TIMEZONE',
  'ROLE_STATUS',
  'EXPERIENCE',
  'PAY',
  'SCOPE',
]);

export const ForumListingContextSchema = z.object({
  originalPostText: z.string().trim().min(1).max(20_000),
  originalPostPublishedAt: z.string().datetime().nullable(),
  firstPartyUpdates: z.array(z.object({
    publishedAt: z.string().datetime().nullable(),
    updateTypes: z.array(ForumListingUpdateTypeSchema).min(1).max(6),
    evidenceText: z.string().trim().min(1).max(20_000),
  }).strict()).max(50),
  latestFirstPartyUpdateAt: z.string().datetime().nullable(),
  geographicRestrictions: z.array(z.string().trim().min(1).max(100)).max(30),
  timezoneRestrictions: z.array(z.string().trim().min(1).max(100)).max(20),
  minimumExperienceYears: z.number().int().min(1).max(50).nullable(),
  payUpdateText: z.string().trim().min(1).max(20_000).nullable(),
  roleClosed: z.boolean(),
  potentiallyStale: z.boolean(),
}).strict();
export type ForumListingContext = z.infer<typeof ForumListingContextSchema>;

export const DiscoveredJobSchema = z.object({
  sourceName: z.string().trim().min(1),
  sourceJobId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  company: z.string().trim().min(1),
  location: z.string().trim().min(1).nullable(),
  remote: z.boolean().nullable(),
  employmentType: z.string().trim().min(1).nullable(),
  category: z.string().trim().min(1).nullable().optional(),
  team: z.string().trim().min(1).nullable().optional(),
  department: z.string().trim().min(1).nullable().optional(),
  workplaceType: z
    .enum(['remote', 'hybrid', 'on-site', 'unspecified'])
    .nullable()
    .optional(),
  salaryText: z.string().trim().min(1).nullable().optional(),
  description: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)),
  publishedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime().nullable().optional(),
  forumListingContext: ForumListingContextSchema.nullable().optional(),
  sourceUrl: z.string().url(),
  applicationUrl: z.string().url().nullable(),
});
export type DiscoveredJob = z.infer<typeof DiscoveredJobSchema>;

export interface DiscoveryFetchResult {
  sourceRecordsFetched: number;
  acceptedRecords: number;
  invalidRecords: number;
  pagesFetched: number;
  jobs: DiscoveredJob[];
  companyFetchReport?: DiscoveryCompanyFetchReport;
  tavilyFetchReport?: TavilyFetchReport;
  webDiscoveryReport?: WebDiscoveryReport;
}

export interface TavilyWebSearchReport {
  enabled: boolean;
  status:
    | 'DISABLED'
    | 'COMPLETED'
    | 'PARTIAL_FAILURE'
    | 'FAILED'
    | 'CACHED'
    | 'DAILY_LIMIT_REACHED'
    | 'MONTHLY_LIMIT_REACHED';
  searchRequestsAttempted: number;
  searchesCompleted: number;
  cacheHits: number;
  searchCreditsConsumed: number;
  urlsDiscovered: number;
  uniqueUrlsContributed: number;
  dailyCreditsUsed: number;
  dailyCreditsReserved: number;
  dailyCreditsConfirmed: number;
  dailyCreditsRemaining: number;
  monthlyCreditsUsed: number;
  monthlyCreditsReserved: number;
  monthlyCreditsConfirmed: number;
  monthlyCreditsRemaining: number;
  sourceFailures: Array<{ queryId: string; code: TavilySourceFailureCode }>;
}

export type WebDiscoveryStoppingReason =
  | 'COMPLETED'
  | 'NO_SOURCES_AVAILABLE'
  | 'QUERY_GROUPS_RECENTLY_EXHAUSTED'
  | 'UNIQUE_URL_CAP_REACHED'
  | 'ALL_QUERY_GROUPS_ATTEMPTED'
  | 'NO_NEW_UNIQUE_URLS'
  | 'TAVILY_DAILY_CREDIT_LIMIT_REACHED'
  | 'TAVILY_MONTHLY_CREDIT_LIMIT_REACHED'
  | 'GEMINI_SEARCH_DAILY_LIMIT_REACHED'
  | 'CANCELLED'
  | 'SAFETY_LIMIT_REACHED';

export interface WebDiscoveryReport {
  scanMode: 'NORMAL' | 'DEEP';
  cacheStrategy: 'CACHED' | 'FRESH';
  selectedQueryGroup: WebSearchQueryGroupId | null;
  queryGroupsAttempted: WebSearchQueryGroupId[];
  queryGroupsRecentlyExhausted: boolean;
  uniqueUrlCap: 250 | 1000;
  stoppingReason: WebDiscoveryStoppingReason;
  tavilySearch: TavilyWebSearchReport;
  geminiSearch: GeminiSearchReport;
  tavilyExtract: TavilyExtractReport;
  urlsBeforeDeduplication: number;
  crossSourceDuplicates: number;
  uniqueUrls: number;
  urlsFoundByBothSources: number;
  urlsQueuedForFetch: number;
  uniqueUrlCapReached: boolean;
  pagesFetchAttempted: number;
  pagesFetchedDirectly: number;
  pagesParsedDirectly: number;
  pagesSentToExtract: number;
  pagesRecoveredByExtract: number;
  pagesRejected: number;
  fetchFailuresByReason: Partial<Record<
    | 'TIMEOUT'
    | 'NETWORK'
    | 'HTTP'
    | 'NON_HTML'
    | 'BODY_TOO_LARGE'
    | 'UNPARSEABLE'
    | 'INELIGIBLE_PAGE'
    | 'UNSAFE_URL',
    number
  >>;
  batchesCompleted: number;
  directEmployerOrAtsPages: number;
}

export const TavilySourceFailureCodeSchema = z.enum([
  'MISSING_API_KEY',
  'DAILY_CREDIT_LIMIT_REACHED',
  'MONTHLY_CREDIT_LIMIT_REACHED',
  'QUERY_IN_FLIGHT',
  'TIMEOUT',
  'HTTP_ERROR',
  'MALFORMED_JSON',
  'SOURCE_SCHEMA_CHANGED',
  'NETWORK_ERROR',
  'PAGE_FETCH_FAILED',
  'PAGE_REJECTED',
  'UNKNOWN_SAFE_ERROR',
]);
export type TavilySourceFailureCode = z.infer<
  typeof TavilySourceFailureCodeSchema
>;

export interface TavilySourceFailure {
  queryId?: string;
  code: TavilySourceFailureCode;
}

export interface TavilyFetchReport {
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
  sourceFailures: TavilySourceFailure[];
  dailyLimitReached: boolean;
}

export const DiscoveryCompanyFetchErrorCodeSchema = z.enum([
  'TIMEOUT',
  'HTTP_ERROR',
  'INVALID_RESPONSE',
  'NETWORK_ERROR',
  'UNKNOWN_SAFE_ERROR',
]);
export type DiscoveryCompanyFetchErrorCode = z.infer<
  typeof DiscoveryCompanyFetchErrorCodeSchema
>;

export const DiscoveryCompanyFetchFailureSchema = z
  .object({
    companyId: z.string().trim().min(1),
    errorCode: DiscoveryCompanyFetchErrorCodeSchema,
  })
  .strict();
export type DiscoveryCompanyFetchFailure = z.infer<
  typeof DiscoveryCompanyFetchFailureSchema
>;

export interface DiscoveryCompanyFetchReport {
  configuredCompanies: string[];
  attemptedCompanies: string[];
  successfulCompanies: string[];
  failedCompanies: DiscoveryCompanyFetchFailure[];
  fetchRequestsAttempted: number;
  fetchRequestsCompleted: number;
}

export interface DiscoverySourceAdapter {
  readonly name: string;
  fetchJobs(options: Pick<DiscoveryOptions, 'limit' | 'pages'>): Promise<DiscoveryFetchResult>;
}

export interface DiscoveryPersistenceRecord {
  discovered: DiscoveredJob;
  additionalSourceNames: string[];
  raw: RawJobInput;
  result: IngestionResult;
  persistedStatus: 'DISCOVERED' | 'HARD_REJECTED';
  matchedProfileIds: JobSearchProfileId[];
  matchedProfileEvidence: JobSearchProfileMatch[];
  verifiedExtraction?: VerifiedJobRequirementsExtraction;
}

export interface DiscoveryRepository {
  loadExistingJobs(): Promise<NormalizedJob[]>;
  persistBatch(records: DiscoveryPersistenceRecord[]): Promise<void>;
}

export type ControlledPersistenceIdempotencyStatus =
  | 'NEW'
  | 'ALREADY_COMPLETED'
  | 'NOT_STARTED';

export type ControlledPersistenceRunKind =
  | 'MANUAL_CONTROLLED'
  | 'SCHEDULED_MORNING'
  | 'DASHBOARD_SCAN';

export type DiscoveryProcessingStage =
  | 'REMOVING_DUPLICATES'
  | 'APPLYING_FILTERS'
  | 'MATCHING_PROFILES';

export interface DailyPersistenceState {
  philippineDate: string;
  dailyLimit: 5;
  persistedCount: number;
  remaining: number;
  idempotencyStatus: ControlledPersistenceIdempotencyStatus;
}

export interface ControlledPersistenceWriteResult {
  idempotencyStatus: ControlledPersistenceIdempotencyStatus;
  jobsPersisted: number;
  scoresPersisted: number;
  finalDatabaseDuplicates: number;
  persistedRecords: DiscoveryPersistenceRecord[];
  persistedBeforeRun: number;
  remainingBeforeRun: number;
  persistedAfterRun: number;
  dailyRemaining: number;
  skippedBecauseOfDailyCap: number;
}

export interface ControlledDiscoveryRepository
  extends DiscoveryRepository {
  getDailyPersistenceState(controls: {
    philippineDate: string;
    idempotencyKey: string;
  }): Promise<DailyPersistenceState>;
  persistControlledBatch(
    records: DiscoveryPersistenceRecord[],
    controls: {
      idempotencyKey: string;
      maxJobsToPersist: number;
      philippineDate: string;
      taskId: string;
      runKind: ControlledPersistenceRunKind;
    },
  ): Promise<ControlledPersistenceWriteResult>;
}

export interface DiscoveryPreview {
  sourceName: string;
  additionalSourceNames: string[];
  title: string;
  company: string;
  location: string | null;
  sourceUrl: string;
  status: 'DISCOVERED' | 'DUPLICATE' | 'HARD_REJECTED' | 'ERROR';
  score: number | null;
  recommendation: string | null;
  matchedProfileIds: JobSearchProfileId[];
  matchedProfileEvidence: JobSearchProfileMatch[];
}

export interface DiscoveryProfileStats {
  profileId: JobSearchProfileId;
  recordsMatched: number;
  hardRejectedJobs: number;
  eligibleScoredJobs: number;
  jobsThatWouldBePersisted: number;
  duplicates: number;
  preview: DiscoveryPreview[];
}

export interface DiscoveryRunSummary {
  source: string;
  dryRun: boolean;
  reviewStatus: 'DISCOVERED';
  activeProfileIds: JobSearchProfileId[];
  sourceRecordsFetched: number;
  acceptedRecords: number;
  invalidRecords: number;
  excludedByFilters: number;
  untargeted: number;
  vibeCodingRolesFound: number;
  duplicates: number;
  profileMatchedDuplicates?: number;
  hardRejectedJobs: number;
  eligibleScoredJobs: number;
  pipelineErrors: number;
  jobsThatWouldBePersisted: number;
  jobsPersisted: number;
  pagesFetched: number;
  preview: DiscoveryPreview[];
  profileStats: DiscoveryProfileStats[];
  companyFetchReport?: DiscoveryCompanyFetchReport;
  tavilyFetchReport?: TavilyFetchReport;
  webDiscoveryReport?: WebDiscoveryReport;
}

export interface DiscoveryDeduplicationContext {
  knownJobs: NormalizedJob[];
  registeredVariants?: DiscoveryIdentityVariant[];
}

export type DiscoveryIdentityVariantState =
  | 'FILTERED'
  | 'UNTARGETED'
  | 'TARGETED'
  | 'HARD_REJECTED'
  | 'SCORED'
  | 'PERSISTED_EXISTING';

export interface DiscoveryIdentityVariant {
  sourceName: string;
  sourceJobId: string;
  sourceUrl: string;
  normalizedId: string;
  passedLocalFilters: boolean;
  state: DiscoveryIdentityVariantState;
  matchedProfileIds: JobSearchProfileId[];
  completenessScore: number;
  sourceOrder: number;
}

export interface DiscoveryRunDependencies {
  adapter: DiscoverySourceAdapter;
  repository: DiscoveryRepository;
  verifiedSkills: SkillEntry[];
  deduplicationContext?: DiscoveryDeduplicationContext;
  diagnosticCollector?: DiscoveryDiagnosticCollector;
  onProcessingStage?: (stage: DiscoveryProcessingStage) => void;
}
