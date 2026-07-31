import { randomUUID } from 'node:crypto';
import { asc, eq, inArray } from 'drizzle-orm';
import {
  activity_log,
  job_extractions,
  job_scores,
  jobs,
} from '@job-app/db/schema';
import {
  checkEligibility,
  classifyCategory,
} from '@job-app/classification';
import { checkHardReject, scoreJob } from '@job-app/scoring';
import type { SkillEntry, StructuredScore } from '@job-app/core';
import {
  computeJobRequirementsContentHash,
  extractVerifiedJobRequirements,
  GeminiJobRequirementsError,
  type ExtractVerifiedJobRequirementsOptions,
  type JobRequirementsExtractionInput,
} from './gemini-job-requirements.server.js';
import { resolveGeminiRequirementsModelIdentifier } from './gemini-job-requirements.server.js';
import {
  JobExtractionSafePreviewSchema,
  JOB_REQUIREMENTS_EXTRACTION_SCHEMA_VERSION,
  VerifiedJobRequirementsExtractionSchema,
  type JobExtractionSafePreview,
  type VerifiedJobRequirementsExtraction,
} from './job-requirements-contracts.js';
import {
  applyVerifiedRequirementsToJob,
  reconcileVerifiedExtractionWithProvider,
} from './job-requirements-verifier.js';
import {
  persistedJobToNormalized,
  type JobDatabase,
} from './persistence.js';

const REPROCESSING_ACTIVITY = 'JOB_REQUIREMENTS_REPROCESSING_COMPLETED';

export interface ReprocessJobExtractionsOptions {
  apply: boolean;
  jobId?: string;
  limit?: number;
  verifiedSkills: SkillEntry[];
  extractor?: (
    input: JobRequirementsExtractionInput,
    options?: ExtractVerifiedJobRequirementsOptions,
  ) => Promise<VerifiedJobRequirementsExtraction>;
  extractionOptions?: ExtractVerifiedJobRequirementsOptions;
  delayBetweenCallsMs?: number;
}

export interface ReprocessJobExtractionsResult {
  mode: 'DRY_RUN' | 'APPLY';
  jobsRead: number;
  eligibleJobs: number;
  geminiCalls: number;
  skippedByContentHash: number;
  extractionSucceeded: number;
  extractionFailed: number;
  recordsWritten: number;
  scoresWritten: number;
  jobsCreated: 0;
  applicationsCreated: 0;
  submissionsCreated: 0;
  previews: JobExtractionSafePreview[];
}

export function reprocessingResultExitCode(
  result: Pick<ReprocessJobExtractionsResult, 'extractionFailed'>,
): 0 | 2 {
  return result.extractionFailed > 0 ? 2 : 0;
}

interface ReprocessingPlan {
  row: typeof jobs.$inferSelect;
  extraction: VerifiedJobRequirementsExtraction;
  statusAfter: 'HARD_REJECTED' | 'SCORING_COMPLETED';
  rejectionReasons: string[];
  score: StructuredScore | null;
  preview: JobExtractionSafePreview;
}

function existingRejectionReasons(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function snapshotAttribution(
  row: typeof jobs.$inferSelect,
): { tags: string[]; location: string | null } {
  try {
    const parsed: unknown = row.raw_snapshot
      ? JSON.parse(row.raw_snapshot)
      : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { tags: [], location: null };
    }
    const attribution = (parsed as Record<string, unknown>).attribution;
    if (
      !attribution ||
      typeof attribution !== 'object' ||
      Array.isArray(attribution)
    ) {
      return { tags: [], location: null };
    }
    const value = attribution as Record<string, unknown>;
    return {
      tags: Array.isArray(value.tags)
        ? value.tags.filter(
            (item): item is string => typeof item === 'string',
          )
        : [],
      location:
        typeof value.location === 'string' ? value.location : null,
    };
  } catch {
    return { tags: [], location: null };
  }
}

