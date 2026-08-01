import { NextResponse } from 'next/server';
import { DashboardJobScanPayloadSchema } from '@job-app/ingestion/discovery/dashboard-scan-contracts';
import {
  DashboardScanApiError,
  isSameOriginPost,
  startDashboardScan,
} from '@/lib/server/dashboard-scans';

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) {
    return NextResponse.json({ code: 'INVALID_REQUEST' }, { status: 403 });
  }
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ code: 'INVALID_REQUEST' }, { status: 400 });
  }
  const parsed = DashboardJobScanPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_REQUEST' }, { status: 400 });
  }
  try {
    return NextResponse.json(await startDashboardScan(parsed.data), { status: 202 });
  } catch (error) {
    const code = error instanceof DashboardScanApiError ? error.code : 'SAFE_RUN_FAILURE';
    const status = code === 'ACTIVE_SCAN' ? 409 : code === 'DISABLED' ? 403 : 500;
    return NextResponse.json({ code }, { status });
  }
}
