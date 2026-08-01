import { z } from 'zod';
import { GeminiSearchProviderFailureCategorySchema } from './gemini-search-contracts.js';
import { JobSearchProfileIdSchema } from './job-search-profiles.v1.js';

export const DASHBOARD_PUBLIC_JOB_SCAN_TASK_ID =
  'public-job-discovery-dashboard-scan' as const;
export const DASHBOARD_PUBLIC_JOB_SCAN_KILL_SWITCH =
  'JOB_DISCOVERY_DASHBOARD_SCAN_ENABLED' as const;

export const DashboardJobScanModeSchema = z.enum(['PREVIEW', 'SAVE', 'DEEP']);
export type DashboardJobScanMode = z.infer<typeof DashboardJobScanModeSchema>;

export const DashboardJobScanCacheStrategySchema = z.enum(['CACHED', 'FRESH']);
export type DashboardJobScanCacheStrategy = z.infer<
  typeof DashboardJobScanCacheStrategySchema
>;

export const DashboardJobScanPayloadSchema = z
  .object({
    mode: DashboardJobScanModeSchema,
    cacheStrategy: DashboardJobScanCacheStrategySchema.default('CACHED'),
    confirmRecentlyExhausted: z.boolean().default(false),
    verifyAndSave: z.boolean().default(false),
    deepScanConfirmed: z.boolean().default(false),
    idempotencyKey: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.mode !== 'DEEP' && (value.verifyAndSave || value.deepScanConfirmed)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mode'],
        message: 'Deep Scan controls are valid only for Deep Web Scan.',
      });
    }
    if (value.mode === 'DEEP' && !value.deepScanConfirmed) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deepScanConfirmed'],
        message: 'Deep Web Scan requires explicit confirmation.',
      });
    }
  });
export type DashboardJobScanPayload = z.infer<
  typeof DashboardJobScanPayloadSchema
>;
export type DashboardJobScanPayloadInput = z.input<
  typeof DashboardJobScanPayloadSchema
>;

export const DashboardJobScanStageSchema = z.enum([
  'STARTING_SCAN',
  'SELECTING_QUERY_GROUP',
  'READING_CACHED_RESULTS',
  'SEARCHING_TAVILY',
  'SEARCHING_GEMINI',
  'COMBINING_URLS',
  'REMOVING_DUPLICATE_URLS',
  'FETCHING_ORIGINAL_PAGES',
  'RECOVERING_FAILED_PAGES',
  'PARSING_JOB_PAGES',
  'FETCHING_JOBS',
  'REMOVING_DUPLICATES',
  'APPLYING_FILTERS',
  'MATCHING_PROFILES',
  'VERIFYING_WITH_GEMINI',
  'SAVING_VERIFIED_JOBS',
  'COMPLETING_BATCH',
  'COMPLETED',
  'COMPLETED_WITH_SOURCE_WARNINGS',
  'CANCELLED',
  'FAILED',
]);
export type DashboardJobScanStage = z.infer<
  typeof DashboardJobScanStageSchema
>;

export const DashboardJobScanStatusSchema = z.enum([
  'COMPLETED',
  'NO_MATCHES',
  'FAILED',
  'DAILY_CAP_REACHED',
  'ALREADY_COMPLETED',
  'NO_DISCOVERY_SOURCES_ENABLED',
  'COMPLETED_WITH_SOURCE_WARNINGS',
  'QUERY_GROUPS_RECENTLY_EXHAUSTED',
  'DEEP_SCAN_COOLDOWN',
  'CANCELLED',
]);
export type DashboardJobScanStatus = z.infer<
  typeof DashboardJobScanStatusSchema
>;

