import { describe, expect, it, vi } from 'vitest';
import {
  TAVILY_JOB_SEARCH_QUERIES,
  TAVILY_SEARCH_API_URL,
  TavilyAdapter,
  canonicalizeTavilyJobUrl,
  parseOriginalJobPage,
} from '../src/adapters/tavily.js';
import type { DiscoveryRepository } from '../src/discovery/contracts.js';
import {
  runPublicJobDiscoveryDryRun,
} from '../src/discovery/orchestration.js';
import { resolveWebDiscoveryDatabasePath } from '../src/discovery/runtime.js';
import {
  createSqliteTavilySearchStore,
  normalizeTavilyQuery,
} from '../src/discovery/tavily-search-store.js';
import {
  isExactDiscoverySourceSwitchEnabled,
  resolvePublicJobDiscoverySourceConfiguration,
} from '../src/discovery/source-configuration.js';

const NOW = new Date('2026-08-01T02:00:00.000Z');
const JOB_URL = 'https://jobs.example.com/careers/software-developer-123?utm_source=test';
const JOB_HTML = `<!doctype html><html><head>
  <script type="application/ld+json">${JSON.stringify({
    '@type': 'JobPosting',
    title: 'Junior Software Developer',
    description: '<p>You will build and maintain software applications with TypeScript and React.</p><p>You will test and ship reliable APIs for remote customers.</p>',
    hiringOrganization: { name: 'Example Employer' },
    employmentType: 'FULL_TIME',
    datePosted: '2026-08-01',
    jobLocationType: 'TELECOMMUTE',
    applicantLocationRequirements: { name: 'Philippines' },
  })}</script></head><body><main>Original employer job content.</main></body></html>`;

function repository(): DiscoveryRepository {
  return {
    async loadExistingJobs() { return []; },
    async persistBatch() { throw new Error('Dry-run must not persist.'); },
  };
}

function tavilyEnvelope(url = JOB_URL, content = 'Untrusted Tavily snippet') {
  return {
    query: 'fixture',
    answer: null,
    images: [],
    results: [{ title: 'Search title', url, content, score: 0.9, raw_content: null }],
    response_time: 0.1,
    request_id: 'request-fixture',
    usage: { credits: 1 },
  };
}

function fetchFixture(options: { failTavily?: boolean; html?: string } = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === TAVILY_SEARCH_API_URL) {
      if (options.failTavily) throw new Error('private provider failure');
      return Response.json(tavilyEnvelope());
    }
    if (url.startsWith('https://jobs.example.com/')) {
      return new Response(options.html ?? JOB_HTML, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }
    throw new Error(`Unexpected mocked URL: ${url}`);
  });
}

const publicResolver = vi.fn(async () => ({ ok: true as const }));

