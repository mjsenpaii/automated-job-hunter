import type { NormalizedJob } from '@job-app/core';
import { checkDuplicate } from '@job-app/classification';
import { normalizeJob } from '../normalizer.js';
import { ingestJob } from '../pipeline.js';
import type { IngestionResult } from '../types.js';
import {
  DiscoveryOptionsSchema,
  type DiscoveredJob,
  type DiscoveryDeduplicationContext,
  type DiscoveryIdentityVariant,
  type DiscoveryProfileStats,
  type DiscoveryPersistenceRecord,
  type DiscoveryPreview,
  type DiscoveryRunDependencies,
  type DiscoveryRunSummary,
} from './contracts.js';
import {
  getEnabledJobSearchProfileIds,
  hasVibeCodingMatchEvidence,
  matchProfilesForDiscoveredJobWithEvidence,
  type JobSearchProfileId,
} from './job-search-profiles.v1.js';
import { matchesDiscoveryFilters } from './filters.js';
import { mapDiscoveredJobToRawInput } from './mapper.js';

function previewStatus(
  result: IngestionResult,
): DiscoveryPreview['status'] {
  if (result.status === 'INGESTED') return 'DISCOVERED';
  return result.status;
}

function persistenceStatus(
  result: IngestionResult,
): DiscoveryPersistenceRecord['persistedStatus'] | null {
  if (result.status === 'INGESTED') return 'DISCOVERED';
  if (result.status === 'HARD_REJECTED') return 'HARD_REJECTED';
  return null;
}

interface DiscoveryRunAccounting {
  excludedByFilters: number;
  untargeted: number;
  vibeCodingRolesFound: number;
  duplicates: number;
  hardRejectedJobs: number;
  eligibleScoredJobs: number;
  pipelineErrors: number;
}

interface DiscoveryIdentityOwner {
  accounting: DiscoveryRunAccounting;
}

interface DiscoveryIdentityEntry {
  normalized: NormalizedJob;
  discovered: DiscoveredJob | null;
  state:
    | 'PERSISTED_EXISTING'
    | 'FILTERED'
    | 'UNTARGETED'
    | 'HARD_REJECTED'
    | 'SCORED';
  primarySourceName: string;
  sourceNames: string[];
  owner?: DiscoveryIdentityOwner;
  result?: IngestionResult;
  matchedProfileIds: JobSearchProfileId[];
  matchedProfileEvidence: DiscoveryPreview['matchedProfileEvidence'];
  vibeCoding: boolean;
  variants: DiscoveryIdentityVariant[];
  persistenceRecord?: DiscoveryPersistenceRecord;
}

interface DiscoveryIdentityState {
  entriesByNormalizedId: Map<string, DiscoveryIdentityEntry>;
}

const identityStates = new WeakMap<
  NonNullable<DiscoveryRunDependencies['deduplicationContext']>,
  DiscoveryIdentityState
>();
const summaryOwners = new WeakMap<
  DiscoveryRunSummary,
  {
    owner: DiscoveryIdentityOwner;
    state: DiscoveryIdentityState;
  }
>();

function identityStateFor(
  context: NonNullable<DiscoveryRunDependencies['deduplicationContext']>,
): DiscoveryIdentityState {
  const existing = identityStates.get(context);
  if (existing) return existing;
  const state: DiscoveryIdentityState = {
    entriesByNormalizedId: new Map(
      context.knownJobs.map((normalized) => [
        normalized.id,
        {
          normalized,
          discovered: null,
          state: 'PERSISTED_EXISTING' as const,
          primarySourceName: normalized.source_name,
          sourceNames: [normalized.source_name],
          matchedProfileIds: [],
          matchedProfileEvidence: [],
          vibeCoding: false,
          variants: [],
        },
      ]),
    ),
  };
  identityStates.set(context, state);
  return state;
}

function addSourceProvenance(
  entry: DiscoveryIdentityEntry,
  sourceName: string,
): void {
  if (!entry.sourceNames.includes(sourceName)) {
    entry.sourceNames.push(sourceName);
  }
}

