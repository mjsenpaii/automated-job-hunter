import { NextResponse } from 'next/server';
import {
  DashboardScanApiError,
  getDashboardScanCapacity,
} from '@/lib/server/dashboard-scans';

export async function GET() {
  try {
    return NextResponse.json(await getDashboardScanCapacity());
  } catch (error) {
    const code = error instanceof DashboardScanApiError ? error.code : 'SAFE_RUN_FAILURE';
    return NextResponse.json({ code }, { status: code === 'DISABLED' ? 403 : 500 });
  }
}
