import type { SkillEntry } from '@job-app/core';
import { describe, expect, it, vi } from 'vitest';
import type { VerifiedJobRequirementsExtraction } from '../src/job-requirements-contracts.js';
import type { ControlledDiscoveryRepository } from '../src/discovery/contracts.js';
import {
  DASHBOARD_PUBLIC_JOB_SCAN_TASK_ID,
  DashboardJobScanPayloadSchema,
} from '../src/discovery/dashboard-scan-contracts.js';
import {
  createGeminiUsageAccumulator,
  DashboardJobScanGateError,
  isDashboardJobScanKillSwitchEnabled,
  runDashboardJobScan,
} from '../src/discovery/dashboard-scan.js';
import { createSqliteWebDiscoveryStore } from '../src/discovery/web-discovery-store.js';
import { WEB_SEARCH_QUERY_GROUPS } from '../src/discovery/web-search-query-groups.v1.js';

const SKILLS: SkillEntry[] = [];
const PAYLOAD = { mode: 'PREVIEW', idempotencyKey: 'dashboard-preview-test' } as const;

function fetchFixture(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('arbeitnow.com')) return Response.json({
      data: [{
        slug: 'dashboard-typescript-developer',
        company_name: 'Dashboard Co',
        title: 'Junior TypeScript Developer',
        description: 'You will build React applications.',
        remote: true,
        url: 'https://www.arbeitnow.com/jobs/dashboard-typescript-developer',
        tags: ['TypeScript', 'React'],
        job_types: ['Full time'],
        location: 'Remote',
        created_at: 1_785_000_000,
      }],
      links: { next: null },
      meta: { current_page: 1 },
    });
    if (url.includes('remotive.com')) return Response.json({
      '0-legal-notice': 'Fixture', 'job-count': 0, jobs: [],
    });
    if (url.includes('api.lever.co')) return Response.json([]);
    throw new Error('Unexpected URL');
  }) as typeof fetch;
}

function repository(options: { persisted?: number; completed?: boolean } = {}) {
  const persistControlledBatch = vi.fn(async (records) => ({
    idempotencyStatus: 'NEW' as const,
    jobsPersisted: records.length,
    scoresPersisted: records.length,
    finalDatabaseDuplicates: 0,
    persistedRecords: records,
    persistedBeforeRun: options.persisted ?? 0,
    remainingBeforeRun: 5 - (options.persisted ?? 0),
    persistedAfterRun: (options.persisted ?? 0) + records.length,
    dailyRemaining: 5 - (options.persisted ?? 0) - records.length,
    skippedBecauseOfDailyCap: 0,
  }));
  const value: ControlledDiscoveryRepository = {
    async loadExistingJobs() { return []; },
    persistBatch: vi.fn(),
    async getDailyPersistenceState({ philippineDate }) {
      const persistedCount = options.persisted ?? 0;
      return {
        philippineDate,
        dailyLimit: 5,
        persistedCount,
        remaining: 5 - persistedCount,
        idempotencyStatus: options.completed ? 'ALREADY_COMPLETED' : 'NOT_STARTED',
      };
    },
    persistControlledBatch,
  };
  return { value, persistControlledBatch };
}

function verifiedExtraction(): VerifiedJobRequirementsExtraction {
  const missingFact = {
    value: null,
    status: 'MISSING' as const,
    source: 'DESCRIPTION_GEMINI_VERIFIED' as const,
    reasonCode: 'NO_EVIDENCE' as const,
    evidence: null,
    affectedScoring: false,
  };
  return {
    schemaVersion: 2,
    contentHash: 'a'.repeat(64),
    modelIdentifier: 'mock-flash-lite',
    extractedAt: '2026-08-01T00:00:00.000Z',
    extractionStatus: 'MISSING',
    extractionFailureReason: null,
    candidateAudit: [],
    experienceRequirements: [],
    requiredQualifications: [],
    preferredQualifications: [],
    degreeRequirements: [],
    certifications: [],
    languages: [],
    salary: {
      currency: null, minimum: null, maximum: null, period: null,
      additionalCompensation: [], currencyStatus: 'MISSING',
      minimumStatus: 'MISSING', maximumStatus: 'MISSING', periodStatus: 'MISSING',
      additionalCompensationStatus: 'MISSING', status: 'MISSING',
      source: 'DESCRIPTION_GEMINI_VERIFIED', reasonCode: 'NO_EVIDENCE',
      evidence: null, affectedScoring: false,
    },
    workArrangement: {
      setup: missingFact,
      geographicRestrictions: [],
      collaborationTimezone: missingFact,
      scheduleRequirements: [],
    },
    employmentType: missingFact,
    reviewItems: [],
  };
}