function candidateCompleteness(job: DiscoveredJob): number {
  return [
    job.location,
    job.remote,
    job.employmentType,
    job.category,
    job.team,
    job.department,
    job.workplaceType,
    job.salaryText,
    job.publishedAt,
    job.updatedAt,
    job.applicationUrl,
    job.tags.length > 0 ? job.tags : null,
    job.description.length >= 200 ? job.description : null,
  ].filter((value) => value !== null && value !== undefined).length;
}

function replaceKnownJob(
  knownJobs: NormalizedJob[],
  previousId: string,
  replacement: NormalizedJob,
): void {
  const index = knownJobs.findIndex((job) => job.id === previousId);
  if (index >= 0) {
    knownJobs[index] = replacement;
  } else {
    knownJobs.push(replacement);
  }
}

function reclassifyOwnerAsDuplicate(entry: DiscoveryIdentityEntry): void {
  const owner = entry.owner;
  if (!owner || !['FILTERED', 'UNTARGETED'].includes(entry.state)) return;
  if (entry.state === 'UNTARGETED') {
    owner.accounting.untargeted = Math.max(
      0,
      owner.accounting.untargeted - 1,
    );
  }
  owner.accounting.duplicates += 1;
}

function makePreview(
  discovered: DiscoveredJob,
  result: IngestionResult,
  matchedProfileIds: JobSearchProfileId[],
  matchedProfileEvidence: DiscoveryPreview['matchedProfileEvidence'],
  additionalSourceNames: string[],
): DiscoveryPreview {
  return {
    sourceName: discovered.sourceName,
    additionalSourceNames: [...additionalSourceNames],
    title: discovered.title,
    company: discovered.company,
    location: discovered.location,
    sourceUrl: discovered.sourceUrl,
    status: previewStatus(result),
    score: result.score ?? null,
    recommendation: result.recommendation ?? null,
    matchedProfileIds: [...matchedProfileIds],
    matchedProfileEvidence: matchedProfileEvidence.map((match) => ({
      profileId: match.profileId,
      evidence: match.evidence.map((item) => ({ ...item })),
    })),
  };
}

function previewForEntry(
  entry: DiscoveryIdentityEntry,
): DiscoveryPreview | null {
  if (
    !entry.discovered ||
    !entry.result ||
    (entry.state !== 'HARD_REJECTED' && entry.state !== 'SCORED')
  ) {
    return null;
  }
  return makePreview(
    entry.discovered,
    entry.result,
    entry.matchedProfileIds,
    entry.matchedProfileEvidence,
    entry.sourceNames.filter((name) => name !== entry.primarySourceName),
  );
}

function cloneProfileStats(
  stats: readonly DiscoveryProfileStats[],
): DiscoveryProfileStats[] {
  return stats.map((item) => ({
    ...item,
    preview: item.preview.map((preview) => ({
      ...preview,
      additionalSourceNames: [...preview.additionalSourceNames],
      matchedProfileIds: [...preview.matchedProfileIds],
      matchedProfileEvidence: preview.matchedProfileEvidence.map((match) => ({
        profileId: match.profileId,
        evidence: match.evidence.map((evidence) => ({ ...evidence })),
      })),
    })),
  }));
}

function cloneSummary(summary: DiscoveryRunSummary): DiscoveryRunSummary {
  return {
    ...summary,
    activeProfileIds: [...summary.activeProfileIds],
    preview: summary.preview.map((preview) => ({
      ...preview,
      additionalSourceNames: [...preview.additionalSourceNames],
      matchedProfileIds: [...preview.matchedProfileIds],
      matchedProfileEvidence: preview.matchedProfileEvidence.map((match) => ({
        profileId: match.profileId,
        evidence: match.evidence.map((evidence) => ({ ...evidence })),
      })),
    })),
    profileStats: cloneProfileStats(summary.profileStats),
    ...(summary.companyFetchReport
      ? {
          companyFetchReport: {
            configuredCompanies: [
              ...summary.companyFetchReport.configuredCompanies,
            ],
            attemptedCompanies: [
              ...summary.companyFetchReport.attemptedCompanies,
            ],
            successfulCompanies: [
              ...summary.companyFetchReport.successfulCompanies,
            ],
            failedCompanies: summary.companyFetchReport.failedCompanies.map(
              (failure) => ({ ...failure }),
            ),
            fetchRequestsAttempted:
              summary.companyFetchReport.fetchRequestsAttempted,
            fetchRequestsCompleted:
              summary.companyFetchReport.fetchRequestsCompleted,
          },
        }
      : {}),
  };
}

