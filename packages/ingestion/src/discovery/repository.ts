import { checkDuplicate } from '@job-app/classification';
import { activity_log, jobs } from '@job-app/db/schema';
import { and, eq } from 'drizzle-orm';
import {
  insertPersistableIngestionResult,
  persistIngestionResults,
  persistedJobToNormalized,
  type JobDatabase,
} from '../persistence.js';
import type {
  ControlledDiscoveryRepository,
  ControlledPersistenceWriteResult,
  DiscoveryPersistenceRecord,
} from './contracts.js';

const CONTROLLED_DISCOVERY_ACTIVITY =
  'CONTROLLED_PUBLIC_JOB_DISCOVERY_COMPLETED';
const CONTROLLED_DISCOVERY_ENTITY_TYPE = 'system';

function snapshot(record: DiscoveryPersistenceRecord): string {
  return JSON.stringify({
    version: record.verifiedExtraction ? 3 : 1,
    source: 'public-discovery',
    attribution: {
      sourceName: record.discovered.sourceName,
      additionalSourceNames: record.additionalSourceNames,
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
    targeting: {
      matchedProfileIds: record.matchedProfileIds,
      matchedProfileEvidence: record.matchedProfileEvidence,
    },
    pipeline: {
      status: record.result.status,
      rejectionReasons: record.result.rejection_reasons ?? [],
    },
    ...(record.verifiedExtraction
      ? { verifiedRequirements: record.verifiedExtraction }
      : {}),
  });
}

export function createDiscoveryRepository(
  database: JobDatabase,
): ControlledDiscoveryRepository {
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
            verifiedExtraction: record.verifiedExtraction,
          },
        })),
      );
    },
    async persistControlledBatch(records, controls) {
      if (
        !Number.isInteger(controls.maxJobsToPersist) ||
        controls.maxJobsToPersist < 1 ||
        controls.maxJobsToPersist > 5
      ) {
        throw new Error(
          'Controlled discovery persistence limit must be between 1 and 5.',
        );
      }
      if (records.length > controls.maxJobsToPersist || records.length > 5) {
        throw new Error(
          'Controlled discovery repository received more records than the approved limit.',
        );
      }

      return database.transaction(
        (transaction): ControlledPersistenceWriteResult => {
          const completed = transaction
            .select({ id: activity_log.id })
            .from(activity_log)
            .where(
              and(
                eq(
                  activity_log.action,
                  CONTROLLED_DISCOVERY_ACTIVITY,
                ),
                eq(
                  activity_log.entity_type,
                  CONTROLLED_DISCOVERY_ENTITY_TYPE,
                ),
                eq(
                  activity_log.entity_id,
                  controls.idempotencyKey,
                ),
              ),
            )
            .get();
          if (completed) {
            return {
              idempotencyStatus: 'ALREADY_COMPLETED',
              jobsPersisted: 0,
              scoresPersisted: 0,
              finalDatabaseDuplicates: 0,
              persistedRecords: [],
            };
          }

          const knownJobs = transaction
            .select()
            .from(jobs)
            .all()
            .map(persistedJobToNormalized);
          const persistedRecords: DiscoveryPersistenceRecord[] = [];
          let scoresPersisted = 0;
          let finalDatabaseDuplicates = 0;

          for (const record of records) {
            const normalized = record.result.normalized_job;
            if (!normalized) {
              throw new Error(
                'Controlled discovery candidate is missing its normalized job.',
              );
            }
            if (checkDuplicate(normalized, knownJobs).is_duplicate) {
              finalDatabaseDuplicates += 1;
              continue;
            }
            insertPersistableIngestionResult(transaction, {
              result: record.result,
              metadata: {
                persistedStatus: record.persistedStatus,
                rawSnapshot: snapshot(record),
                verifiedExtraction: record.verifiedExtraction,
              },
            });
            knownJobs.push(normalized);
            persistedRecords.push(record);
            if (record.result.score_detail) scoresPersisted += 1;
          }

          transaction
            .insert(activity_log)
            .values({
              action: CONTROLLED_DISCOVERY_ACTIVITY,
              entity_type: CONTROLLED_DISCOVERY_ENTITY_TYPE,
              entity_id: controls.idempotencyKey,
              details: JSON.stringify({
                version: 1,
                jobsPersisted: persistedRecords.length,
                scoresPersisted,
                finalDatabaseDuplicates,
                jobIds: persistedRecords.map(
                  (record) => record.result.job_id,
                ),
              }),
            })
            .run();

          return {
            idempotencyStatus: 'NEW',
            jobsPersisted: persistedRecords.length,
            scoresPersisted,
            finalDatabaseDuplicates,
            persistedRecords,
          };
        },
      );
    },
  };
}
