import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { jobs } from '@job-app/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = await params;
    await db
      .update(jobs)
      .set({ status: 'USER_APPROVED' })
      .where(eq(jobs.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to approve job:', error);
    return NextResponse.json({ error: 'Failed to approve job' }, { status: 500 });
  }
}