/**
 * Materialize a fresh source snapshot after shared-context promotion without
 * mutating any DiscoveryRunSummary previously returned to a caller.
 */
export function materializeDiscoveryRunSummary(
  summary: DiscoveryRunSummary,
): DiscoveryRunSummary {
  const metadata = summaryOwners.get(summary);
  if (!metadata) return cloneSummary(summary);
  const entries = [...metadata.state.entriesByNormalizedId.values()].filter(
    (entry) => entry.owner === metadata.owner,
  );
  const previews = entries
    .map(previewForEntry)
    .filter((preview): preview is DiscoveryPreview => preview !== null)
    .slice(0, 10);
  const profileStats = cloneProfileStats(summary.profileStats).map((stats) => ({
    ...stats,
    preview: previews
      .filter((preview) =>
        preview.matchedProfileIds.includes(stats.profileId),
      )
      .slice(0, 5),
  }));
  return {
    ...cloneSummary(summary),
    excludedByFilters: metadata.owner.accounting.excludedByFilters,
    untargeted: metadata.owner.accounting.untargeted,
    vibeCodingRolesFound:
      metadata.owner.accounting.vibeCodingRolesFound,
    duplicates: metadata.owner.accounting.duplicates,
    hardRejectedJobs: metadata.owner.accounting.hardRejectedJobs,
    eligibleScoredJobs: metadata.owner.accounting.eligibleScoredJobs,
    pipelineErrors: metadata.owner.accounting.pipelineErrors,
    preview: previews,
    profileStats,
  };
}

export interface DiscoveryIdentityFinalization {
  acceptedRecords: number;
  untargeted: number;
  hardRejectedJobs: number;
  eligibleScoredJobs: number;
  jobsThatWouldBePersisted: number;
  vibeCodingRolesFound: number;
  preview: DiscoveryPreview[];
  profileStats: DiscoveryProfileStats[];
  persistenceCandidates: DiscoveryPersistenceRecord[];
}

