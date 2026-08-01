import { z } from 'zod';

export const FREELANCE_SCAN_TASK_ID =
  'freelance-opportunity-dashboard-scan' as const;
export const FREELANCE_DISCOVERY_KILL_SWITCH =
  'JOB_DISCOVERY_FREELANCE_ENABLED' as const;
export const FREELANCE_DAILY_SAVE_LIMIT_MAX = 20 as const;
export const FREELANCE_LEARNING_HOURS_MIN = 4 as const;
export const FREELANCE_LEARNING_HOURS_MAX = 24 as const;

export const FreelanceSourceSchema = z.enum([
  'HIMALAYAS',
  'REMOTIVE',
  'TAVILY',
  'GEMINI_SEARCH',
  'MANUAL',
]);
export type FreelanceSource = z.infer<typeof FreelanceSourceSchema>;

export const FreelanceSourceStatusSchema = z.enum([
  'ENABLED',
  'DISABLED',
  'COMPLETED',
  'PARTIAL_FAILURE',
  'FAILED',
  'CACHED',
  'DAILY_LIMIT_REACHED',
  'MONTHLY_LIMIT_REACHED',
  'UPWORK_API_PENDING',
  'FREELANCER_API_PENDING',
]);

export const FreelanceSourceCostSchema = z.enum([
  'FREE_NO_API_KEY',
  'FREE_PUBLIC_API_NO_KEY',
  'API_CREDITS',
  'API_QUOTA',
  'MANUAL_PUBLIC_URL',
]);

export const FreelanceContractTypeSchema = z.enum([
  'HOURLY',
  'FIXED_PRICE',
  'PART_TIME',
  'CONTRACTOR',
  'TEMPORARY',
  'PROJECT',
  'INTERN',
  'OTHER',
]);
export type FreelanceContractType = z.infer<
  typeof FreelanceContractTypeSchema
>;

export const FreelancePayKindSchema = z.enum([
  'HOURLY',
  'FIXED_PRICE',
  'UNKNOWN',
]);
export const FreelancePayClassificationSchema = z.enum([
  'ABOVE_MINIMUM',
  'BELOW_MINIMUM',
  'UNKNOWN',
  'FIXED_PRICE_SCOPE_REQUIRED',
  'NON_USD_UNCONVERTED',
]);
export type FreelancePayClassification = z.infer<
  typeof FreelancePayClassificationSchema
>;

export const FreelancePaySchema = z
  .object({
    kind: FreelancePayKindSchema,
    originalCurrency: z.string().trim().min(3).max(10).nullable(),
    minimum: z.number().finite().nonnegative().nullable(),
    maximum: z.number().finite().nonnegative().nullable(),
    period: z.enum(['HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR']).nullable(),
    statedHourlyMinimum: z.number().finite().nonnegative().nullable(),
    statedHourlyMaximum: z.number().finite().nonnegative().nullable(),
    estimatedEffectiveHourlyRate: z.number().finite().nonnegative().nullable(),
    classification: FreelancePayClassificationSchema,
    evidenceLabel: z.string().trim().min(1).max(240).nullable(),
  })
  .strict();
export type FreelancePay = z.infer<typeof FreelancePaySchema>;

export const FreelanceReadinessSchema = z.enum([
  'READY_NOW',
  'LEARNABLE_FAST_WITH_AI',
  'NOT_READY',
]);
export type FreelanceReadiness = z.infer<typeof FreelanceReadinessSchema>;

export const FreelanceRecommendedActionSchema = z.enum([
  'REVIEW_AND_APPLY_MANUALLY',
  'APPLY_AFTER_PRACTICE',
  'BUILD_SAMPLE_FIRST',
  'REVIEW_SCOPE_WITH_CLIENT',
  'SKIP_FOR_NOW',
]);

export const FreelanceReadinessAssessmentSchema = z
  .object({
    classification: FreelanceReadinessSchema,
    transferableSkills: z.array(z.string().trim().min(1).max(80)).max(20),
    missingSkills: z.array(z.string().trim().min(1).max(80)).max(20),
    learningHoursMinimum: z.number().int().min(4).max(24).nullable(),
    learningHoursMaximum: z.number().int().min(4).max(24).nullable(),
    learningTimeUncertain: z.boolean(),
    narrowGapReasons: z.array(z.string().trim().min(1).max(100)).max(12),
    practiceBeforeApplying: z.array(z.string().trim().min(1).max(160)).max(8),
    suggestedSampleProject: z.string().trim().min(1).max(240).nullable(),
    deliveryRisks: z.array(z.string().trim().min(1).max(120)).max(10),
    confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    recommendedAction: FreelanceRecommendedActionSchema,
    applicationReady: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.classification === 'LEARNABLE_FAST_WITH_AI') {
      if (!value.learningTimeUncertain) {
        if (
          value.learningHoursMinimum === null ||
          value.learningHoursMaximum === null ||
          value.learningHoursMinimum > value.learningHoursMaximum
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['learningHoursMinimum'],
            message: 'Defensible learning estimates require a bounded range.',
          });
        }
      }
    }
  });
