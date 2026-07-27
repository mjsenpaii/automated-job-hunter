import type { NormalizedJob, SkillEntry } from '@job-app/core';
import { z } from 'zod';
import type {
  IngestionResult,
  RawJobInput,
} from '../types.js';

export const DiscoveryOptionsSchema = z.object({
  limit: z.number().int().min(1).max(100),
  pages: z.number().int().min(1).max(3),
  remoteOnly: z.boolean(),
  query: z.string(),
  category: z.string().default(''),
  apply: z.boolean(),
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
}

export interface DiscoverySourceAdapter {
  readonly name: string;
  fetchJobs(options: Pick<DiscoveryOptions, 'limit' | 'pages'>): Promise<DiscoveryFetchResult>;
}

export interface DiscoveryPersistenceRecord {
  discovered: DiscoveredJob;
  raw: RawJobInput;
  result: IngestionResult;
  persistedStatus: 'DISCOVERED' | 'HARD_REJECTED';
}

export interface DiscoveryRepository {
  loadExistingJobs(): Promise<NormalizedJob[]>;
  persistBatch(records: DiscoveryPersistenceRecord[]): Promise<void>;
}

export interface DiscoveryPreview {
  title: string;
  company: string;
  location: string | null;
  sourceUrl: string;
  status: 'DISCOVERED' | 'DUPLICATE' | 'HARD_REJECTED' | 'ERROR';
  score: number | null;
  recommendation: string | null;
}

export interface DiscoveryRunSummary {
  source: string;
  dryRun: boolean;
  reviewStatus: 'DISCOVERED';
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
  pagesFetched: number;
  preview: DiscoveryPreview[];
}

export interface DiscoveryRunDependencies {
  adapter: DiscoverySourceAdapter;
  repository: DiscoveryRepository;
  verifiedSkills: SkillEntry[];
}
