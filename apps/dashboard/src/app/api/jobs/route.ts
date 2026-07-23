import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { jobs, job_scores } from '@job-app/db/schema';
import { desc, eq } from 'drizzle-orm';
import { classifyJob } from '@job-app/classification';
import { scoreJob } from '@job-app/scoring';
import { JobPosting } from '@job-app/core';
import crypto from 'crypto';

export async function GET() {
  try {
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
    
    // Simulate classification and scoring pipeline
    const rawJob: JobPosting = {
      source_id: 'manual',
      source_name: 'Manual Entry',
      source_job_id: crypto.randomUUID(),
      original_url: body.url || null,
      title: body.title,
      company: body.company,
      description: body.description,
      date_posted: new Date().toISOString(),
      date_expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      country: body.country || null,
      city: body.city || null,
      region: null,
      work_setup: body.work_setup || 'UNCLEAR',
      work_setup_confidence: 1.0,
      employment_type: 'FULL_TIME',
      seniority: 'MID_LEVEL',
      salary_min: null,
      salary_max: null,
      salary_currency: null,
      salary_period: null,
      years_experience_min: null,
      required_skills: body.skills ? body.skills.split(',').map((s: string) => s.trim()) : [],
      preferred_skills: [],
    };

    const classified = classifyJob(rawJob);
    const scoreResult = scoreJob(classified, rawJob);
    const jobId = crypto.randomUUID();

    await db.insert(jobs).values({
      id: jobId,
      source_id: rawJob.source_id,
      source_name: rawJob.source_name,
      source_job_id: rawJob.source_job_id,
      original_url: rawJob.original_url,
      title: rawJob.title,
      company: rawJob.company,
      description: rawJob.description,
      date_posted: rawJob.date_posted,
      date_expires: rawJob.date_expires!,
      date_ingested: new Date().toISOString(),
      country: rawJob.country,
      city: rawJob.city,
      region: rawJob.region,
      work_setup: classified.work_setup,
      work_setup_confidence: classified.confidence.work_setup,
      employment_type: classified.employment_type,
      seniority: classified.seniority_level,
      salary_min: rawJob.salary_min,
      salary_max: rawJob.salary_max,
      salary_currency: rawJob.salary_currency,
      salary_period: rawJob.salary_period,
      years_experience_min: rawJob.years_experience_min,
      required_skills: JSON.stringify(rawJob.required_skills),
      preferred_skills: JSON.stringify(rawJob.preferred_skills),
      category: classified.category,
      eligibility_status: classified.eligibility_status,
      status: 'SCORING_COMPLETED',
      raw_snapshot: JSON.stringify(rawJob),
    });

    await db.insert(job_scores).values({
      id: crypto.randomUUID(),
      job_id: jobId,
      score: scoreResult.total_score,
      factors: JSON.stringify(scoreResult.factors),
      recommendation: scoreResult.recommendation,
      matched_skills: JSON.stringify(scoreResult.matched_skills),
      missing_skills: JSON.stringify(scoreResult.missing_skills),
      risk_flags: JSON.stringify(scoreResult.risk_flags),
      reason: scoreResult.reason,
    });

    return NextResponse.json({ success: true, jobId });
  } catch (error) {
    console.error('Failed to add job:', error);
    return NextResponse.json({ error: 'Failed to add job' }, { status: 500 });
  }
}