export function finalizeDiscoveryDeduplicationContext(
  context: DiscoveryDeduplicationContext,
  activeProfileIds: readonly JobSearchProfileId[],
): DiscoveryIdentityFinalization {
  const state = identityStates.get(context);
  const entries = state
    ? [...state.entriesByNormalizedId.values()].filter(
        (entry) => entry.variants.length > 0,
      )
    : [];
  const profileStats = new Map<JobSearchProfileId, DiscoveryProfileStats>(
    activeProfileIds.map((profileId) => [
      profileId,
      {
        profileId,
        recordsMatched: 0,
        hardRejectedJobs: 0,
        eligibleScoredJobs: 0,
        jobsThatWouldBePersisted: 0,
        duplicates: 0,
        preview: [],
      },
    ]),
  );
  const preview: DiscoveryPreview[] = [];
  let untargeted = 0;
  let hardRejectedJobs = 0;
  let eligibleScoredJobs = 0;
  let jobsThatWouldBePersisted = 0;
  let vibeCodingRolesFound = 0;
  const persistenceCandidates: DiscoveryPersistenceRecord[] = [];

  for (const entry of entries) {
    if (entry.state === 'UNTARGETED') untargeted += 1;
    if (entry.state === 'HARD_REJECTED') {
      hardRejectedJobs += 1;
      jobsThatWouldBePersisted += 1;
    }
    if (entry.state === 'SCORED') {
      eligibleScoredJobs += 1;
      jobsThatWouldBePersisted += 1;
    }
    if (
      entry.persistenceRecord &&
      (entry.state === 'HARD_REJECTED' || entry.state === 'SCORED')
    ) {
      persistenceCandidates.push({
        ...entry.persistenceRecord,
        additionalSourceNames: entry.sourceNames.filter(
          (name) => name !== entry.primarySourceName,
        ),
        matchedProfileIds: [...entry.persistenceRecord.matchedProfileIds],
        matchedProfileEvidence:
          entry.persistenceRecord.matchedProfileEvidence.map((match) => ({
            profileId: match.profileId,
            evidence: match.evidence.map((item) => ({ ...item })),
          })),
      });
    }
    if (
      entry.vibeCoding &&
      (entry.state === 'HARD_REJECTED' || entry.state === 'SCORED')
    ) {
      vibeCodingRolesFound += 1;
    }

    const entryPreview = previewForEntry(entry);
    if (entryPreview && preview.length < 10) preview.push(entryPreview);
    if (
      entry.state !== 'HARD_REJECTED' &&
      entry.state !== 'SCORED'
    ) {
      continue;
    }
    for (const profileId of entry.matchedProfileIds) {
      const stats = profileStats.get(profileId);
      if (!stats) continue;
      stats.recordsMatched += 1;
      if (entry.state === 'HARD_REJECTED') {
        stats.hardRejectedJobs += 1;
      } else {
        stats.eligibleScoredJobs += 1;
      }
      stats.jobsThatWouldBePersisted += 1;
      if (entryPreview && stats.preview.length < 5) {
        stats.preview.push(entryPreview);
      }
    }
  }

  return {
    acceptedRecords: entries.length,
    untargeted,
    hardRejectedJobs,
    eligibleScoredJobs,
    jobsThatWouldBePersisted,
    vibeCodingRolesFound,
    preview,
    profileStats: activeProfileIds
      .map((profileId) => profileStats.get(profileId))
      .filter((value): value is DiscoveryProfileStats => value !== undefined),
    persistenceCandidates,
  };
}

