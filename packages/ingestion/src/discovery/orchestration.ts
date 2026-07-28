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
import type {
  DiscoveryPreview,
  DiscoveryRepository,
  DiscoveryRunSummary,
  DiscoverySourceAdapter,
} from './contracts.js';
import { resolveLeverCompanies } from './lever-selection.js';
import {
  createDryRunRepositorySession,
  defaultDatabasePath,
  defaultSkillsPath,
  loadVerifiedSkills,
} from './runtime.js';
import { runDiscovery } from './runner.js';

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
    remoteOnly: z.boolean().default(true),
    arbeitnowLimit: z.number().int().min(1).max(50).default(50),
    remotiveLimit: z.number().int().min(1).max(50).default(50),
    leverLimit: z.number().int().min(1).max(100).default(50),
    leverCompanies: z
      .array(LeverCompanyIdentifierSchema)
      .default([...DEFAULT_LEVER_COMPANIES]),
  })
  .strict();
export type PublicJobDiscoveryDryRunPayload = z.infer<
  typeof PublicJobDiscoveryDryRunPayloadSchema
>;

export class PublicJobDiscoveryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicJobDiscoveryValidationError';
  }
}

export type PublicJobDiscoverySourceName =
  | 'arbeitnow'
  | 'remotive'
  | 'lever';

export type PublicJobDiscoverySourceStatus = 'SUCCESS' | 'FAILED';

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
  hardRejectedJobs: number;
  eligibleScoredJobs: number;
  pipelineErrors: number;
  jobsThatWouldBePersisted: number;
  jobsPersisted: number;
  preview: DiscoveryPreview[];
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
}

export interface PublicJobDiscoveryDryRunResult {
  mode: 'DRY_RUN';
  startedAt: string;
  completedAt: string;
  query: string;
  sources: Partial<
    Record<PublicJobDiscoverySourceName, PublicJobDiscoverySourceResult>
  >;
  combinedTotals: PublicJobDiscoveryCombinedTotals;
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
    hardRejectedJobs: 0,
    eligibleScoredJobs: 0,
    pipelineErrors: 0,
    jobsThatWouldBePersisted: 0,
    jobsPersisted: 0,
    preview: [],
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
  return {
    code: 'SOURCE_UNAVAILABLE',
    message: 'The discovery source failed safely. No jobs were persisted.',
  };
}

function mapSummaryToSourceResult(
  summary: DiscoveryRunSummary,
): PublicJobDiscoverySourceResult {
  return {
    status: 'SUCCESS',
    sourceRecordsFetched: summary.sourceRecordsFetched,
    acceptedRecords: summary.acceptedRecords,
    invalidRecords: summary.invalidRecords,
    excludedByFilters: summary.excludedByFilters,
    duplicates: summary.duplicates,
    hardRejectedJobs: summary.hardRejectedJobs,
    eligibleScoredJobs: summary.eligibleScoredJobs,
    pipelineErrors: summary.pipelineErrors,
    jobsThatWouldBePersisted: summary.jobsThatWouldBePersisted,
    jobsPersisted: 0,
    preview: summary.preview.slice(0, 5),
  };
}

export function combinePublicJobDiscoveryTotals(
  sources: Partial<
    Record<PublicJobDiscoverySourceName, PublicJobDiscoverySourceResult>
  >,
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
  }

  return totals;
}

