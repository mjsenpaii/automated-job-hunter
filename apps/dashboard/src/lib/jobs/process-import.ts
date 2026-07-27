import 'server-only';

import { randomUUID } from 'node:crypto';
import type { NormalizedJob } from '@job-app/core';
import { jobs, job_scores } from '@job-app/db/schema';
import {
  ingestJob,
  enrichGovernmentSalary,
  GovernmentSalaryReferenceSchema,
  toJobImportResult,
  type ApiError,
  type ConfirmScoreRequest,
  type JobImportResult,
  type RawJobInput,
} from '@job-app/ingestion';
import { getDatabase } from '@/lib/db';
import { getVerifiedSkills } from '@/lib/verified-skills';

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function toNormalizedForDedupe(row: typeof jobs.$inferSelect): NormalizedJob {
  return {
    id: row.id,
    source_id: row.source_id,
    source_name: row.source_name,
    source_job_id: row.source_job_id,
    original_url: row.original_url,
    title: row.title,
    company: row.company,
    description: row.description,
    date_posted: row.date_posted || null,
    date_expires: row.date_expires || null,
    date_ingested: row.date_ingested,
    country: row.country,
    city: row.city,
    region: row.region,
    work_setup: row.work_setup as NormalizedJob['work_setup'],
    work_setup_confidence: row.work_setup_confidence,
    work_setup_evidence: null,
    onsite_days_per_week: null,
    relocation_required: null,
    allowed_countries: [],
    allowed_regions: [],
    eligibility_text: null,
    employment_type: row.employment_type as NormalizedJob['employment_type'],
    contract_type: null,
    schedule: null,
    timezone_overlap: null,
    salary_min: row.salary_min,
    salary_max: row.salary_max,
    salary_currency: row.salary_currency,
    salary_period: row.salary_period as NormalizedJob['salary_period'],
    seniority: row.seniority as NormalizedJob['seniority'],
    years_experience_min: row.years_experience_min,
    years_experience_max: null,
    required_skills: parseStringArray(row.required_skills),
    preferred_skills: parseStringArray(row.preferred_skills),
    required_education: null,
    required_licenses: [],
    application_url: null,
    application_method: null,
    has_sensitive_questions: null,
    category: (row.category as NormalizedJob['category']) ?? null,
    eligibility_status:
      (row.eligibility_status as NormalizedJob['eligibility_status']) ?? null,
    status: row.status as NormalizedJob['status'],
    raw_snapshot: row.raw_snapshot,
  };
}

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

  await db.insert(jobs).values({
    id: jobId,
    source_id: normalized.source_id,
    source_name: normalized.source_name,
    source_job_id: normalized.source_job_id ?? jobId,
    original_url: normalized.original_url,
    title: normalized.title,
    company: normalized.company,
    description: normalized.description,
    // The legacy SQLite schema is NOT NULL for dates. Empty string preserves
    // "unknown" without inventing a date until that schema is migrated.
    date_posted: normalized.date_posted ?? '',
    date_expires: data.closing_date ?? normalized.date_expires ?? '',
    date_ingested: normalized.date_ingested,
    country: normalized.country,
    city: normalized.city,
    region: normalized.region,
    work_setup: normalized.work_setup,
    work_setup_confidence: normalized.work_setup_confidence,
    employment_type: normalized.employment_type,
    seniority: normalized.seniority,
    salary_min: normalized.salary_min,
    salary_max: normalized.salary_max,
    salary_currency: normalized.salary_currency,
    salary_period: normalized.salary_period,
    salary_grade: data.salary_grade ?? null,
    salary_step: data.salary_step ?? null,
    salary_reference_min: salaryReference.salaryReferenceMin,
    salary_reference_max: salaryReference.salaryReferenceMax,
    salary_reference_currency: salaryReference.salaryReferenceCurrency,
    salary_reference_period: salaryReference.salaryReferencePeriod,
    salary_reference_schedule_year:
      salaryReference.salaryReferenceScheduleYear,
    salary_reference_source: salaryReference.salaryReferenceSource,
    salary_is_reference_only: salaryReference.salaryIsReferenceOnly,
    compensation_note: salaryReference.compensationNote,
    vacancies: data.vacancies ?? null,
    application_email: data.application_email?.trim() || null,
    application_addressee: data.application_addressee?.trim() || null,
    civil_service_eligibility:
      data.civil_service_eligibility?.trim() || null,
    schedule_notes: JSON.stringify(data.schedule_notes),
    government_scope: data.government_scope ?? null,
    years_experience_min: normalized.years_experience_min,
    required_skills: JSON.stringify(normalized.required_skills),
    preferred_skills: JSON.stringify(normalized.preferred_skills),
    category: normalized.category,
    eligibility_status: normalized.eligibility_status,
    status:
      result.status === 'HARD_REJECTED'
        ? 'HARD_REJECTED'
        : 'SCORING_COMPLETED',
    rejection_reasons:
      actualReasons.length > 0 ? JSON.stringify(actualReasons) : null,
    raw_snapshot: snapshot,
  });

  if (result.score_detail) {
    const score = result.score_detail;
    await db.insert(job_scores).values({
      id: randomUUID(),
      job_id: jobId,
      score: score.score,
      factors: JSON.stringify(score.factors),
      recommendation: score.recommendation,
      matched_skills: JSON.stringify(score.matched_verified_skills),
      missing_skills: JSON.stringify(score.missing_required_skills),
      risk_flags: JSON.stringify(score.risk_flags),
      reason: score.reason,
    });
  }

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