function dependencies(repo: ControlledDiscoveryRepository, overrides: Record<string, unknown> = {}) {
  return {
    environmentType: 'DEVELOPMENT',
    killSwitchEnabled: true,
    taskId: DASHBOARD_PUBLIC_JOB_SCAN_TASK_ID,
    runId: 'run_dashboardtest',
    repository: repo,
    fetchImpl: fetchFixture(),
    verifiedSkills: SKILLS,
    sourceEnvironment: {
      JOB_DISCOVERY_ARBEITNOW_ENABLED: 'true',
      JOB_DISCOVERY_REMOTIVE_ENABLED: 'true',
      JOB_DISCOVERY_LEVER_ENABLED: 'true',
    },
    now: () => new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('dashboard job scans', () => {
  it('uses a strict payload and exact development kill switch', () => {
    expect(DashboardJobScanPayloadSchema.safeParse({ ...PAYLOAD, extra: true }).success).toBe(false);
    expect(isDashboardJobScanKillSwitchEnabled('true')).toBe(true);
    expect(isDashboardJobScanKillSwitchEnabled('TRUE')).toBe(false);
    expect(isDashboardJobScanKillSwitchEnabled(undefined)).toBe(false);
    expect(DashboardJobScanPayloadSchema.safeParse({
      mode: 'DEEP', idempotencyKey: 'deep-without-confirmation',
    }).success).toBe(false);
    expect(DashboardJobScanPayloadSchema.safeParse({
      mode: 'DEEP', idempotencyKey: 'deep-confirmed',
      deepScanConfirmed: true,
    }).success).toBe(true);
  });

  it('requires the exact Deep Scan switch and keeps default Deep Scan preview-only', async () => {
    const disabledRepo = repository();
    await expect(runDashboardJobScan(
      { mode: 'DEEP', idempotencyKey: 'deep-disabled', deepScanConfirmed: true },
      dependencies(disabledRepo.value),
    )).rejects.toBeInstanceOf(DashboardJobScanGateError);

    const repo = repository();
    const extractor = vi.fn();
    const result = await runDashboardJobScan(
      { mode: 'DEEP', idempotencyKey: 'deep-preview', deepScanConfirmed: true },
      dependencies(repo.value, {
        requirementsExtractor: extractor,
        sourceEnvironment: {
          JOB_DISCOVERY_DEEP_SCAN_ENABLED: 'true',
          JOB_DISCOVERY_ARBEITNOW_ENABLED: 'true',
        },
      }),
    );
    expect(result).toMatchObject({ mode: 'DEEP', cacheStrategy: 'FRESH' });
    expect(extractor).not.toHaveBeenCalled();
    expect(repo.persistControlledBatch).not.toHaveBeenCalled();
  });

  it('keeps Deep Scan save mode inside the shared five-job cap', async () => {
    const repo = repository({ persisted: 4 });
    const extractor = vi.fn(async () => verifiedExtraction());
    const result = await runDashboardJobScan(
      {
        mode: 'DEEP', idempotencyKey: 'deep-save', deepScanConfirmed: true,
        verifyAndSave: true,
      },
      dependencies(repo.value, {
        requirementsExtractor: extractor,
        sourceEnvironment: {
          JOB_DISCOVERY_DEEP_SCAN_ENABLED: 'true',
          JOB_DISCOVERY_ARBEITNOW_ENABLED: 'true',
        },
      }),
    );
    expect(result.persistedThisRun).toBeLessThanOrEqual(1);
    expect(result.persistedAfterRun).toBeLessThanOrEqual(5);
    expect(result.applicationsCreated).toBe(0);
    expect(result.submissionsCreated).toBe(0);
  });

  it('rejects non-development and disabled execution before fetching', async () => {
    const repo = repository().value;
    await expect(runDashboardJobScan(PAYLOAD, dependencies(repo, { environmentType: 'PRODUCTION' })))
      .rejects.toMatchObject({ code: 'NON_DEVELOPMENT_ENVIRONMENT' });
    await expect(runDashboardJobScan(PAYLOAD, dependencies(repo, { killSwitchEnabled: false })))
      .rejects.toBeInstanceOf(DashboardJobScanGateError);
  });

  it('returns the closed no-source result without fetch, Gemini, or writes', async () => {
    const repo = repository();
    const fetchImpl = vi.fn();
    const extractor = vi.fn();
    const result = await runDashboardJobScan(PAYLOAD, dependencies(repo.value, {
      sourceEnvironment: {}, fetchImpl, requirementsExtractor: extractor,
    }));
    expect(result.status).toBe('NO_DISCOVERY_SOURCES_ENABLED');
    expect(result.sourceSummaries).toHaveLength(4);
    expect(result.sourceSummaries.every((source) => source.status === 'DISABLED')).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(extractor).not.toHaveBeenCalled();
    expect(repo.persistControlledBatch).not.toHaveBeenCalled();
  });

  it('carries closed Gemini Search failure diagnostics to the dashboard result', async () => {
    const repo = repository();
    const webDiscoveryStore = createSqliteWebDiscoveryStore(':memory:');
    const result = await runDashboardJobScan(
      { ...PAYLOAD, cacheStrategy: 'FRESH' },
      dependencies(repo.value, {
        sourceEnvironment: { JOB_DISCOVERY_GEMINI_SEARCH_ENABLED: 'true' },
        geminiApiKey: 'test-only-key',
        geminiSearchModel: 'gemini-2.5-flash-lite',
        webDiscoveryStore,
        geminiSearchClientFactory: () => ({
          models: {
            async generateContent() {
              throw new TypeError('private transport detail');
            },
          },
        }),
      }),
    );
    const failures = result.sourceFailures.filter(
      (failure) => failure.provider === 'GEMINI_SEARCH',
    );
    expect(failures).toHaveLength(8);
    expect(failures.every((failure) =>
      failure.providerCategory === 'NETWORK_FAILURE' &&
      failure.providerStatus === null &&
      failure.requestReachedProvider === false &&
      failure.quotaReserved === true &&
      failure.quotaReleased === true &&
      failure.groundedUrlsReturned === 0
    )).toBe(true);
    expect(JSON.stringify(failures)).not.toMatch(/private transport detail|stack|api.?key/i);
    expect(result.geminiSearch).toMatchObject({
      promptsAttempted: 8,
      promptsCompleted: 0,
      dailyPromptsUsed: 0,
      dailyPromptsRemaining: 60,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
    });
    expect(repo.persistControlledBatch).not.toHaveBeenCalled();
    webDiscoveryStore.close?.();
  });

  it('keeps preview available at the daily cap with zero Gemini calls and writes', async () => {
    const repo = repository({ persisted: 5 });
    const extractor = vi.fn();
    const result = await runDashboardJobScan(PAYLOAD, dependencies(repo.value, {
      requirementsExtractor: extractor,
    }));
    expect(result).toMatchObject({ mode: 'PREVIEW', geminiCalls: 0, persistedThisRun: 0, dailyRemaining: 0 });
    expect(result.fetched).toBe(1);
    expect(extractor).not.toHaveBeenCalled();
    expect(repo.persistControlledBatch).not.toHaveBeenCalled();
  });

  it('uses verified extraction and the shared atomic repository for save mode', async () => {
    const repo = repository({ persisted: 3 });
    const extractor = vi.fn(async (_input, options) => {
      options?.onUsage?.({ inputTokens: 120, outputTokens: 35, totalTokens: 155 });
      return verifiedExtraction();
    });
    const result = await runDashboardJobScan(
      { mode: 'SAVE', idempotencyKey: 'dashboard-save-test' },
      dependencies(repo.value, { requirementsExtractor: extractor }),
    );
    expect(extractor).toHaveBeenCalledTimes(1);
    expect(repo.persistControlledBatch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      mode: 'SAVE', selected: 1, geminiCalls: 1,
      inputTokens: 120, outputTokens: 35, totalTokens: 155,
      persistedThisRun: 1, persistedAfterRun: 4, dailyRemaining: 1,
      applicationsCreated: 0, submissionsCreated: 0,
    });
  });

  it('does not fetch, call Gemini, or write when the shared limit is exhausted', async () => {
    const repo = repository({ persisted: 5 });
    const fetchImpl = fetchFixture();
    const extractor = vi.fn();
    const result = await runDashboardJobScan(
      { mode: 'SAVE', idempotencyKey: 'dashboard-cap-test' },
      dependencies(repo.value, { fetchImpl, requirementsExtractor: extractor }),
    );
    expect(result.status).toBe('DAILY_CAP_REACHED');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(extractor).not.toHaveBeenCalled();
    expect(repo.persistControlledBatch).not.toHaveBeenCalled();
  });

  it('returns the persistent idempotency result without a second source or model call', async () => {
    const repo = repository({ completed: true });
    const fetchImpl = fetchFixture();
    const extractor = vi.fn();
    const result = await runDashboardJobScan(
      { mode: 'SAVE', idempotencyKey: 'dashboard-repeat-test' },
      dependencies(repo.value, { fetchImpl, requirementsExtractor: extractor }),
    );
    expect(result.status).toBe('ALREADY_COMPLETED');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(extractor).not.toHaveBeenCalled();
    expect(repo.persistControlledBatch).not.toHaveBeenCalled();
  });

  it('does not verify or persist when every fresh query group needs explicit reuse confirmation', async () => {
    const repo = repository();
    const store = createSqliteWebDiscoveryStore(':memory:');
    for (const group of WEB_SEARCH_QUERY_GROUPS) {
      const runKey = `recent-${group.id}`;
      await store.recordQueryGroupSelection({
        runKey,
        queryGroupId: group.id,
        activeProfileIds: ['software_development', 'ai_automation'],
        cacheStrategy: 'FRESH',
        philippineDate: '2026-08-01',
        now: new Date('2026-08-01T00:00:00.000Z'),
      });
      await store.completeQueryGroup({
        runKey,
        status: 'COMPLETED',
        now: new Date('2026-08-01T00:00:00.000Z'),
      });
    }
    const fetchImpl = vi.fn();
    const extractor = vi.fn();
    const result = await runDashboardJobScan(
      {
        mode: 'SAVE',
        cacheStrategy: 'FRESH',
        idempotencyKey: 'dashboard-query-exhaustion',
      },
      dependencies(repo.value, {
        sourceEnvironment: { JOB_DISCOVERY_TAVILY_ENABLED: 'true' },
        tavilyApiKey: 'test-key',
        webDiscoveryStore: store,
        fetchImpl,
        requirementsExtractor: extractor,
      }),
    );
    expect(result.status, JSON.stringify(result)).toBe(
      'QUERY_GROUPS_RECENTLY_EXHAUSTED',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(extractor).not.toHaveBeenCalled();
    expect(repo.persistControlledBatch).not.toHaveBeenCalled();
    store.close?.();
  });

  it('fails closed without partial writes and retains token usage from a failed extraction', async () => {
    const repo = repository();
    const extractor = vi.fn(async (_input, options) => {
      options?.onUsage?.({ inputTokens: 40, outputTokens: 8, totalTokens: 48 });
      throw new Error('private provider detail');
    });
    const result = await runDashboardJobScan(
      { mode: 'SAVE', idempotencyKey: 'dashboard-failure-test' },
      dependencies(repo.value, { requirementsExtractor: extractor }),
    );
    expect(result).toMatchObject({ status: 'FAILED', failureCode: 'EXTRACTION_FAILED', geminiCalls: 1, inputTokens: 40, outputTokens: 8, persistedThisRun: 0 });
    expect(JSON.stringify(result)).not.toContain('private provider detail');
    expect(repo.persistControlledBatch).not.toHaveBeenCalled();
  });

  it('returns null rather than estimating unavailable usage metadata', () => {
    const usage = createGeminiUsageAccumulator();
    usage.callStarted();
    usage.record({ inputTokens: null, outputTokens: null, totalTokens: null });
    expect(usage.result()).toEqual({ geminiCalls: 1, inputTokens: null, outputTokens: null, totalTokens: null });
  });
});
