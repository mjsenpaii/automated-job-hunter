import { checkDuplicate } from '@job-app/classification';
import {
  activity_log,
  job_discovery_persistence_runs,
  jobs,
} from '@job-app/db/schema';
import { and, eq, sql } from 'drizzle-orm';
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
import { PUBLIC_JOB_DISCOVERY_DAILY_LIMIT } from './limits.js';

const CONTROLLED_DISCOVERY_ACTIVITY =
  'CONTROLLED_PUBLIC_JOB_DISCOVERY_COMPLETED';
const SCHEDULED_MORNING_DISCOVERY_ACTIVITY =
  'SCHEDULED_MORNING_PUBLIC_JOB_DISCOVERY_COMPLETED';
const DASHBOARD_SCAN_DISCOVERY_ACTIVITY =
  'DASHBOARD_PUBLIC_JOB_DISCOVERY_COMPLETED';
const CONTROLLED_DISCOVERY_ENTITY_TYPE = 'system';

function validatePhilippineDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Philippine persistence date must use YYYY-MM-DD.');
  }
}

function readDailyPersistenceState(
  database: Pick<JobDatabase, 'select'>,
  controls: { philippineDate: string; idempotencyKey: string },
) {
  validatePhilippineDate(controls.philippineDate);
  const completedRun = database
    .select({ idempotencyKey: job_discovery_persistence_runs.idempotency_key })
    .from(job_discovery_persistence_runs)
    .where(
      eq(
        job_discovery_persistence_runs.idempotency_key,
        controls.idempotencyKey,
      ),
    )
    .get();
  const legacyCompletion = completedRun
    ? undefined
    : database
        .select({ id: activity_log.id })
        .from(activity_log)
        .where(
          and(
            eq(activity_log.action, CONTROLLED_DISCOVERY_ACTIVITY),
            eq(
              activity_log.entity_type,
              CONTROLLED_DISCOVERY_ENTITY_TYPE,
            ),
            eq(activity_log.entity_id, controls.idempotencyKey),
          ),
        )
        .get();
  const aggregate = database
    .select({
      persistedCount: sql<number>`COALESCE(SUM(${job_discovery_persistence_runs.persisted_job_count}), 0)`,
    })
    .from(job_discovery_persistence_runs)
    .where(
      eq(
        job_discovery_persistence_runs.philippine_date,
        controls.philippineDate,
      ),
    )
    .get();
  const persistedCount = Number(aggregate?.persistedCount ?? 0);
  return {
    philippineDate: controls.philippineDate,
    dailyLimit: PUBLIC_JOB_DISCOVERY_DAILY_LIMIT,
    persistedCount,
    remaining: Math.max(
      0,
      PUBLIC_JOB_DISCOVERY_DAILY_LIMIT - persistedCount,
    ),
    idempotencyStatus:
      completedRun || legacyCompletion
        ? ('ALREADY_COMPLETED' as const)
        : ('NOT_STARTED' as const),
  };
}

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
    async getDailyPersistenceState(controls) {
      return readDailyPersistenceState(database, controls);
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

      validatePhilippineDate(controls.philippineDate);
      return database.transaction(
        (transaction): ControlledPersistenceWriteResult => {
          const dailyState = readDailyPersistenceState(
            transaction,
            controls,
          );
          if (dailyState.idempotencyStatus === 'ALREADY_COMPLETED') {
            return {
              idempotencyStatus: 'ALREADY_COMPLETED',
              jobsPersisted: 0,
              scoresPersisted: 0,
              finalDatabaseDuplicates: 0,
              persistedRecords: [],
              persistedBeforeRun: dailyState.persistedCount,
              remainingBeforeRun: dailyState.remaining,
              persistedAfterRun: dailyState.persistedCount,
              dailyRemaining: dailyState.remaining,
              skippedBecauseOfDailyCap: 0,
            };
          }
          if (dailyState.remaining === 0) {
            return {
              idempotencyStatus: 'NOT_STARTED',
              jobsPersisted: 0,
              scoresPersisted: 0,
              finalDatabaseDuplicates: 0,
              persistedRecords: [],
              persistedBeforeRun: dailyState.persistedCount,
              remainingBeforeRun: 0,
              persistedAfterRun: dailyState.persistedCount,
              dailyRemaining: 0,
              skippedBecauseOfDailyCap: records.length,
            };
          }

          const knownJobs = transaction
            .select()
            .from(jobs)
            .all()
            .map(persistedJobToNormalized);
          const uniqueRecords: DiscoveryPersistenceRecord[] = [];
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
            knownJobs.push(normalized);
            uniqueRecords.push(record);
          }

          const approvedRecords = uniqueRecords.slice(
            0,
            Math.min(
              controls.maxJobsToPersist,
              dailyState.remaining,
            ),
          );
          const skippedBecauseOfDailyCap = Math.max(
            0,
            uniqueRecords.length - approvedRecords.length,
          );

          transaction
            .insert(job_discovery_persistence_runs)
            .values({
              idempotency_key: controls.idempotencyKey,
              philippine_date: controls.philippineDate,
              task_id: controls.taskId,
              run_kind: controls.runKind,
              persisted_job_count: approvedRecords.length,
            })
            .run();

          let scoresPersisted = 0;
          for (const record of approvedRecords) {
            insertPersistableIngestionResult(transaction, {
              result: record.result,
              metadata: {
                persistedStatus: record.persistedStatus,
                rawSnapshot: snapshot(record),
                verifiedExtraction: record.verifiedExtraction,
              },
            });
            if (record.result.score_detail) scoresPersisted += 1;
          }

          transaction
            .insert(activity_log)
            .values({
              action:
                controls.runKind === 'SCHEDULED_MORNING'
                  ? SCHEDULED_MORNING_DISCOVERY_ACTIVITY
                  : controls.runKind === 'DASHBOARD_SCAN'
                    ? DASHBOARD_SCAN_DISCOVERY_ACTIVITY
                    : CONTROLLED_DISCOVERY_ACTIVITY,
              entity_type: CONTROLLED_DISCOVERY_ENTITY_TYPE,
              entity_id: controls.idempotencyKey,
              details: JSON.stringify({
                version: 2,
                runKind: controls.runKind,
                taskId: controls.taskId,
                philippineDate: controls.philippineDate,
                jobsPersisted: approvedRecords.length,
                scoresPersisted,
                finalDatabaseDuplicates,
                skippedBecauseOfDailyCap,
                jobIds: approvedRecords.map(
                  (record) => record.result.job_id,
                ),
              }),
            })
            .run();

          return {
            idempotencyStatus: 'NEW',
            jobsPersisted: approvedRecords.length,
            scoresPersisted,
            finalDatabaseDuplicates,
            persistedRecords: approvedRecords,
            persistedBeforeRun: dailyState.persistedCount,
            remainingBeforeRun: dailyState.remaining,
            persistedAfterRun:
              dailyState.persistedCount + approvedRecords.length,
            dailyRemaining: Math.max(
              0,
              dailyState.remaining - approvedRecords.length,
            ),
            skippedBecauseOfDailyCap,
          };
        },
      );
    },
  };
}
