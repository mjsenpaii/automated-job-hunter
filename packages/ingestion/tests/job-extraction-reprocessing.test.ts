import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '@job-app/db/connection';
import {
  activity_log,
  applications,
  job_extractions,
  job_scores,
  jobs,
} from '@job-app/db/schema';
import {
  computeJobRequirementsContentHash,
  GeminiJobRequirementsError,
  type JobRequirementsExtractionInput,
} from '../src/gemini-job-requirements.server.js';
import type { VerifiedJobRequirementsExtraction } from '../src/job-requirements-contracts.js';
import {
  reprocessJobExtractions,
  reprocessingResultExitCode,
} from '../src/job-extraction-reprocessing.js';

const RAW_DESCRIPTION =
  'Requirements\n- You have at least 3 years of experience.\n- You are proficient in Java.';
const MODEL = 'mock-configured-gemini-model';

function insertExistingJob(
  database: ReturnType<typeof getDb>,
  id = 'existing-job-1',
): void {
  database.insert(jobs).values({
    id,
    source_id: `source-${id}`,
    source_name: 'Test Source',
    source_job_id: `provider-${id}`,
    original_url: `https://jobs.example.com/${id}`,
    title:
      id === 'existing-job-1'
        ? 'Backend Software Engineer'
        : 'Frontend Software Engineer',
    company: 'Example Company',
    description: RAW_DESCRIPTION,
    date_posted: '2026-07-29T00:00:00.000Z',
    date_expires: '',
    date_ingested: '2026-07-29T00:00:00.000Z',
    country: 'Philippines',
    city: null,
    region: null,
    work_setup: 'REMOTE',
    work_setup_confidence: 1,
    employment_type: 'FULL_TIME',
    seniority: 'MID',
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    salary_period: null,
    years_experience_min: null,
    required_skills: '[]',
    preferred_skills: '[]',
    category: 'PH',
    eligibility_status: 'ELIGIBLE',
    status: 'SCORING_COMPLETED',
    raw_snapshot: null,
  }).run();
  database.insert(job_scores).values({
    id: `score-${id}`,
    job_id: id,
    score: 20,
    factors: '{}',
    recommendation: 'REVIEW',
    matched_skills: '[]',
    missing_skills: '[]',
    risk_flags: '[]',
    reason: 'Legacy score',
    scored_at: '2026-07-29T00:00:00.000Z',
  }).run();
}

function verifiedExtraction(
  input: JobRequirementsExtractionInput,
  modelIdentifier = MODEL,
): VerifiedJobRequirementsExtraction {
  return {
    schemaVersion: 2,
    contentHash: computeJobRequirementsContentHash(input, modelIdentifier),
    modelIdentifier,
    extractedAt: '2026-07-29T01:00:00.000Z',
    extractionStatus: 'VERIFIED',
    extractionFailureReason: null,
    candidateAudit: [],
    experienceRequirements: [
      {
        minimumYears: 3,
        maximumYears: null,
        requirementType: 'REQUIRED',
        status: 'VERIFIED',
        source: 'DESCRIPTION_GEMINI_VERIFIED',
        reasonCode: 'VERIFIED_EXACT_EVIDENCE',
        evidence: {
          quote: 'You have at least 3 years of experience.',
          section: 'Requirements',
        },
        affectedScoring: true,
      },
    ],
    requiredQualifications: [
      {
        name: 'Java',
        requirementType: 'REQUIRED',
        status: 'VERIFIED',
        source: 'DESCRIPTION_GEMINI_VERIFIED',
        reasonCode: 'VERIFIED_EXACT_EVIDENCE',
        evidence: {
          quote: 'You are proficient in Java.',
          section: 'Requirements',
        },
        affectedScoring: true,
      },
    ],
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
        value: 'REMOTE',
        status: 'VERIFIED',
        source: 'PROVIDER_METADATA',
        reasonCode: 'VERIFIED_PROVIDER_METADATA',
        evidence: null,
        affectedScoring: true,
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
      value: 'FULL_TIME',
      status: 'VERIFIED',
      source: 'PROVIDER_METADATA',
      reasonCode: 'VERIFIED_PROVIDER_METADATA',
      evidence: null,
      affectedScoring: false,
    },
    reviewItems: [],
  };
}