export type FreelanceReadinessAssessment = z.infer<
  typeof FreelanceReadinessAssessmentSchema
>;

export const FreelanceScamRiskSchema = z.enum([
  'LOW',
  'MEDIUM',
  'HIGH',
  'HARD_REJECTED',
]);
export type FreelanceScamRisk = z.infer<typeof FreelanceScamRiskSchema>;

export const FreelanceRiskReasonSchema = z.enum([
  'PAY_TO_WORK',
  'ACCOUNT_RENTAL',
  'CREDENTIAL_OR_OTP_REQUEST',
  'FAKE_REVIEW_OR_ENGAGEMENT',
  'IMPERSONATION',
  'ACADEMIC_CHEATING',
  'MALWARE_OR_CREDENTIAL_THEFT',
  'PROHIBITED_AUTOMATION_OR_SCRAPING',
  'CRYPTO_DEPOSIT_OR_INVESTMENT',
  'MONEY_LAUNDERING_OR_RESHIPPING',
  'IDENTITY_DOCUMENT_MISUSE',
  'ADULT_CONTENT',
  'ILLEGAL_OR_UNLICENSED_WORK',
  'UNPAID_TEST_WORK',
  'VAGUE_SCOPE',
  'UNREALISTIC_COMPENSATION',
  'OFF_PLATFORM_PAYMENT_REQUEST',
  'MESSAGING_ONLY_RECRUITMENT',
  'NAMED_SELLER_EQUIPMENT_PURCHASE',
  'MISSING_CLIENT_IDENTITY',
  'SHORTENED_URL',
  'MISSING_FUNDED_MILESTONE',
  'CONTRADICTORY_BUDGET',
  'DUPLICATE_DESCRIPTION',
  'URGENT_PERSONAL_DOCUMENT_REQUEST',
  'POTENTIALLY_STALE_LISTING',
]);
export type FreelanceRiskReason = z.infer<typeof FreelanceRiskReasonSchema>;

export const FreelanceRiskAssessmentSchema = z
  .object({
    level: FreelanceScamRiskSchema,
    reasons: z.array(FreelanceRiskReasonSchema).max(20),
    displayMessage: z.literal('Potential risk indicators detected.').nullable(),
  })
  .strict();
export type FreelanceRiskAssessment = z.infer<
  typeof FreelanceRiskAssessmentSchema
>;

export const FreelanceViewSchema = z.enum([
  'PHILIPPINES',
  'INTERNATIONAL_CLIENTS',
  'WORLDWIDE_REMOTE',
]);
export type FreelanceView = z.infer<typeof FreelanceViewSchema>;

export const FreelanceOpportunityCategorySchema = z.enum([
  'TECHNICAL_QUICK_WINS',
  'AI_AUTOMATION',
  'TECHNICAL_VIRTUAL_ASSISTANCE',
  'GENERAL_LEARNABLE_WORK',
]);
export type FreelanceOpportunityCategory = z.infer<
  typeof FreelanceOpportunityCategorySchema
>;

export const FreelanceOpportunityStatusSchema = z.enum([
  'NEW',
  'SHORTLISTED',
  'DISMISSED',
  'APPLIED_MANUALLY',
  'EXPIRED',
  'HARD_REJECTED',
]);
export type FreelanceOpportunityStatus = z.infer<
  typeof FreelanceOpportunityStatusSchema
>;

export const FreelancePreparationSchema = z
  .object({
    state: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']),
    learningCompleted: z.boolean(),
    sampleCreated: z.boolean(),
    sampleLinkOrNote: z.string().trim().max(500).nullable(),
    remainingConcerns: z.string().trim().max(500).nullable(),
    readinessConfirmedManually: z.boolean(),
    completedAt: z.string().datetime().nullable(),
  })
  .strict();
export type FreelancePreparation = z.infer<
  typeof FreelancePreparationSchema
