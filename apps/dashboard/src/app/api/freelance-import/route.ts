import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { FreelanceManualImportSchema } from '@job-app/ingestion/freelance/contracts';
import { prepareManualFreelanceImport } from '@job-app/ingestion/freelance/scan';
import { createFreelanceRepository } from '@job-app/ingestion/freelance/repository';
import { philippineCalendarDate } from '@job-app/ingestion/discovery/philippine-time';
import { getDatabase } from '@/lib/db';
import { getVerifiedSkills } from '@/lib/verified-skills';
import {
  freelanceDashboardAvailable,
  isFreelanceSameOriginPost,
} from '@/lib/server/freelance-scans';

export async function POST(request: Request) {
  if (!freelanceDashboardAvailable()) {
    return NextResponse.json({ code: 'DISABLED' }, { status: 403 });
  }
  if (!isFreelanceSameOriginPost(request)) {
    return NextResponse.json({ code: 'INVALID_REQUEST' }, { status: 403 });
  }
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ code: 'INVALID_REQUEST' }, { status: 400 });
  }
  const parsed = FreelanceManualImportSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ code: 'INVALID_REQUEST' }, { status: 400 });
  try {
    const opportunity = await prepareManualFreelanceImport(parsed.data.url, {
      verifiedSkills: getVerifiedSkills(),
    });
    const idempotencyKey = `manual-freelance-${randomUUID()}`;
    const persisted = await createFreelanceRepository(getDatabase()).persistBatch({
      opportunities: [opportunity],
      philippineDate: philippineCalendarDate(new Date()),
      idempotencyKey,
      taskId: 'dashboard-manual-freelance-import',
      dailyLimit: 20,
    });
    return NextResponse.json({
      status: persisted.savedThisRun === 1 ? 'SAVED' : persisted.duplicates > 0 ? 'DUPLICATE' : 'NOT_SAVED',
      opportunityId: persisted.savedOpportunities[0]?.id ?? null,
      saved: persisted.savedThisRun,
      duplicates: persisted.duplicates,
      applicationsCreated: 0,
      submissionsCreated: 0,
    }, { status: persisted.savedThisRun === 1 ? 201 : 200 });
  } catch (error) {
    const code = error instanceof Error && [
      'MANUAL_FREELANCE_PAGE_UNPARSEABLE',
      'MANUAL_URL_NOT_CLEAR_FREELANCE',
    ].includes(error.message)
      ? error.message
      : 'SAFE_IMPORT_FAILURE';
    return NextResponse.json({ code }, { status: 422 });
  }
}