export const DashboardJobScanFailureCodeSchema = z.enum([
  'INVALID_PAYLOAD',
  'NON_DEVELOPMENT_ENVIRONMENT',
  'KILL_SWITCH_DISABLED',
  'WRONG_TASK',
  'SOURCE_FAILED',
  'EXTRACTION_FAILED',
  'RUN_FAILED',
  'UNKNOWN_SAFE_FAILURE',
  'NO_DISCOVERY_SOURCES_ENABLED',
  'QUERY_GROUPS_RECENTLY_EXHAUSTED',
  'DEEP_SCAN_COOLDOWN',
  'DEEP_SCAN_DISABLED',
  'CANCELLED',
]);
export type DashboardJobScanFailureCode = z.infer<
  typeof DashboardJobScanFailureCodeSchema
>;

export const DashboardJobScanSourceFailureCodeSchema = z.enum([
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
  'MISSING_MODEL_CONFIGURATION',
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

export const DashboardJobScanSourceFailureSchema = z
  .object({
    source: z.enum(['tavily', 'arbeitnow', 'remotive', 'lever']),
    provider: z.enum(['TAVILY_SEARCH', 'GEMINI_SEARCH', 'TAVILY_EXTRACT']).optional(),
    providerCategory: GeminiSearchProviderFailureCategorySchema.optional(),
    providerStatus: z.number().int().min(400).max(599).nullable().optional(),
    requestReachedProvider: z.boolean().optional(),
    quotaReserved: z.boolean().optional(),
    quotaReleased: z.boolean().optional(),
    groundedUrlsReturned: z.number().int().nonnegative().optional(),
    code: DashboardJobScanSourceFailureCodeSchema,
    companyId: z.string().trim().min(1).max(80).optional(),
    queryId: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9._:-]+$/).optional(),
  })
  .strict();
export type DashboardJobScanSourceFailure = z.infer<
  typeof DashboardJobScanSourceFailureSchema
>;

export const DashboardJobScanSourceSummarySchema = z
  .object({
    source: z.enum(['tavily', 'arbeitnow', 'remotive', 'lever']),
    status: z.enum([
      'ENABLED',
      'DISABLED',
      'COMPLETED',
      'PARTIAL_FAILURE',
      'FAILED',
      'DAILY_LIMIT_REACHED',
      'MONTHLY_LIMIT_REACHED',
      'CACHED',
    ]),
    costClassification: z.enum([
      'FREE_TIER_CREDITS',
      'FREE',
      'FREE_CONFIGURED_BOARDS',
    ]),
    fetched: z.number().int().nonnegative(),
    accepted: z.number().int().nonnegative(),
    invalid: z.number().int().nonnegative(),
    duplicates: z.number().int().nonnegative(),
    exclusions: z.number().int().nonnegative(),
    profileMatches: z.number().int().nonnegative(),
  })
  .strict();
export type DashboardJobScanSourceSummary = z.infer<
  typeof DashboardJobScanSourceSummarySchema
>;

export const DashboardTavilyMetricsSchema = z
  .object({
    enabled: z.boolean(),
    status: z.enum(['DISABLED', 'COMPLETED', 'PARTIAL_FAILURE', 'FAILED', 'CACHED', 'DAILY_LIMIT_REACHED', 'MONTHLY_LIMIT_REACHED']),
    searchesAttempted: z.number().int().nonnegative().max(40),
    searchesCompleted: z.number().int().nonnegative().max(40),
    cacheHits: z.number().int().nonnegative().max(40),
    searchCreditsConsumed: z.number().int().nonnegative(),
    extractEnabled: z.boolean(),
    extractStatus: z.enum(['DISABLED', 'COMPLETED', 'PARTIAL_FAILURE', 'FAILED', 'DAILY_LIMIT_REACHED', 'MONTHLY_LIMIT_REACHED']),
    extractUrlsAttempted: z.number().int().nonnegative().max(200),
    extractPagesRecovered: z.number().int().nonnegative().max(200),
    extractCreditsConsumed: z.number().int().nonnegative(),
    totalCreditsConsumed: z.number().int().nonnegative(),
    dailyCreditsUsed: z.number().int().nonnegative(),
    dailyCreditsReserved: z.number().int().nonnegative(),
    dailyCreditsConfirmed: z.number().int().nonnegative(),
    dailyCreditsRemaining: z.number().int().nonnegative(),
    monthlyCreditsUsed: z.number().int().nonnegative(),
    monthlyCreditsReserved: z.number().int().nonnegative(),
    monthlyCreditsConfirmed: z.number().int().nonnegative(),
    monthlyCreditsRemaining: z.number().int().nonnegative(),
    urlsDiscovered: z.number().int().nonnegative(),
    uniqueUrls: z.number().int().nonnegative(),
    originalPagesFetched: z.number().int().nonnegative(),
    pagesParsedSuccessfully: z.number().int().nonnegative(),
    pagesRejected: z.number().int().nonnegative(),
    directEmployerOrAtsPages: z.number().int().nonnegative(),
    profileMatches: z.number().int().nonnegative(),
    existingMatches: z.number().int().nonnegative(),
    newSaveableMatches: z.number().int().nonnegative(),
  })
  .strict();