describe('existing-job requirements reprocessing', () => {
  it('keeps dry-run read-only and apply atomic without creating jobs or applications', async () => {
    const database = getDb(':memory:');
    insertExistingJob(database);
    const extractor = vi.fn(
      async (
        input: JobRequirementsExtractionInput,
        options?: { modelIdentifier?: string },
      ) => verifiedExtraction(input, options?.modelIdentifier),
    );

    const dryRun = await reprocessJobExtractions(database, {
      apply: false,
      verifiedSkills: [],
      extractor,
      extractionOptions: { modelIdentifier: MODEL },
      delayBetweenCallsMs: 0,
    });
    expect(dryRun).toMatchObject({
      mode: 'DRY_RUN',
      jobsRead: 1,
      geminiCalls: 1,
      recordsWritten: 0,
      jobsCreated: 0,
      applicationsCreated: 0,
      submissionsCreated: 0,
    });
    expect(database.select().from(job_extractions).all()).toHaveLength(0);
    expect(database.select().from(activity_log).all()).toHaveLength(0);

    const applied = await reprocessJobExtractions(database, {
      apply: true,
      verifiedSkills: [],
      extractor,
      extractionOptions: { modelIdentifier: MODEL },
      delayBetweenCallsMs: 0,
    });
    expect(applied.recordsWritten).toBe(1);
    expect(database.select().from(jobs).all()).toHaveLength(1);
    expect(
      database.select().from(jobs).where(eq(jobs.id, 'existing-job-1')).get()
        ?.description,
    ).toBe(RAW_DESCRIPTION);
    expect(database.select().from(job_extractions).all()).toHaveLength(1);
    expect(database.select().from(job_scores).all()).toHaveLength(1);
    expect(database.select().from(applications).all()).toHaveLength(0);
    expect(database.select().from(activity_log).all()).toHaveLength(1);
    expect(
      database.select().from(activity_log).get()?.action,
    ).toBe('JOB_REQUIREMENTS_REPROCESSING_COMPLETED');
  });

  it('uses the versioned content hash to skip unchanged work without another Gemini call', async () => {
    const database = getDb(':memory:');
    insertExistingJob(database);
    const firstExtractor = vi.fn(
      async (
        input: JobRequirementsExtractionInput,
        options?: { modelIdentifier?: string },
      ) => verifiedExtraction(input, options?.modelIdentifier),
    );
    await reprocessJobExtractions(database, {
      apply: true,
      verifiedSkills: [],
      extractor: firstExtractor,
      extractionOptions: { modelIdentifier: MODEL },
      delayBetweenCallsMs: 0,
    });

    const shouldNotRun = vi.fn();
    const repeated = await reprocessJobExtractions(database, {
      apply: false,
      verifiedSkills: [],
      extractor: shouldNotRun,
      extractionOptions: { modelIdentifier: MODEL },
      delayBetweenCallsMs: 0,
    });
    expect(repeated).toMatchObject({
      geminiCalls: 0,
      skippedByContentHash: 1,
      extractionFailed: 0,
      recordsWritten: 0,
    });
    expect(reprocessingResultExitCode(repeated)).toBe(0);
    expect(shouldNotRun).not.toHaveBeenCalled();
  });

  it('writes every plan atomically when every eligible job succeeds', async () => {
    const database = getDb(':memory:');
    insertExistingJob(database, 'existing-job-1');
    insertExistingJob(database, 'existing-job-2');
    const extractor = vi.fn(async (input, options) =>
      verifiedExtraction(input, options?.modelIdentifier),
    );

    const result = await reprocessJobExtractions(database, {
      apply: true,
      verifiedSkills: [],
      extractor,
      extractionOptions: { modelIdentifier: MODEL },
      delayBetweenCallsMs: 0,
    });

    expect(result).toMatchObject({
      jobsRead: 2,
      extractionSucceeded: 2,
      extractionFailed: 0,
      recordsWritten: 2,
      scoresWritten: 2,
    });
    expect(database.select().from(job_extractions).all()).toHaveLength(2);
    expect(database.select().from(job_scores).all()).toHaveLength(2);
    expect(database.select().from(activity_log).all()).toHaveLength(1);
  });

  it('treats valid content-hash skips as completed outcomes beside new plans', async () => {
    const database = getDb(':memory:');
    insertExistingJob(database, 'existing-job-1');
    const extractor = vi.fn(async (input, options) =>
      verifiedExtraction(input, options?.modelIdentifier),
    );
    await reprocessJobExtractions(database, {
      apply: true,
      verifiedSkills: [],
      extractor,
      extractionOptions: { modelIdentifier: MODEL },
      delayBetweenCallsMs: 0,
    });
    insertExistingJob(database, 'existing-job-2');
    extractor.mockClear();

    const result = await reprocessJobExtractions(database, {
      apply: true,
      verifiedSkills: [],
      extractor,
      extractionOptions: { modelIdentifier: MODEL },
      delayBetweenCallsMs: 0,
    });

    expect(result).toMatchObject({
      jobsRead: 2,
      geminiCalls: 1,
      skippedByContentHash: 1,
      extractionSucceeded: 1,
      extractionFailed: 0,
      recordsWritten: 1,
    });
    expect(extractor).toHaveBeenCalledTimes(1);
    expect(database.select().from(job_extractions).all()).toHaveLength(2);
  });

  it('blocks the entire apply and reports CLI failure when one eligible extraction fails', async () => {
    const database = getDb(':memory:');
    insertExistingJob(database, 'existing-job-1');
    insertExistingJob(database, 'existing-job-2');
    const jobsBefore = database.select().from(jobs).orderBy(jobs.id).all();
    const scoresBefore = database.select().from(job_scores).orderBy(job_scores.job_id).all();
    const extractor = vi.fn(async (input, options) => {
      if (input.title === 'Frontend Software Engineer') {
        throw new GeminiJobRequirementsError('MODEL_OUTPUT_INVALID');
      }
      return verifiedExtraction(input, options?.modelIdentifier);
    });

    const result = await reprocessJobExtractions(database, {
      apply: true,
      verifiedSkills: [],
      extractor,
      extractionOptions: { modelIdentifier: MODEL },
      delayBetweenCallsMs: 0,
    });

    expect(result).toMatchObject({
      jobsRead: 2,
      extractionSucceeded: 1,
      extractionFailed: 1,
      recordsWritten: 0,
      scoresWritten: 0,
    });
    expect(reprocessingResultExitCode(result)).toBe(2);
    expect(database.select().from(job_extractions).all()).toHaveLength(0);
    expect(database.select().from(activity_log).all()).toHaveLength(0);
    expect(database.select().from(jobs).orderBy(jobs.id).all()).toEqual(jobsBefore);
    expect(database.select().from(job_scores).orderBy(job_scores.job_id).all()).toEqual(scoresBefore);
  });

  it('fails closed when Gemini extraction fails and leaves existing data unchanged', async () => {
    const database = getDb(':memory:');
    insertExistingJob(database);
    const before = database.select().from(jobs).get();

    const result = await reprocessJobExtractions(database, {
      apply: true,
      verifiedSkills: [],
      extractor: vi.fn(async () => {
        throw new Error('private provider failure detail');
      }),
      extractionOptions: { modelIdentifier: MODEL },
      delayBetweenCallsMs: 0,
    });

    expect(result).toMatchObject({
      extractionFailed: 1,
      recordsWritten: 0,
      scoresWritten: 0,
      applicationsCreated: 0,
      submissionsCreated: 0,
      previews: [
        expect.objectContaining({
          outcome: 'EXTRACTION_FAILED',
          failureReason: 'MODEL_UNAVAILABLE',
        }),
      ],
    });
    expect(JSON.stringify(result)).not.toContain('private provider failure');
    expect(database.select().from(jobs).get()).toEqual(before);
    expect(database.select().from(job_extractions).all()).toHaveLength(0);
    expect(database.select().from(activity_log).all()).toHaveLength(0);
  });

  it('returns only closed invalid-output diagnostics in a failed preview', async () => {
    const database = getDb(':memory:');
    insertExistingJob(database);
    const result = await reprocessJobExtractions(database, {
      apply: false,
      verifiedSkills: [],
      extractor: vi.fn(async () => {
        throw new GeminiJobRequirementsError(
          'MODEL_OUTPUT_INVALID',
          'MISSING_CANDIDATE_DECISION',
          7,
          6,
          {
            issueCode: 'INVALID_TYPE',
            path: 'decisions[6].classification',
            expectedCategory: 'DECISION_CLASSIFICATION',
            structuralReason: 'MISSING_FIELD',
          },
        );
      }),
      extractionOptions: { modelIdentifier: MODEL },
      delayBetweenCallsMs: 0,
    });

    expect(result.previews).toEqual([
      expect.objectContaining({
        jobId: 'existing-job-1',
        failureReason: 'MODEL_OUTPUT_INVALID',
        failureDiagnosticSubtype: 'MISSING_CANDIDATE_DECISION',
        candidateCount: 7,
        returnedDecisionCount: 6,
        schemaValidationDiagnostic: {
          issueCode: 'INVALID_TYPE',
          path: 'decisions[6].classification',
          expectedCategory: 'DECISION_CLASSIFICATION',
          structuralReason: 'MISSING_FIELD',
        },
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain('description');
    expect(result.recordsWritten).toBe(0);
  });

  it('does not automatically reverse an existing hard rejection during extraction reprocessing', async () => {
    const database = getDb(':memory:');
    insertExistingJob(database);
    database.update(jobs).set({
      status: 'HARD_REJECTED',
      rejection_reasons: JSON.stringify(['EXPERIENCE_TOO_HIGH']),
    }).where(eq(jobs.id, 'existing-job-1')).run();
    database.delete(job_scores).where(eq(job_scores.job_id, 'existing-job-1')).run();

    const result = await reprocessJobExtractions(database, {
      apply: false,
      verifiedSkills: [],
      extractor: vi.fn(async (input, options) =>
        verifiedExtraction(input, options?.modelIdentifier),
      ),
      extractionOptions: { modelIdentifier: MODEL },
      delayBetweenCallsMs: 0,
    });

    expect(result.previews[0]).toMatchObject({
      statusBefore: 'HARD_REJECTED',
      statusAfter: 'HARD_REJECTED',
      scoreAfter: null,
    });
    expect(database.select().from(jobs).get()?.rejection_reasons).toBe(
      JSON.stringify(['EXPERIENCE_TOO_HIGH']),
    );
  });
});