function extractionInput(
  row: typeof jobs.$inferSelect,
): JobRequirementsExtractionInput {
  const attribution = snapshotAttribution(row);
  return {
    title: row.title,
    company: row.company,
    rawDescription: row.description,
    providerMetadata: {
      sourceName: row.source_name,
      sourceJobId: row.source_job_id,
      originalUrl: row.original_url,
      country: row.country,
      workSetup: row.work_setup,
      employmentType: row.employment_type,
      location:
        attribution.location ??
        ([row.city, row.region, row.country]
          .filter(Boolean)
          .join(', ') ||
          null),
      tags: attribution.tags,
    },
  };
}

function countConflicts(
  extraction: VerifiedJobRequirementsExtraction,
): number {
  const facts = [
    ...extraction.experienceRequirements,
    ...extraction.requiredQualifications,
    ...extraction.preferredQualifications,
    ...extraction.degreeRequirements,
    ...extraction.certifications,
    ...extraction.languages,
    extraction.salary,
    extraction.workArrangement.setup,
    ...extraction.workArrangement.geographicRestrictions,
    extraction.workArrangement.collaborationTimezone,
    ...extraction.workArrangement.scheduleRequirements,
    extraction.employmentType,
  ];
  return facts.filter((fact) => fact.status === 'CONFLICT').length;
}

function verifiedMinimum(
  extraction: VerifiedJobRequirementsExtraction,
): number | null {
  const values = extraction.experienceRequirements
    .filter(
      (item) =>
        item.status === 'VERIFIED' &&
        item.requirementType === 'REQUIRED' &&
        item.minimumYears !== null,
    )
    .map((item) => item.minimumYears as number);
  return values.length > 0 ? Math.max(...values) : null;
}

function safePreview(
  row: typeof jobs.$inferSelect,
  extraction: VerifiedJobRequirementsExtraction,
  statusAfter: string,
  scoreBefore: number | null,
  scoreAfter: number | null,
  outcome: JobExtractionSafePreview['outcome'],
): JobExtractionSafePreview {
  return JobExtractionSafePreviewSchema.parse({
    jobId: row.id,
    title: row.title,
    company: row.company,
    status: extraction.extractionStatus,
    verifiedMinimumExperienceYears: verifiedMinimum(extraction),
    verifiedSalary:
      extraction.salary.currencyStatus === 'VERIFIED' &&
      extraction.salary.minimumStatus === 'VERIFIED' &&
      extraction.salary.currency &&
      extraction.salary.minimum !== null
        ? {
            currency: extraction.salary.currency,
            minimum: extraction.salary.minimum,
            maximum: extraction.salary.maximum,
            period: extraction.salary.period,
            additionalCompensation: [
              ...extraction.salary.additionalCompensation,
            ],
          }
        : null,
    verifiedGeographicRestrictions:
      extraction.workArrangement.geographicRestrictions
        .filter(
          (item): item is typeof item & { value: string } =>
            item.status === 'VERIFIED' && item.value !== null,
        )
        .map((item) => item.value),
    verifiedTimezone:
      extraction.workArrangement.collaborationTimezone.status ===
        'VERIFIED'
        ? extraction.workArrangement.collaborationTimezone.value
        : null,
    verifiedRequiredQualifications: extraction.requiredQualifications
      .filter((item) => item.status === 'VERIFIED')
      .map((item) => item.name),
    verifiedPreferredQualifications: extraction.preferredQualifications
      .filter((item) => item.status === 'VERIFIED')
      .map((item) => item.name),
    salaryFieldStatuses: {
      currency: extraction.salary.currencyStatus,
      minimum: extraction.salary.minimumStatus,
      maximum: extraction.salary.maximumStatus,
      period: extraction.salary.periodStatus,
      additionalCompensation: extraction.salary.additionalCompensationStatus,
    },
    candidateClassifications: extraction.candidateAudit,
    requiredCount: extraction.requiredQualifications.filter(
      (item) => item.status === 'VERIFIED',
    ).length,
    preferredCount: extraction.preferredQualifications.filter(
      (item) => item.status === 'VERIFIED',
    ).length,
    conflicts: countConflicts(extraction),
    scoreBefore,
    scoreAfter,
    statusBefore: row.status,
    statusAfter,
    outcome,
    failureReason: null,
    failureDiagnosticSubtype: null,
    candidateCount: extraction.candidateAudit.length,
    returnedDecisionCount: extraction.candidateAudit.length,
    schemaValidationDiagnostic: null,
  });
}

