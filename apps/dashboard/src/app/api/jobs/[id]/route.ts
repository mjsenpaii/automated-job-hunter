import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { jobs, job_scores } from '@job-app/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDatabase();
    const jobResult = await db
      .select({
        job: jobs,
        score: job_scores
      })
      .from(jobs)
      .leftJoin(job_scores, eq(jobs.id, job_scores.job_id))
      .where(eq(jobs.id, id))
      .limit(1);

    if (!jobResult || jobResult.length === 0) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json(jobResult[0]);
  } catch (error) {
    console.error('Failed to fetch job:', error);
    return NextResponse.json({ error: 'Failed to fetch job' }, { status: 500 });
  }
}