>;

export const FreelanceSourceAttributionSchema = z
  .object({
    source: FreelanceSourceSchema,
    sourceIdentifier: z.string().trim().min(1).max(200),
    sourceUrl: z.string().url(),
    costClassification: FreelanceSourceCostSchema,
  })
  .strict();

export const FreelanceOpportunityCandidateSchema = z
  .object({
    source: FreelanceSourceSchema,
    sourceIdentifier: z.string().trim().min(1).max(200),
    canonicalUrl: z.string().url(),
    title: z.string().trim().min(1).max(240),
    clientOrCompany: z.string().trim().min(1).max(240),
    publicDescription: z.string().trim().min(80).max(200_000),
    publishedAt: z.string().datetime().nullable(),
    expiresAt: z.string().datetime().nullable(),
    clientCountry: z.string().trim().min(1).max(100).nullable(),
    applicantGeographicRestrictions: z
      .array(z.string().trim().min(1).max(100))
      .max(30),
    timezoneRestrictions: z.array(z.string().trim().min(1).max(100)).max(20),
    remote: z.boolean().nullable(),
    contractType: FreelanceContractTypeSchema,
    pay: FreelancePaySchema,
    requiredSkills: z.array(z.string().trim().min(1).max(80)).max(40),
    preferredSkills: z.array(z.string().trim().min(1).max(80)).max(40),
    minimumExperienceYears: z.number().int().min(0).max(50).nullable(),
    seniority: z.array(z.string().trim().min(1).max(60)).max(10),
    categoryHints: z.array(z.string().trim().min(1).max(80)).max(20),
    sourceAttributions: z.array(FreelanceSourceAttributionSchema).min(1).max(8),
  })
  .strict();
export type FreelanceOpportunityCandidate = z.infer<
  typeof FreelanceOpportunityCandidateSchema
>;

export const FreelanceOpportunitySchema = FreelanceOpportunityCandidateSchema.extend({
  id: z.string().trim().min(1).max(128),
  identityKey: z.string().length(64),
  semanticIdentityKey: z.string().length(64),
  descriptionHash: z.string().length(64),
  views: z.array(FreelanceViewSchema).max(3),
  opportunityCategories: z.array(FreelanceOpportunityCategorySchema).max(4),
  readiness: FreelanceReadinessAssessmentSchema,
  risk: FreelanceRiskAssessmentSchema,
  ethicsComplianceStatus: z.enum(['PASS', 'REQUIRES_REVIEW', 'HARD_REJECTED']),
  rankingScore: z.number().int().min(0).max(1000),
  status: FreelanceOpportunityStatusSchema,
  manualNote: z.string().trim().max(500).nullable(),
  preparation: FreelancePreparationSchema,
}).strict();
export type FreelanceOpportunity = z.infer<typeof FreelanceOpportunitySchema>;

export const FreelanceScanPayloadSchema = z
  .object({
    mode: z.enum(['PREVIEW', 'SAVE']),
    cacheStrategy: z.enum(['CACHED', 'FRESH']).default('CACHED'),
    idempotencyKey: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  })
  .strict();
export type FreelanceScanPayload = z.infer<typeof FreelanceScanPayloadSchema>;

export const FreelanceSourceSummarySchema = z.object({
  source: z.enum(['HIMALAYAS', 'REMOTIVE', 'TAVILY', 'GEMINI_SEARCH']),
  status: FreelanceSourceStatusSchema,
  costClassification: FreelanceSourceCostSchema,
  requestsAttempted: z.number().int().nonnegative(),
  requestsCompleted: z.number().int().nonnegative(),
  cacheHits: z.number().int().nonnegative(),
  listingsFetched: z.number().int().nonnegative(),
  accepted: z.number().int().nonnegative(),
  originalPagesFetched: z.number().int().nonnegative().default(0),
  validOpportunityPages: z.number().int().nonnegative().default(0),
  nonOpportunityPages: z.number().int().nonnegative().default(0),
  duplicateOrRepostPages: z.number().int().nonnegative().default(0),
  pagesRecoveredByExtract: z.number().int().nonnegative().default(0),
  pagesWithSufficientTaskScope: z.number().int().nonnegative().default(0),
  pagesWithInsufficientTaskScope: z.number().int().nonnegative().default(0),
  queriesUsed: z.array(z.string().trim().min(1).max(160)).max(8).default([]),
  queryYields: z.array(z.object({
    queryId: z.string().trim().min(1).max(40),
    urlsDiscovered: z.number().int().nonnegative(),
    validIndividualOpportunities: z.number().int().nonnegative(),
    nonOpportunityPages: z.number().int().nonnegative(),
    duplicateOpportunities: z.number().int().nonnegative(),
  }).strict()).max(8).default([]),
  attributionPreserved: z.boolean(),
  searchCreditsConsumed: z.number().int().nonnegative(),
  extractCreditsConsumed: z.number().int().nonnegative(),
  dailyCreditsUsed: z.number().int().nonnegative(),
  dailyCreditsRemaining: z.number().int().nonnegative(),
  monthlyCreditsUsed: z.number().int().nonnegative(),
  monthlyCreditsRemaining: z.number().int().nonnegative(),
  dailyPromptsUsed: z.number().int().nonnegative(),
  dailyPromptsRemaining: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  totalTokens: z.number().int().nonnegative().nullable(),
  providerResponseReached: z.boolean().nullable(),
  quotaReservationReleased: z.boolean().nullable(),
  failures: z.array(z.string().trim().min(1).max(80)).max(20),
}).strict();

