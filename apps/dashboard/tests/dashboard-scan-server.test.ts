import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { trigger, retrieve } = vi.hoisted(() => ({
  trigger: vi.fn(),
  retrieve: vi.fn(),
}));
vi.mock('@trigger.dev/sdk', () => ({
  tasks: { trigger },
  runs: { retrieve },
}));

import {
  DashboardScanApiError,
  getDashboardScanStatus,
  isSameOriginPost,
  resetDashboardScanStateForTests,
  startDashboardScan,
} from '../src/lib/server/dashboard-scans';

describe('dashboard scan server boundary', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('JOB_DISCOVERY_DASHBOARD_SCAN_ENABLED', 'true');
    resetDashboardScanStateForTests();
    trigger.mockReset();
    retrieve.mockReset();
  });

  afterEach(() => vi.unstubAllEnvs());

  it('requires a same-origin POST', () => {
    expect(isSameOriginPost(new Request('http://localhost:3000/api/job-scans', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'sec-fetch-site': 'same-origin' },
    }))).toBe(true);
    expect(isSameOriginPost(new Request('http://localhost:3000/api/job-scans', {
      method: 'POST', headers: { origin: 'https://attacker.example' },
    }))).toBe(false);
  });

  it('permits only one active dashboard scan and passes task idempotency', async () => {
    trigger.mockResolvedValue({ id: 'run_dashboardtest' });
    retrieve.mockResolvedValue({
      id: 'run_dashboardtest',
      taskIdentifier: 'public-job-discovery-dashboard-scan',
      status: 'EXECUTING',
      metadata: { dashboardScanStage: 'FETCHING_JOBS' },
    });
    await expect(startDashboardScan({ mode: 'PREVIEW', idempotencyKey: 'same-safe-key' }))
      .resolves.toEqual({ runId: 'run_dashboardtest', status: 'QUEUED' });
    expect(trigger).toHaveBeenCalledWith(
      'public-job-discovery-dashboard-scan',
      {
        mode: 'PREVIEW',
        idempotencyKey: 'same-safe-key',
        cacheStrategy: 'CACHED',
        confirmRecentlyExhausted: false,
        verifyAndSave: false,
        deepScanConfirmed: false,
      },
      { idempotencyKey: 'same-safe-key' },
    );
    await expect(startDashboardScan({ mode: 'PREVIEW', idempotencyKey: 'another-key' }))
      .rejects.toBeInstanceOf(DashboardScanApiError);
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it('maps provider run failures to a closed result without raw errors', async () => {
    retrieve.mockResolvedValue({
      id: 'run_dashboardtest', taskIdentifier: 'public-job-discovery-dashboard-scan',
      status: 'FAILED', metadata: { dashboardScanStage: 'VERIFYING_WITH_GEMINI' },
      error: { message: 'secret provider response', stackTrace: 'private stack' },
    });
    const status = await getDashboardScanStatus('run_dashboardtest');
    expect(status).toEqual({
      runId: 'run_dashboardtest', active: false, stage: 'FAILED', status: 'FAILED',
      result: null, failureCode: 'RUN_FAILED',
    });
    expect(JSON.stringify(status)).not.toMatch(/secret provider|private stack/);
  });

  it('rejects the dashboard route when its exact switch is not enabled', async () => {
    vi.stubEnv('JOB_DISCOVERY_DASHBOARD_SCAN_ENABLED', 'TRUE');
    await expect(startDashboardScan({ mode: 'PREVIEW', idempotencyKey: 'disabled-key' }))
      .rejects.toMatchObject({ code: 'DISABLED' });
  });
});
