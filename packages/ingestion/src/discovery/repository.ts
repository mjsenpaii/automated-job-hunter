import { jobs } from '@job-app/db/schema';
import {
  persistIngestionResults,
  persistedJobToNormalized,
  type JobDatabase,
} from '../persistence.js';
import type {
  DiscoveryPersistenceRecord,
  DiscoveryRepository,
} from './contracts.js';

function snapshot(record: DiscoveryPersistenceRecord): string {
  return JSON.stringify({
    version: 1,
    source: 'public-discovery',
    attribution: {
      sourceName: record.discovered.sourceName,
      sourceJobId: record.discovered.sourceJobId,
      sourceUrl: record.discovered.sourceUrl,
      location: record.discovered.location,
      remote: record.discovered.remote,
      employmentType: record.discovered.employmentType,
      category: record.discovered.category ?? null,
      team: record.discovered.team ?? null,
      department: record.discovered.department ?? null,
      workplaceType: record.discovered.workplaceType ?? null,
      salaryText: record.discovered.salaryText ?? null,
      tags: record.discovered.tags,
      publishedAt: record.discovered.publishedAt,
      updatedAt: record.discovered.updatedAt ?? null,
    },
    pipeline: {
      status: record.result.status,
      rejectionReasons: record.result.rejection_reasons ?? [],
    },
  });
}

export function createDiscoveryRepository(
  database: JobDatabase,
): DiscoveryRepository {
  return {
    async loadExistingJobs() {
      return database
        .select()
        .from(jobs)
        .all()
        .map(persistedJobToNormalized);
    },
    async persistBatch(records) {
      persistIngestionResults(
        database,
        records.map((record) => ({
          result: record.result,
          metadata: {
            persistedStatus: record.persistedStatus,
            rawSnapshot: snapshot(record),
          },
        })),
      );
    },
  };
}
