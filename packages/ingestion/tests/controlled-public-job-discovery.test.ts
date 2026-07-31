import fs from 'node:fs';
import path from 'node:path';
import type { SkillEntry } from '@job-app/core';
import { getDb } from '@job-app/db/connection';
import {
  activity_log,
  applications,
  job_discovery_persistence_runs,
  job_extractions,
  jobs,
  job_scores,
} from '@job-app/db/schema';
import { sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import type {
  ControlledDiscoveryRepository,
  DiscoveryPersistenceRecord,
} from '../src/discovery/contracts.js';
import {
  CONTROLLED_PUBLIC_JOB_DISCOVERY_TASK_ID,
  ControlledPersistenceGateError,
  ControlledPublicJobDiscoveryPayloadSchema,
  isControlledPersistenceKillSwitchEnabled,
  isScheduledPersistenceKillSwitchEnabled,
  philippineCalendarDate,
  runControlledPublicJobDiscovery,
  runScheduledMorningPublicJobDiscoveryPersistence,
  scheduledMorningPersistenceIdempotencyKey,
  SCHEDULED_MORNING_PUBLIC_JOB_DISCOVERY_TASK_ID,
} from '../src/discovery/orchestration.js';
import { createDiscoveryRepository } from '../src/discovery/repository.js';
import { ingestJob } from '../src/pipeline.js';
import type { RawJobInput } from '../src/types.js';
import type { VerifiedJobRequirementsExtraction } from '../src/job-requirements-contracts.js';

const VERIFIED_SKILLS: SkillEntry[] = [
  {
    name: 'TypeScript',
    category: 'language',
    proficiency: null,
    verification_status: 'VERIFIED',
    source: 'CV_MJ.docx',
    source_reference: 'Controlled persistence test fixture',
    evidence_level: 'training',
    allowed_in_resume: true,
  },
];

const VALID_PAYLOAD = {
  scheduleGroup: 'MORNING',
  persistenceMode: 'CONTROLLED',
  maxJobsToPersist: 5,
  idempotencyKey: 'phase-7.1b.4a-test',
} as const;

function arbeitnowRecord(index: number, overrides: Record<string, unknown> = {}) {
  return {
    slug: `controlled-typescript-developer-${index}`,
    company_name: `Controlled Company ${index}`,
    title: `Junior TypeScript Developer ${index}`,
    description: 'You will build React applications.',
    remote: true,
    url: `https://www.arbeitnow.com/jobs/controlled-${index}`,
    tags: ['TypeScript', 'React'],
    job_types: ['Full time'],
    location: 'Remote',
    created_at: 1_753_651_200 + index,
    ...overrides,
  };
}

function controlledFetch(
  arbeitnowJobs: Record<string, unknown>[],
): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('arbeitnow.com')) {
      return Response.json({
        data: arbeitnowJobs,
        links: {},
        meta: { current_page: 1 },
      });
    }
    if (url.includes('remotive.com')) {
      return Response.json({
        '0-legal-notice': 'Test fixture.',
        'job-count': 0,
        jobs: [],
      });
    }
    if (url.includes('api.lever.co')) return Response.json([]);
    throw new Error('Unexpected test URL.');
  }) as typeof fetch;
}

