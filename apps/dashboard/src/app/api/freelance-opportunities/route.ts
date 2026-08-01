import { NextResponse } from 'next/server';
import { createFreelanceRepository } from '@job-app/ingestion/freelance/repository';
import { getDatabase } from '@/lib/db';

export async function GET() {
  try {
    const opportunities = await createFreelanceRepository(getDatabase()).list();
    return NextResponse.json(opportunities);
  } catch {
    return NextResponse.json({ code: 'SAFE_READ_FAILURE' }, { status: 500 });
  }
}