function failurePreview(
  row: typeof jobs.$inferSelect,
  scoreBefore: number | null,
  failureReason:
    | 'MODEL_NOT_CONFIGURED'
    | 'MODEL_UNAVAILABLE'
    | 'MODEL_TIMEOUT'
    | 'MODEL_RATE_LIMITED'
    | 'MODEL_OUTPUT_INVALID',
  diagnosticSubtype: GeminiJobRequirementsError['diagnosticSubtype'] = null,
  candidateCount: number | null = null,
  returnedDecisionCount: number | null = null,
  schemaValidationDiagnostic: GeminiJobRequirementsError['schemaValidationDiagnostic'] = null,
): JobExtractionSafePreview {
  return JobExtractionSafePreviewSchema.parse({
    jobId: row.id,
    title: row.title,
    company: row.company,
    status: 'EXTRACTION_FAILED',
    verifiedMinimumExperienceYears: null,
    verifiedSalary: null,
    verifiedGeographicRestrictions: [],
    verifiedTimezone: null,
    verifiedRequiredQualifications: [],
    verifiedPreferredQualifications: [],
    salaryFieldStatuses: {
      currency: 'MISSING',
      minimum: 'MISSING',
      maximum: 'MISSING',
      period: 'MISSING',
      additionalCompensation: 'MISSING',
    },
    candidateClassifications: [],
    requiredCount: 0,
    preferredCount: 0,
    conflicts: 0,
    scoreBefore,
    scoreAfter: scoreBefore,
    statusBefore: row.status,
    statusAfter: row.status,
    outcome: 'EXTRACTION_FAILED',
    failureReason,
    failureDiagnosticSubtype: diagnosticSubtype,
    candidateCount,
    returnedDecisionCount,
    schemaValidationDiagnostic,
  });
}

function toScoreValues(jobId: string, score: StructuredScore) {
  return {
    id: randomUUID(),
    job_id: jobId,
    score: score.score,
    factors: JSON.stringify(score.factors),
    recommendation: score.recommendation,
    matched_skills: JSON.stringify(score.matched_verified_skills),
    missing_skills: JSON.stringify(score.missing_required_skills),
    risk_flags: JSON.stringify(score.risk_flags),
    reason: score.reason,
    scored_at: new Date().toISOString(),
  };
}

function persistPlansAtomically(
  database: JobDatabase,
  plans: ReprocessingPlan[],
): { recordsWritten: number; scoresWritten: number } {
  return database.transaction((transaction) => {
    let scoresWritten = 0;
    for (const plan of plans) {
      const verifiedJob = applyVerifiedRequirementsToJob(
        persistedJobToNormalized(plan.row),
        plan.extraction,
      );
      transaction
        .insert(job_extractions)
        .values({
          job_id: plan.row.id,
          schema_version: plan.extraction.schemaVersion,
          content_hash: plan.extraction.contentHash,
          model_identifier: plan.extraction.modelIdentifier,
          verification_status: plan.extraction.extractionStatus,
          structured_json: JSON.stringify(plan.extraction),
          extracted_at: plan.extraction.extractedAt,
          updated_at: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: job_extractions.job_id,
          set: {
            schema_version: plan.extraction.schemaVersion,
            content_hash: plan.extraction.contentHash,
            model_identifier: plan.extraction.modelIdentifier,
            verification_status: plan.extraction.extractionStatus,
            structured_json: JSON.stringify(plan.extraction),
            extracted_at: plan.extraction.extractedAt,
            updated_at: new Date().toISOString(),
          },
        })
        .run();

      transaction
        .update(jobs)
        .set({
          years_experience_min: verifiedJob.years_experience_min,
          required_skills: JSON.stringify(verifiedJob.required_skills),
          preferred_skills: JSON.stringify(verifiedJob.preferred_skills),
          work_setup: verifiedJob.work_setup,
          work_setup_confidence: verifiedJob.work_setup_confidence,
          salary_min: verifiedJob.salary_min,
          salary_max: verifiedJob.salary_max,
          salary_currency: verifiedJob.salary_currency,
          salary_period: verifiedJob.salary_period,
          eligibility_status: verifiedJob.eligibility_status,
          status: plan.statusAfter,
          rejection_reasons:
            plan.rejectionReasons.length > 0
              ? JSON.stringify(plan.rejectionReasons)
              : null,
          updated_at: new Date().toISOString(),
        })
        .where(eq(jobs.id, plan.row.id))
        .run();

      transaction
        .delete(job_scores)
        .where(eq(job_scores.job_id, plan.row.id))
        .run();
      if (plan.score) {
        transaction.insert(job_scores).values(
          toScoreValues(plan.row.id, plan.score),
        ).run();
        scoresWritten += 1;
      }
    }
    transaction.insert(activity_log).values({
      action: REPROCESSING_ACTIVITY,
      entity_type: 'system',
      entity_id: randomUUID(),
      details: JSON.stringify({
        version: 1,
        jobsReprocessed: plans.length,
        scoresWritten,
        schemaVersion: 2,
      }),
    }).run();
    return { recordsWritten: plans.length, scoresWritten };
  });
}