export async function runDiscovery(
  unvalidatedOptions: unknown,
  dependencies: DiscoveryRunDependencies,
): Promise<DiscoveryRunSummary> {
  const options = DiscoveryOptionsSchema.parse(unvalidatedOptions);
  const activeProfileIds =
    options.activeProfileIds ?? getEnabledJobSearchProfileIds();

  // Fetch and source validation complete before the repository is asked to
  // persist anything. A fetch failure therefore cannot partially write.
  const fetched = await dependencies.adapter.fetchJobs(options);
  const deduplicationContext =
    dependencies.deduplicationContext ?? {
      knownJobs: [...(await dependencies.repository.loadExistingJobs())],
    };
  deduplicationContext.registeredVariants ??= [];
  const currentExisting = deduplicationContext.knownJobs;
  const identityState = identityStateFor(deduplicationContext);
  const persistable: DiscoveryPersistenceRecord[] = [];
  const previews: DiscoveryPreview[] = [];
  const profileStatsMap = new Map<JobSearchProfileId, DiscoveryProfileStats>();
  for (const profileId of activeProfileIds) {
    profileStatsMap.set(profileId, {
      profileId,
      recordsMatched: 0,
      hardRejectedJobs: 0,
      eligibleScoredJobs: 0,
      jobsThatWouldBePersisted: 0,
      duplicates: 0,
      preview: [],
    });
  }
  const accounting: DiscoveryRunAccounting = {
    excludedByFilters: 0,
    untargeted: 0,
    vibeCodingRolesFound: 0,
    duplicates: 0,
    hardRejectedJobs: 0,
    eligibleScoredJobs: 0,
    pipelineErrors: 0,
  };
  const currentOwner: DiscoveryIdentityOwner = { accounting };

  for (const discovered of fetched.jobs) {
    const raw = mapDiscoveredJobToRawInput(discovered);
    let identityNormalized: NormalizedJob;
    try {
      identityNormalized = normalizeJob(raw);
    } catch {
      accounting.pipelineErrors += 1;
      continue;
    }
    const identityDuplicate = checkDuplicate(
      identityNormalized,
      currentExisting,
    );
    const duplicateEntry = identityDuplicate.duplicate_of_id
      ? identityState.entriesByNormalizedId.get(
          identityDuplicate.duplicate_of_id,
        )
      : undefined;
    const passedLocalFilters = matchesDiscoveryFilters(discovered, options);
    const variant: DiscoveryIdentityVariant = {
      sourceName: discovered.sourceName,
      sourceJobId: discovered.sourceJobId,
      sourceUrl: discovered.sourceUrl,
      normalizedId:
        duplicateEntry?.normalized.id ?? identityNormalized.id,
      passedLocalFilters,
      state: passedLocalFilters ? 'UNTARGETED' : 'FILTERED',
      matchedProfileIds: [],
      completenessScore: candidateCompleteness(discovered),
      sourceOrder: deduplicationContext.registeredVariants.length,
    };
    deduplicationContext.registeredVariants.push(variant);
    if (duplicateEntry) duplicateEntry.variants.push(variant);

    if (!passedLocalFilters) {
      accounting.excludedByFilters += 1;
      if (identityDuplicate.is_duplicate) {
        accounting.duplicates += 1;
        if (duplicateEntry) {
          addSourceProvenance(duplicateEntry, discovered.sourceName);
        }
      } else {
        currentExisting.push(identityNormalized);
        identityState.entriesByNormalizedId.set(identityNormalized.id, {
          normalized: identityNormalized,
          discovered,
          state: 'FILTERED',
          primarySourceName: discovered.sourceName,
          sourceNames: [discovered.sourceName],
          owner: currentOwner,
          matchedProfileIds: [],
          matchedProfileEvidence: [],
          vibeCoding: false,
          variants: [variant],
        });
      }
      continue;
    }

    const matchedProfileEvidence = matchProfilesForDiscoveredJobWithEvidence(
      discovered,
      activeProfileIds,
    );
    const matchedProfileIds = matchedProfileEvidence.map(
      (match) => match.profileId,
    );
    variant.matchedProfileIds = [...matchedProfileIds];

    if (matchedProfileIds.length === 0) {
      if (
        identityDuplicate.is_duplicate &&
        duplicateEntry?.state === 'FILTERED'
      ) {
        reclassifyOwnerAsDuplicate(duplicateEntry);
        accounting.untargeted += 1;
        const previousId = duplicateEntry.normalized.id;
        replaceKnownJob(currentExisting, previousId, identityNormalized);
        identityState.entriesByNormalizedId.delete(previousId);
        duplicateEntry.normalized = identityNormalized;
        duplicateEntry.discovered = discovered;
        duplicateEntry.state = 'UNTARGETED';
        duplicateEntry.primarySourceName = discovered.sourceName;
        duplicateEntry.owner = currentOwner;
        duplicateEntry.matchedProfileIds = [];
        duplicateEntry.matchedProfileEvidence = [];
        duplicateEntry.vibeCoding = false;
        identityState.entriesByNormalizedId.set(
          identityNormalized.id,
          duplicateEntry,
        );
        addSourceProvenance(duplicateEntry, discovered.sourceName);
      } else if (identityDuplicate.is_duplicate) {
        accounting.duplicates += 1;
        if (duplicateEntry) {
          addSourceProvenance(duplicateEntry, discovered.sourceName);
          if (
            duplicateEntry.state === 'UNTARGETED' &&
            duplicateEntry.discovered &&
            candidateCompleteness(discovered) >
              candidateCompleteness(duplicateEntry.discovered)
          ) {
            const previousId = duplicateEntry.normalized.id;
            replaceKnownJob(
              currentExisting,
              previousId,
              identityNormalized,
            );
            identityState.entriesByNormalizedId.delete(previousId);
            duplicateEntry.normalized = identityNormalized;
            duplicateEntry.discovered = discovered;
            duplicateEntry.primarySourceName = discovered.sourceName;
            identityState.entriesByNormalizedId.set(
              identityNormalized.id,
              duplicateEntry,
            );
            addSourceProvenance(duplicateEntry, discovered.sourceName);
          }
        }
      } else {
        accounting.untargeted += 1;
        currentExisting.push(identityNormalized);
        const entry: DiscoveryIdentityEntry = {
          normalized: identityNormalized,
          discovered,
          state: 'UNTARGETED',
          primarySourceName: discovered.sourceName,
          sourceNames: [discovered.sourceName],
          owner: currentOwner,
          matchedProfileIds: [],
          matchedProfileEvidence: [],
          vibeCoding: false,
          variants: [variant],
        };
        identityState.entriesByNormalizedId.set(identityNormalized.id, entry);
      }
      continue;
    }

    const promotingEarlierVariant =
      identityDuplicate.is_duplicate &&
      duplicateEntry !== undefined &&
      ['FILTERED', 'UNTARGETED'].includes(duplicateEntry.state);
    const ingestExisting = promotingEarlierVariant
      ? currentExisting.filter(
          (job) => job.id !== duplicateEntry.normalized.id,
        )
      : currentExisting;
    const result = await ingestJob(
      raw,
      ingestExisting,
      dependencies.verifiedSkills,
    );
    const persistedStatus = persistenceStatus(result);
    const promotionSucceeded =
      promotingEarlierVariant &&
      persistedStatus !== null &&
      result.normalized_job !== undefined;

    if (promotionSucceeded && duplicateEntry) {
      reclassifyOwnerAsDuplicate(duplicateEntry);
    } else if (result.status === 'DUPLICATE') {
      accounting.duplicates += 1;
    }
    if (result.status === 'HARD_REJECTED') {
      accounting.hardRejectedJobs += 1;
      variant.state = 'HARD_REJECTED';
    }
    if (result.status === 'INGESTED') {
      accounting.eligibleScoredJobs += 1;
      variant.state = 'SCORED';
    }
    if (result.status === 'ERROR') {
      accounting.pipelineErrors += 1;
    }
    if (result.status === 'DUPLICATE') {
      variant.state =
        duplicateEntry?.state ?? 'PERSISTED_EXISTING';
    }
    if (
      result.status !== 'DUPLICATE' &&
      result.status !== 'ERROR' &&
      hasVibeCodingMatchEvidence(matchedProfileEvidence)
    ) {
      accounting.vibeCodingRolesFound += 1;
    }

    const additionalSourceNames =
      promotionSucceeded && duplicateEntry
        ? duplicateEntry.sourceNames.filter(
            (name) => name !== discovered.sourceName,
          )
        : [];
    const candidatePreview =
      result.status !== 'DUPLICATE'
        ? makePreview(
            discovered,
            result,
            matchedProfileIds,
            matchedProfileEvidence,
            additionalSourceNames,
          )
        : null;
    if (result.status !== 'DUPLICATE' && previews.length < 10) {
      if (candidatePreview) {
        previews.push(candidatePreview);
      }
    }

    for (const profileId of matchedProfileIds) {
      const stats = profileStatsMap.get(profileId);
      if (!stats) continue;
      if (result.status === 'DUPLICATE') {
        stats.duplicates += 1;
        continue;
      }
      if (result.status === 'ERROR') continue;
      stats.recordsMatched += 1;
      if (result.status === 'HARD_REJECTED') stats.hardRejectedJobs += 1;
      if (result.status === 'INGESTED') stats.eligibleScoredJobs += 1;
      if (stats.preview.length < 5) {
        const profilePreview =
          candidatePreview ??
          makePreview(
            discovered,
            result,
            matchedProfileIds,
            matchedProfileEvidence,
            additionalSourceNames,
          );
        stats.preview.push(profilePreview);
      }
    }

    if (persistedStatus && result.normalized_job) {
      const persistenceRecord: DiscoveryPersistenceRecord = {
        discovered,
        additionalSourceNames,
        raw,
        result,
        persistedStatus,
        matchedProfileIds,
        matchedProfileEvidence,
      };
      persistable.push(persistenceRecord);

      if (promotionSucceeded && duplicateEntry) {
        const previousId = duplicateEntry.normalized.id;
        replaceKnownJob(
          currentExisting,
          previousId,
          result.normalized_job,
        );
        identityState.entriesByNormalizedId.delete(previousId);
        duplicateEntry.normalized = result.normalized_job;
        duplicateEntry.discovered = discovered;
        duplicateEntry.state =
          result.status === 'HARD_REJECTED'
            ? 'HARD_REJECTED'
            : 'SCORED';
        duplicateEntry.primarySourceName = discovered.sourceName;
        duplicateEntry.owner = currentOwner;
        duplicateEntry.result = result;
        duplicateEntry.matchedProfileIds = [...matchedProfileIds];
        duplicateEntry.matchedProfileEvidence = [
          ...matchedProfileEvidence,
        ];
        duplicateEntry.vibeCoding = hasVibeCodingMatchEvidence(
          matchedProfileEvidence,
        );
        duplicateEntry.persistenceRecord = persistenceRecord;
        identityState.entriesByNormalizedId.set(
          result.normalized_job.id,
          duplicateEntry,
        );
        addSourceProvenance(duplicateEntry, discovered.sourceName);
      } else {
        currentExisting.push(result.normalized_job);
        const entry: DiscoveryIdentityEntry = {
          normalized: result.normalized_job,
          discovered,
          state:
            result.status === 'HARD_REJECTED'
              ? 'HARD_REJECTED'
              : 'SCORED',
          primarySourceName: discovered.sourceName,
          sourceNames: [discovered.sourceName],
          owner: currentOwner,
          result,
          matchedProfileIds: [...matchedProfileIds],
          matchedProfileEvidence: [...matchedProfileEvidence],
          vibeCoding: hasVibeCodingMatchEvidence(
            matchedProfileEvidence,
          ),
          variants: [variant],
          persistenceRecord,
        };
        identityState.entriesByNormalizedId.set(
          result.normalized_job.id,
          entry,
        );
      }
      for (const profileId of matchedProfileIds) {
        const stats = profileStatsMap.get(profileId);
        if (stats) stats.jobsThatWouldBePersisted += 1;
      }
    } else if (result.status === 'DUPLICATE' && duplicateEntry) {
      addSourceProvenance(duplicateEntry, discovered.sourceName);
    }
  }

  if (options.apply && persistable.length > 0) {
    await dependencies.repository.persistBatch(persistable);
  }

  const summary: DiscoveryRunSummary = {
    source: dependencies.adapter.name,
    dryRun: !options.apply,
    reviewStatus: 'DISCOVERED',
    activeProfileIds,
    sourceRecordsFetched: fetched.sourceRecordsFetched,
    acceptedRecords: fetched.acceptedRecords,
    invalidRecords: fetched.invalidRecords,
    excludedByFilters: accounting.excludedByFilters,
    untargeted: accounting.untargeted,
    vibeCodingRolesFound: accounting.vibeCodingRolesFound,
    duplicates: accounting.duplicates,
    hardRejectedJobs: accounting.hardRejectedJobs,
    eligibleScoredJobs: accounting.eligibleScoredJobs,
    pipelineErrors: accounting.pipelineErrors,
    jobsThatWouldBePersisted: persistable.length,
    jobsPersisted: options.apply ? persistable.length : 0,
    pagesFetched: fetched.pagesFetched,
    preview: previews,
    profileStats: activeProfileIds
      .map((profileId) => profileStatsMap.get(profileId))
      .filter((value): value is DiscoveryProfileStats => value !== undefined),
    ...(fetched.companyFetchReport
      ? { companyFetchReport: fetched.companyFetchReport }
      : {}),
  };
  summaryOwners.set(summary, { owner: currentOwner, state: identityState });
  return summary;
}