export type DashboardTavilyMetrics = z.infer<
  typeof DashboardTavilyMetricsSchema
>;

const nullableTokenCount = z.number().int().nonnegative().nullable();

export const DashboardGeminiSearchMetricsSchema = z.object({
  enabled: z.boolean(),
  status: z.enum(['DISABLED', 'COMPLETED', 'PARTIAL_FAILURE', 'FAILED', 'CACHED', 'DAILY_LIMIT_REACHED']),
  promptsAttempted: z.number().int().nonnegative().max(40),
  promptsCompleted: z.number().int().nonnegative().max(40),
  cacheHits: z.number().int().nonnegative().max(40),
  groundedResponses: z.number().int().nonnegative(),
  groundedUrlsFound: z.number().int().nonnegative(),
  uniqueUrlsContributed: z.number().int().nonnegative(),
  dailyPromptsUsed: z.number().int().nonnegative(),
  dailyPromptsRemaining: z.number().int().nonnegative(),
  inputTokens: nullableTokenCount,
  outputTokens: nullableTokenCount,
  totalTokens: nullableTokenCount,
}).strict();
export type DashboardGeminiSearchMetrics = z.infer<
  typeof DashboardGeminiSearchMetricsSchema
>;

export const DashboardWebDiscoveryMetricsSchema = z.object({
  scanMode: z.enum(['NORMAL', 'DEEP']),
  cacheStrategy: DashboardJobScanCacheStrategySchema,
  selectedQueryGroup: z.enum(['ENTRY_LEVEL_SOFTWARE', 'MOBILE_BACKEND', 'AI_WORKFLOW_AUTOMATION', 'DIRECT_EMPLOYER_ATS']).nullable(),
  queryGroupsAttempted: z.array(z.enum(['ENTRY_LEVEL_SOFTWARE', 'MOBILE_BACKEND', 'AI_WORKFLOW_AUTOMATION', 'DIRECT_EMPLOYER_ATS'])).max(4),
  uniqueUrlCap: z.union([z.literal(250), z.literal(1000)]),
  stoppingReason: z.enum(['COMPLETED', 'NO_SOURCES_AVAILABLE', 'QUERY_GROUPS_RECENTLY_EXHAUSTED', 'UNIQUE_URL_CAP_REACHED', 'ALL_QUERY_GROUPS_ATTEMPTED', 'NO_NEW_UNIQUE_URLS', 'TAVILY_DAILY_CREDIT_LIMIT_REACHED', 'TAVILY_MONTHLY_CREDIT_LIMIT_REACHED', 'GEMINI_SEARCH_DAILY_LIMIT_REACHED', 'CANCELLED', 'SAFETY_LIMIT_REACHED']),
  urlsBeforeDeduplication: z.number().int().nonnegative(),
  crossSourceDuplicates: z.number().int().nonnegative(),
  uniqueUrls: z.number().int().nonnegative().max(1000),
  urlsFoundByBothSources: z.number().int().nonnegative(),
  urlsQueuedForFetch: z.number().int().nonnegative().max(1000),
  uniqueUrlCapReached: z.boolean(),
  pagesFetchAttempted: z.number().int().nonnegative().max(1000),
  pagesFetchedDirectly: z.number().int().nonnegative().max(1000),
  pagesParsedDirectly: z.number().int().nonnegative().max(1000),
  pagesSentToExtract: z.number().int().nonnegative().max(200),
  pagesRecoveredByExtract: z.number().int().nonnegative().max(200),
  pagesRejected: z.number().int().nonnegative().max(1000),
  batchesCompleted: z.number().int().nonnegative().max(10),
}).strict();
export type DashboardWebDiscoveryMetrics = z.infer<
  typeof DashboardWebDiscoveryMetricsSchema