export const FreelanceReadinessBlockerSchema = z.enum([
  'MANDATORY_EXPERIENCE_REQUIREMENT',
  'SENIOR_OR_LEAD_RESPONSIBILITY',
  'UNRELATED_JOB_FAMILY',
  'INSUFFICIENT_TASK_SCOPE_EVIDENCE',
  'SKILL_GAP_TOO_BROAD',
  'LEARNING_ESTIMATE_CANNOT_BE_DEFENDED',
  'CERTIFICATION_OR_REGULATED_WORK',
  'GEOGRAPHIC_RESTRICTION',
  'FULL_TIME_NOT_FREELANCE',
  'VAGUE_PROJECT_SCOPE',
  'PAY_UNKNOWN',
  'SCAM_OR_COMPLIANCE_BOUNDARY',
  'OTHER_DETERMINISTIC_REASON',
]);
export type FreelanceReadinessBlocker = z.infer<
  typeof FreelanceReadinessBlockerSchema
>;

export const FreelanceReadinessBlockerCountSchema = z.object({
  code: FreelanceReadinessBlockerSchema,
  count: z.number().int().positive(),
}).strict();
export type FreelanceReadinessBlockerCount = z.infer<
  typeof FreelanceReadinessBlockerCountSchema
>;

export const FreelanceScanReadinessDiagnosticSchema = z.object({
  title: z.string().trim().min(1).max(240),
  source: FreelanceSourceSchema,
  contractType: FreelanceContractTypeSchema,
  payClassification: FreelancePayClassificationSchema,
  geographicEligibility: z.enum(['ELIGIBLE', 'INELIGIBLE', 'REQUIRES_REVIEW']),
  opportunityCategories: z.array(FreelanceOpportunityCategorySchema).max(4),
  readiness: FreelanceReadinessSchema,
  resultState: z.enum([
    'READY_NOW',
    'LEARNABLE_FAST_WITH_AI',
    'REVIEW_SCOPE_MANUALLY',
    'NOT_READY',
    'HARD_REJECTED',
  ]).default('NOT_READY'),
  sourceDomain: z.string().trim().min(1).max(253),
  pageType: z.enum([
    'INDIVIDUAL_OPPORTUNITY',
    'SEARCH_OR_CATEGORY_PAGE',
    'ARTICLE_OR_GUIDE',
    'SERVICE_OR_PROFILE_PAGE',
    'REPOST_OR_AGGREGATOR',
    'PROVIDER_OPPORTUNITY',
    'UNKNOWN',
  ]),
  individualOpportunityPage: z.boolean(),
  taskScopeEvidenceCount: z.number().int().nonnegative(),
  requiredSkillEvidenceCount: z.number().int().nonnegative(),
  transferableSkills: z.array(z.string().trim().min(1).max(80)).max(5),
  missingSkills: z.array(z.string().trim().min(1).max(80)).max(5),
  mandatoryExperienceYears: z.number().int().min(1).max(50).nullable(),
  learningHoursMinimum: z.number().int().min(4).max(24).nullable(),
  learningHoursMaximum: z.number().int().min(4).max(24).nullable(),
  learningTimeUncertain: z.boolean(),
  primaryBlocker: FreelanceReadinessBlockerSchema.nullable(),
  blockerCodes: z.array(FreelanceReadinessBlockerSchema).max(13),
  scamRisk: FreelanceScamRiskSchema,
  complianceStatus: z.enum(['PASS', 'REQUIRES_REVIEW', 'HARD_REJECTED']),
  potentiallyWorthManualReview: z.boolean(),
}).strict();
export type FreelanceScanReadinessDiagnostic = z.infer<
  typeof FreelanceScanReadinessDiagnosticSchema
