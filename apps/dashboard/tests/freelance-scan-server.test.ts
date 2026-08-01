import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { trigger, retrieve } = vi.hoisted(() => ({ trigger: vi.fn(), retrieve: vi.fn() }));
vi.mock('@trigger.dev/sdk', () => ({ tasks: { trigger }, runs: { retrieve } }));

import {
  FREELANCE_SCAN_TASK_ID,
  FreelanceScanResultSchema,
} from '@job-app/ingestion/freelance/contracts';
import {
  FreelanceScanApiError,
  getFreelancePreviewOpportunity,
  getFreelanceScanStatus,
  isFreelanceSameOriginPost,
  resetFreelanceScanStateForTests,
  startFreelanceScan,
} from '../src/lib/server/freelance-scans';

const sourceSummary = (source: 'HIMALAYAS' | 'REMOTIVE' | 'TAVILY' | 'GEMINI_SEARCH') => ({
  source, status: 'DISABLED' as const,
  costClassification: source === 'HIMALAYAS' ? 'FREE_NO_API_KEY' as const
    : source === 'REMOTIVE' ? 'FREE_PUBLIC_API_NO_KEY' as const
      : source === 'TAVILY' ? 'API_CREDITS' as const : 'API_QUOTA' as const,
  requestsAttempted: 0, requestsCompleted: 0, cacheHits: 0, listingsFetched: 0,
  accepted: 0, originalPagesFetched: 0, validOpportunityPages: 0,
  nonOpportunityPages: 0, duplicateOrRepostPages: 0, pagesRecoveredByExtract: 0,
  pagesWithSufficientTaskScope: 0, pagesWithInsufficientTaskScope: 0,
  queriesUsed: [], queryYields: [], attributionPreserved: true,
  searchCreditsConsumed: 0, extractCreditsConsumed: 0,
  dailyCreditsUsed: 0, dailyCreditsRemaining: 0,
  monthlyCreditsUsed: 0, monthlyCreditsRemaining: 0,
  dailyPromptsUsed: 0, dailyPromptsRemaining: 0,
  inputTokens: null, outputTokens: null, totalTokens: null,
  providerResponseReached: null, quotaReservationReleased: null, failures: [],
});

function previewResult() {
  return FreelanceScanResultSchema.parse({
    runId: 'run_freelancefixture', mode: 'PREVIEW', environment: 'DEVELOPMENT',
    philippineDate: '2026-08-02', status: 'COMPLETED',
    sourceSummaries: ['HIMALAYAS', 'REMOTIVE', 'TAVILY', 'GEMINI_SEARCH'].map((source) =>
      sourceSummary(source as 'HIMALAYAS' | 'REMOTIVE' | 'TAVILY' | 'GEMINI_SEARCH')),
    fetched: 1, unique: 1, validIndividualOpportunities: 1,
    aboveMinimum: 0, unknownPay: 1, readyNow: 0, learnableFast: 0,
    notReady: 1, requiresReview: 1, reviewScopeManually: 0, hardRejected: 0,
    previewOpportunityTotal: 1,
    previewOpportunities: [{
      temporaryResultId: 'freelance_aaaaaaaaaaaaaaaaaaaaaaaa',
      title: 'Small website update', clientOrCompany: null, source: 'TAVILY',
      sourceDomain: 'jobs.example', originalUrl: 'https://jobs.example/project/1',
      publishedAt: null, contractType: 'PROJECT', remote: true,
      geographicEligibility: 'REQUIRES_REVIEW', views: ['PHILIPPINES'],
      originalPayText: null, payClassification: 'UNKNOWN', readiness: 'NOT_READY',
      resultState: 'NOT_READY', primaryBlocker: 'INSUFFICIENT_TASK_SCOPE_EVIDENCE',
      matchedCategories: ['TECHNICAL_QUICK_WINS'], transferableSkills: ['HTML'],
      missingSkills: ['WordPress'], taskScope: { status: 'INSUFFICIENT', evidenceCount: 0, requiredSkillEvidenceCount: 0 },
      learning: null, scamRisk: 'LOW', riskIndicators: [], aggregatorOrRepost: false,
      recommendedAction: 'REVIEW_SCOPE_WITH_CLIENT', expired: false,
    }],
    selected: 0, savedThisRun: 0, savedBeforeRun: 0, savedAfterRun: 0,
    dailyRemaining: 20, geminiSearchPrompts: 0, geminiVerificationCalls: 0,
    applicationsCreated: 0, submissionsCreated: 0, proposalsSent: 0,
    bidsPlaced: 0, messagesSent: 0, idempotencyStatus: 'NOT_STARTED', elapsedMs: 1,
  });
}

