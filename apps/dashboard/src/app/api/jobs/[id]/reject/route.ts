import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { jobs } from '@job-app/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDatabase();
    await db
      .update(jobs)
      .set({ status: 'USER_REJECTED' })
      .where(eq(jobs.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to reject job:', error);
    return NextResponse.json({ error: 'Failed to reject job' }, { status: 500 });
  }
}
