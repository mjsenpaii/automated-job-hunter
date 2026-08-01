import { NextResponse } from 'next/server';
import {
  cancelDashboardScan,
  DashboardScanApiError,
  isSameOriginPost,
} from '@/lib/server/dashboard-scans';

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  if (!isSameOriginPost(request)) {
    return NextResponse.json({ code: 'INVALID_REQUEST' }, { status: 403 });
  }
  const { runId } = await context.params;
  try {
    return NextResponse.json(await cancelDashboardScan(runId));
  } catch (error) {
    const code = error instanceof DashboardScanApiError
      ? error.code
      : 'SAFE_RUN_FAILURE';
    return NextResponse.json({ code }, { status: code === 'INVALID_REQUEST' ? 400 : 500 });
  }
}
