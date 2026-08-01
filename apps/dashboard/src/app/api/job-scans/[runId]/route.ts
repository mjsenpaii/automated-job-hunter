import { NextResponse } from 'next/server';
import {
  DashboardScanApiError,
  getDashboardScanStatus,
} from '@/lib/server/dashboard-scans';

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  try {
    return NextResponse.json(await getDashboardScanStatus(runId));
  } catch (error) {
    const code = error instanceof DashboardScanApiError ? error.code : 'SAFE_RUN_FAILURE';
    return NextResponse.json({ code }, { status: code === 'RUN_NOT_FOUND' ? 404 : code === 'DISABLED' ? 403 : 400 });
  }
}