describe('freelance dashboard scan server boundary', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('JOB_DISCOVERY_DASHBOARD_SCAN_ENABLED', 'true');
    resetFreelanceScanStateForTests();
    trigger.mockReset();
    retrieve.mockReset();
  });

  afterEach(() => vi.unstubAllEnvs());

  it('requires the existing exact development dashboard switch and same-origin POST', async () => {
    expect(isFreelanceSameOriginPost(new Request('http://localhost:3000/api/freelance-scans', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'sec-fetch-site': 'same-origin' },
    }))).toBe(true);
    expect(isFreelanceSameOriginPost(new Request('http://localhost:3000/api/freelance-scans', {
      method: 'POST', headers: { origin: 'https://attacker.example' },
    }))).toBe(false);
    vi.stubEnv('JOB_DISCOVERY_DASHBOARD_SCAN_ENABLED', 'TRUE');
    await expect(startFreelanceScan({ mode: 'PREVIEW', idempotencyKey: 'disabled' }))
      .rejects.toMatchObject({ code: 'DISABLED' });
  });

  it('uses the unscheduled freelance task, task idempotency, and one active scan', async () => {
    trigger.mockResolvedValue({ id: 'run_freelancefixture' });
    retrieve.mockResolvedValue({
      id: 'run_freelancefixture', taskIdentifier: FREELANCE_SCAN_TASK_ID, status: 'EXECUTING',
    });
    await expect(startFreelanceScan({ mode: 'PREVIEW', cacheStrategy: 'CACHED', idempotencyKey: 'freelance-idempotency' }))
      .resolves.toEqual({ runId: 'run_freelancefixture', status: 'QUEUED' });
    expect(trigger).toHaveBeenCalledWith(
      FREELANCE_SCAN_TASK_ID,
      { mode: 'PREVIEW', cacheStrategy: 'CACHED', idempotencyKey: 'freelance-idempotency' },
      { idempotencyKey: 'freelance-idempotency' },
    );
    await expect(startFreelanceScan({ mode: 'SAVE', idempotencyKey: 'second-key' }))
      .rejects.toBeInstanceOf(FreelanceScanApiError);
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it('returns only a closed run failure when Trigger reports an unsafe terminal result', async () => {
    retrieve.mockResolvedValue({
      id: 'run_freelancefixture', taskIdentifier: FREELANCE_SCAN_TASK_ID,
      status: 'FAILED', error: { message: 'private provider details', stack: 'private stack' },
    });
    const status = await getFreelanceScanStatus('run_freelancefixture');
    expect(status).toEqual({
      runId: 'run_freelancefixture', active: false, status: 'FAILED',
      result: null, failureCode: 'RUN_FAILED',
    });
    expect(JSON.stringify(status)).not.toMatch(/private provider|private stack/);
  });

  it('retrieves a trusted bounded Preview opportunity instead of accepting browser source data', async () => {
    retrieve.mockResolvedValue({
      id: 'run_freelancefixture', taskIdentifier: FREELANCE_SCAN_TASK_ID,
      status: 'COMPLETED', output: previewResult(),
    });
    await expect(getFreelancePreviewOpportunity(
      'run_freelancefixture',
      'freelance_aaaaaaaaaaaaaaaaaaaaaaaa',
    )).resolves.toMatchObject({
      title: 'Small website update',
      source: 'TAVILY',
      originalUrl: 'https://jobs.example/project/1',
    });
    await expect(getFreelancePreviewOpportunity('run_freelancefixture', 'unknown'))
      .rejects.toMatchObject({ code: 'RUN_NOT_FOUND' });
  });
});