function dependencies(
  repository: ControlledDiscoveryRepository,
  fetchImpl: typeof fetch = controlledFetch([]),
) {
  return {
    environmentType: 'DEVELOPMENT',
    killSwitchEnabled: true,
    taskId: CONTROLLED_PUBLIC_JOB_DISCOVERY_TASK_ID,
    repository,
    fetchImpl,
    verifiedSkills: VERIFIED_SKILLS,
    now: () => new Date('2026-07-29T00:00:00.000Z'),
    requirementsExtractor: vi.fn(
      async (): Promise<VerifiedJobRequirementsExtraction> => ({
        schemaVersion: 2,
        contentHash: 'b'.repeat(64),
        modelIdentifier: 'mock-gemini-model',
        extractedAt: '2026-07-29T00:00:00.000Z',
        extractionStatus: 'VERIFIED',
        extractionFailureReason: null,
        candidateAudit: [],
        experienceRequirements: [],
        requiredQualifications: [],
        preferredQualifications: [],
        degreeRequirements: [],
        certifications: [],
        languages: [],
        salary: {
          currency: null,
          minimum: null,
          maximum: null,
          period: null,
          additionalCompensation: [],
          currencyStatus: 'MISSING',
          minimumStatus: 'MISSING',
          maximumStatus: 'MISSING',
          periodStatus: 'MISSING',
          additionalCompensationStatus: 'MISSING',
          status: 'MISSING',
          source: 'DESCRIPTION_GEMINI_VERIFIED',
          reasonCode: 'NO_EVIDENCE',
          evidence: null,
          affectedScoring: false,
        },
        workArrangement: {
          setup: {
            value: null,
            status: 'MISSING',
            source: 'DESCRIPTION_GEMINI_VERIFIED',
            reasonCode: 'NO_EVIDENCE',
            evidence: null,
            affectedScoring: false,
          },
          geographicRestrictions: [],
          collaborationTimezone: {
            value: null,
            status: 'MISSING',
            source: 'DESCRIPTION_GEMINI_VERIFIED',
            reasonCode: 'NO_EVIDENCE',
            evidence: null,
            affectedScoring: false,
          },
          scheduleRequirements: [],
        },
        employmentType: {
          value: null,
          status: 'MISSING',
          source: 'DESCRIPTION_GEMINI_VERIFIED',
          reasonCode: 'NO_EVIDENCE',
          evidence: null,
          affectedScoring: false,
        },
        reviewItems: [],
      }),
    ),
  };
}

function inertRepository(): ControlledDiscoveryRepository {
  return {
    async loadExistingJobs() {
      return [];
    },
    persistBatch: vi.fn(),
    async getDailyPersistenceState({ philippineDate }) {
      return {
        philippineDate,
        dailyLimit: 5,
        persistedCount: 0,
        remaining: 5,
        idempotencyStatus: 'NOT_STARTED' as const,
      };
    },
    persistControlledBatch: vi.fn(async () => ({
      idempotencyStatus: 'NEW' as const,
      jobsPersisted: 0,
      scoresPersisted: 0,
      finalDatabaseDuplicates: 0,
      persistedRecords: [],
      persistedBeforeRun: 0,
      remainingBeforeRun: 5,
      persistedAfterRun: 0,
      dailyRemaining: 5,
      skippedBecauseOfDailyCap: 0,
    })),
  };
}

async function persistenceRecord(
  index: number,
): Promise<DiscoveryPersistenceRecord> {
  const raw: RawJobInput = {
    source_name: 'Test Source',
    source_job_id: `controlled-record-${index}`,
    original_url: `https://jobs.example.com/controlled-record-${index}`,
    title: `Junior TypeScript Developer ${index}`,
    company: `Controlled Repository Company ${index}`,
    description: 'You will build React applications.',
    date_posted: '2026-07-29T00:00:00.000Z',
    country: 'Philippines',
    work_setup_hint: 'REMOTE',
    employment_type: 'Full time',
    required_skills: ['TypeScript'],
  };
  const result = await ingestJob(raw, [], VERIFIED_SKILLS);
  if (result.status !== 'INGESTED' || !result.normalized_job) {
    throw new Error('Controlled test fixture did not produce a scored job.');
  }
  return {
    discovered: {
      sourceName: 'Test Source',
      sourceJobId: `controlled-record-${index}`,
      title: raw.title,
      company: raw.company,
      location: 'Remote',
      remote: true,
      employmentType: 'Full time',
      description: raw.description,
      tags: ['TypeScript'],
      publishedAt: '2026-07-29T00:00:00.000Z',
      sourceUrl: raw.original_url!,
      applicationUrl: raw.original_url!,
    },
    additionalSourceNames: [],
    raw,
    result,
    persistedStatus: 'DISCOVERED',
    matchedProfileIds: ['software_development'],
    matchedProfileEvidence: [
      {
        profileId: 'software_development',
        evidence: [
          {
            type: 'title_role',
            value: 'typescript developer',
          },
        ],
      },
    ],
  };
}

