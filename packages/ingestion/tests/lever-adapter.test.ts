import { describe, expect, it, vi } from 'vitest';
import {
  LEVER_API_ORIGIN,
  LEVER_USER_AGENT,
  LeverAdapter,
  LeverDiscoveryError,
  buildLeverPostingsUrl,
  mapLeverRecord,
  type LeverRecord,
} from '../src/adapters/lever.js';
import type { LeverCompany } from '../src/discovery/lever-companies.v1.js';

const SPOTIFY: LeverCompany = {
  displayName: 'Spotify',
  site: 'spotify',
  enabled: true,
};
const HIGHSPOT: LeverCompany = {
  displayName: 'Highspot',
  site: 'highspot',
  enabled: true,
};

function record(overrides: Partial<LeverRecord> = {}): LeverRecord {
  return {
    id: 'posting-123',
    text: 'Backend Developer',
    categories: {
      commitment: 'Permanent',
      department: 'Research and Development',
      location: 'New York, NY',
      team: 'Engineering',
      allLocations: ['New York, NY'],
    },
    createdAt: 1_785_000_000_000,
    updatedAt: 1_785_086_400_000,
    opening: '<p>Build products used around the world.</p>',
    descriptionBody:
      '<h2>What you will do</h2><p>Ship reliable services.</p>',
    lists: [
      {
        text: 'Requirements',
        content: '<ul><li>Visible TypeScript experience</li></ul>',
      },
    ],
    additional: '<p>Equal opportunity employer.</p>',
    hostedUrl: 'https://jobs.lever.co/spotify/posting-123',
    applyUrl:
      'https://jobs.lever.co/spotify/posting-123/apply',
    workplaceType: 'remote',
    ...overrides,
  };
}

