import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  FREELANCE_DAILY_SAVE_LIMIT_MAX,
  FreelancePreviewSaveRequestSchema,
  FreelancePreviewSaveResponseSchema,
} from '@job-app/ingestion/freelance/contracts';
import { createFreelanceRepository } from '@job-app/ingestion/freelance/repository';
import {
  prepareManualFreelanceImport,
  preparePreviewOpportunityForReview,
} from '@job-app/ingestion/freelance/scan';
import { philippineCalendarDate } from '@job-app/ingestion/discovery/philippine-time';
import { getDatabase } from '@/lib/db';
import { getVerifiedSkills } from '@/lib/verified-skills';
import {
  freelanceDashboardAvailable,
  getFreelancePreviewOpportunity,
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
  const parsed = FreelancePreviewSaveRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_REQUEST' }, { status: 400 });
  }

  try {
    const summary = await getFreelancePreviewOpportunity(
      parsed.data.runId,
      parsed.data.temporaryResultId,
    );
    if (summary.resultState === 'HARD_REJECTED' || summary.expired) {
      return NextResponse.json({ code: 'PREVIEW_OPPORTUNITY_NOT_SAVEABLE' }, { status: 422 });
    }
    if (summary.resultState === 'NOT_READY' && !parsed.data.blockerConfirmed) {
      return NextResponse.json({ code: 'BLOCKER_CONFIRMATION_REQUIRED' }, { status: 409 });
    }

    // Revalidate the original public page server-side before the explicit local write.
    // No browser-provided description or source attribution is trusted.
    const imported = await prepareManualFreelanceImport(summary.originalUrl, {
      verifiedSkills: getVerifiedSkills(),
    });
    const opportunity = preparePreviewOpportunityForReview(imported, summary);
    if (opportunity.risk.level === 'HARD_REJECTED' ||
        ['HARD_REJECTED', 'EXPIRED'].includes(opportunity.status)) {
      return NextResponse.json({ code: 'PREVIEW_OPPORTUNITY_NOT_SAVEABLE' }, { status: 422 });
    }
    const idempotencyKey = `preview-review-${createHash('sha256')
      .update(`${parsed.data.runId}:${parsed.data.temporaryResultId}`)
      .digest('hex')}`;
    const persisted = await createFreelanceRepository(getDatabase()).saveForReview({
      opportunity,
      philippineDate: philippineCalendarDate(new Date()),
      idempotencyKey,
      taskId: 'dashboard-freelance-preview-review',
      dailyLimit: FREELANCE_DAILY_SAVE_LIMIT_MAX,
    });
    const response = FreelancePreviewSaveResponseSchema.parse({
      status: persisted.savedThisRun === 1
        ? 'SAVED_FOR_REVIEW'
        : persisted.duplicates > 0
          ? 'DUPLICATE'
          : 'DAILY_CAP_REACHED',
      opportunityId: persisted.savedOpportunities[0]?.id ?? null,
      saved: persisted.savedThisRun,
      duplicates: persisted.duplicates,
      dailyRemaining: persisted.remaining,
      localOnly: true,
      proposalsSent: 0,
      bidsPlaced: 0,
      messagesSent: 0,
      applicationsCreated: 0,
      submissionsCreated: 0,
    });
    return NextResponse.json(response, { status: response.status === 'SAVED_FOR_REVIEW' ? 201 : 200 });
  } catch (error) {
    const code = error instanceof Error && [
      'MANUAL_FREELANCE_PAGE_UNPARSEABLE',
      'MANUAL_URL_NOT_CLEAR_FREELANCE',
      'PREVIEW_OPPORTUNITY_NOT_SAVEABLE',
    ].includes(error.message)
      ? error.message
      : 'SAFE_PREVIEW_SAVE_FAILURE';
    return NextResponse.json({ code }, { status: 422 });
  }
}
