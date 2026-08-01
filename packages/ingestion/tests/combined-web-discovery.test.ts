import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase } from '@job-app/db';
import {
  CombinedWebDiscoveryAdapter,
  DEEP_WEB_DISCOVERY_BATCH_SIZE,
  DEEP_WEB_DISCOVERY_UNIQUE_URL_CAP,
  NORMAL_WEB_DISCOVERY_UNIQUE_URL_CAP,
  ORIGINAL_PAGE_GLOBAL_CONCURRENCY,
  ORIGINAL_PAGE_PER_HOST_CONCURRENCY,
  deduplicateWebDiscoveryUrls,
  isSpecificPublicJobUrl,
} from '../src/adapters/combined-web-discovery.js';
import {
  resolveGeminiSearchModel,
  type GeminiSearchClientFactory,
} from '../src/adapters/gemini-web-search.server.js';
import {
  TAVILY_EXTRACT_API_URL,
} from '../src/adapters/tavily-extract.js';
import { TAVILY_SEARCH_API_URL } from '../src/adapters/tavily.js';
import {
  WEB_SEARCH_QUERY_GROUPS,
  selectDeterministicQueryGroup,
} from '../src/discovery/web-search-query-groups.v1.js';
import {
  createSqliteWebDiscoveryStore,
  resolveWebDiscoveryQuotaCaps,
} from '../src/discovery/web-discovery-store.js';
import {
  resolvePublicJobDiscoverySourceConfiguration,
} from '../src/discovery/source-configuration.js';

const NOW = new Date('2026-08-01T02:00:00.000Z');
const CAPS = { tavilyDaily: 30, tavilyMonthly: 900, geminiSearchDaily: 60 };
const resolver = vi.fn(async () => ({ ok: true as const }));

function searchEnvelope(urls: string[]) {
  return {
    query: 'fixture',
    answer: null,
    images: [],
    results: urls.map((url, index) => ({
      title: `Untrusted search snippet ${index}`,
      url,
      content: 'This snippet must never become job evidence.',
      score: 0.9,
      raw_content: null,
    })),
    usage: { credits: 1 },
  };
}

function jobHtml(title = 'Junior Software Developer', company = 'Example Co') {
  return `<html><head><script type="application/ld+json">${JSON.stringify({
    '@type': 'JobPosting',
    title,
    hiringOrganization: { name: company },
    description: '<p>You will build and test React applications, maintain TypeScript services, implement reliable APIs, and ship production software with a collaborative engineering team.</p>',
    jobLocationType: 'TELECOMMUTE',
    datePosted: '2026-08-01',
  })}</script></head><body>Attributable employer vacancy.</body></html>`;
}

function geminiFactory(urls: string[], calls: ReturnType<typeof vi.fn>): GeminiSearchClientFactory {
  return () => ({
    models: {
      async generateContent() {
        calls();
        return {
          candidates: [{
            groundingMetadata: {
              groundingChunks: urls.map((uri, index) => ({
                web: { uri, title: `Grounded lead ${index}` },
              })),
            },
          }],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 2,
            totalTokenCount: 12,
          },
        };
      },
    },
  });
}

function adapter(options: {
  store: ReturnType<typeof createSqliteWebDiscoveryStore>;
  fetchImpl: typeof fetch;
  tavily?: boolean;
  gemini?: boolean;
  extract?: boolean;
  deep?: boolean;
  cacheStrategy?: 'CACHED' | 'FRESH';
  runKey?: string;
  geminiFactory?: GeminiSearchClientFactory;
}) {
  return new CombinedWebDiscoveryAdapter({
    tavilyEnabled: options.tavily ?? true,
    geminiSearchEnabled: options.gemini ?? true,
    tavilyExtractEnabled: options.extract ?? false,
    tavilyApiKey: 'test-only-tavily-key',
    geminiApiKey: 'test-only-gemini-key',
    geminiSearchModel: 'gemini-test-search-model',
    store: options.store,
    caps: CAPS,
    philippineDate: '2026-08-01',
    scan: {
      scanMode: options.deep ? 'DEEP' : 'NORMAL',
      cacheStrategy: options.cacheStrategy ?? 'FRESH',
      confirmRecentlyExhausted: false,
      runKey: options.runKey ?? 'test-run',
      activeProfileIds: ['software_development', 'ai_automation'],
      ...(options.deep ? { deepScanIdempotencyKey: 'test-deep-key' } : {}),
    },
    fetchImpl: options.fetchImpl,
    resolveHost: resolver,
    now: () => NOW,
    geminiClientFactory: options.geminiFactory,
  });
}