async function delay(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function reprocessJobExtractions(
  database: JobDatabase,
  options: ReprocessJobExtractionsOptions,
): Promise<ReprocessJobExtractionsResult> {
  const extractor = options.extractor ?? extractVerifiedJobRequirements;
  const modelIdentifier =
    options.extractionOptions?.modelIdentifier ??
    resolveGeminiRequirementsModelIdentifier();
  const allRows = options.jobId
    ? database
        .select()
        .from(jobs)
        .where(eq(jobs.id, options.jobId))
        .orderBy(asc(jobs.id))
        .all()
    : database.select().from(jobs).orderBy(asc(jobs.id)).all();
  const rows =
    options.limit === undefined
      ? allRows
      : allRows.slice(0, options.limit);
  const ids = rows.map((row) => row.id);
  let extractionRows: Array<typeof job_extractions.$inferSelect> = [];
  if (ids.length > 0) {
    try {
      extractionRows = database
        .select()
        .from(job_extractions)
        .where(inArray(job_extractions.job_id, ids))
        .all();
    } catch {
      // A read-only legacy snapshot may predate the additive extraction table.
      // Treat it as having no prior extraction records; never mutate it.
      extractionRows = [];
    }
  }
  const scoreRows =
    ids.length > 0
      ? database
          .select()
          .from(job_scores)
          .where(inArray(job_scores.job_id, ids))
          .all()
      : [];
  const existingExtraction = new Map(
    extractionRows.map((row) => [row.job_id, row]),
  );
  const existingScore = new Map(scoreRows.map((row) => [row.job_id, row]));
  const plans: ReprocessingPlan[] = [];
  const previews: JobExtractionSafePreview[] = [];
  let geminiCalls = 0;
  let skippedByContentHash = 0;
  let extractionFailed = 0;

  for (const row of rows) {
    const input = extractionInput(row);
    const hash = computeJobRequirementsContentHash(input, modelIdentifier);
    const previous = existingExtraction.get(row.id);
    if (
      previous?.content_hash === hash &&
      previous.schema_version === JOB_REQUIREMENTS_EXTRACTION_SCHEMA_VERSION
    ) {
      try {
        const extraction =
          VerifiedJobRequirementsExtractionSchema.parse(
            JSON.parse(previous.structured_json),
          );
        skippedByContentHash += 1;
        previews.push(
          safePreview(
            row,
            extraction,
            row.status,
            existingScore.get(row.id)?.score ?? null,
            existingScore.get(row.id)?.score ?? null,
            'SKIPPED_CONTENT_HASH',
          ),
        );
      } catch {
        extractionFailed += 1;
        previews.push(
          failurePreview(
            row,
            existingScore.get(row.id)?.score ?? null,
            'MODEL_OUTPUT_INVALID',
            'SCHEMA_VALIDATION_FAILED',
          ),
        );
      }
      continue;
    }

    geminiCalls += 1;
    try {
      const proposed = await extractor(input, {
        ...options.extractionOptions,
        modelIdentifier,
      });
      const extraction = reconcileVerifiedExtractionWithProvider(
        proposed,
        {
          salaryMin: row.salary_min,
          salaryMax: row.salary_max,
          salaryCurrency: row.salary_currency,
          workSetup: row.work_setup,
          employmentType: row.employment_type,
        },
      );
      const normalized = applyVerifiedRequirementsToJob(
        persistedJobToNormalized(row),
        extraction,
      );
      const category = normalized.category ?? classifyCategory(normalized);
      normalized.category = category;
      const eligibility = checkEligibility(
        normalized,
        category,
        normalized.work_setup,
        { verifiedRestrictionsOnly: true },
      );
      normalized.eligibility_status = eligibility.status;
      const hardReject = checkHardReject(normalized, {
        isInternationalNonRemote:
          category === 'INTERNATIONAL' &&
          normalized.work_setup !== 'REMOTE',
        isCountryIneligible: eligibility.status === 'INELIGIBLE',
        verifiedRequirementsOnly: true,
      });
      const preserveExistingHardRejection = row.status === 'HARD_REJECTED';
      const score = preserveExistingHardRejection || hardReject.rejected
        ? null
        : scoreJob({
            job: normalized,
            verifiedSkills: options.verifiedSkills,
            eligibilityStatus: eligibility.status,
            workSetup: normalized.work_setup,
            verifiedRequirementsOnly: true,
          });
      const statusAfter = preserveExistingHardRejection || hardReject.rejected
        ? 'HARD_REJECTED'
        : 'SCORING_COMPLETED';
      const preview = safePreview(
        row,
        extraction,
        statusAfter,
        existingScore.get(row.id)?.score ?? null,
        score?.score ?? null,
        options.apply ? 'UPDATED' : 'WOULD_UPDATE',
      );
      previews.push(preview);
      plans.push({
        row,
        extraction,
        statusAfter,
        rejectionReasons: preserveExistingHardRejection
          ? existingRejectionReasons(row.rejection_reasons)
          : hardReject.reasons,
        score,
        preview,
      });
    } catch (error) {
      extractionFailed += 1;
      previews.push(
        failurePreview(
          row,
          existingScore.get(row.id)?.score ?? null,
          error instanceof GeminiJobRequirementsError
            ? error.code
            : 'MODEL_UNAVAILABLE',
          error instanceof GeminiJobRequirementsError
            ? error.diagnosticSubtype
            : null,
          error instanceof GeminiJobRequirementsError
            ? error.candidateCount
            : null,
          error instanceof GeminiJobRequirementsError
            ? error.returnedDecisionCount
            : null,
          error instanceof GeminiJobRequirementsError
            ? error.schemaValidationDiagnostic
            : null,
        ),
      );
    }
    if (geminiCalls < rows.length) {
      await delay(options.delayBetweenCallsMs ?? 4_100);
    }
  }

  const completedOutcomes = plans.length + skippedByContentHash;
  const batchIsComplete =
    extractionFailed === 0 && completedOutcomes === rows.length;
  const writeResult =
    options.apply && plans.length > 0 && batchIsComplete
      ? persistPlansAtomically(database, plans)
      : { recordsWritten: 0, scoresWritten: 0 };

  return {
    mode: options.apply ? 'APPLY' : 'DRY_RUN',
    jobsRead: rows.length,
    eligibleJobs: rows.length,
    geminiCalls,
    skippedByContentHash,
    extractionSucceeded: plans.length,
    extractionFailed,
    recordsWritten: writeResult.recordsWritten,
    scoresWritten: writeResult.scoresWritten,
    jobsCreated: 0,
    applicationsCreated: 0,
    submissionsCreated: 0,
    previews,
  };
}
