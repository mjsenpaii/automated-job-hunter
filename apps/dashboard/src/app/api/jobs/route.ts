import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDatabase } from '@/lib/db';
import { jobs, job_scores } from '@job-app/db/schema';
import { desc, eq } from 'drizzle-orm';
import { ingestJob, type RawJobInput } from '@job-app/ingestion';
import { getVerifiedSkills } from '@/lib/verified-skills';

export async function GET() {
  try {
    const db = getDatabase();
    const allJobs = await db
      .select({
        job: jobs,
        score: job_scores
      })
      .from(jobs)
      .leftJoin(job_scores, eq(jobs.id, job_scores.job_id))
      .orderBy(desc(jobs.created_at));

    return NextResponse.json(allJobs);
  } catch (error) {
    console.error('Failed to fetch jobs:', error);
    return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body?.title || !body?.company || !body?.description) {
      return NextResponse.json(
        { error: 'title, company and description are required' },
        { status: 400 },
      );
    }

    // Feed the manual/URL-imported job through the REAL production ingestion pipeline
    // (normalize → dedupe → classify → eligibility → hard-reject → score). No logic is
    // duplicated here.
    const raw: RawJobInput = {
      source_name: 'Dashboard Import',
      original_url: body.url || undefined,
      application_url: body.url || undefined,
      title: body.title,
      company: body.company,
      description: body.description,
      country: body.country || undefined,
      city: body.city || undefined,
      work_setup_hint: body.work_setup || undefined,
      required_skills: body.skills
        ? String(body.skills)
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean)
        : [],
    };

    const db = getDatabase();
    const result = await ingestJob(raw, [], getVerifiedSkills());

    if (result.status === 'ERROR') {
      return NextResponse.json(
        { error: result.error || 'Failed to ingest job' },
        { status: 422 },
      );
    }

    const normalized = result.normalized_job;
    const jobId = normalized.id;

    // Persist the normalized job produced by the pipeline.
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
      raw_snapshot: normalized.raw_snapshot ?? JSON.stringify(raw),
    });

    // Persist the score only when the pipeline produced one (not for hard-rejected jobs).
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

    return NextResponse.json({
      success: true,
      jobId,
      status: result.status,
      score: result.score,
      recommendation: result.recommendation,
      rejection_reasons: result.rejection_reasons,
    });
  } catch (error) {
    console.error('Failed to add job:', error);
    return NextResponse.json({ error: 'Failed to add job' }, { status: 500 });
  }
}
