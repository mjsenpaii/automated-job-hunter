import { NextResponse } from 'next/server';
import {
  FreelanceScanApiError,
  isFreelanceSameOriginPost,
  startFreelanceScan,
} from '@/lib/server/freelance-scans';

export async function POST(request: Request) {
  if (!isFreelanceSameOriginPost(request)) {
    return NextResponse.json({ code: 'INVALID_REQUEST' }, { status: 403 });
  }
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ code: 'INVALID_REQUEST' }, { status: 400 });
  }
  try {
    return NextResponse.json(await startFreelanceScan(body), { status: 202 });
  } catch (error) {
    const code = error instanceof FreelanceScanApiError ? error.code : 'SAFE_RUN_FAILURE';
    return NextResponse.json(
      { code },
      { status: code === 'ACTIVE_SCAN' ? 409 : code === 'DISABLED' ? 403 : 500 },
    );
  }
}
