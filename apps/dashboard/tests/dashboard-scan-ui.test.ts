import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DashboardJobScanResult } from '@job-app/ingestion/discovery/dashboard-scan-contracts';
import {
  canSaveDashboardScan,
  dashboardScanResultHeading,
  JobScanControl,
  JobScanResultView,
} from '../src/components/JobScanControl';

function result(overrides: Partial<DashboardJobScanResult> = {}): DashboardJobScanResult {
  return {
    runId: 'run_dashboardtest', mode: 'PREVIEW', cacheStrategy: 'CACHED', environment: 'DEVELOPMENT',
    philippineDate: '2026-08-01', stage: 'COMPLETED', status: 'NO_MATCHES',
    activeProfileIds: ['software_development', 'ai_automation'],
    sourceSummaries: [], sourceFailures: [],
    tavily: {
      enabled: false, status: 'DISABLED', searchesAttempted: 0, searchesCompleted: 0,
      cacheHits: 0, searchCreditsConsumed: 0, extractEnabled: false,
      extractStatus: 'DISABLED', extractUrlsAttempted: 0,
      extractPagesRecovered: 0, extractCreditsConsumed: 0,
      totalCreditsConsumed: 0, dailyCreditsUsed: 0, dailyCreditsRemaining: 30,
      dailyCreditsReserved: 0, dailyCreditsConfirmed: 0,
      monthlyCreditsUsed: 0, monthlyCreditsReserved: 0,
      monthlyCreditsConfirmed: 0, monthlyCreditsRemaining: 900,
      urlsDiscovered: 0, uniqueUrls: 0, originalPagesFetched: 0,
      pagesParsedSuccessfully: 0, pagesRejected: 0,
      directEmployerOrAtsPages: 0, profileMatches: 0,
      existingMatches: 0, newSaveableMatches: 0,
    },
    geminiSearch: {
      enabled: false, status: 'DISABLED', promptsAttempted: 0,
      promptsCompleted: 0, cacheHits: 0, groundedResponses: 0,
      groundedUrlsFound: 0, uniqueUrlsContributed: 0,
      dailyPromptsUsed: 0, dailyPromptsRemaining: 60,
      inputTokens: 0, outputTokens: 0, totalTokens: 0,
    },
    webDiscovery: null, deepScanEligibleAgainAt: null,
    fetched: 134, uniqueAccepted: 104,
    duplicates: 30, exclusions: 112, profileMatches: 0,
    existingMatches: 0, newSaveableMatches: 0, nearMatches: 12,
    selected: 0, selectedForGemini: 0,
    geminiCalls: 0, inputTokens: 0, outputTokens: 0,
    totalTokens: 0, persistedBeforeRun: 0, persistedThisRun: 0,
    persistedAfterRun: 0, dailyRemaining: 5, extractionSucceeded: 0,
    extractionFailed: 0, persistedJobs: [], idempotencyStatus: 'NOT_STARTED',
    failureCode: null, failedStage: null, elapsedMs: 1200,
    applicationsCreated: 0, submissionsCreated: 0,
    ...overrides,
  };
}

