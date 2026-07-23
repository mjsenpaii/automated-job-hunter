import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { jobs, job_scores } from '@job-app/db/schema';
import { sql } from 'drizzle-orm';

export async function GET() {
  try {
    const statsResult = await db.select({
      totalJobs: sql<number>`count(${jobs.id})`,
      shortlistedJobs: sql<number>`sum(case when ${jobs.status} = 'USER_APPROVED' then 1 else 0 end)`,
      appliedJobs: sql<number>`sum(case when ${jobs.status} = 'APPLIED' then 1 else 0 end)`,
      averageScore: sql<number>`avg(${job_scores.score})`
    }).from(jobs).leftJoin(job_scores, sql`${jobs.id} = ${job_scores.job_id}`);

    const stats = statsResult[0];

    return NextResponse.json({
      totalJobs: Number(stats.totalJobs) || 0,
      shortlistedJobs: Number(stats.shortlistedJobs) || 0,
      appliedJobs: Number(stats.appliedJobs) || 0,
      averageScore: Math.round(Number(stats.averageScore) || 0)
    });
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