>;

const FreelancePreviewPublicUrlSchema = z.string().url().max(2_000).refine(
  (value) => {
    try {
      const parsed = new URL(value);
      const hostname = parsed.hostname.toLocaleLowerCase();
      const blockedHost = hostname === 'localhost' || hostname.endsWith('.local') ||
        ['[::1]', '::1', '0.0.0.0'].includes(hostname) ||
        /^\[?(fc|fd|fe8|fe9|fea|feb)[0-9a-f:]*\]?$/i.test(hostname) ||
        /^127\./.test(hostname) || /^10\./.test(hostname) ||
        /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(hostname) ||
        /^192\.168\./.test(hostname) ||
        /^169\.254\./.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
      return ['http:', 'https:'].includes(parsed.protocol) && !blockedHost &&
        parsed.username === '' && parsed.password === '';
    } catch {
      return false;
    }
  },
  'Preview opportunity URL must be a credential-free HTTP(S) URL.',
);

export const FreelancePreviewOpportunitySummarySchema = z.object({
  temporaryResultId: z.string().trim().min(1).max(128),
  title: z.string().trim().min(1).max(240),
  clientOrCompany: z.string().trim().min(1).max(240).nullable(),
  source: FreelanceSourceSchema,
  sourceDomain: z.string().trim().min(1).max(253),
  originalUrl: FreelancePreviewPublicUrlSchema,
  publishedAt: z.string().datetime().nullable(),
  contractType: FreelanceContractTypeSchema,
  remote: z.boolean().nullable(),
  geographicEligibility: z.enum(['ELIGIBLE', 'INELIGIBLE', 'REQUIRES_REVIEW']),
  views: z.array(FreelanceViewSchema).max(3),
  originalPayText: z.string().trim().min(1).max(240).nullable(),
  payClassification: FreelancePayClassificationSchema,
  readiness: FreelanceReadinessSchema,
  resultState: z.enum([
    'READY_NOW',
    'LEARNABLE_FAST_WITH_AI',
    'REVIEW_SCOPE_MANUALLY',
    'NOT_READY',
    'HARD_REJECTED',
  ]),
  primaryBlocker: FreelanceReadinessBlockerSchema.nullable(),
  matchedCategories: z.array(FreelanceOpportunityCategorySchema).max(4),
  transferableSkills: z.array(z.string().trim().min(1).max(80)).max(5),
  missingSkills: z.array(z.string().trim().min(1).max(80)).max(5),
  taskScope: z.object({
    status: z.enum(['SUFFICIENT', 'INSUFFICIENT']),
    evidenceCount: z.number().int().nonnegative().max(100),
    requiredSkillEvidenceCount: z.number().int().nonnegative().max(100),
  }).strict(),
  learning: z.object({
    minimumHours: z.number().int().min(4).max(24).nullable(),
    maximumHours: z.number().int().min(4).max(24).nullable(),
    timeUncertain: z.boolean(),
    practiceRequirements: z.array(z.string().trim().min(1).max(160)).max(3),
    suggestedSampleProject: z.string().trim().min(1).max(240).nullable(),
    deliveryRisks: z.array(z.string().trim().min(1).max(120)).max(3),
  }).strict().nullable(),
  scamRisk: FreelanceScamRiskSchema,
  riskIndicators: z.array(FreelanceRiskReasonSchema).max(3),
  aggregatorOrRepost: z.boolean(),
  recommendedAction: FreelanceRecommendedActionSchema,
  expired: z.boolean(),
}).strict();
export type FreelancePreviewOpportunitySummary = z.infer<
  typeof FreelancePreviewOpportunitySummarySchema
>;

