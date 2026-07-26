import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDatabase } from '@/lib/db';
import { jobs, job_scores } from '@job-app/db/schema';
import { desc, eq } from 'drizzle-orm';
import type { NormalizedJob } from '@job-app/core';
import {
  ingestJob,
  validateConfirmScoreRequest,
  toJobImportResult,
  apiError,
  type RawJobInput,
} from '@job-app/ingestion';
import { getVerifiedSkills } from '@/lib/verified-skills';

export async function GET() {
  try {
    const db = getDatabase();
    const allJobs = await db
      .select({
        job: jobs,
        score: job_scores,
      })
      .from(jobs)
      .leftJoin(job_scores, eq(jobs.id, job_scores.job_id))
      .orderBy(desc(jobs.created_at));

    return NextResponse.json(allJobs);
  } catch (error) {
    console.error('Failed to fetch jobs:', {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      apiError('INTERNAL_ERROR', 'Failed to fetch jobs.'),
      { status: 500 },
    );
  }
}

/**
 * Maps persisted job rows into the minimal NormalizedJob shape the
 * deduplication checker needs. Does not invent missing fields.
 */
function toNormalizedForDedupe(
  row: typeof jobs.$inferSelect,
): NormalizedJob {
  let required: string[] = [];
  let preferred: string[] = [];
  try {
    const r = JSON.parse(row.required_skills);
    if (Array.isArray(r)) required = r.map(String);
  } catch {
    /* keep empty */
  }
  try {
    const p = JSON.parse(row.preferred_skills);
    if (Array.isArray(p)) preferred = p.map(String);
  } catch {
    /* keep empty */
  }

  return {
    id: row.id,
    source_id: row.source_id,
    source_name: row.source_name,
    source_job_id: row.source_job_id,
    original_url: row.original_url,
    title: row.title,
    company: row.company,
    description: row.description,
    date_posted: row.date_posted,
    date_expires: row.date_expires,
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
    required_skills: required,
    preferred_skills: preferred,
    required_education: null,
    required_licenses: [],
    application_url: null,
    application_method: null,
    has_sensitive_questions: null,
    category: (row.category as NormalizedJob['category']) ?? null,
    eligibility_status: (row.eligibility_status as NormalizedJob['eligibility_status']) ?? null,
    status: row.status as NormalizedJob['status'],
    raw_snapshot: row.raw_snapshot,
  };
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        apiError('INVALID_JSON', 'Request body must be valid JSON.'),
        { status: 400 },
      );
    }

    const validated = validateConfirmScoreRequest(body);
    if (!validated.ok) {
      return NextResponse.json(
        apiError('VALIDATION_ERROR', validated.message, validated.fieldErrors),
        { status: 400 },
      );
    }

    const data = validated.data;

    const raw: RawJobInput = {
      source_name: 'Dashboard Import',
      original_url: data.url,
      application_url: data.url,
      title: data.title,
      company: data.company,
      description: data.description,
      country: data.country?.trim() || undefined,
      city: data.city?.trim() || undefined,
      work_setup_hint: data.work_setup,
      employment_type: data.employment_type?.trim() || undefined,
      seniority_hint: data.seniority?.trim() || undefined,
      salary_text: data.salary_text?.trim() || undefined,
      required_skills: data.skills
        ? data.skills
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    };

    const db = getDatabase();
    const existingRows = await db.select().from(jobs);
    const existingJobs = existingRows.map(toNormalizedForDedupe);

    const result = await ingestJob(raw, existingJobs, getVerifiedSkills());

    if (result.status === 'ERROR') {
      return NextResponse.json(
        apiError('UNPROCESSABLE', result.error || 'Failed to ingest job.'),
        { status: 422 },
      );
    }

    if (result.status === 'DUPLICATE') {
      const importResult = toJobImportResult({
        status: 'DUPLICATE',
        job_id: result.job_id,
        duplicate_of_id: result.duplicate_of_id,
      });
      return NextResponse.json(importResult, { status: 409 });
    }

    const normalized = result.normalized_job;
    if (!normalized) {
      return NextResponse.json(
        apiError('UNPROCESSABLE', 'Ingestion produced no job record.'),
        { status: 422 },
      );
    }

    const jobId = normalized.id as string;

    await db.insert(jobs).values({
      id: jobId,
      source_id: normalized.source_id,
      source_name: normalized.source_name,
      source_job_id: normalized.source_job_id ?? jobId,
      original_url: normalized.original_url,
      title: normalized.title,
      company: normalized.company,
      description: normalized.description,
      date_posted: normalized.date_posted ?? new Date().toISOString(),
      date_expires:
        normalized.date_expires ??
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
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
      years_experience_min: normalized.years_experience_min,
      required_skills: JSON.stringify(normalized.required_skills),
      preferred_skills: JSON.stringify(normalized.preferred_skills),
      category: normalized.category,
      eligibility_status: normalized.eligibility_status,
      status: result.status === 'HARD_REJECTED' ? 'HARD_REJECTED' : 'SCORING_COMPLETED',
      rejection_reasons:
        result.rejection_reasons && result.rejection_reasons.length > 0
          ? JSON.stringify(result.rejection_reasons)
          : null,
      raw_snapshot: normalized.raw_snapshot ?? JSON.stringify(raw),
    });

    if (result.score_detail) {
      const s = result.score_detail;
      await db.insert(job_scores).values({
        id: randomUUID(),
        job_id: jobId,
        score: s.score,
        factors: JSON.stringify(s.factors),
        recommendation: s.recommendation,
        matched_skills: JSON.stringify(s.matched_verified_skills),
        missing_skills: JSON.stringify(s.missing_required_skills),
        risk_flags: JSON.stringify(s.risk_flags),
        reason: s.reason,
      });
    }

    const importResult = toJobImportResult({
      status: result.status,
      job_id: jobId,
      rejection_reasons: result.rejection_reasons,
      score: result.score,
      recommendation: result.recommendation,
      score_detail: result.score_detail ?? null,
      title: normalized.title,
      company: normalized.company,
      work_setup: normalized.work_setup,
      category: normalized.category,
      eligibility_status: normalized.eligibility_status,
    });

    if ('success' in importResult && importResult.success === false) {
      return NextResponse.json(importResult, { status: 422 });
    }

    return NextResponse.json(importResult, { status: 200 });
  } catch (error) {
    console.error('Failed to add job:', {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      apiError('INTERNAL_ERROR', 'Unable to save and score this job. Try again.'),
      { status: 500 },
    );
  }
}
