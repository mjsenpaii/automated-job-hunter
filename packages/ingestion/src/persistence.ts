import { randomUUID } from 'node:crypto';
import type { NormalizedJob } from '@job-app/core';
import { getDb } from '@job-app/db/connection';
import { jobs, job_scores } from '@job-app/db/schema';
import type { IngestionResult } from './types.js';

export type JobDatabase = ReturnType<typeof getDb>;

export interface PersistedJobMetadata {
  persistedStatus: 'DISCOVERED' | 'SCORING_COMPLETED' | 'HARD_REJECTED';
  rawSnapshot: string | null;
  dateExpires?: string | null;
  salaryGrade?: number | null;
  salaryStep?: number | null;
  salaryReferenceMin?: number | null;
  salaryReferenceMax?: number | null;
  salaryReferenceCurrency?: string | null;
  salaryReferencePeriod?: string | null;
  salaryReferenceScheduleYear?: number | null;
  salaryReferenceSource?: string | null;
  salaryIsReferenceOnly?: boolean;
  compensationNote?: string | null;
  vacancies?: number | null;
  applicationEmail?: string | null;
  applicationAddressee?: string | null;
  civilServiceEligibility?: string | null;
  scheduleNotes?: string[];
  governmentScope?: string | null;
}

export interface PersistableIngestionResult {
  result: IngestionResult;
  metadata: PersistedJobMetadata;
}

function requirePersistableNormalizedJob(
  result: IngestionResult,
): NormalizedJob {
  if (
    result.status === 'ERROR' ||
    result.status === 'DUPLICATE' ||
    !result.normalized_job
  ) {
    throw new Error(
      `Cannot persist ingestion result with status ${result.status}.`,
    );
  }
  if (
    result.status === 'HARD_REJECTED' &&
    !result.rejection_reasons?.length
  ) {
    throw new Error(
      'Cannot persist a hard-rejected job without its deterministic reason.',
    );
  }
  return result.normalized_job;
}

function insertOne(
  database: Pick<JobDatabase, 'insert'>,
  record: PersistableIngestionResult,
): void {
  const { result, metadata } = record;
  const normalized = requirePersistableNormalizedJob(result);
  const rejectionReasons = result.rejection_reasons ?? [];

  database
    .insert(jobs)
    .values({
      id: normalized.id,
      source_id: normalized.source_id,
      source_name: normalized.source_name,
      source_job_id: normalized.source_job_id ?? normalized.id,
      original_url: normalized.original_url,
      title: normalized.title,
      company: normalized.company,
      description: normalized.description,
      date_posted: normalized.date_posted ?? '',
      date_expires:
        metadata.dateExpires ?? normalized.date_expires ?? '',
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
      salary_grade: metadata.salaryGrade ?? null,
      salary_step: metadata.salaryStep ?? null,
      salary_reference_min: metadata.salaryReferenceMin ?? null,
      salary_reference_max: metadata.salaryReferenceMax ?? null,
      salary_reference_currency: metadata.salaryReferenceCurrency ?? null,
      salary_reference_period: metadata.salaryReferencePeriod ?? null,
      salary_reference_schedule_year:
        metadata.salaryReferenceScheduleYear ?? null,
      salary_reference_source: metadata.salaryReferenceSource ?? null,
      salary_is_reference_only: metadata.salaryIsReferenceOnly ?? false,
      compensation_note: metadata.compensationNote ?? null,
      vacancies: metadata.vacancies ?? null,
      application_email: metadata.applicationEmail ?? null,
      application_addressee: metadata.applicationAddressee ?? null,
      civil_service_eligibility:
        metadata.civilServiceEligibility ?? null,
      schedule_notes: JSON.stringify(metadata.scheduleNotes ?? []),
      government_scope: metadata.governmentScope ?? null,
      years_experience_min: normalized.years_experience_min,
      required_skills: JSON.stringify(normalized.required_skills),
      preferred_skills: JSON.stringify(normalized.preferred_skills),
      category: normalized.category,
      eligibility_status: normalized.eligibility_status,
      status: metadata.persistedStatus,
      rejection_reasons:
        rejectionReasons.length > 0
          ? JSON.stringify(rejectionReasons)
          : null,
      raw_snapshot: metadata.rawSnapshot,
    })
    .run();

  if (result.score_detail) {
    const score = result.score_detail;
    database
      .insert(job_scores)
      .values({
        id: randomUUID(),
        job_id: normalized.id,
        score: score.score,
        factors: JSON.stringify(score.factors),
        recommendation: score.recommendation,
        matched_skills: JSON.stringify(score.matched_verified_skills),
        missing_skills: JSON.stringify(score.missing_required_skills),
        risk_flags: JSON.stringify(score.risk_flags),
        reason: score.reason,
      })
      .run();
  }
}

/**
 * Persists a fully processed batch atomically.
 *
 * Discovery completes source validation and deterministic pipeline evaluation
 * before reaching this function, so a failed fetch can never partially write.
 */
export function persistIngestionResults(
  database: JobDatabase,
  records: PersistableIngestionResult[],
): void {
  database.transaction((transaction) => {
    for (const record of records) {
      insertOne(transaction, record);
    }
  });
}

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

export function persistedJobToNormalized(
  row: typeof jobs.$inferSelect,
): NormalizedJob {
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
    employment_type:
      row.employment_type as NormalizedJob['employment_type'],
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
    application_url: row.original_url,
    application_method: null,
    has_sensitive_questions: null,
    category: (row.category as NormalizedJob['category']) ?? null,
    eligibility_status:
      (row.eligibility_status as NormalizedJob['eligibility_status']) ??
      null,
    status: row.status as NormalizedJob['status'],
    raw_snapshot: row.raw_snapshot,
  };
}
