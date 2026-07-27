import 'server-only';

import { jobs } from '@job-app/db/schema';
import {
  ingestJob,
  enrichGovernmentSalary,
  GovernmentSalaryReferenceSchema,
  persistedJobToNormalized,
  persistIngestionResults,
  toJobImportResult,
  type ApiError,
  type ConfirmScoreRequest,
  type JobImportResult,
  type RawJobInput,
} from '@job-app/ingestion';
import { getDatabase } from '@/lib/db';
import { getVerifiedSkills } from '@/lib/verified-skills';

export const toNormalizedForDedupe = persistedJobToNormalized;

function appendUniqueSection(
  description: string,
  heading: string,
  items: string[],
): string {
  const additions = items.filter(
    (item) => !description.toLowerCase().includes(item.toLowerCase()),
  );
  if (additions.length === 0) return description;
  return `${description}\n\n${heading}\n${additions.map((item) => `- ${item}`).join('\n')}`;
}

function composePipelineDescription(data: ConfirmScoreRequest): string {
  let description = data.description;
  description = appendUniqueSection(description, 'Responsibilities', data.responsibilities);
  description = appendUniqueSection(description, 'Requirements', data.requirements);
  description = appendUniqueSection(
    description,
    'Application instructions',
    data.application_instructions,
  );
  return description;
}

function salaryText(data: ConfirmScoreRequest): string | undefined {
  const suppliedText = data.salary_text?.trim();
  const salaryGradeOnly =
    suppliedText &&
    /^\s*(?:salary\s*grade|sg)\s*[-:]?\s*\d{1,2}(?:\s*,?\s*step\s*\d)?\s*$/i.test(
      suppliedText,
    );
  if (suppliedText && !salaryGradeOnly) return suppliedText;
  if (data.salary_min == null && data.salary_max == null) return undefined;
  const values = [data.salary_min, data.salary_max]
    .filter((value): value is number => value != null)
    .join(' - ');
  return [data.salary_currency, values].filter(Boolean).join(' ');
}

function governmentEnrichment(data: ConfirmScoreRequest) {
  return enrichGovernmentSalary({
    company: data.company,
    country: data.country ?? null,
    employmentType: data.employment_type ?? null,
    salaryText: data.salary_text ?? null,
    salaryMin: data.salary_min ?? null,
    salaryMax: data.salary_max ?? null,
    salaryGrade: data.salary_grade ?? null,
    salaryStep: data.salary_step ?? null,
    datePosted: data.date_posted ?? null,
    closingDate: data.closing_date ?? null,
    governmentScope: data.government_scope ?? null,
    evidence: data.evidence,
  });
}

function buildRawInput(data: ConfirmScoreRequest): RawJobInput {
  const eligibilityEvidence = data.evidence
    .filter((item) =>
      ['country', 'location', 'workSetup'].includes(item.field),
    )
    .flatMap((item) => item.excerpts);
  const eligibilityText = [
    data.location,
    data.country,
    data.timezone_or_schedule,
    ...eligibilityEvidence,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' · ');

  return {
    source_name: data.source_site?.trim() || 'Dashboard Import',
    original_url: data.url?.trim() || undefined,
    application_url:
      data.application_url?.trim() || data.url?.trim() || undefined,
    title: data.title,
    company: data.company,
    description: composePipelineDescription(data),
    date_posted: data.date_posted?.trim() || undefined,
    date_expires: data.closing_date || undefined,
    country: data.country?.trim() || undefined,
    city: data.city?.trim() || undefined,
    work_setup_hint: data.work_setup,
    employment_type: data.employment_type?.trim() || undefined,
    schedule:
      [...data.schedule_notes, data.timezone_or_schedule]
        .filter((value): value is string => Boolean(value?.trim()))
        .join(' · ') || undefined,
    seniority_hint: data.seniority?.trim() || undefined,
    salary_text: salaryText(data),
    required_skills: data.skills
      ? data.skills
          .split(',')
          .map((skill) => skill.trim())
          .filter(Boolean)
      : [],
    eligibility_text: eligibilityText || undefined,
    raw_html: JSON.stringify({
      version: 1,
      source: 'unified-import',
      extraction: data,
    }),
  };
}

export async function processAndPersistImportedJob(
  data: ConfirmScoreRequest,
): Promise<JobImportResult | ApiError> {
  const raw = buildRawInput(data);
  const db = getDatabase();
  const existingRows = await db.select().from(jobs);
  const existingJobs = existingRows.map(toNormalizedForDedupe);
  const result = await ingestJob(raw, existingJobs, getVerifiedSkills());

  if (result.status === 'ERROR') {
    return {
      success: false,
      code: 'UNPROCESSABLE',
      message: result.error || 'Failed to process this job.',
    };
  }
  if (result.status === 'DUPLICATE') {
    return toJobImportResult({
      status: result.status,
      job_id: result.job_id,
      duplicate_of_id: result.duplicate_of_id,
    });
  }

  const normalized = result.normalized_job;
  if (!normalized) {
    return {
      success: false,
      code: 'UNPROCESSABLE',
      message: 'The pipeline produced no job record.',
    };
  }
  if (result.status === 'HARD_REJECTED' && !result.rejection_reasons?.length) {
    return {
      success: false,
      code: 'UNPROCESSABLE',
      message: 'The pipeline rejected this job without returning a reason, so it was not saved.',
    };
  }

  const jobId = normalized.id;
  const actualReasons = result.rejection_reasons ?? [];
  const enrichedGovernment = governmentEnrichment(data);
  const salaryReference =
    GovernmentSalaryReferenceSchema.parse(enrichedGovernment);
  const snapshot = JSON.stringify({
    version: 2,
    source: 'unified-import',
    extraction: data,
    government: salaryReference,
    pipeline: {
      status: result.status,
      rejectionReasons: actualReasons,
    },
  });

  persistIngestionResults(db, [
    {
      result,
      metadata: {
        persistedStatus:
          result.status === 'HARD_REJECTED'
            ? 'HARD_REJECTED'
            : 'SCORING_COMPLETED',
        rawSnapshot: snapshot,
        dateExpires: data.closing_date ?? normalized.date_expires,
        salaryGrade: data.salary_grade ?? null,
        salaryStep: data.salary_step ?? null,
        salaryReferenceMin: salaryReference.salaryReferenceMin,
        salaryReferenceMax: salaryReference.salaryReferenceMax,
        salaryReferenceCurrency:
          salaryReference.salaryReferenceCurrency,
        salaryReferencePeriod: salaryReference.salaryReferencePeriod,
        salaryReferenceScheduleYear:
          salaryReference.salaryReferenceScheduleYear,
        salaryReferenceSource: salaryReference.salaryReferenceSource,
        salaryIsReferenceOnly: salaryReference.salaryIsReferenceOnly,
        compensationNote: salaryReference.compensationNote,
        vacancies: data.vacancies ?? null,
        applicationEmail: data.application_email?.trim() || null,
        applicationAddressee:
          data.application_addressee?.trim() || null,
        civilServiceEligibility:
          data.civil_service_eligibility?.trim() || null,
        scheduleNotes: data.schedule_notes,
        governmentScope: data.government_scope ?? null,
      },
    },
  ]);

  return toJobImportResult({
    status: result.status,
    job_id: jobId,
    rejection_reasons: actualReasons,
    score: result.score,
    recommendation: result.recommendation,
    score_detail: result.score_detail ?? null,
    title: normalized.title,
    company: normalized.company,
    work_setup: normalized.work_setup,
    category: normalized.category,
    eligibility_status: normalized.eligibility_status,
  });
}