function response(data: unknown[], status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Lever public company-board adapter', () => {
  it('maps visible fields with stable identity and the canonical hosted URL', async () => {
    const fetchImpl = vi.fn(async () => response([record()]));
    const result = await new LeverAdapter({
      companies: [SPOTIFY],
      fetchImpl,
    }).fetchJobs({ limit: 25, pages: 1 });

    expect(result).toMatchObject({
      sourceRecordsFetched: 1,
      acceptedRecords: 1,
      invalidRecords: 0,
      pagesFetched: 1,
    });
    expect(result.jobs[0]).toMatchObject({
      sourceName: 'Lever',
      sourceJobId: 'posting-123',
      title: 'Backend Developer',
      company: 'Spotify',
      location: 'New York, NY',
      remote: true,
      workplaceType: 'remote',
      employmentType: 'Permanent',
      team: 'Engineering',
      department: 'Research and Development',
      salaryText: null,
      tags: [],
      sourceUrl: 'https://jobs.lever.co/spotify/posting-123',
      applicationUrl: 'https://jobs.lever.co/spotify/posting-123',
    });
    expect(result.jobs[0]?.publishedAt).toBe(
      new Date(1_785_000_000_000).toISOString(),
    );
    expect(result.jobs[0]?.updatedAt).toBe(
      new Date(1_785_086_400_000).toISOString(),
    );
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      `${LEVER_API_ORIGIN}/v0/postings/spotify?mode=json&skip=0&limit=25`,
    );
    expect(init?.headers).toMatchObject({
      Accept: 'application/json',
      'User-Agent': LEVER_USER_AGENT,
    });
  });

  it('constructs requests only on the fixed official host', () => {
    const url = buildLeverPostingsUrl(SPOTIFY, 50, 25);
    expect(url.origin).toBe(LEVER_API_ORIGIN);
    expect(url.pathname).toBe('/v0/postings/spotify');
    expect(url.searchParams.get('skip')).toBe('50');
    expect(url.searchParams.get('limit')).toBe('25');
  });

  it('cleans rich text and preserves visible list sections', () => {
    const mapped = mapLeverRecord(record(), SPOTIFY);
    expect(mapped.description).toContain('Build products used around the world.');
    expect(mapped.description).toContain('What you will do');
    expect(mapped.description).toContain('Requirements');
    expect(mapped.description).toContain('Visible TypeScript experience');
    expect(mapped.description).not.toMatch(/<p>|<h2>|<li>|<ul>/);
  });

  it('keeps missing optional fields unknown without inventing salary or skills', () => {
    const mapped = mapLeverRecord(
      record({
        categories: {},
        createdAt: undefined,
        updatedAt: undefined,
        workplaceType: undefined,
        opening: undefined,
        descriptionBody: undefined,
        lists: undefined,
        additional: undefined,
        description: '<p>Public role details.</p>',
      }),
      SPOTIFY,
    );
    expect(mapped).toMatchObject({
      location: null,
      remote: null,
      employmentType: null,
      team: null,
      department: null,
      workplaceType: null,
      salaryText: null,
      tags: [],
      publishedAt: null,
      updatedAt: null,
    });
  });

  it('classifies remote only from explicit workplace or location evidence', () => {
    expect(mapLeverRecord(record(), SPOTIFY).remote).toBe(true);
    expect(
      mapLeverRecord(
        record({ workplaceType: 'hybrid' }),
        SPOTIFY,
      ).remote,
    ).toBe(false);
    expect(
      mapLeverRecord(
        record({
          workplaceType: 'unspecified',
          categories: { location: 'Remote - Canada' },
        }),
        SPOTIFY,
      ).remote,
    ).toBe(true);
    expect(
      mapLeverRecord(
        record({
          workplaceType: 'unspecified',
          categories: { location: 'Canada' },
        }),
        SPOTIFY,
      ).remote,
    ).toBeNull();
  });

  it('normalizes Lever’s official onsite variant to the canonical on-site value', () => {
    const mapped = mapLeverRecord(
      record({ workplaceType: 'onsite' }),
      SPOTIFY,
    );
    expect(mapped.workplaceType).toBe('on-site');
    expect(mapped.remote).toBe(false);
  });

  it('rejects canonical URLs outside the configured company board', async () => {
    const fetchImpl = vi.fn(async () =>
      response([
        record({
          hostedUrl: 'https://jobs.lever.co/another-company/posting-123',
        }),
      ]),
    );
    const result = await new LeverAdapter({
      companies: [SPOTIFY],
      fetchImpl,
    }).fetchJobs({ limit: 1, pages: 1 });
    expect(result).toMatchObject({
      acceptedRecords: 0,
      invalidRecords: 1,
    });
  });

  it('aggregates multiple configured companies', async () => {
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      const site = url.pathname.split('/').filter(Boolean).at(-1);
      return response([
        record({
          id: `${site}-1`,
          hostedUrl: `https://jobs.lever.co/${site}/${site}-1`,
        }),
      ]);
    });
    const result = await new LeverAdapter({
      companies: [SPOTIFY, HIGHSPOT],
      fetchImpl,
    }).fetchJobs({ limit: 10, pages: 1 });
    expect(result.jobs.map((job) => job.company)).toEqual([
      'Spotify',
      'Highspot',
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rejects more than ten companies and never accepts more than 100 jobs', async () => {
    expect(
      () =>
        new LeverAdapter({
          companies: Array.from({ length: 11 }, (_, index) => ({
            displayName: `Company ${index}`,
            site: `company-${index}`,
            enabled: true,
          })),
        }),
    ).toThrow('one and ten');

    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      const skip = Number(url.searchParams.get('skip'));
      const limit = Number(url.searchParams.get('limit'));
      return response(
        Array.from({ length: limit }, (_, index) => {
          const id = skip + index;
          return record({
            id: `posting-${id}`,
            hostedUrl: `https://jobs.lever.co/spotify/posting-${id}`,
          });
        }),
      );
    });
    const result = await new LeverAdapter({
      companies: [SPOTIFY],
      fetchImpl,
    }).fetchJobs({ limit: 100, pages: 1 });
    expect(result.jobs).toHaveLength(100);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await expect(
      new LeverAdapter({
        companies: [SPOTIFY],
        fetchImpl,
      }).fetchJobs({ limit: 101, pages: 1 }),
    ).rejects.toThrow();
  });

  it('returns a safe timeout error', async () => {
    const fetchImpl = vi.fn(
      (_input: URL | RequestInfo, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    await expect(
      new LeverAdapter({
        companies: [SPOTIFY],
        fetchImpl,
        timeoutMs: 1,
      }).fetchJobs({ limit: 1, pages: 1 }),
    ).rejects.toMatchObject<Partial<LeverDiscoveryError>>({
      code: 'TIMEOUT',
    });
  });

  it('reports unavailable and non-2xx boards without response diagnostics', async () => {
    await expect(
      new LeverAdapter({
        companies: [SPOTIFY],
        fetchImpl: vi.fn(async () => new Response(null, { status: 404 })),
      }).fetchJobs({ limit: 1, pages: 1 }),
    ).rejects.toMatchObject<Partial<LeverDiscoveryError>>({
      code: 'BOARD_UNAVAILABLE',
      message: 'Configured Lever board Spotify (spotify) is unavailable.',
    });

    await expect(
      new LeverAdapter({
        companies: [SPOTIFY],
        fetchImpl: vi.fn(async () =>
          new Response('private provider diagnostic', { status: 503 }),
        ),
      }).fetchJobs({ limit: 1, pages: 1 }),
    ).rejects.toMatchObject<Partial<LeverDiscoveryError>>({
      code: 'HTTP_ERROR',
      message: 'Lever returned HTTP 503 for Spotify. Try again later.',
    });
  });

  it('rejects malformed JSON and changed response envelopes safely', async () => {
    await expect(
      new LeverAdapter({
        companies: [SPOTIFY],
        fetchImpl: vi.fn(async () => new Response('{bad json')),
      }).fetchJobs({ limit: 1, pages: 1 }),
    ).rejects.toMatchObject<Partial<LeverDiscoveryError>>({
      code: 'MALFORMED_JSON',
    });
    await expect(
      new LeverAdapter({
        companies: [SPOTIFY],
        fetchImpl: vi.fn(async () =>
          new Response(JSON.stringify({ jobs: [record()] })),
        ),
      }).fetchJobs({ limit: 1, pages: 1 }),
    ).rejects.toMatchObject<Partial<LeverDiscoveryError>>({
      code: 'SOURCE_SCHEMA_CHANGED',
    });
  });

  it('counts Zod-invalid records while accepting valid records', async () => {
    const fetchImpl = vi.fn(async () =>
      response([{ id: 'invalid' }, record()]),
    );
    const result = await new LeverAdapter({
      companies: [SPOTIFY],
      fetchImpl,
    }).fetchJobs({ limit: 1, pages: 1 });
    expect(result).toMatchObject({
      sourceRecordsFetched: 2,
      acceptedRecords: 1,
      invalidRecords: 1,
    });
  });
});
