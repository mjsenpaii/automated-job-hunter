import { ingestJob } from '../pipeline.js';
import type { IngestionResult } from '../types.js';
import {
  DiscoveryOptionsSchema,
  type DiscoveredJob,
  type DiscoveryPersistenceRecord,
  type DiscoveryPreview,
  type DiscoveryRunDependencies,
  type DiscoveryRunSummary,
} from './contracts.js';
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

export async function runDiscovery(
  unvalidatedOptions: unknown,
  dependencies: DiscoveryRunDependencies,
): Promise<DiscoveryRunSummary> {
  const options = DiscoveryOptionsSchema.parse(unvalidatedOptions);

  // Fetch and source validation complete before the repository is asked to
  // persist anything. A fetch failure therefore cannot partially write.
  const fetched = await dependencies.adapter.fetchJobs(options);
  const filtered = fetched.jobs.filter((job) =>
    matchesDiscoveryFilters(job, options),
  );
  const existingJobs = await dependencies.repository.loadExistingJobs();
  const currentExisting = [...existingJobs];
  const persistable: DiscoveryPersistenceRecord[] = [];
  const previews: DiscoveryPreview[] = [];
  let duplicates = 0;
  let hardRejectedJobs = 0;
  let eligibleScoredJobs = 0;
  let pipelineErrors = 0;

  for (const discovered of filtered) {
    const raw = mapDiscoveredJobToRawInput(discovered);
    const result = await ingestJob(
      raw,
      currentExisting,
      dependencies.verifiedSkills,
    );
    if (result.status === 'DUPLICATE') duplicates += 1;
    if (result.status === 'HARD_REJECTED') hardRejectedJobs += 1;
    if (result.status === 'INGESTED') eligibleScoredJobs += 1;
    if (result.status === 'ERROR') pipelineErrors += 1;

    if (previews.length < 10) {
      previews.push({
        title: discovered.title,
        company: discovered.company,
        location: discovered.location,
        sourceUrl: discovered.sourceUrl,
        status: previewStatus(result),
        score: result.score ?? null,
        recommendation: result.recommendation ?? null,
      });
    }

    const persistedStatus = persistenceStatus(result);
    if (persistedStatus && result.normalized_job) {
      persistable.push({
        discovered,
        raw,
        result,
        persistedStatus,
      });
      // Reuse the existing dedupe implementation for repeated records within
      // this batch, not only records already stored in SQLite.
      currentExisting.push(result.normalized_job);
    }
  }

  if (options.apply && persistable.length > 0) {
    await dependencies.repository.persistBatch(persistable);
  }

  return {
    source: dependencies.adapter.name,
    dryRun: !options.apply,
    reviewStatus: 'DISCOVERED',
    sourceRecordsFetched: fetched.sourceRecordsFetched,
    acceptedRecords: fetched.acceptedRecords,
    invalidRecords: fetched.invalidRecords,
    excludedByFilters: fetched.jobs.length - filtered.length,
    duplicates,
    hardRejectedJobs,
    eligibleScoredJobs,
    pipelineErrors,
    jobsThatWouldBePersisted: persistable.length,
    jobsPersisted: options.apply ? persistable.length : 0,
    pagesFetched: fetched.pagesFetched,
    preview: previews,
  };
}
