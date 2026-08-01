import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  FreelancePreparationUpdateSchema,
  FreelanceStatusUpdateSchema,
} from '@job-app/ingestion/freelance/contracts';
import { createFreelanceRepository } from '@job-app/ingestion/freelance/repository';
import { getDatabase } from '@/lib/db';
import { isFreelanceSameOriginPost } from '@/lib/server/freelance-scans';

const IdSchema = z.string().regex(/^freelance_[a-f0-9]{24}$/);

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!IdSchema.safeParse(id).success) return NextResponse.json({ code: 'NOT_FOUND' }, { status: 404 });
  const opportunity = await createFreelanceRepository(getDatabase()).findById(id);
  return opportunity
    ? NextResponse.json(opportunity)
    : NextResponse.json({ code: 'NOT_FOUND' }, { status: 404 });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isFreelanceSameOriginPost(request)) {
    return NextResponse.json({ code: 'INVALID_REQUEST' }, { status: 403 });
  }
  const { id } = await context.params;
  if (!IdSchema.safeParse(id).success) return NextResponse.json({ code: 'NOT_FOUND' }, { status: 404 });
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ code: 'INVALID_REQUEST' }, { status: 400 });
  }
  const preparation = FreelancePreparationUpdateSchema.safeParse(body);
  const status = FreelanceStatusUpdateSchema.safeParse(body);
  if (!preparation.success && !status.success) {
    return NextResponse.json({ code: 'INVALID_REQUEST' }, { status: 400 });
  }
  try {
    const repository = createFreelanceRepository(getDatabase());
    const opportunity = preparation.success
      ? await repository.completePreparation(id, preparation.data, new Date())
      : await repository.updateStatus(id, status.data);
    return opportunity
      ? NextResponse.json({
          id: opportunity.id,
          status: opportunity.status,
          preparation: opportunity.preparation,
          applicationReady: opportunity.readiness.applicationReady,
          localOnly: true,
          proposalsSent: 0,
          applicationsCreated: 0,
        })
      : NextResponse.json({ code: 'NOT_FOUND_OR_NOT_LEARNABLE' }, { status: 404 });
  } catch {
    return NextResponse.json({ code: 'SAFE_UPDATE_FAILURE' }, { status: 500 });
  }
}