export const FreelanceScanResultSchema = z.object({
  runId: z.string().trim().min(1).max(120),
  mode: z.enum(['PREVIEW', 'SAVE']),
  environment: z.literal('DEVELOPMENT'),
  philippineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum([
    'COMPLETED',
    'COMPLETED_WITH_SOURCE_WARNINGS',
    'NO_RESULTS',
    'NO_SOURCES_ENABLED',
    'DAILY_CAP_REACHED',
    'ALREADY_COMPLETED',
    'FAILED_SAFE',
  ]),
  sourceSummaries: z.array(FreelanceSourceSummarySchema).length(4),
  fetched: z.number().int().nonnegative(),
  sourceCandidatesBeforeDedup: z.number().int().nonnegative().default(0),
  candidatesMergedByDedup: z.number().int().nonnegative().default(0),
  unique: z.number().int().nonnegative(),
  validIndividualOpportunities: z.number().int().nonnegative().default(0),
  nonOpportunityPagesRejected: z.number().int().nonnegative().default(0),
  duplicateOrRepostPages: z.number().int().nonnegative().default(0),
  pagesWithSufficientTaskScope: z.number().int().nonnegative().default(0),
  pagesWithInsufficientTaskScope: z.number().int().nonnegative().default(0),
  aboveMinimum: z.number().int().nonnegative(),
  unknownPay: z.number().int().nonnegative(),
  readyNow: z.number().int().nonnegative(),
  learnableFast: z.number().int().nonnegative(),
  notReady: z.number().int().nonnegative(),
  requiresReview: z.number().int().nonnegative().default(0),
  reviewScopeManually: z.number().int().nonnegative().default(0),
  hardRejected: z.number().int().nonnegative(),
  readinessBlockers: z.array(FreelanceReadinessBlockerCountSchema).max(13).default([]),
  readinessDiagnostics: z.array(FreelanceScanReadinessDiagnosticSchema).max(20).default([]),
  previewOpportunityTotal: z.number().int().nonnegative().default(0),
  previewOpportunities: z.array(FreelancePreviewOpportunitySummarySchema).max(20).default([]),
  selected: z.number().int().nonnegative().max(20),
  savedThisRun: z.number().int().nonnegative().max(20),
  savedBeforeRun: z.number().int().nonnegative().max(20),
  savedAfterRun: z.number().int().nonnegative().max(20),
  dailyRemaining: z.number().int().nonnegative().max(20),
  geminiSearchPrompts: z.number().int().nonnegative(),
  geminiVerificationCalls: z.literal(0),
  applicationsCreated: z.literal(0),
  submissionsCreated: z.literal(0),
  proposalsSent: z.literal(0),
  bidsPlaced: z.literal(0),
  messagesSent: z.literal(0),
  idempotencyStatus: z.enum(['NEW', 'ALREADY_COMPLETED', 'NOT_STARTED']),
  elapsedMs: z.number().int().nonnegative(),
}).strict();
export type FreelanceScanResult = z.infer<typeof FreelanceScanResultSchema>;

export const FreelancePreparationUpdateSchema = z.object({
  action: z.literal('MARK_PREPARATION_COMPLETE'),
  learningCompleted: z.literal(true),
  sampleCreated: z.boolean(),
  sampleLinkOrNote: z.string().trim().min(1).max(500).nullable(),
  remainingConcerns: z.string().trim().max(500).nullable(),
  readinessConfirmedManually: z.literal(true),
}).strict();

export const FreelanceStatusUpdateSchema = z.object({
  action: z.enum(['SHORTLIST', 'DISMISS', 'MARK_APPLIED_MANUALLY']),
  note: z.string().trim().max(500).nullable().optional(),
}).strict();

export const FreelanceManualImportSchema = z.object({
  url: z.string().url().max(2_000),
}).strict();

export const FreelancePreviewSaveRequestSchema = z.object({
  runId: z.string().regex(/^run_[A-Za-z0-9]+$/),
  temporaryResultId: z.string().trim().min(1).max(128),
  confirmed: z.literal(true),
  blockerConfirmed: z.boolean().default(false),
}).strict();

export const FreelancePreviewSaveResponseSchema = z.object({
  status: z.enum(['SAVED_FOR_REVIEW', 'DUPLICATE', 'DAILY_CAP_REACHED']),
  opportunityId: z.string().regex(/^freelance_[a-f0-9]{24}$/).nullable(),
  saved: z.number().int().min(0).max(1),
  duplicates: z.number().int().nonnegative(),
  dailyRemaining: z.number().int().min(0).max(20),
  localOnly: z.literal(true),
  proposalsSent: z.literal(0),
  bidsPlaced: z.literal(0),
  messagesSent: z.literal(0),
  applicationsCreated: z.literal(0),
  submissionsCreated: z.literal(0),
}).strict();
export type FreelancePreviewSaveResponse = z.infer<
  typeof FreelancePreviewSaveResponseSchema
>;