describe('combined Tavily and Gemini web discovery', () => {
  it('keeps search model configuration independent and all feature switches exact', () => {
    expect(resolveGeminiSearchModel('gemini-2.5-flash-lite')).toBe('gemini-2.5-flash-lite');
    expect(resolveGeminiSearchModel(undefined)).toBeNull();
    const configuration = resolvePublicJobDiscoverySourceConfiguration({
      JOB_DISCOVERY_TAVILY_ENABLED: 'true',
      JOB_DISCOVERY_GEMINI_SEARCH_ENABLED: 'true',
      JOB_DISCOVERY_TAVILY_EXTRACT_ENABLED: 'TRUE',
      JOB_DISCOVERY_DEEP_SCAN_ENABLED: ' true',
    });
    expect(configuration).toMatchObject({
      tavily: true,
      geminiSearch: true,
      tavilyExtract: false,
      deepScan: false,
    });
    expect(JSON.stringify(configuration)).not.toContain('GEMINI_MODEL');
  });

  it('defines four bounded groups and rotates deterministically without randomness', () => {
    expect(WEB_SEARCH_QUERY_GROUPS).toHaveLength(4);
    expect(WEB_SEARCH_QUERY_GROUPS.every((group) => group.intents.length === 8)).toBe(true);
    const first = selectDeterministicQueryGroup({
      philippineDate: '2026-08-01',
      activeProfileIds: ['software_development', 'ai_automation'],
      executions: [],
      now: NOW,
      cacheStrategy: 'FRESH',
    });
    const second = selectDeterministicQueryGroup({
      philippineDate: '2026-08-01',
      activeProfileIds: ['software_development', 'ai_automation'],
      executions: [{ queryGroupId: first.queryGroup.id, executedAt: NOW.toISOString() }],
      now: NOW,
      cacheStrategy: 'FRESH',
    });
    expect(second.queryGroup.id).not.toBe(first.queryGroup.id);
    expect(selectDeterministicQueryGroup({
      philippineDate: '2026-08-01',
      activeProfileIds: ['software_development', 'ai_automation'],
      executions: [], now: NOW, cacheStrategy: 'FRESH',
    }).queryGroup.id).toBe(first.queryGroup.id);
  });

  it('requires explicit reuse after every group ran recently', () => {
    const executions = WEB_SEARCH_QUERY_GROUPS.map((group, index) => ({
      queryGroupId: group.id,
      executedAt: new Date(NOW.getTime() - index * 1_000).toISOString(),
    }));
    const blocked = selectDeterministicQueryGroup({
      philippineDate: '2026-08-01',
      activeProfileIds: ['software_development'],
      executions, now: NOW, cacheStrategy: 'FRESH',
    });
    expect(blocked).toMatchObject({ recentlyExhausted: true, requiresFreshConfirmation: true });
    expect(selectDeterministicQueryGroup({
      philippineDate: '2026-08-01',
      activeProfileIds: ['software_development'],
      executions, now: NOW, cacheStrategy: 'FRESH', confirmRecentlyExhausted: true,
    }).requiresFreshConfirmation).toBe(false);
  });

  it('runs both search providers, deduplicates cross-source URLs, and uses only original-page evidence', async () => {
    const store = createSqliteWebDiscoveryStore(':memory:');
    const url = 'https://jobs.example.com/jobs/123?utm_source=search';
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === TAVILY_SEARCH_API_URL) return Response.json(searchEnvelope([url]));
      if (String(input) === 'https://jobs.example.com/jobs/123') {
        return new Response(jobHtml(), { headers: { 'content-type': 'text/html' } });
      }
      throw new Error('Unexpected test URL');
    }) as typeof fetch;
    const geminiCalls = vi.fn();
    const result = await adapter({
      store, fetchImpl,
      geminiFactory: geminiFactory(['https://jobs.example.com/jobs/123'], geminiCalls),
    }).fetchJobs({ limit: 250, pages: 1 });
    expect(result.webDiscoveryReport).toMatchObject({
      uniqueUrlCap: NORMAL_WEB_DISCOVERY_UNIQUE_URL_CAP,
      uniqueUrls: 1,
      urlsFoundByBothSources: 1,
      pagesParsedDirectly: 1,
    });
    expect(result.webDiscoveryReport?.tavilySearch.searchRequestsAttempted).toBe(8);
    expect(result.webDiscoveryReport?.geminiSearch.promptsAttempted).toBe(8);
    expect(geminiCalls).toHaveBeenCalledTimes(8);
    expect(result.jobs[0]?.sourceName).toBe('Tavily + Gemini Search');
    expect(result.jobs[0]?.description).toContain('You will build');
    expect(result.jobs[0]?.description).not.toMatch(/snippet|Grounded lead/);
    store.close?.();
  });

  it('enforces normal and Deep unique-URL caps after cross-source deduplication', () => {
    const urls = Array.from({ length: 1_100 }, (_, index) => ({
      url: `https://jobs.example.com/jobs/${index}`,
      title: `Job ${index}`,
      directEmployerOrAts: true,
    }));
    const normal = deduplicateWebDiscoveryUrls({
      tavily: urls,
      gemini: urls.slice(0, 100),
      cap: NORMAL_WEB_DISCOVERY_UNIQUE_URL_CAP,
    });
    const deep = deduplicateWebDiscoveryUrls({
      tavily: urls,
      gemini: [],
      cap: DEEP_WEB_DISCOVERY_UNIQUE_URL_CAP,
    });
    expect(normal.urls).toHaveLength(250);
    expect(normal.both).toBe(100);
    expect(normal.capReached).toBe(true);
    expect(deep.urls).toHaveLength(1_000);
    expect(deep.capReached).toBe(true);
  });

  it('reuses both caches without fresh Search credits or Gemini prompts', async () => {
    const store = createSqliteWebDiscoveryStore(':memory:');
    const url = 'https://jobs.example.com/jobs/cache-1';
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === TAVILY_SEARCH_API_URL) return Response.json(searchEnvelope([url]));
      if (String(input) === url) return new Response(jobHtml(), { headers: { 'content-type': 'text/html' } });
      throw new Error('Unexpected test URL');
    }) as typeof fetch;
    const initialCalls = vi.fn();
    await adapter({ store, fetchImpl, runKey: 'fresh', geminiFactory: geminiFactory([url], initialCalls) })
      .fetchJobs({ limit: 250, pages: 1 });
    const searchCallsBefore = vi.mocked(fetchImpl).mock.calls.filter(([input]) => String(input) === TAVILY_SEARCH_API_URL).length;
    const cachedGeminiCalls = vi.fn();
    const cached = await adapter({
      store, fetchImpl, runKey: 'cached', cacheStrategy: 'CACHED',
      geminiFactory: geminiFactory([url], cachedGeminiCalls),
    }).fetchJobs({ limit: 250, pages: 1 });
    const searchCallsAfter = vi.mocked(fetchImpl).mock.calls.filter(([input]) => String(input) === TAVILY_SEARCH_API_URL).length;
    expect(searchCallsAfter).toBe(searchCallsBefore);
    expect(cachedGeminiCalls).not.toHaveBeenCalled();
    expect(cached.webDiscoveryReport?.tavilySearch).toMatchObject({ cacheHits: 8, searchCreditsConsumed: 0 });
    expect(cached.webDiscoveryReport?.geminiSearch).toMatchObject({ cacheHits: 8, promptsAttempted: 0 });
    store.close?.();
  });

  it('isolates either search source failure from the other', async () => {
    const store = createSqliteWebDiscoveryStore(':memory:');
    const url = 'https://jobs.example.com/jobs/gemini-only';
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === TAVILY_SEARCH_API_URL) throw new Error('private outage');
      if (String(input) === url) return new Response(jobHtml(), { headers: { 'content-type': 'text/html' } });
      throw new Error('Unexpected test URL');
    }) as typeof fetch;
    const result = await adapter({ store, fetchImpl, geminiFactory: geminiFactory([url], vi.fn()) })
      .fetchJobs({ limit: 250, pages: 1 });
    expect(result.jobs).toHaveLength(1);
    expect(result.webDiscoveryReport?.tavilySearch.status).toBe('FAILED');
    expect(result.webDiscoveryReport?.geminiSearch.status).toBe('COMPLETED');
    expect(result.webDiscoveryReport?.tavilySearch.searchCreditsConsumed).toBe(0);
    expect(result.webDiscoveryReport?.tavilySearch.dailyCreditsReserved).toBe(0);
    expect(result.webDiscoveryReport?.tavilySearch.dailyCreditsConfirmed).toBe(0);
    store.close?.();
  });

  it('releases failed Search reservations while retaining confirmed provider usage', async () => {
    const store = createSqliteWebDiscoveryStore(':memory:');
    const completed = await store.reserveSearch({
      provider: 'TAVILY', operation: 'SEARCH', normalizedRequest: 'completed query',
      cacheOnly: false, philippineDate: '2026-08-01', now: NOW, caps: CAPS,
    });
    expect(completed.status).toBe('RESERVED');
    if (completed.status !== 'RESERVED') throw new Error('Expected test reservation.');
    await store.completeSearch({
      provider: 'TAVILY', normalizedRequest: 'completed query',
      reservationToken: completed.reservationToken, urls: [], now: NOW,
    });
    const failed = await store.reserveSearch({
      provider: 'TAVILY', operation: 'SEARCH', normalizedRequest: 'failed query',
      cacheOnly: false, philippineDate: '2026-08-01', now: NOW, caps: CAPS,
    });
    expect(failed.status).toBe('RESERVED');
    if (failed.status !== 'RESERVED') throw new Error('Expected test reservation.');
    await store.failSearch({
      provider: 'TAVILY', normalizedRequest: 'failed query',
      reservationToken: failed.reservationToken, now: NOW,
    });
    expect(await store.getUsage({ philippineDate: '2026-08-01', caps: CAPS }))
      .toMatchObject({
        tavilyDailyUsed: 1,
        tavilyDailyReserved: 0,
        tavilyDailyConfirmed: 1,
        tavilyMonthlyUsed: 1,
        tavilyMonthlyReserved: 0,
        tavilyMonthlyConfirmed: 1,
      });
    store.close?.();
  });

  it('counts a canonical provider charge once when a legacy provenance mirror exists', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'job-app-web-usage-'));
    const databasePath = join(directory, 'usage.db');
    const store = createSqliteWebDiscoveryStore(databasePath);
    const reservation = await store.reserveSearch({
      provider: 'TAVILY', operation: 'SEARCH', normalizedRequest: 'legacy live query',
      cacheOnly: false, philippineDate: '2026-08-01', now: NOW, caps: CAPS,
    });
    expect(reservation.status).toBe('RESERVED');
    if (reservation.status !== 'RESERVED') throw new Error('Expected test reservation.');
    await store.completeSearch({
      provider: 'TAVILY', normalizedRequest: 'legacy live query',
      reservationToken: reservation.reservationToken, urls: [], now: NOW,
    });
    const sqlite = createDatabase(databasePath);
    sqlite.prepare(
      `INSERT INTO web_discovery_usage_ledger (
         reservation_token, provider, operation, philippine_date,
         philippine_month, cache_key, counted_units, consumed_units,
         daily_cap, monthly_cap, state, created_at, updated_at
       ) VALUES (?, 'TAVILY', 'SEARCH', '2026-08-01', '2026-08', ?,
                 1, 1, 30, 900, 'COMPLETED', ?, ?)`,
    ).run(
      'legacy-tavily-search:provenance-mirror',
      'legacy-live-query',
      NOW.toISOString(),
      NOW.toISOString(),
    );
    sqlite.close();
    expect(await store.getUsage({ philippineDate: '2026-08-01', caps: CAPS }))
      .toMatchObject({ tavilyDailyUsed: 1, tavilyMonthlyUsed: 1 });
    store.close?.();
    await rm(directory, { recursive: true, force: true });
  });

  it('returns eight closed Tavily diagnostics without raw provider details', async () => {
    const store = createSqliteWebDiscoveryStore(':memory:');
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === TAVILY_SEARCH_API_URL) throw new Error('private provider body');
      throw new Error('Unexpected test URL');
    }) as typeof fetch;
    const result = await adapter({ store, fetchImpl, gemini: false })
      .fetchJobs({ limit: 250, pages: 1 });
    const failures = result.webDiscoveryReport?.tavilySearch.sourceFailures ?? [];
    expect(failures).toHaveLength(8);
    expect(failures.every((failure) => failure.code === 'NETWORK_ERROR')).toBe(true);
    expect(JSON.stringify(failures)).not.toContain('private provider body');
    expect(result.webDiscoveryReport?.tavilySearch).toMatchObject({
      searchRequestsAttempted: 8,
      searchesCompleted: 0,
      searchCreditsConsumed: 0,
      dailyCreditsUsed: 0,
      dailyCreditsReserved: 0,
      dailyCreditsConfirmed: 0,
    });
    store.close?.();
  });

  it('uses Basic Extract only after an eligible direct-fetch parse failure', async () => {
    const store = createSqliteWebDiscoveryStore(':memory:');
    const url = 'https://jobs.example.com/jobs/recover-1';
    const extractCalls: RequestInit[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === TAVILY_SEARCH_API_URL) return Response.json(searchEnvelope([url]));
      if (String(input) === url) return new Response('<html><body><div id="app"></div></body></html>', { headers: { 'content-type': 'text/html' } });
      if (String(input) === TAVILY_EXTRACT_API_URL) {
        extractCalls.push(init ?? {});
        return Response.json({
          results: [{ url, raw_content: '# Junior Software Developer\nCompany: Recovery Co\n\nYou will build and test React applications. This is a remote full-time public vacancy with meaningful attributable responsibilities.' }],
          failed_results: [],
          usage: { credits: 1 },
        });
      }
      throw new Error('Unexpected test URL');
    }) as typeof fetch;
    const result = await adapter({ store, fetchImpl, gemini: false, extract: true })
      .fetchJobs({ limit: 250, pages: 1 });
    expect(extractCalls.length).toBeGreaterThan(0);
    const body = JSON.parse(String(extractCalls[0]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ extract_depth: 'basic', include_usage: true });
    expect(body).not.toHaveProperty('crawl');
    expect(result.webDiscoveryReport?.pagesRecoveredByExtract).toBe(1);
    expect(result.jobs).toHaveLength(1);
    store.close?.();
  });

  it('limits original-page fetching to five globally and one per host', async () => {
    const store = createSqliteWebDiscoveryStore(':memory:');
    const urls = Array.from({ length: 10 }, (_, index) =>
      `https://jobs${Math.floor(index / 2)}.example.org/jobs/${index}`,
    );
    let active = 0;
    let maxActive = 0;
    const hostActive = new Map<string, number>();
    let maxPerHost = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === TAVILY_SEARCH_API_URL) return Response.json(searchEnvelope(urls));
      const host = new URL(url).hostname;
      active += 1;
      maxActive = Math.max(maxActive, active);
      const nextHost = (hostActive.get(host) ?? 0) + 1;
      hostActive.set(host, nextHost);
      maxPerHost = Math.max(maxPerHost, nextHost);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      hostActive.set(host, nextHost - 1);
      return new Response(jobHtml(`Developer ${url.split('/').at(-1)}`), {
        headers: { 'content-type': 'text/html' },
      });
    }) as typeof fetch;
    const result = await adapter({ store, fetchImpl, gemini: false })
      .fetchJobs({ limit: 250, pages: 1 });
    expect(result.jobs).toHaveLength(10);
    expect(maxActive).toBeLessThanOrEqual(ORIGINAL_PAGE_GLOBAL_CONCURRENCY);
    expect(maxPerHost).toBe(ORIGINAL_PAGE_PER_HOST_CONCURRENCY);
    store.close?.();
  });

  it('never sends ineligible login/search/submission pages to Extract', () => {
    expect(isSpecificPublicJobUrl('https://example.com/login/jobs/1')).toBe(false);
    expect(isSpecificPublicJobUrl('https://example.com/search/jobs/1')).toBe(false);
    expect(isSpecificPublicJobUrl('https://example.com/jobs/1/apply')).toBe(false);
    expect(isSpecificPublicJobUrl('http://127.0.0.1/jobs/1')).toBe(false);
  });

  it('shares Tavily daily/monthly credit limits and enforces Gemini prompts transactionally', async () => {
    const store = createSqliteWebDiscoveryStore(':memory:');
    const small = { tavilyDaily: 2, tavilyMonthly: 3, geminiSearchDaily: 2 };
    const first = await store.reserveUsage({ provider: 'TAVILY', operation: 'SEARCH', cacheKey: 'a', units: 1, philippineDate: '2026-08-01', now: NOW, caps: small });
    const second = await store.reserveUsage({ provider: 'TAVILY', operation: 'EXTRACT', cacheKey: 'b', units: 1, philippineDate: '2026-08-01', now: NOW, caps: small });
    expect(first.status).toBe('RESERVED');
    expect(second.status).toBe('RESERVED');
    expect((await store.reserveUsage({ provider: 'TAVILY', operation: 'SEARCH', cacheKey: 'c', units: 1, philippineDate: '2026-08-01', now: NOW, caps: small })).status).toBe('DAILY_LIMIT_REACHED');
    expect((await store.reserveUsage({ provider: 'TAVILY', operation: 'SEARCH', cacheKey: 'd', units: 1, philippineDate: '2026-08-02', now: new Date(NOW.getTime() + 86_400_000), caps: small })).status).toBe('RESERVED');
    expect((await store.reserveUsage({ provider: 'TAVILY', operation: 'SEARCH', cacheKey: 'e', units: 1, philippineDate: '2026-08-02', now: new Date(NOW.getTime() + 86_400_000), caps: small })).status).toBe('MONTHLY_LIMIT_REACHED');
    expect((await store.reserveUsage({ provider: 'TAVILY', operation: 'SEARCH', cacheKey: 'f', units: 1, philippineDate: '2026-09-01', now: new Date('2026-09-01T02:00:00.000Z'), caps: small })).status).toBe('RESERVED');
    const geminiReservations = await Promise.all(['g1', 'g2', 'g3'].map((cacheKey) => store.reserveUsage({ provider: 'GEMINI_SEARCH', operation: 'PROMPT', cacheKey, units: 1, philippineDate: '2026-08-01', now: NOW, caps: small })));
    expect(geminiReservations.filter((value) => value.status === 'RESERVED')).toHaveLength(2);
    expect(geminiReservations.filter((value) => value.status === 'DAILY_LIMIT_REACHED')).toHaveLength(1);
    store.close?.();
  });

  it('uses safe quota defaults and separates day from month rollover', () => {
    expect(resolveWebDiscoveryQuotaCaps({})).toEqual({
      tavilyDaily: 30, tavilyMonthly: 900, geminiSearchDaily: 60,
    });
    expect(resolveWebDiscoveryQuotaCaps({
      JOB_DISCOVERY_TAVILY_DAILY_CREDIT_CAP: ' 31',
      JOB_DISCOVERY_TAVILY_MONTHLY_CREDIT_CAP: '901',
      JOB_DISCOVERY_GEMINI_SEARCH_DAILY_PROMPT_CAP: '61',
    })).toEqual({ tavilyDaily: 30, tavilyMonthly: 901, geminiSearchDaily: 61 });
  });

  it('persists Deep Scan cooldown, idempotency, checkpoints, and cancellation', async () => {
    const store = createSqliteWebDiscoveryStore(':memory:');
    const started = await store.beginDeepScan({ idempotencyKey: 'deep-1', triggerRunId: 'run_deep1', philippineDate: '2026-08-01', verifyAndSave: false, now: NOW });
    expect(started.status).toBe('STARTED');
    expect((await store.beginDeepScan({ idempotencyKey: 'deep-1', triggerRunId: 'run_deep1', philippineDate: '2026-08-01', verifyAndSave: false, now: NOW })).status).toBe('ALREADY_ACTIVE');
    expect((await store.beginDeepScan({ idempotencyKey: 'deep-2', triggerRunId: 'run_deep2', philippineDate: '2026-08-02', verifyAndSave: false, now: new Date(NOW.getTime() + 86_400_000) })).status).toBe('COOLDOWN');
    expect(await store.requestDeepScanCancellation('run_deep1')).toBe(true);
    expect(await store.isDeepScanCancellationRequested('deep-1')).toBe(true);
    await store.recordDeepScanCheckpoint({ runKey: 'deep-1', batchNumber: 1, urlsAttempted: DEEP_WEB_DISCOVERY_BATCH_SIZE, pagesParsed: 20, pagesRecovered: 2, pagesRejected: 78 });
    await store.completeDeepScan({ idempotencyKey: 'deep-1', state: 'CANCELLED', stoppingReason: 'CANCELLED', now: NOW });
    expect(DEEP_WEB_DISCOVERY_UNIQUE_URL_CAP).toBe(1000);
    expect(DEEP_WEB_DISCOVERY_BATCH_SIZE).toBe(100);
    expect(ORIGINAL_PAGE_GLOBAL_CONCURRENCY).toBe(5);
    expect(ORIGINAL_PAGE_PER_HOST_CONCURRENCY).toBe(1);
    store.close?.();
  });
});
