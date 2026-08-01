import 'server-only';
import { runs, tasks } from '@trigger.dev/sdk';
import {
  job_discovery_persistence_runs,
  web_discovery_deep_scan_runs,
} from '@job-app/db/schema';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import {
  DASHBOARD_PUBLIC_JOB_SCAN_KILL_SWITCH,
  DASHBOARD_PUBLIC_JOB_SCAN_TASK_ID,
  DashboardJobScanPayloadSchema,
  DashboardJobScanResultSchema,
  DashboardJobScanStageSchema,
  type DashboardJobScanPayloadInput,
  type DashboardJobScanResult,
  type DashboardJobScanStage,
} from '@job-app/ingestion/discovery/dashboard-scan-contracts';
import { philippineCalendarDate } from '@job-app/ingestion/discovery/philippine-time';
import {
  DEEP_SCAN_COOLDOWN_MS,
  PUBLIC_JOB_DISCOVERY_DAILY_LIMIT,
} from '@job-app/ingestion/discovery/limits';
import { getDatabase } from '@/lib/db';

const TERMINAL_RUN_STATUSES = new Set([
  'COMPLETED', 'CANCELED', 'FAILED', 'CRASHED',
  'SYSTEM_FAILURE', 'EXPIRED', 'TIMED_OUT',
]);

type ActiveScanState = { runId: string | null; starting: boolean };
const globalScanState = globalThis as typeof globalThis & {
  __jobAppDashboardScanState?: ActiveScanState;
};
const activeScanState = globalScanState.__jobAppDashboardScanState ??= {
  runId: null,
  starting: false,
};

export class DashboardScanApiError extends Error {
  constructor(
    readonly code: 'DISABLED' | 'ACTIVE_SCAN' | 'INVALID_REQUEST' | 'RUN_NOT_FOUND' | 'SAFE_RUN_FAILURE',
    message: string,
  ) {
    super(message);
    this.name = 'DashboardScanApiError';
  }
}

export function dashboardScansAvailable(): boolean {
  return process.env.NODE_ENV === 'development' &&
    process.env[DASHBOARD_PUBLIC_JOB_SCAN_KILL_SWITCH] === 'true';
}

function assertAvailable(): void {
  if (!dashboardScansAvailable()) {
    throw new DashboardScanApiError(
      'DISABLED',
      'Dashboard scans are available only in the enabled development environment.',
    );
  }
}

export function isSameOriginPost(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const requestOrigin = new URL(request.url).origin;
  if (origin !== requestOrigin) return false;
  const fetchSite = request.headers.get('sec-fetch-site');
  return fetchSite === null || fetchSite === 'same-origin';
}

export async function startDashboardScan(
  input: DashboardJobScanPayloadInput,
): Promise<{ runId: string; status: 'QUEUED' }> {
  assertAvailable();
  const payload = DashboardJobScanPayloadSchema.safeParse(input);
  if (!payload.success) {
    throw new DashboardScanApiError('INVALID_REQUEST', 'The scan request is invalid.');
  }
  if (activeScanState.starting || activeScanState.runId) {
    if (activeScanState.runId) {
      const existing = await getDashboardScanStatus(activeScanState.runId);
      if (existing.active) {
        throw new DashboardScanApiError('ACTIVE_SCAN', 'A dashboard scan is already active.');
      }
    } else {
      throw new DashboardScanApiError('ACTIVE_SCAN', 'A dashboard scan is already active.');
    }
  }
  activeScanState.starting = true;
  try {
    const handle = await tasks.trigger(
      DASHBOARD_PUBLIC_JOB_SCAN_TASK_ID,
      payload.data,
      { idempotencyKey: payload.data.idempotencyKey },
    );
    activeScanState.runId = handle.id;
    return { runId: handle.id, status: 'QUEUED' };
  } catch {
    throw new DashboardScanApiError('SAFE_RUN_FAILURE', 'The scan could not be started safely.');
  } finally {
    activeScanState.starting = false;
  }
}

export async function cancelDashboardScan(runId: string): Promise<{
  runId: string;
  cancellationRequested: boolean;
}> {
  assertAvailable();
  if (!/^run_[A-Za-z0-9]+$/.test(runId)) {
    throw new DashboardScanApiError('INVALID_REQUEST', 'The scan run identifier is invalid.');
  }
  const status = await getDashboardScanStatus(runId);
  if (!status.active) return { runId, cancellationRequested: false };
  const result = getDatabase().update(web_discovery_deep_scan_runs).set({
    cancel_requested: true,
  }).where(and(
    eq(web_discovery_deep_scan_runs.trigger_run_id, runId),
    eq(web_discovery_deep_scan_runs.state, 'ACTIVE'),
  )).run();
  return {
    runId,
    cancellationRequested: result.changes === 1,
  };
}