export function formatPublicJobDiscoveryDryRunForLog(
  result: PublicJobDiscoveryDryRunResult,
): string {
  const lines = [
    `Public job discovery ${result.mode}`,
    `Query: ${result.query}`,
    `Started: ${result.startedAt}`,
    `Completed: ${result.completedAt}`,
    `Persistence enabled: ${result.persistenceEnabled}`,
    `Applications created: ${result.applicationsCreated}`,
    `Submissions created: ${result.submissionsCreated}`,
    '',
    'Combined totals:',
    `Source records fetched: ${result.combinedTotals.sourceRecordsFetched}`,
    `Accepted by source validation: ${result.combinedTotals.acceptedRecords}`,
    `Rejected as invalid: ${result.combinedTotals.invalidRecords}`,
    `Excluded by local filters: ${result.combinedTotals.excludedByFilters}`,
    `Duplicates: ${result.combinedTotals.duplicates}`,
    `Hard-rejected jobs: ${result.combinedTotals.hardRejectedJobs}`,
    `Eligible/scored jobs: ${result.combinedTotals.eligibleScoredJobs}`,
    `Pipeline errors: ${result.combinedTotals.pipelineErrors}`,
    `Jobs that would be persisted: ${result.combinedTotals.jobsThatWouldBePersisted}`,
    `Jobs persisted: ${result.combinedTotals.jobsPersisted}`,
  ];

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
    );
    if (sourceResult.error) {
      lines.push(
        `Error code: ${sourceResult.error.code}`,
        `Error message: ${sourceResult.error.message}`,
      );
    }
    if (sourceResult.preview.length > 0) {
      lines.push('Preview (descriptions omitted):');
      sourceResult.preview.forEach((job, index) => {
        lines.push(
          `${index + 1}. [${job.status}] ${job.title} — ${job.company} | ${job.location ?? 'Location unknown'} | Score: ${job.score ?? 'Not scored'} | ${job.recommendation ?? 'No recommendation'} | ${job.sourceUrl}`,
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
  },
  repository: DiscoveryRepository,
  verifiedSkills: SkillEntry[],
): Promise<PublicJobDiscoverySourceResult> {
  const summary = await runDiscovery(options, {
    adapter,
    repository,
    verifiedSkills,
  });
  return mapSummaryToSourceResult(summary);
}

export async function runPublicJobDiscoveryDryRun(
  unvalidatedPayload: unknown,
  dependencies: PublicJobDiscoveryDryRunDependencies = {},
): Promise<PublicJobDiscoveryDryRunResult> {
  const payload = parsePayload(unvalidatedPayload);
  const startedAt = (dependencies.now ?? (() => new Date()))().toISOString();
  const databasePath =
    dependencies.databasePath ?? defaultDatabasePath();
  const skillsPath = dependencies.skillsPath ?? defaultSkillsPath();
  const dryRunSession = dependencies.repository
    ? {
        repository: dependencies.repository,
        cleanup() {},
      }
    : createDryRunRepositorySession(databasePath);
  const repository = dryRunSession.repository;
  const verifiedSkills =
    dependencies.verifiedSkills ?? loadVerifiedSkills(skillsPath);
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const timeoutMs = dependencies.timeoutMs ?? 10_000;
  const sources: Partial<
    Record<PublicJobDiscoverySourceName, PublicJobDiscoverySourceResult>
  > = {};

  try {
    const sharedOptions = {
      remoteOnly: payload.remoteOnly,
      query: payload.query,
      category: '',
      apply: false as const,
      pages: 1,
    };

    if (payload.arbeitnowEnabled) {
      dependencies.onSourceStart?.('arbeitnow');
      try {
        sources.arbeitnow = await runSourceDiscovery(
          new ArbeitnowAdapter({ fetchImpl, timeoutMs }),
          {
            ...sharedOptions,
            limit: payload.arbeitnowLimit,
          },
          repository,
          verifiedSkills,
        );
      } catch (error) {
        sources.arbeitnow = emptySourceResult('FAILED', mapSourceError(error));
      }
    }

    if (payload.remotiveEnabled) {
      dependencies.onSourceStart?.('remotive');
      try {
        sources.remotive = await runSourceDiscovery(
          new RemotiveAdapter({ fetchImpl, timeoutMs }),
          {
            ...sharedOptions,
            limit: payload.remotiveLimit,
          },
          repository,
          verifiedSkills,
        );
      } catch (error) {
        sources.remotive = emptySourceResult('FAILED', mapSourceError(error));
      }
    }

    if (payload.leverEnabled) {
      dependencies.onSourceStart?.('lever');
      try {
        const companies = resolveLeverCompanySelection(payload);
        sources.lever = await runSourceDiscovery(
          new LeverAdapter({
            companies,
            fetchImpl,
            timeoutMs,
          }),
          {
            ...sharedOptions,
            limit: payload.leverLimit,
          },
          repository,
          verifiedSkills,
        );
      } catch (error) {
        if (error instanceof PublicJobDiscoveryValidationError) {
          throw error;
        }
        sources.lever = emptySourceResult('FAILED', mapSourceError(error));
      }
    }

    const completedAt = (dependencies.now ?? (() => new Date()))().toISOString();

    return {
      mode: 'DRY_RUN',
      startedAt,
      completedAt,
      query: payload.query,
      sources,
      combinedTotals: combinePublicJobDiscoveryTotals(sources),
      persistenceEnabled: false,
      applicationsCreated: 0,
      submissionsCreated: 0,
    };
  } finally {
    dryRunSession.cleanup();
  }
}
