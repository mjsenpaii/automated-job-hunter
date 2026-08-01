import { NextResponse } from 'next/server';
import {
  FreelanceScanApiError,
  getFreelanceScanStatus,
} from '@/lib/server/freelance-scans';

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  try {
    return NextResponse.json(await getFreelanceScanStatus(runId));
  } catch (error) {
    const code = error instanceof FreelanceScanApiError ? error.code : 'SAFE_RUN_FAILURE';
    return NextResponse.json(
      { code },
      { status: code === 'RUN_NOT_FOUND' ? 404 : code === 'DISABLED' ? 403 : 400 },
    );
  }
}
