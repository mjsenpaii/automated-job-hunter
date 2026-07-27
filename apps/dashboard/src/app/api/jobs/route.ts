import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { jobs, job_scores } from '@job-app/db/schema';
import { desc, eq } from 'drizzle-orm';
import {
  validateConfirmScoreRequest,
  apiError,
} from '@job-app/ingestion';
import { processAndPersistImportedJob } from '@/lib/jobs/process-import';

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

    const result = await processAndPersistImportedJob(validated.data);
    if (!result.success) {
      return NextResponse.json(result, { status: 422 });
    }
    return NextResponse.json(result, {
      status: result.status === 'DUPLICATE' ? 409 : 200,
    });
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