function safeStage(metadata: unknown): DashboardJobScanStage {
  if (!metadata || typeof metadata !== 'object') return 'STARTING_SCAN';
  const value = (metadata as Record<string, unknown>).dashboardScanStage;
  const parsed = DashboardJobScanStageSchema.safeParse(value);
  return parsed.success ? parsed.data : 'STARTING_SCAN';
}

export interface DashboardScanStatusResponse {
  runId: string;
  active: boolean;
  stage: DashboardJobScanStage;
  status: 'ACTIVE' | 'COMPLETED' | 'FAILED';
  result: DashboardJobScanResult | null;
  failureCode: 'RUN_FAILED' | null;
}

export async function getDashboardScanStatus(runId: string): Promise<DashboardScanStatusResponse> {
  assertAvailable();
  if (!/^run_[A-Za-z0-9]+$/.test(runId)) {
    throw new DashboardScanApiError('INVALID_REQUEST', 'The scan run identifier is invalid.');
  }
  let run: Awaited<ReturnType<typeof runs.retrieve>>;
  try {
    run = await runs.retrieve(runId);
  } catch {
    throw new DashboardScanApiError('RUN_NOT_FOUND', 'The scan run could not be found.');
  }
  if (run.taskIdentifier !== DASHBOARD_PUBLIC_JOB_SCAN_TASK_ID) {
    throw new DashboardScanApiError('RUN_NOT_FOUND', 'The scan run could not be found.');
  }
  const terminal = TERMINAL_RUN_STATUSES.has(run.status);
  if (terminal && activeScanState.runId === runId) activeScanState.runId = null;
  if (run.status === 'COMPLETED') {
    const parsed = DashboardJobScanResultSchema.safeParse(run.output);
    if (!parsed.success) {
      return { runId, active: false, stage: 'FAILED', status: 'FAILED', result: null, failureCode: 'RUN_FAILED' };
    }
    return { runId, active: false, stage: parsed.data.stage, status: 'COMPLETED', result: parsed.data, failureCode: null };
  }
  if (terminal) {
    return { runId, active: false, stage: 'FAILED', status: 'FAILED', result: null, failureCode: 'RUN_FAILED' };
  }
  return { runId, active: true, stage: safeStage(run.metadata), status: 'ACTIVE', result: null, failureCode: null };
}

export async function getDashboardScanCapacity() {
  assertAvailable();
  const now = new Date();
  const philippineDate = philippineCalendarDate(now);
  const database = getDatabase();
  const persistence = database.select({
    count: sql<number>`COALESCE(SUM(${job_discovery_persistence_runs.persisted_job_count}), 0)`,
  }).from(job_discovery_persistence_runs)
    .where(eq(job_discovery_persistence_runs.philippine_date, philippineDate))
    .get();
  const savedToday = Number(persistence?.count ?? 0);
  const deepScanEnabled = process.env.JOB_DISCOVERY_DEEP_SCAN_ENABLED === 'true';
  const cutoff = new Date(now.getTime() - DEEP_SCAN_COOLDOWN_MS).toISOString();
  const recent = deepScanEnabled
    ? database.select({ startedAt: web_discovery_deep_scan_runs.started_at })
        .from(web_discovery_deep_scan_runs)
        .where(gt(web_discovery_deep_scan_runs.started_at, cutoff))
        .orderBy(desc(web_discovery_deep_scan_runs.started_at))
        .limit(1)
        .get()
    : undefined;
  return {
    philippineDate,
    dailyLimit: PUBLIC_JOB_DISCOVERY_DAILY_LIMIT,
    savedToday,
    remaining: Math.max(0, PUBLIC_JOB_DISCOVERY_DAILY_LIMIT - savedToday),
    deepScanEnabled,
    deepScanEligible: deepScanEnabled && !recent,
    deepScanEligibleAgainAt: recent
      ? new Date(Date.parse(recent.startedAt) + DEEP_SCAN_COOLDOWN_MS).toISOString()
      : null,
  } as const;
}

export function resetDashboardScanStateForTests(): void {
  activeScanState.runId = null;
  activeScanState.starting = false;
}