describe('dashboard Scan Jobs UI', () => {
  it('renders both clear scan choices and their safety boundaries', () => {
    const html = renderToStaticMarkup(createElement(JobScanControl));
    expect(html).toContain('Scan Jobs');
    expect(html).toContain('Preview Scan');
    expect(html).toContain('Scan &amp; Save');
    expect(html).toContain('no Gemini verification');
    expect(html).toContain('shared five-job');
    expect(html).toContain('Deep Web Scan');
    expect(html).toContain('cap is not a guaranteed result');
    expect(html).not.toMatch(/GEMINI_API_KEY|TAVILY_API_KEY|JOB_DISCOVERY_(?:TAVILY|ARBEITNOW|REMOTIVE|LEVER)_ENABLED|JOB_DISCOVERY_DASHBOARD_SCAN_ENABLED|stack trace/i);
  });

  it('keeps preview available while disabling save-capability at zero remaining', () => {
    expect(canSaveDashboardScan({
      philippineDate: '2026-08-01', dailyLimit: 5, savedToday: 5, remaining: 0,
      deepScanEnabled: true, deepScanEligible: true, deepScanEligibleAgainAt: null,
    })).toBe(false);
    expect(canSaveDashboardScan({
      philippineDate: '2026-08-01', dailyLimit: 5, savedToday: 4, remaining: 1,
      deepScanEnabled: true, deepScanEligible: true, deepScanEligibleAgainAt: null,
    })).toBe(true);
  });

  it('uses explicit no-match and failure result language', () => {
    expect(dashboardScanResultHeading(result())).toBe(
      'No jobs matched your active profiles.',
    );
    expect(dashboardScanResultHeading(result({ status: 'FAILED' }))).toBe(
      'The scan stopped safely.',
    );
    expect(dashboardScanResultHeading(result({
      status: 'COMPLETED', profileMatches: 2, existingMatches: 2,
      newSaveableMatches: 0,
    }))).toBe('All matching jobs are already in your dashboard.');
  });

  it('renders compact Tavily and disabled legacy source summaries', () => {
    const html = renderToStaticMarkup(createElement(JobScanResultView, {
      result: result({
        sourceSummaries: [
          { source: 'tavily', status: 'COMPLETED', costClassification: 'FREE_TIER_CREDITS', fetched: 8, accepted: 3, invalid: 5, duplicates: 1, exclusions: 1, profileMatches: 1 },
          { source: 'arbeitnow', status: 'DISABLED', costClassification: 'FREE', fetched: 0, accepted: 0, invalid: 0, duplicates: 0, exclusions: 0, profileMatches: 0 },
          { source: 'remotive', status: 'DISABLED', costClassification: 'FREE', fetched: 0, accepted: 0, invalid: 0, duplicates: 0, exclusions: 0, profileMatches: 0 },
          { source: 'lever', status: 'DISABLED', costClassification: 'FREE_CONFIGURED_BOARDS', fetched: 0, accepted: 0, invalid: 0, duplicates: 0, exclusions: 0, profileMatches: 0 },
        ],
        tavily: {
          enabled: true, status: 'COMPLETED', searchesAttempted: 8, searchesCompleted: 8,
          cacheHits: 0, searchCreditsConsumed: 8, extractEnabled: true,
          extractStatus: 'COMPLETED', extractUrlsAttempted: 5,
          extractPagesRecovered: 2, extractCreditsConsumed: 1,
          totalCreditsConsumed: 9, dailyCreditsUsed: 9, dailyCreditsRemaining: 21,
          dailyCreditsReserved: 0, dailyCreditsConfirmed: 9,
          monthlyCreditsUsed: 9, monthlyCreditsReserved: 0,
          monthlyCreditsConfirmed: 9, monthlyCreditsRemaining: 891,
          urlsDiscovered: 54, uniqueUrls: 41, originalPagesFetched: 35,
          pagesParsedSuccessfully: 21, pagesRejected: 20,
          directEmployerOrAtsPages: 18, profileMatches: 1,
          existingMatches: 1, newSaveableMatches: 0,
        },
      }),
    }));
    expect(html).toContain('Tavily Basic Search');
    expect(html).toContain('Current-run Search credits');
    expect(html).toContain('Confirmed today');
    expect(html).toContain('Reserved today');
    expect(html).toContain('Arbeitnow');
    expect((html.match(/DISABLED/g) ?? [])).toHaveLength(4);
  });

  it('renders safe failure metrics and actual-or-unavailable token usage', () => {
    const html = renderToStaticMarkup(createElement(JobScanResultView, {
      result: result({
        mode: 'SAVE', status: 'FAILED', stage: 'FAILED',
        failedStage: 'VERIFYING_WITH_GEMINI', failureCode: 'EXTRACTION_FAILED',
        geminiCalls: 1, inputTokens: 44, outputTokens: null, totalTokens: null,
      }),
    }));
    expect(html).toContain('Failed stage:');
    expect(html).toContain('Verifying selected jobs');
    expect(html).toContain('44');
    expect(html).toContain('Usage unavailable');
    expect(html).not.toMatch(/candidateId|description|stack/i);
  });

  it('attributes combined-source warnings to the actual web provider', () => {
    const html = renderToStaticMarkup(createElement(JobScanResultView, {
      result: result({
        sourceFailures: [
          {
            source: 'tavily',
            provider: 'GEMINI_SEARCH',
            queryId: 'entry-01',
            code: 'API_ERROR',
            providerCategory: 'NETWORK_FAILURE',
            providerStatus: null,
            requestReachedProvider: false,
            quotaReserved: true,
            quotaReleased: true,
            groundedUrlsReturned: 0,
          },
        ],
      }),
    }));
    expect(html).toContain('GEMINI SEARCH / entry-01: API ERROR');
    expect(html).toContain('NETWORK FAILURE');
    expect(html).not.toContain('tavily / entry-01');
  });

  it('reports saved results without exposing descriptions', () => {
    const value = result({ mode: 'SAVE', status: 'COMPLETED', persistedThisRun: 2 });
    expect(dashboardScanResultHeading(value)).toBe('2 verified jobs were saved.');
    expect(JSON.stringify(value)).not.toContain('description');
  });
});