describe('Tavily Basic Search discovery', () => {
  it('keeps repository-injected web discovery stores isolated from the default database', () => {
    expect(resolveWebDiscoveryDatabasePath({
      repositoryInjected: true,
    })).toBe(':memory:');
    expect(resolveWebDiscoveryDatabasePath({
      databasePath: 'temporary-test.db',
      repositoryInjected: true,
    })).toBe('temporary-test.db');
  });

  it('uses exact source switches and keeps every malformed legacy switch disabled', () => {
    expect(isExactDiscoverySourceSwitchEnabled('true')).toBe(true);
    for (const value of [undefined, '', 'TRUE', ' true', 'true ', '1', 'yes']) {
      expect(isExactDiscoverySourceSwitchEnabled(value)).toBe(false);
    }
    expect(resolvePublicJobDiscoverySourceConfiguration({
      JOB_DISCOVERY_TAVILY_ENABLED: 'true',
      JOB_DISCOVERY_ARBEITNOW_ENABLED: 'TRUE',
      JOB_DISCOVERY_REMOTIVE_ENABLED: ' true',
      JOB_DISCOVERY_LEVER_ENABLED: 'false',
    })).toEqual({
      tavily: true,
      geminiSearch: false,
      tavilyExtract: false,
      deepScan: false,
      arbeitnow: false,
      remotive: false,
      lever: false,
    });
  });

  it('uses only Basic Search with eight fixed requests and no answer or raw content', async () => {
    const store = createSqliteTavilySearchStore(':memory:');
    const fetchImpl = fetchFixture();
    const adapter = new TavilyAdapter({
      apiKey: 'test-only-key', searchStore: store,
      philippineDate: '2026-08-01', fetchImpl,
      now: () => NOW, resolveHost: publicResolver,
    });
    const result = await adapter.fetchJobs({ limit: 50, pages: 1 });
    const searchCalls = fetchImpl.mock.calls.filter(([url]) => String(url) === TAVILY_SEARCH_API_URL);
    expect(searchCalls).toHaveLength(8);
    for (const [, init] of searchCalls) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).toMatchObject({
        search_depth: 'basic', max_results: 10, include_answer: false,
        include_raw_content: false, include_images: false, auto_parameters: false,
      });
      expect(body).not.toHaveProperty('extract');
    }
    expect(TAVILY_JOB_SEARCH_QUERIES).toHaveLength(8);
    expect(result.tavilyFetchReport).toMatchObject({
      searchesAttempted: 8, searchesCompleted: 8, creditsConsumed: 8,
      urlsDiscovered: 8, uniqueUrls: 1, pagesParsedSuccessfully: 1,
    });
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.description).toContain('TypeScript');
    expect(result.jobs[0]?.description).not.toContain('Untrusted Tavily snippet');
    store.close?.();
  });

  it('fails safely without a key and makes no request', async () => {
    const store = createSqliteTavilySearchStore(':memory:');
    const fetchImpl = vi.fn();
    const result = await new TavilyAdapter({
      apiKey: '', searchStore: store, philippineDate: '2026-08-01',
      fetchImpl, now: () => NOW, resolveHost: publicResolver,
    }).fetchJobs({ limit: 50, pages: 1 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.tavilyFetchReport?.sourceFailures).toEqual([
      { code: 'MISSING_API_KEY' },
    ]);
    store.close?.();
  });

  it('uses the six-hour cache without spending another credit', async () => {
    const store = createSqliteTavilySearchStore(':memory:');
    const firstFetch = fetchFixture();
    await new TavilyAdapter({
      apiKey: 'test-only-key', searchStore: store,
      philippineDate: '2026-08-01', fetchImpl: firstFetch,
      now: () => NOW, resolveHost: publicResolver,
    }).fetchJobs({ limit: 50, pages: 1 });
    const secondFetch = fetchFixture();
    const second = await new TavilyAdapter({
      apiKey: 'test-only-key', searchStore: store,
      philippineDate: '2026-08-01', fetchImpl: secondFetch,
      now: () => new Date(NOW.getTime() + 60 * 60 * 1_000),
      resolveHost: publicResolver,
    }).fetchJobs({ limit: 50, pages: 1 });
    expect(secondFetch.mock.calls.filter(([url]) => String(url) === TAVILY_SEARCH_API_URL)).toHaveLength(0);
    expect(second.tavilyFetchReport).toMatchObject({ cacheHits: 8, creditsConsumed: 0, dailyCreditsRemaining: 8 });
    store.close?.();
  });

  it('enforces sixteen credits per Philippine date transactionally', async () => {
    const store = createSqliteTavilySearchStore(':memory:');
    const reservations = await Promise.all(
      Array.from({ length: 17 }, (_, index) => store.reserve({
        normalizedQuery: `unique query ${index}`,
        philippineDate: '2026-08-01',
        now: NOW,
      })),
    );
    expect(reservations.filter((item) => item.status === 'RESERVED')).toHaveLength(16);
    expect(reservations.at(-1)?.status).toBe('DAILY_LIMIT_REACHED');
    expect(await store.getDailyRemaining('2026-08-01')).toBe(0);
    expect(await store.getDailyRemaining('2026-08-02')).toBe(16);
    store.close?.();
  });

  it('does not double-reserve an identical concurrent query', async () => {
    const store = createSqliteTavilySearchStore(':memory:');
    const [first, second] = await Promise.all([
      store.reserve({ normalizedQuery: ' Same   Query ', philippineDate: '2026-08-01', now: NOW }),
      store.reserve({ normalizedQuery: 'same query', philippineDate: '2026-08-01', now: NOW }),
    ]);
    expect([first.status, second.status].sort()).toEqual(['IN_FLIGHT', 'RESERVED']);
    expect(await store.getDailyRemaining('2026-08-01')).toBe(15);
    expect(normalizeTavilyQuery(' Same   Query ')).toBe('same query');
    store.close?.();
  });

  it('canonicalizes job URLs while rejecting login, search, and submission pages', () => {
    expect(canonicalizeTavilyJobUrl(JOB_URL)).toBe(
      'https://jobs.example.com/careers/software-developer-123',
    );
    expect(canonicalizeTavilyJobUrl('https://example.com/login')).toBeNull();
    expect(canonicalizeTavilyJobUrl('https://example.com/search/jobs')).toBeNull();
    expect(canonicalizeTavilyJobUrl('https://example.com/apply/123')).toBeNull();
    expect(canonicalizeTavilyJobUrl('file:///private/job')).toBeNull();
  });

  it('parses JSON-LD JobPosting and rejects unparseable original pages', () => {
    const parsed = parseOriginalJobPage(JOB_HTML, JOB_URL);
    expect(parsed).toMatchObject({
      title: 'Junior Software Developer', company: 'Example Employer',
      remote: true, employmentType: 'FULL_TIME',
    });
    expect(parseOriginalJobPage('<html><h1>Maybe a job</h1></html>', JOB_URL)).toBeNull();
  });

  it('runs Tavily alone and reports legacy sources disabled without network calls', async () => {
    const store = createSqliteTavilySearchStore(':memory:');
    const fetchImpl = fetchFixture();
    const result = await runPublicJobDiscoveryDryRun({ cacheStrategy: 'FRESH' }, {
      repository: repository(), verifiedSkills: [], fetchImpl,
      now: () => NOW, resolveHost: publicResolver,
      tavilyApiKey: 'test-only-key', tavilySearchStore: store,
      sourceEnvironment: { JOB_DISCOVERY_TAVILY_ENABLED: 'true' },
    });
    expect(fetchImpl.mock.calls.some(([url]) => /arbeitnow|remotive|lever/.test(String(url)))).toBe(false);
    expect(
      result.sources.tavily?.status,
      JSON.stringify(result.sources.tavily),
    ).toBe('SUCCESS');
    expect(result.sources.arbeitnow?.status).toBe('DISABLED');
    expect(result.sources.remotive?.status).toBe('DISABLED');
    expect(result.sources.lever?.status).toBe('DISABLED');
    expect(result.combinedTotals.sourceRecordsFetched).toBe(8);
    store.close?.();
  });

  it('returns a closed no-source result without any network request', async () => {
    const fetchImpl = vi.fn();
    const result = await runPublicJobDiscoveryDryRun({ cacheStrategy: 'FRESH' }, {
      repository: repository(), verifiedSkills: [], fetchImpl,
      sourceEnvironment: {}, now: () => NOW,
    });
    expect(result.finalStatus).toBe('NO_DISCOVERY_SOURCES_ENABLED');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.combinedTotals.sourceRecordsFetched).toBe(0);
    expect(Object.values(result.sources).every((source) => source?.status === 'DISABLED')).toBe(true);
  });

  it('keeps a Tavily outage isolated without activating disabled legacy sources', async () => {
    const store = createSqliteTavilySearchStore(':memory:');
    const fetchImpl = fetchFixture({ failTavily: true });
    const result = await runPublicJobDiscoveryDryRun({ cacheStrategy: 'FRESH' }, {
      repository: repository(), verifiedSkills: [], fetchImpl,
      tavilyApiKey: 'test-only-key', tavilySearchStore: store,
      sourceEnvironment: { JOB_DISCOVERY_TAVILY_ENABLED: 'true' },
      now: () => NOW,
    });
    expect(result.sources.tavily?.status).toBe('FAILED');
    expect(result.sources.arbeitnow?.status).toBe('DISABLED');
    expect(fetchImpl.mock.calls.some(([url]) => /arbeitnow|remotive|lever/.test(String(url)))).toBe(false);
    expect(JSON.stringify(result)).not.toContain('private provider failure');
    store.close?.();
  });

  it('keeps an explicitly enabled legacy source running after Tavily fails', async () => {
    const store = createSqliteTavilySearchStore(':memory:');
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === TAVILY_SEARCH_API_URL) throw new Error('private Tavily outage');
      if (url.includes('arbeitnow.com')) {
        return Response.json({
          data: [{
            slug: 'legacy-explicit-1', company_name: 'Legacy Explicit',
            title: 'Junior Software Developer',
            description: 'You will build React applications.', remote: true,
            url: 'https://www.arbeitnow.com/jobs/legacy-explicit-1',
            tags: ['React'], job_types: ['Full time'], location: 'Remote',
            created_at: 1_785_000_000,
          }],
          links: { next: null }, meta: { current_page: 1 },
        });
      }
      throw new Error('Unexpected mocked URL');
    });
    const result = await runPublicJobDiscoveryDryRun({ cacheStrategy: 'FRESH' }, {
      repository: repository(), verifiedSkills: [], fetchImpl,
      tavilyApiKey: 'test-only-key', tavilySearchStore: store,
      sourceEnvironment: {
        JOB_DISCOVERY_TAVILY_ENABLED: 'true',
        JOB_DISCOVERY_ARBEITNOW_ENABLED: 'true',
      },
      now: () => NOW,
    });
    expect(result.sources.tavily?.status).toBe('FAILED');
    expect(result.sources.arbeitnow?.status).toBe('SUCCESS');
    expect(result.combinedTotals.sourceRecordsFetched).toBe(1);
    expect(JSON.stringify(result)).not.toContain('private Tavily outage');
    store.close?.();
  });
});
