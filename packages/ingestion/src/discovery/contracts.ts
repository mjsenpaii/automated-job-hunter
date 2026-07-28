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

export const DiscoveryOptionsSchema = z.object({
  limit: z.number().int().min(1).max(100),
  pages: z.number().int().min(1).max(3),
  remoteOnly: z.boolean(),
  query: z.string(),
  category: z.string().default(''),
  apply: z.boolean(),
  activeProfileIds: JobSearchProfileIdListSchema.optional(),
});
export type DiscoveryOptions = z.infer<typeof DiscoveryOptionsSchema>;

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
}

export interface DiscoveryRepository {
  loadExistingJobs(): Promise<NormalizedJob[]>;
  persistBatch(records: DiscoveryPersistenceRecord[]): Promise<void>;
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
  hardRejectedJobs: number;
  eligibleScoredJobs: number;
  pipelineErrors: number;
  jobsThatWouldBePersisted: number;
  jobsPersisted: number;
  pagesFetched: number;
  preview: DiscoveryPreview[];
  profileStats: DiscoveryProfileStats[];
  companyFetchReport?: DiscoveryCompanyFetchReport;
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
}
