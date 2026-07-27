import { describe, expect, it, vi } from 'vitest';
import {
  ARBEITNOW_API_URL,
  ARBEITNOW_USER_AGENT,
  ArbeitnowAdapter,
  ArbeitnowDiscoveryError,
  mapArbeitnowRecord,
  type ArbeitnowRecord,
} from '../src/adapters/arbeitnow.js';

function record(
  overrides: Partial<ArbeitnowRecord> = {},
): ArbeitnowRecord {
  return {
    slug: 'junior-typescript-developer-123',
    company_name: 'Example GmbH',
    title: 'Junior TypeScript Developer',
    description:
      '<h2>Role</h2><p>Build accessible products.</p><ul><li>TypeScript</li></ul>',
    remote: true,
    url: 'https://www.arbeitnow.com/jobs/companies/example/junior-typescript-developer-123',
    tags: ['TypeScript', 'Web Development'],
    job_types: ['Permanent', 'Full time'],
    location: 'Berlin',
    created_at: 1_785_000_000,
    ...overrides,
  };
}

function apiResponse(
  data: unknown[],
  page = 1,
  hasNext = false,
): Response {
  return new Response(
    JSON.stringify({
      data,
      links: {
        first: `${ARBEITNOW_API_URL}?page=1`,
        last: null,
        prev: page > 1 ? `${ARBEITNOW_API_URL}?page=${page - 1}` : null,
        next: hasNext ? `${ARBEITNOW_API_URL}?page=${page + 1}` : null,
      },
      meta: {
        current_page: page,
        per_page: data.length,
        terms: 'Free public API; please do not abuse.',
      },
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    },
  );
}

describe('Arbeitnow public source adapter', () => {
  it('maps a valid response with stable source identity and canonical URL', async () => {
    const fetchImpl = vi.fn(async () => apiResponse([record()]));
    const result = await new ArbeitnowAdapter({ fetchImpl }).fetchJobs({
      limit: 10,
      pages: 1,
    });

    expect(result).toMatchObject({
      sourceRecordsFetched: 1,
      acceptedRecords: 1,
      invalidRecords: 0,
      pagesFetched: 1,
    });
    expect(result.jobs[0]).toMatchObject({
      sourceName: 'Arbeitnow',
      sourceJobId: 'junior-typescript-developer-123',
      title: 'Junior TypeScript Developer',
      company: 'Example GmbH',
      location: 'Berlin',
      remote: true,
      employmentType: 'Permanent, Full time',
      tags: ['TypeScript', 'Web Development'],
      sourceUrl:
        'https://www.arbeitnow.com/jobs/companies/example/junior-typescript-developer-123',
      applicationUrl:
        'https://www.arbeitnow.com/jobs/companies/example/junior-typescript-developer-123',
    });
    const [url, request] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toBe(`${ARBEITNOW_API_URL}?page=1`);
    expect(request?.headers).toMatchObject({
      Accept: 'application/json',
      'User-Agent': ARBEITNOW_USER_AGENT,
    });
  });

  it('cleans HTML descriptions with the existing content cleaner', () => {
    const mapped = mapArbeitnowRecord(record());
    expect(mapped.description).toContain('Role');
    expect(mapped.description).toContain('Build accessible products.');
    expect(mapped.description).toContain('TypeScript');
    expect(mapped.description).not.toMatch(/<h2>|<p>|<li>/);
  });

  it('keeps missing optional values unknown', async () => {
    const fetchImpl = vi.fn(async () =>
      apiResponse([
        {
          slug: 'unknown-fields-1',
          company_name: 'Unknown Fields GmbH',
          title: 'Developer',
          description: '<p>Public job description.</p>',
          remote: false,
          url: 'https://www.arbeitnow.com/jobs/unknown-fields-1',
          created_at: 1_785_000_000,
        },
      ]),
    );
    const result = await new ArbeitnowAdapter({ fetchImpl }).fetchJobs({
      limit: 1,
      pages: 1,
    });
    expect(result.jobs[0]).toMatchObject({
      location: null,
      employmentType: null,
      tags: [],
      remote: false,
    });
  });

  it('paginates only until the requested page limit', async () => {
    const fetchImpl = vi.fn(async (url: URL | RequestInfo) => {
      const page = Number(new URL(String(url)).searchParams.get('page'));
      return apiResponse(
        [record({ slug: `job-${page}`, url: `https://www.arbeitnow.com/jobs/job-${page}` })],
        page,
        true,
      );
    });
    const result = await new ArbeitnowAdapter({ fetchImpl }).fetchJobs({
      limit: 10,
      pages: 2,
    });
    expect(result.pagesFetched).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('never fetches more than three pages', async () => {
    const fetchImpl = vi.fn(async (url: URL | RequestInfo) => {
      const page = Number(new URL(String(url)).searchParams.get('page'));
      return apiResponse(
        [record({ slug: `job-${page}`, url: `https://www.arbeitnow.com/jobs/job-${page}` })],
        page,
        true,
      );
    });
    const result = await new ArbeitnowAdapter({ fetchImpl }).fetchJobs({
      limit: 50,
      pages: 3,
    });
    expect(result.pagesFetched).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    await expect(
      new ArbeitnowAdapter({ fetchImpl }).fetchJobs({
        limit: 50,
        pages: 4,
      }),
    ).rejects.toThrow();
  });

  it('never accepts more than 50 jobs', async () => {
    const records = Array.from({ length: 60 }, (_, index) =>
      record({
        slug: `job-${index}`,
        url: `https://www.arbeitnow.com/jobs/job-${index}`,
      }),
    );
    const fetchImpl = vi.fn(async () => apiResponse(records, 1, true));
    const result = await new ArbeitnowAdapter({ fetchImpl }).fetchJobs({
      limit: 50,
      pages: 3,
    });
    expect(result.jobs).toHaveLength(50);
    expect(result.sourceRecordsFetched).toBe(50);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('returns a safe timeout error', async () => {
    const fetchImpl = vi.fn(
      (_url: URL | RequestInfo, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    await expect(
      new ArbeitnowAdapter({ fetchImpl, timeoutMs: 1 }).fetchJobs({
        limit: 1,
        pages: 1,
      }),
    ).rejects.toMatchObject<Partial<ArbeitnowDiscoveryError>>({
      code: 'TIMEOUT',
      message: 'Arbeitnow did not respond before the request timeout.',
    });
  });

  it('returns a safe non-2xx error without exposing the response body', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('provider diagnostic should stay hidden', { status: 503 }),
    );
    await expect(
      new ArbeitnowAdapter({ fetchImpl }).fetchJobs({
        limit: 1,
        pages: 1,
      }),
    ).rejects.toMatchObject<Partial<ArbeitnowDiscoveryError>>({
      code: 'HTTP_ERROR',
      message: 'Arbeitnow returned HTTP 503. Try again later.',
    });
  });

  it('rejects malformed JSON safely', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('{not valid json', { status: 200 }),
    );
    await expect(
      new ArbeitnowAdapter({ fetchImpl }).fetchJobs({
        limit: 1,
        pages: 1,
      }),
    ).rejects.toMatchObject<Partial<ArbeitnowDiscoveryError>>({
      code: 'MALFORMED_JSON',
    });
  });

  it('counts Zod-invalid source records and continues safely', async () => {
    const fetchImpl = vi.fn(async () =>
      apiResponse([
        { title: 'Missing required source fields' },
        record(),
      ]),
    );
    const result = await new ArbeitnowAdapter({ fetchImpl }).fetchJobs({
      limit: 1,
      pages: 1,
    });
    expect(result).toMatchObject({
      sourceRecordsFetched: 2,
      acceptedRecords: 1,
      invalidRecords: 1,
    });
  });

  it('rejects a changed response envelope', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ jobs: [record()] }), { status: 200 }),
    );
    await expect(
      new ArbeitnowAdapter({ fetchImpl }).fetchJobs({
        limit: 1,
        pages: 1,
      }),
    ).rejects.toMatchObject<Partial<ArbeitnowDiscoveryError>>({
      code: 'SOURCE_SCHEMA_CHANGED',
    });
  });
});
