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
  DiscoveryCompanyFetchFailure,
  DiscoveryDeduplicationContext,
  DiscoveryProfileStats,
  DiscoveryRepository,
  DiscoveryRunSummary,
  DiscoverySourceAdapter,
} from './contracts.js';
import {
  getEnabledJobSearchProfileIds,
  getJobSearchProfileDisplayName,
  JobSearchProfileIdListSchema,
  type JobSearchProfileId,
} from './job-search-profiles.v1.js';
import { getScheduleRetrievalHints } from './profile-retrieval-hints.v1.js';
import { resolveLeverCompanies } from './lever-selection.js';
import {
  createDryRunRepositorySession,
  defaultDatabasePath,
  defaultSkillsPath,
  loadVerifiedSkills,
} from './runtime.js';
import {
  finalizeDiscoveryDeduplicationContext,
  materializeDiscoveryRunSummary,
  runDiscovery,
  type DiscoveryIdentityFinalization,
} from './runner.js';

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

export type PublicJobDiscoverySourceStatus =
  | 'SUCCESS'
  | 'PARTIAL_SUCCESS'
  | 'FAILED';

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
  return {
    code: 'SOURCE_UNAVAILABLE',
    message: 'The discovery source failed safely. No jobs were persisted.',
  };
}

function mapSummaryToSourceResult(
  summary: DiscoveryRunSummary,
): PublicJobDiscoverySourceResult {
  const companyReport = summary.companyFetchReport;
  const status: PublicJobDiscoverySourceStatus = companyReport
    ? companyReport.failedCompanies.length === 0
      ? 'SUCCESS'
      : companyReport.successfulCompanies.length > 0
        ? 'PARTIAL_SUCCESS'
        : 'FAILED'
    : 'SUCCESS';
  return {
    status,
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
): Promise<DiscoveryRunSummary> {
  return runDiscovery(options, {
    adapter,
    repository,
    verifiedSkills,
    deduplicationContext,
  });
}

export async function runPublicJobDiscoveryDryRun(
  unvalidatedPayload: unknown,
  dependencies: PublicJobDiscoveryDryRunDependencies = {},
): Promise<PublicJobDiscoveryDryRunResult> {
  const payload = parsePayload(unvalidatedPayload);
  const activeProfileIds = resolveActiveProfileIds(payload);
  const retrievalHints = payload.scheduleGroup
    ? getScheduleRetrievalHints(payload.scheduleGroup)
    : null;
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
  const sourceSummaries: Partial<
    Record<PublicJobDiscoverySourceName, DiscoveryRunSummary>
  > = {};

  try {
    const deduplicationContext: DiscoveryDeduplicationContext = {
      knownJobs: [...(await repository.loadExistingJobs())],
    };
    const sharedOptions = {
      remoteOnly: payload.remoteOnly,
      query: payload.query,
      category: '',
      apply: false as const,
      pages: 1,
      activeProfileIds,
    };

    if (payload.arbeitnowEnabled) {
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
        );
      } catch (error) {
        sources.arbeitnow = emptySourceResult('FAILED', mapSourceError(error));
      }
    }

    if (payload.remotiveEnabled) {
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
        );
      } catch (error) {
        sources.remotive = emptySourceResult('FAILED', mapSourceError(error));
      }
    }

    if (payload.leverEnabled) {
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
        );
      } catch (error) {
        if (error instanceof PublicJobDiscoveryValidationError) {
          throw error;
        }
        sources.lever = emptySourceResult('FAILED', mapSourceError(error));
      }
    }

    for (const sourceName of [
      'arbeitnow',
      'remotive',
      'lever',
    ] as const) {
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
      mode: 'DRY_RUN',
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
    };
  } finally {
    dryRunSession.cleanup();
  }
}