describe('controlled public-job persistence', () => {
  it('uses a strict bounded payload schema', () => {
    expect(
      ControlledPublicJobDiscoveryPayloadSchema.parse(VALID_PAYLOAD),
    ).toEqual(VALID_PAYLOAD);
    expect(() =>
      ControlledPublicJobDiscoveryPayloadSchema.parse({
        ...VALID_PAYLOAD,
        maxJobsToPersist: 6,
      }),
    ).toThrow();
    expect(() =>
      ControlledPublicJobDiscoveryPayloadSchema.parse({
        ...VALID_PAYLOAD,
        applications: true,
      }),
    ).toThrow();
    expect(() =>
      ControlledPublicJobDiscoveryPayloadSchema.parse({
        ...VALID_PAYLOAD,
        profileIds: ['software_development', 'software_development'],
      }),
    ).toThrow();
    expect(() =>
      ControlledPublicJobDiscoveryPayloadSchema.parse({
        ...VALID_PAYLOAD,
        idempotencyKey: '',
      }),
    ).toThrow();
  });

  it('rejects non-development execution before fetching', async () => {
    const fetchImpl = vi.fn();
    await expect(
      runControlledPublicJobDiscovery(VALID_PAYLOAD, {
        ...dependencies(inertRepository(), fetchImpl as typeof fetch),
        environmentType: 'PRODUCTION',
      }),
    ).rejects.toMatchObject({
      code: 'NON_DEVELOPMENT_ENVIRONMENT',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects an absent or disabled kill switch before fetching', async () => {
    expect(isControlledPersistenceKillSwitchEnabled(undefined)).toBe(false);
    expect(isControlledPersistenceKillSwitchEnabled('')).toBe(false);
    expect(isControlledPersistenceKillSwitchEnabled('false')).toBe(false);
    expect(isControlledPersistenceKillSwitchEnabled('TRUE')).toBe(false);
    expect(isControlledPersistenceKillSwitchEnabled('true')).toBe(true);
    const fetchImpl = vi.fn();
    await expect(
      runControlledPublicJobDiscovery(VALID_PAYLOAD, {
        ...dependencies(inertRepository(), fetchImpl as typeof fetch),
        killSwitchEnabled: false,
      }),
    ).rejects.toMatchObject({ code: 'KILL_SWITCH_DISABLED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('requires the exact scheduled-persistence kill switch value', () => {
    expect(isScheduledPersistenceKillSwitchEnabled(undefined)).toBe(false);
    expect(isScheduledPersistenceKillSwitchEnabled('')).toBe(false);
    expect(isScheduledPersistenceKillSwitchEnabled('false')).toBe(false);
    expect(isScheduledPersistenceKillSwitchEnabled('TRUE')).toBe(false);
    expect(isScheduledPersistenceKillSwitchEnabled(' true ')).toBe(false);
    expect(isScheduledPersistenceKillSwitchEnabled('true')).toBe(true);
  });

  it('rejects scheduled persistence outside DEVELOPMENT before fetching', async () => {
    const fetchImpl = vi.fn();
    await expect(
      runScheduledMorningPublicJobDiscoveryPersistence({
        ...dependencies(inertRepository(), fetchImpl as typeof fetch),
        environmentType: 'PRODUCTION',
        taskId: SCHEDULED_MORNING_PUBLIC_JOB_DISCOVERY_TASK_ID,
      }),
    ).rejects.toMatchObject({ code: 'NON_DEVELOPMENT_ENVIRONMENT' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects scheduled persistence when its independent switch is disabled', async () => {
    const fetchImpl = vi.fn();
    await expect(
      runScheduledMorningPublicJobDiscoveryPersistence({
        ...dependencies(inertRepository(), fetchImpl as typeof fetch),
        killSwitchEnabled: false,
        taskId: SCHEDULED_MORNING_PUBLIC_JOB_DISCOVERY_TASK_ID,
      }),
    ).rejects.toMatchObject({ code: 'KILL_SWITCH_DISABLED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects calls from any task other than the dedicated task', async () => {
    await expect(
      runControlledPublicJobDiscovery(VALID_PAYLOAD, {
        ...dependencies(inertRepository()),
        taskId: 'public-job-discovery-morning-dry-run',
      }),
    ).rejects.toMatchObject({ code: 'WRONG_TASK' });
  });

  it('returns a safe gate error for malformed payloads', async () => {
    await expect(
      runControlledPublicJobDiscovery(
        { persistenceMode: 'CONTROLLED' },
        dependencies(inertRepository()),
      ),
    ).rejects.toBeInstanceOf(ControlledPersistenceGateError);
  });

  it('does not persist filtered or untargeted records', async () => {
    const database = getDb(':memory:');
    const repository = createDiscoveryRepository(database);
    const result = await runControlledPublicJobDiscovery(
      VALID_PAYLOAD,
      dependencies(
        repository,
        controlledFetch([
          arbeitnowRecord(1, { remote: false }),
          arbeitnowRecord(2, {
            title: 'Operations Coordinator',
            description: 'Coordinate weekly operational reports.',
            tags: [],
          }),
        ]),
      ),
    );

    expect(result.qualifiedBeforeCap).toBe(0);
    expect(result.jobsPersisted).toBe(0);
    expect(database.select().from(jobs).all()).toHaveLength(0);
    expect(database.select().from(job_scores).all()).toHaveLength(0);
    expect(database.select().from(applications).all()).toHaveLength(0);
  });

  it('persists at most five evidence-backed candidates in stable source order', async () => {
    const database = getDb(':memory:');
    const repository = createDiscoveryRepository(database);
    const result = await runControlledPublicJobDiscovery(
      VALID_PAYLOAD,
      dependencies(
        repository,
        controlledFetch(
          Array.from({ length: 7 }, (_, index) =>
            arbeitnowRecord(index + 1),
          ),
        ),
      ),
    );

    expect(result).toMatchObject({
      mode: 'CONTROLLED',
      environment: 'DEVELOPMENT',
      persistenceLimit: 5,
      qualifiedBeforeCap: 7,
      selectedForPersistence: 5,
      skippedBecauseOfCap: 2,
      jobsPersisted: 5,
      scoresPersisted: 5,
      finalDatabaseDuplicates: 0,
      applicationsCreated: 0,
      submissionsCreated: 0,
      persistenceEnabled: true,
    });
    expect(result.persistedJobs.map((job) => job.title)).toEqual(
      Array.from(
        { length: 5 },
        (_, index) => `Junior TypeScript Developer ${index + 1}`,
      ),
    );
    expect(database.select().from(jobs).all()).toHaveLength(5);
    expect(database.select().from(job_scores).all()).toHaveLength(5);
    expect(database.select().from(applications).all()).toHaveLength(0);
    expect(database.select().from(activity_log).all()).toHaveLength(1);
  });

  it('runs the enabled morning schedule with fixed profiles and a five-job daily cap', async () => {
    const database = getDb(':memory:');
    const result = await runScheduledMorningPublicJobDiscoveryPersistence({
      ...dependencies(
        createDiscoveryRepository(database),
        controlledFetch([arbeitnowRecord(1), arbeitnowRecord(2)]),
      ),
      taskId: SCHEDULED_MORNING_PUBLIC_JOB_DISCOVERY_TASK_ID,
    });

    expect(result).toMatchObject({
      mode: 'CONTROLLED',
      runKind: 'SCHEDULED_MORNING',
      scheduleGroup: 'MORNING',
      philippineDate: '2026-07-29',
      dailyLimit: 5,
      persistedBeforeRun: 0,
      remainingBeforeRun: 5,
      selected: 2,
      persistedThisRun: 2,
      persistedAfterRun: 2,
      dailyRemaining: 3,
      finalStatus: 'COMPLETED',
      activeProfileIds: ['software_development', 'ai_automation'],
      applicationsCreated: 0,
      submissionsCreated: 0,
    });
    expect(database.select().from(jobs).all()).toHaveLength(2);
    expect(database.select().from(applications).all()).toHaveLength(0);
  });

  it('shares the Philippine daily budget between manual and scheduled runs', async () => {
    const database = getDb(':memory:');
    const repository = createDiscoveryRepository(database);
    const first = await runControlledPublicJobDiscovery(
      { ...VALID_PAYLOAD, maxJobsToPersist: 3, idempotencyKey: 'manual-three' },
      dependencies(
        repository,
        controlledFetch(Array.from({ length: 3 }, (_, index) => arbeitnowRecord(index + 1))),
      ),
    );
    const second = await runScheduledMorningPublicJobDiscoveryPersistence({
      ...dependencies(
        repository,
        controlledFetch(Array.from({ length: 5 }, (_, index) => arbeitnowRecord(index + 4))),
      ),
      taskId: SCHEDULED_MORNING_PUBLIC_JOB_DISCOVERY_TASK_ID,
    });

    expect(first.persistedThisRun).toBe(3);
    expect(second).toMatchObject({
      persistedBeforeRun: 3,
      remainingBeforeRun: 2,
      selectedForPersistence: 2,
      persistedThisRun: 2,
      persistedAfterRun: 5,
      dailyRemaining: 0,
    });
    expect(database.select().from(jobs).all()).toHaveLength(5);
    expect(
      database.select().from(job_discovery_persistence_runs).all()
        .reduce((sum, row) => sum + row.persisted_job_count, 0),
    ).toBe(5);
  });

  it('performs no provider or Gemini calls when the daily cap is exhausted', async () => {
    const database = getDb(':memory:');
    const repository = createDiscoveryRepository(database);
    await runControlledPublicJobDiscovery(
      { ...VALID_PAYLOAD, idempotencyKey: 'fill-daily-cap' },
      dependencies(
        repository,
        controlledFetch(Array.from({ length: 5 }, (_, index) => arbeitnowRecord(index + 1))),
      ),
    );
    const fetchImpl = vi.fn();
    const requirementsExtractor = vi.fn();
    const result = await runScheduledMorningPublicJobDiscoveryPersistence({
      ...dependencies(repository, fetchImpl as typeof fetch),
      taskId: SCHEDULED_MORNING_PUBLIC_JOB_DISCOVERY_TASK_ID,
      requirementsExtractor,
    });

    expect(result).toMatchObject({
      finalStatus: 'DAILY_CAP_REACHED',
      persistedBeforeRun: 5,
      remainingBeforeRun: 0,
      persistedThisRun: 0,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(requirementsExtractor).not.toHaveBeenCalled();
  });

  it('returns ALREADY_COMPLETED before provider or Gemini calls for a same-day duplicate', async () => {
    const database = getDb(':memory:');
    const repository = createDiscoveryRepository(database);
    await runScheduledMorningPublicJobDiscoveryPersistence({
      ...dependencies(repository, controlledFetch([arbeitnowRecord(1)])),
      taskId: SCHEDULED_MORNING_PUBLIC_JOB_DISCOVERY_TASK_ID,
    });
    const fetchImpl = vi.fn();
    const requirementsExtractor = vi.fn();
    const duplicate = await runScheduledMorningPublicJobDiscoveryPersistence({
      ...dependencies(repository, fetchImpl as typeof fetch),
      taskId: SCHEDULED_MORNING_PUBLIC_JOB_DISCOVERY_TASK_ID,
      requirementsExtractor,
    });

    expect(duplicate.finalStatus).toBe('ALREADY_COMPLETED');
    expect(duplicate.idempotencyStatus).toBe('ALREADY_COMPLETED');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(requirementsExtractor).not.toHaveBeenCalled();
    expect(database.select().from(activity_log).all()).toHaveLength(1);
  });

  it('uses a fresh budget and idempotency key on the next Philippine day', async () => {
    const database = getDb(':memory:');
    const repository = createDiscoveryRepository(database);
    const dayOne = dependencies(repository, controlledFetch([arbeitnowRecord(1)]));
    const first = await runScheduledMorningPublicJobDiscoveryPersistence({
      ...dayOne,
      taskId: SCHEDULED_MORNING_PUBLIC_JOB_DISCOVERY_TASK_ID,
    });
    const second = await runScheduledMorningPublicJobDiscoveryPersistence({
      ...dependencies(repository, controlledFetch([arbeitnowRecord(2)])),
      taskId: SCHEDULED_MORNING_PUBLIC_JOB_DISCOVERY_TASK_ID,
      now: () => new Date('2026-07-29T16:00:00.000Z'),
    });

    expect(first.philippineDate).toBe('2026-07-29');
    expect(second).toMatchObject({
      philippineDate: '2026-07-30',
      persistedBeforeRun: 0,
      persistedThisRun: 1,
    });
    expect(
      scheduledMorningPersistenceIdempotencyKey(first.philippineDate),
    ).not.toBe(
      scheduledMorningPersistenceIdempotencyKey(second.philippineDate),
    );
  });

  it('resolves Philippine dates correctly at the UTC day boundary', () => {
    expect(
      philippineCalendarDate(new Date('2026-08-01T15:59:59.999Z')),
    ).toBe('2026-08-01');
    expect(
      philippineCalendarDate(new Date('2026-08-01T16:00:00.000Z')),
    ).toBe('2026-08-02');
  });

  it('calls requirements extraction once per selected unique candidate and never above five', async () => {
    const database = getDb(':memory:');
    const base = dependencies(
      createDiscoveryRepository(database),
      controlledFetch(
        Array.from({ length: 7 }, (_, index) => arbeitnowRecord(index + 1)),
      ),
    );
    const requirementsExtractor = vi.fn(base.requirementsExtractor);
    const result = await runControlledPublicJobDiscovery(VALID_PAYLOAD, {
      ...base,
      requirementsExtractor,
    });

    expect(requirementsExtractor).toHaveBeenCalledTimes(5);
    expect(result).toMatchObject({
      selectedForPersistence: 5,
      selectedAfterExtraction: 5,
      extractionFailed: 0,
      jobsPersisted: 5,
    });
  });

  it('does not call Gemini for filtered or untargeted candidates', async () => {
    const database = getDb(':memory:');
    const base = dependencies(
      createDiscoveryRepository(database),
      controlledFetch([
        arbeitnowRecord(1, { remote: false }),
        arbeitnowRecord(2, {
          title: 'Operations Coordinator',
          description: 'Coordinate weekly operational reports.',
          tags: [],
        }),
      ]),
    );
    const requirementsExtractor = vi.fn(base.requirementsExtractor);
    const result = await runControlledPublicJobDiscovery(VALID_PAYLOAD, {
      ...base,
      requirementsExtractor,
    });

    expect(requirementsExtractor).not.toHaveBeenCalled();
    expect(result.selectedForPersistence).toBe(0);
    expect(result.jobsPersisted).toBe(0);
  });

  it('fails closed atomically without replacement when extraction fails', async () => {
    const database = getDb(':memory:');
    const base = dependencies(
      createDiscoveryRepository(database),
      controlledFetch([arbeitnowRecord(1), arbeitnowRecord(2)]),
    );
    const successfulExtraction = base.requirementsExtractor;
    const requirementsExtractor = vi
      .fn()
      .mockRejectedValueOnce(new Error('private provider diagnostic'))
      .mockImplementation(successfulExtraction);
    const result = await runControlledPublicJobDiscovery(
      {
        ...VALID_PAYLOAD,
        maxJobsToPersist: 2,
        idempotencyKey: 'extraction-failure-test',
      },
      { ...base, requirementsExtractor },
    );

    expect(requirementsExtractor).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      selectedForPersistence: 2,
      selectedAfterExtraction: 1,
      extractionFailed: 1,
      jobsPersisted: 0,
      finalStatus: 'EXTRACTION_FAILED',
    });
    expect(JSON.stringify(result)).not.toContain('private provider diagnostic');
    expect(database.select().from(jobs).all()).toHaveLength(0);
    expect(database.select().from(job_scores).all()).toHaveLength(0);
    expect(database.select().from(job_extractions).all()).toHaveLength(0);
    expect(database.select().from(activity_log).all()).toHaveLength(0);
    expect(
      database.select().from(job_discovery_persistence_runs).all(),
    ).toHaveLength(0);
  });

  it('uses the activity ledger to make a repeated key write-idempotent', async () => {
    const database = getDb(':memory:');
    const repository = createDiscoveryRepository(database);
    const first = await runControlledPublicJobDiscovery(
      VALID_PAYLOAD,
      dependencies(repository, controlledFetch([arbeitnowRecord(1)])),
    );
    const second = await runControlledPublicJobDiscovery(
      VALID_PAYLOAD,
      dependencies(
        repository,
        controlledFetch([arbeitnowRecord(1), arbeitnowRecord(2)]),
      ),
    );

    expect(first.idempotencyStatus).toBe('NEW');
    expect(second.idempotencyStatus).toBe('ALREADY_COMPLETED');
    expect(second.jobsPersisted).toBe(0);
    expect(database.select().from(jobs).all()).toHaveLength(1);
    expect(database.select().from(job_scores).all()).toHaveLength(1);
    expect(database.select().from(activity_log).all()).toHaveLength(1);
  });

  it('reports a final database duplicate without writing it twice', async () => {
    const database = getDb(':memory:');
    const realRepository = createDiscoveryRepository(database);
    const existing = await persistenceRecord(1);
    await realRepository.persistBatch([existing]);
    const repository: ControlledDiscoveryRepository = {
      ...realRepository,
      async loadExistingJobs() {
        return [];
      },
    };

    const result = await runControlledPublicJobDiscovery(
      {
        ...VALID_PAYLOAD,
        idempotencyKey: 'final-duplicate-test',
      },
      dependencies(repository, controlledFetch([arbeitnowRecord(1, {
        slug: 'controlled-record-1',
        company_name: existing.discovered.company,
        title: existing.discovered.title,
        url: existing.discovered.sourceUrl,
      })])),
    );

    expect(result.selectedForPersistence).toBe(1);
    expect(result.finalDatabaseDuplicates).toBe(1);
    expect(result.jobsPersisted).toBe(0);
    expect(database.select().from(jobs).all()).toHaveLength(1);
    expect(database.select().from(job_scores).all()).toHaveLength(1);
  });

  it('enforces the five-record limit again at the repository boundary', async () => {
    const database = getDb(':memory:');
    const repository = createDiscoveryRepository(database);
    const records = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        persistenceRecord(index + 1),
      ),
    );
    await expect(
      repository.persistControlledBatch(records, {
        idempotencyKey: 'repository-limit-test',
        maxJobsToPersist: 5,
        philippineDate: '2026-07-29',
        taskId: CONTROLLED_PUBLIC_JOB_DISCOVERY_TASK_ID,
        runKind: 'MANUAL_CONTROLLED',
      }),
    ).rejects.toThrow(/more records than the approved limit/);
    expect(database.select().from(jobs).all()).toHaveLength(0);
  });

  it('atomically caps repeated repository writes at five for one Philippine date', async () => {
    const database = getDb(':memory:');
    const repository = createDiscoveryRepository(database);
    const firstRecords = await Promise.all([
      persistenceRecord(1),
      persistenceRecord(2),
      persistenceRecord(3),
    ]);
    const secondRecords = await Promise.all([
      persistenceRecord(4),
      persistenceRecord(5),
      persistenceRecord(6),
    ]);

    const first = await repository.persistControlledBatch(firstRecords, {
      idempotencyKey: 'daily-budget-first',
      maxJobsToPersist: 3,
      philippineDate: '2026-07-29',
      taskId: CONTROLLED_PUBLIC_JOB_DISCOVERY_TASK_ID,
      runKind: 'MANUAL_CONTROLLED',
    });
    const second = await repository.persistControlledBatch(secondRecords, {
      idempotencyKey: 'daily-budget-second',
      maxJobsToPersist: 3,
      philippineDate: '2026-07-29',
      taskId: SCHEDULED_MORNING_PUBLIC_JOB_DISCOVERY_TASK_ID,
      runKind: 'SCHEDULED_MORNING',
    });

    expect(first.jobsPersisted).toBe(3);
    expect(second).toMatchObject({
      persistedBeforeRun: 3,
      remainingBeforeRun: 2,
      jobsPersisted: 2,
      persistedAfterRun: 5,
      dailyRemaining: 0,
      skippedBecauseOfDailyCap: 1,
    });
    expect(database.select().from(jobs).all()).toHaveLength(5);
    expect(database.select().from(job_scores).all()).toHaveLength(5);
    expect(
      database.select().from(job_discovery_persistence_runs).all()
        .reduce((sum, row) => sum + row.persisted_job_count, 0),
    ).toBe(5);
  });

  it('enforces the daily ceiling inside SQLite even when callers race past preflight', () => {
    const database = getDb(':memory:');
    database.insert(job_discovery_persistence_runs).values({
      idempotency_key: 'database-cap-first',
      philippine_date: '2026-07-29',
      task_id: CONTROLLED_PUBLIC_JOB_DISCOVERY_TASK_ID,
      run_kind: 'MANUAL_CONTROLLED',
      persisted_job_count: 3,
    }).run();

    expect(() =>
      database.insert(job_discovery_persistence_runs).values({
        idempotency_key: 'database-cap-racing-second',
        philippine_date: '2026-07-29',
        task_id: SCHEDULED_MORNING_PUBLIC_JOB_DISCOVERY_TASK_ID,
        run_kind: 'SCHEDULED_MORNING',
        persisted_job_count: 3,
      }).run(),
    ).toThrow(/daily persistence limit exceeded/);
    expect(
      database.select().from(job_discovery_persistence_runs).all()
        .reduce((sum, row) => sum + row.persisted_job_count, 0),
    ).toBe(3);
  });

  it('blocks all persistence when any discovery source fails', async () => {
    const database = getDb(':memory:');
    const repository = createDiscoveryRepository(database);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('arbeitnow.com')) {
        throw new Error('private network diagnostic');
      }
      if (url.includes('remotive.com')) {
        return Response.json({
          '0-legal-notice': 'Test fixture.',
          'job-count': 0,
          jobs: [],
        });
      }
      if (url.includes('api.lever.co')) return Response.json([]);
      throw new Error('Unexpected test URL.');
    }) as typeof fetch;
    const base = dependencies(repository, fetchImpl);
    const requirementsExtractor = vi.fn(base.requirementsExtractor);
    const result = await runControlledPublicJobDiscovery(
      { ...VALID_PAYLOAD, idempotencyKey: 'source-failure-no-write' },
      { ...base, requirementsExtractor },
    );

    expect(result.finalStatus).toBe('SOURCE_FAILED');
    expect(result.jobsPersisted).toBe(0);
    expect(requirementsExtractor).not.toHaveBeenCalled();
    expect(database.select().from(jobs).all()).toHaveLength(0);
    expect(database.select().from(job_extractions).all()).toHaveLength(0);
    expect(database.select().from(activity_log).all()).toHaveLength(0);
    expect(
      database.select().from(job_discovery_persistence_runs).all(),
    ).toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain('private network diagnostic');
  });

  it('rolls back jobs, scores, and idempotency ledger atomically', async () => {
    const database = getDb(':memory:');
    const repository = createDiscoveryRepository(database);
    const records = await Promise.all([
      persistenceRecord(1),
      persistenceRecord(2),
    ]);
    database.run(
      sql.raw(`
        CREATE TRIGGER controlled_test_failure
        BEFORE INSERT ON jobs
        WHEN NEW.title = 'Junior TypeScript Developer 2'
        BEGIN
          SELECT RAISE(ABORT, 'controlled test failure');
        END;
      `),
    );

    await expect(
      repository.persistControlledBatch(records, {
        idempotencyKey: 'atomic-rollback-test',
        maxJobsToPersist: 2,
        philippineDate: '2026-07-29',
        taskId: CONTROLLED_PUBLIC_JOB_DISCOVERY_TASK_ID,
        runKind: 'MANUAL_CONTROLLED',
      }),
    ).rejects.toThrow();
    expect(database.select().from(jobs).all()).toHaveLength(0);
    expect(database.select().from(job_scores).all()).toHaveLength(0);
    expect(database.select().from(job_extractions).all()).toHaveLength(0);
    expect(database.select().from(activity_log).all()).toHaveLength(0);
    expect(
      database.select().from(job_discovery_persistence_runs).all(),
    ).toHaveLength(0);
  });

  it('returns no descriptions, secrets, raw errors, or provider payloads', async () => {
    const database = getDb(':memory:');
    const result = await runControlledPublicJobDiscovery(
      VALID_PAYLOAD,
      dependencies(
        createDiscoveryRepository(database),
        controlledFetch([arbeitnowRecord(1)]),
      ),
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('You will build React applications.');
    expect(serialized).not.toMatch(
      /GEMINI_API_KEY|authorization|stack|providerPayload|databasePath/i,
    );
  });

  it('keeps Gemini extraction behind the server orchestration and has no application workflow dependency', () => {
    const controlledTaskSource = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../../src/trigger/public-job-discovery-controlled-persistence.ts',
      ),
      'utf8',
    );
    expect(controlledTaskSource).not.toMatch(
      /@google\/genai|playwright|puppeteer|nodemailer|coverLetter|generateResume|createApplication|createSubmission/i,
    );
  });
});
