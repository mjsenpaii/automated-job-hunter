import { NextResponse } from 'next/server';
import {
  FreelanceScanApiError,
  getFreelanceCapacity,
} from '@/lib/server/freelance-scans';

export async function GET() {
  try {
    return NextResponse.json(getFreelanceCapacity());
  } catch (error) {
    const code = error instanceof FreelanceScanApiError ? error.code : 'SAFE_RUN_FAILURE';
    return NextResponse.json({ code }, { status: code === 'DISABLED' ? 403 : 500 });
  }
}
