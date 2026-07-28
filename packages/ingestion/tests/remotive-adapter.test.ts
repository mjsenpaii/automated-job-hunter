import { describe, expect, it, vi } from 'vitest';
import {
  REMOTIVE_API_URL,
  REMOTIVE_USER_AGENT,
  RemotiveAdapter,
  RemotiveDiscoveryError,
  mapRemotiveRecord,
  type RemotiveRecord,
} from '../src/adapters/remotive.js';

function record(
  overrides: Partial<RemotiveRecord> = {},
): RemotiveRecord {
  return {
    id: 12345,
    url: 'https://remotive.com/remote-jobs/software-dev/junior-typescript-developer-12345',
    title: 'Junior TypeScript Developer',
    company_name: 'Example Remote Inc.',
    category: 'Software Development',
    job_type: 'full_time',
    publication_date: '2026-07-28T08:30:00',
    candidate_required_location: 'Worldwide',
    salary: '$60,000 - $80,000',
    description:
      '<h2>Role</h2><p>Build accessible products.</p><ul><li>TypeScript</li></ul>',
    tags: ['TypeScript', 'Accessibility'],
    ...overrides,
  };
}

function apiResponse(data: unknown[]): Response {
  return new Response(
    JSON.stringify({
      '0-legal-notice': 'Remotive API Legal Notice',
      'job-count': data.length,
      jobs: data,
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    },
  );
}

describe('Remotive public source adapter', () => {
  it('maps a valid response with stable source identity and canonical URL', async () => {
    const fetchImpl = vi.fn(async () => apiResponse([record()]));
    const result = await new RemotiveAdapter({
      fetchImpl,
      category: 'software-dev',
      search: 'developer',
    }).fetchJobs({
      limit: 20,
      pages: 1,
    });

    expect(result).toMatchObject({
      sourceRecordsFetched: 1,
      acceptedRecords: 1,
      invalidRecords: 0,
      pagesFetched: 1,
    });
    expect(result.jobs[0]).toMatchObject({
      sourceName: 'Remotive',
      sourceJobId: '12345',
      title: 'Junior TypeScript Developer',
      company: 'Example Remote Inc.',
      location: 'Worldwide',
      remote: true,
      employmentType: 'full time',
      category: 'Software Development',
      salaryText: '$60,000 - $80,000',
      tags: ['TypeScript', 'Accessibility'],
      sourceUrl:
        'https://remotive.com/remote-jobs/software-dev/junior-typescript-developer-12345',
      applicationUrl:
        'https://remotive.com/remote-jobs/software-dev/junior-typescript-developer-12345',
    });
    const [url, request] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      `${REMOTIVE_API_URL}?limit=20&category=software-dev&search=developer`,
    );
    expect(request?.headers).toMatchObject({
      Accept: 'application/json',
      'User-Agent': REMOTIVE_USER_AGENT,
    });
  });

  it('cleans HTML descriptions with the existing content cleaner', () => {
    const mapped = mapRemotiveRecord(record());
    expect(mapped.description).toContain('Role');
    expect(mapped.description).toContain('Build accessible products.');
    expect(mapped.description).toContain('TypeScript');
    expect(mapped.description).not.toMatch(/<h2>|<p>|<li>/);
  });

  it('keeps missing optional values unknown', async () => {
    const fetchImpl = vi.fn(async () =>
      apiResponse([
        record({
          category: undefined,
          job_type: undefined,
          publication_date: undefined,
          candidate_required_location: undefined,
          salary: undefined,
          tags: undefined,
        }),
      ]),
    );
    const result = await new RemotiveAdapter({ fetchImpl }).fetchJobs({
      limit: 1,
      pages: 1,
    });
    expect(result.jobs[0]).toMatchObject({
      location: null,
      employmentType: null,
      category: null,
      salaryText: null,
      tags: [],
      publishedAt: null,
    });
  });

  it('preserves salary text only when explicitly source-provided', () => {
    expect(mapRemotiveRecord(record()).salaryText).toBe(
      '$60,000 - $80,000',
    );
    expect(
      mapRemotiveRecord(record({ salary: undefined })).salaryText,
    ).toBeNull();
    expect(
      mapRemotiveRecord(record({ salary: '   ' })).salaryText,
    ).toBeNull();
  });

  it('never accepts more than 50 jobs', async () => {
    const records = Array.from({ length: 60 }, (_, index) =>
      record({
        id: index + 1,
        url: `https://remotive.com/remote-jobs/software-dev/job-${index + 1}`,
      }),
    );
    const fetchImpl = vi.fn(async () => apiResponse(records));
    const result = await new RemotiveAdapter({ fetchImpl }).fetchJobs({
      limit: 50,
      pages: 1,
    });
    expect(result.jobs).toHaveLength(50);
    expect(result.sourceRecordsFetched).toBe(50);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      `${REMOTIVE_API_URL}?limit=50`,
    );
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
      new RemotiveAdapter({ fetchImpl, timeoutMs: 1 }).fetchJobs({
        limit: 1,
        pages: 1,
      }),
    ).rejects.toMatchObject<Partial<RemotiveDiscoveryError>>({
      code: 'TIMEOUT',
      message: 'Remotive did not respond before the request timeout.',
    });
  });

  it('returns a safe non-2xx error without exposing the response body', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('private provider diagnostic', { status: 503 }),
    );
    await expect(
      new RemotiveAdapter({ fetchImpl }).fetchJobs({
        limit: 1,
        pages: 1,
      }),
    ).rejects.toMatchObject<Partial<RemotiveDiscoveryError>>({
      code: 'HTTP_ERROR',
      message: 'Remotive returned HTTP 503. Try again later.',
    });
  });

  it('rejects malformed JSON safely', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('{not valid json', { status: 200 }),
    );
    await expect(
      new RemotiveAdapter({ fetchImpl }).fetchJobs({
        limit: 1,
        pages: 1,
      }),
    ).rejects.toMatchObject<Partial<RemotiveDiscoveryError>>({
      code: 'MALFORMED_JSON',
    });
  });

  it('rejects a changed response envelope', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ data: [record()] }), { status: 200 }),
    );
    await expect(
      new RemotiveAdapter({ fetchImpl }).fetchJobs({
        limit: 1,
        pages: 1,
      }),
    ).rejects.toMatchObject<Partial<RemotiveDiscoveryError>>({
      code: 'SOURCE_SCHEMA_CHANGED',
    });
  });

  it('rejects an inconsistent envelope job count', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          '0-legal-notice': 'Remotive API Legal Notice',
          'job-count': 2,
          jobs: [record()],
        }),
        { status: 200 },
      ),
    );
    await expect(
      new RemotiveAdapter({ fetchImpl }).fetchJobs({
        limit: 1,
        pages: 1,
      }),
    ).rejects.toMatchObject<Partial<RemotiveDiscoveryError>>({
      code: 'SOURCE_SCHEMA_CHANGED',
    });
  });

  it('counts Zod-invalid source records and continues safely', async () => {
    const fetchImpl = vi.fn(async () =>
      apiResponse([
        { id: 1, title: 'Missing required source fields' },
        record(),
      ]),
    );
    const result = await new RemotiveAdapter({ fetchImpl }).fetchJobs({
      limit: 1,
      pages: 1,
    });
    expect(result).toMatchObject({
      sourceRecordsFetched: 2,
      acceptedRecords: 1,
      invalidRecords: 1,
    });
  });
});
