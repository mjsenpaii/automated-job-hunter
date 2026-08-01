import 'server-only';
import { runs, tasks } from '@trigger.dev/sdk';
import {
  FREELANCE_DAILY_SAVE_LIMIT_MAX,
  FREELANCE_SCAN_TASK_ID,
  FreelanceScanPayloadSchema,
  FreelanceScanResultSchema,
  type FreelancePreviewOpportunitySummary,
  type FreelanceScanPayload,
  type FreelanceScanResult,
} from '@job-app/ingestion/freelance/contracts';
import { freelance_persistence_runs } from '@job-app/db/schema';
import { eq, sql } from 'drizzle-orm';
import { philippineCalendarDate } from '@job-app/ingestion/discovery/philippine-time';
import { getDatabase } from '@/lib/db';

const DASHBOARD_SWITCH = 'JOB_DISCOVERY_DASHBOARD_SCAN_ENABLED';
const TERMINAL = new Set([
  'COMPLETED', 'CANCELED', 'FAILED', 'CRASHED', 'SYSTEM_FAILURE',
  'EXPIRED', 'TIMED_OUT',
]);

type State = { runId: string | null; starting: boolean };
const globalState = globalThis as typeof globalThis & {
  __jobAppFreelanceScanState?: State;
};
const state = globalState.__jobAppFreelanceScanState ??= {
  runId: null,
  starting: false,
};

export class FreelanceScanApiError extends Error {
  constructor(
    readonly code:
      | 'DISABLED'
      | 'ACTIVE_SCAN'
      | 'INVALID_REQUEST'
      | 'RUN_NOT_FOUND'
      | 'SAFE_RUN_FAILURE',
    message: string,
  ) {
    super(message);
    this.name = 'FreelanceScanApiError';
  }
}

export function freelanceDashboardAvailable(): boolean {
  return process.env.NODE_ENV === 'development' &&
    process.env[DASHBOARD_SWITCH] === 'true';
}

function assertAvailable(): void {
  if (!freelanceDashboardAvailable()) {
    throw new FreelanceScanApiError(
      'DISABLED',
      'Freelance scans are available only from the enabled development dashboard.',
    );
  }
}

export function isFreelanceSameOriginPost(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) return false;
  const site = request.headers.get('sec-fetch-site');
  return site === null || site === 'same-origin';
}

export async function getFreelanceScanStatus(runId: string): Promise<{
  runId: string;
  active: boolean;
  status: 'ACTIVE' | 'COMPLETED' | 'FAILED';
  result: FreelanceScanResult | null;
  failureCode: 'RUN_FAILED' | null;
}> {
  assertAvailable();
  if (!/^run_[A-Za-z0-9]+$/.test(runId)) {
    throw new FreelanceScanApiError('INVALID_REQUEST', 'Invalid scan identifier.');
  }
  let run: Awaited<ReturnType<typeof runs.retrieve>>;
  try { run = await runs.retrieve(runId); } catch {
    throw new FreelanceScanApiError('RUN_NOT_FOUND', 'Freelance scan not found.');
  }
  if (run.taskIdentifier !== FREELANCE_SCAN_TASK_ID) {
    throw new FreelanceScanApiError('RUN_NOT_FOUND', 'Freelance scan not found.');
  }
  const terminal = TERMINAL.has(run.status);
  if (terminal && state.runId === runId) state.runId = null;
  if (run.status === 'COMPLETED') {
    const parsed = FreelanceScanResultSchema.safeParse(run.output);
    return parsed.success
      ? { runId, active: false, status: 'COMPLETED', result: parsed.data, failureCode: null }
      : { runId, active: false, status: 'FAILED', result: null, failureCode: 'RUN_FAILED' };
  }
  if (terminal) return { runId, active: false, status: 'FAILED', result: null, failureCode: 'RUN_FAILED' };
  return { runId, active: true, status: 'ACTIVE', result: null, failureCode: null };
}

export async function getFreelancePreviewOpportunity(
  runId: string,
  temporaryResultId: string,
): Promise<FreelancePreviewOpportunitySummary> {
  const status = await getFreelanceScanStatus(runId);
  if (status.status !== 'COMPLETED' || status.result?.mode !== 'PREVIEW') {
    throw new FreelanceScanApiError('RUN_NOT_FOUND', 'Preview result is unavailable.');
  }
  const opportunity = status.result.previewOpportunities.find(
    (item) => item.temporaryResultId === temporaryResultId,
  );
  if (!opportunity) {
    throw new FreelanceScanApiError('RUN_NOT_FOUND', 'Preview opportunity is unavailable.');
  }
  return opportunity;
}

export async function startFreelanceScan(input: unknown): Promise<{
  runId: string;
  status: 'QUEUED';
}> {
  assertAvailable();
  const parsed = FreelanceScanPayloadSchema.safeParse(input);
  if (!parsed.success) {
    throw new FreelanceScanApiError('INVALID_REQUEST', 'Invalid freelance scan request.');
  }
  if (state.starting || state.runId) {
    if (state.runId && !(await getFreelanceScanStatus(state.runId)).active) {
      state.runId = null;
    } else {
      throw new FreelanceScanApiError('ACTIVE_SCAN', 'A freelance scan is already active.');
    }
  }
  state.starting = true;
  try {
    const handle = await tasks.trigger(
      FREELANCE_SCAN_TASK_ID,
      parsed.data,
      { idempotencyKey: parsed.data.idempotencyKey },
    );
    state.runId = handle.id;
    return { runId: handle.id, status: 'QUEUED' };
  } catch {
    throw new FreelanceScanApiError('SAFE_RUN_FAILURE', 'Freelance scan could not be started safely.');
  } finally {
    state.starting = false;
  }
}

export function getFreelanceCapacity(now = new Date()) {
  assertAvailable();
  const philippineDate = philippineCalendarDate(now);
  const database = getDatabase();
  const aggregate = database.select({
    count: sql<number>`COALESCE(SUM(${freelance_persistence_runs.persisted_count}), 0)`,
  }).from(freelance_persistence_runs)
    .where(eq(freelance_persistence_runs.philippine_date, philippineDate)).get();
  const savedToday = Number(aggregate?.count ?? 0);
  return {
    philippineDate,
    dailyLimit: FREELANCE_DAILY_SAVE_LIMIT_MAX,
    savedToday,
    remaining: Math.max(0, FREELANCE_DAILY_SAVE_LIMIT_MAX - savedToday),
  };
}

export function resetFreelanceScanStateForTests(): void {
  state.runId = null;
  state.starting = false;
}

export type StartFreelanceScanPayload = FreelanceScanPayload;