>;

export const DashboardJobScanPersistedPreviewSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    company: z.string().trim().min(1).max(200),
    source: z.string().trim().min(1).max(100),
    matchedProfileIds: z.array(JobSearchProfileIdSchema),
    status: z.enum(['DISCOVERED', 'HARD_REJECTED']),
    recommendation: z.string().trim().min(1).max(200).nullable(),
  })
  .strict();

export const DashboardJobScanResultSchema = z
  .object({
    runId: z.string().trim().min(1).max(100),
    mode: DashboardJobScanModeSchema,
    cacheStrategy: DashboardJobScanCacheStrategySchema,
    environment: z.literal('DEVELOPMENT'),
    philippineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    stage: DashboardJobScanStageSchema,
    status: DashboardJobScanStatusSchema,
    activeProfileIds: z.array(JobSearchProfileIdSchema),
    sourceSummaries: z.array(DashboardJobScanSourceSummarySchema),
    sourceFailures: z.array(DashboardJobScanSourceFailureSchema),
    tavily: DashboardTavilyMetricsSchema,
    geminiSearch: DashboardGeminiSearchMetricsSchema,
    webDiscovery: DashboardWebDiscoveryMetricsSchema.nullable(),
    deepScanEligibleAgainAt: z.string().datetime().nullable(),
    fetched: z.number().int().nonnegative(),
    uniqueAccepted: z.number().int().nonnegative(),
    duplicates: z.number().int().nonnegative(),
    exclusions: z.number().int().nonnegative(),
    profileMatches: z.number().int().nonnegative(),
    existingMatches: z.number().int().nonnegative(),
    newSaveableMatches: z.number().int().nonnegative(),
    nearMatches: z.number().int().nonnegative(),
    selected: z.number().int().nonnegative(),
    selectedForGemini: z.number().int().nonnegative(),
    geminiCalls: z.number().int().nonnegative(),
    inputTokens: nullableTokenCount,
    outputTokens: nullableTokenCount,
    totalTokens: nullableTokenCount,
    persistedBeforeRun: z.number().int().nonnegative(),
    persistedThisRun: z.number().int().nonnegative(),
    persistedAfterRun: z.number().int().nonnegative(),
    dailyRemaining: z.number().int().min(0).max(5),
    extractionSucceeded: z.number().int().nonnegative(),
    extractionFailed: z.number().int().nonnegative(),
    persistedJobs: z.array(DashboardJobScanPersistedPreviewSchema).max(5),
    idempotencyStatus: z.enum(['NEW', 'ALREADY_COMPLETED', 'NOT_STARTED']),
    failureCode: DashboardJobScanFailureCodeSchema.nullable(),
    failedStage: DashboardJobScanStageSchema.nullable(),
    elapsedMs: z.number().int().nonnegative(),
    applicationsCreated: z.literal(0),
    submissionsCreated: z.literal(0),
  })
  .strict();
export type DashboardJobScanResult = z.infer<
  typeof DashboardJobScanResultSchema
>;

export const DashboardJobScanCapacitySchema = z
  .object({
    philippineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dailyLimit: z.literal(5),
    savedToday: z.number().int().min(0).max(5),
    remaining: z.number().int().min(0).max(5),
    deepScanEnabled: z.boolean(),
    deepScanEligible: z.boolean(),
    deepScanEligibleAgainAt: z.string().datetime().nullable(),
  })
  .strict();
export type DashboardJobScanCapacity = z.infer<
  typeof DashboardJobScanCapacitySchema
>;
