import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { SkillEntry } from '@job-app/core';
import { describe, expect, it, vi } from 'vitest';
import {
  ArbeitnowAdapter,
} from '../src/adapters/arbeitnow.js';
import {
  LeverAdapter,
} from '../src/adapters/lever.js';
import {
  RemotiveAdapter,
} from '../src/adapters/remotive.js';
import type {
  DiscoveredJob,
  DiscoveryFetchResult,
  DiscoveryRepository,
} from '../src/discovery/contracts.js';
import {
  combinePublicJobDiscoveryTotals,
  formatPublicJobDiscoveryDryRunForLog,
  PublicJobDiscoveryDryRunPayloadSchema,
  PublicJobDiscoveryValidationError,
  runPublicJobDiscoveryDryRun,
} from '../src/discovery/orchestration.js';

const VERIFIED_SKILLS: SkillEntry[] = [
  {
    name: 'TypeScript',
    category: 'language',
    proficiency: null,
    verification_status: 'VERIFIED',
    source: 'CV_MJ.docx',
    source_reference: 'Test fixture',
    evidence_level: 'training',
    allowed_in_resume: true,
  },
];

function discovered(
  sourceName: string,
  overrides: Partial<DiscoveredJob> = {},
): DiscoveredJob {
  return {
    sourceName,
    sourceJobId: `${sourceName.toLowerCase()}-1`,
    title: 'Junior TypeScript Developer',
    company: 'Example Co',
    location: 'Remote',
    remote: true,
    employmentType: 'Full time',
    description: 'Build TypeScript products with a remote developer team.',
    tags: ['TypeScript', 'developer'],
    publishedAt: '2026-07-28T00:00:00.000Z',
    sourceUrl: `https://example.com/${sourceName.toLowerCase()}/1`,
    applicationUrl: `https://example.com/${sourceName.toLowerCase()}/1`,
    ...overrides,
  };
}

function fetchResult(jobs: DiscoveredJob[]): DiscoveryFetchResult {
  return {
    sourceRecordsFetched: jobs.length,
    acceptedRecords: jobs.length,
    invalidRecords: 0,
    pagesFetched: 1,
    jobs,
  };
}

function createRepository(): DiscoveryRepository & {
  persistBatch: ReturnType<typeof vi.fn>;
} {
  return {
    async loadExistingJobs() {
      return [];
    },
    persistBatch: vi.fn(),
  };
}

function remotiveEnvelope(
  jobs: Record<string, unknown>[] = [],
): Record<string, unknown> {
  return {
    '0-legal-notice': 'Remotive test fixture.',
    'job-count': jobs.length,
    jobs,
  };
}

function mockFetchForSources(
  handlers: Partial<
    Record<'arbeitnow' | 'remotive' | 'lever', () => Promise<Response>>
  >,
): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('arbeitnow.com')) {
      return handlers.arbeitnow
        ? handlers.arbeitnow()
        : Response.json({
            data: [],
            links: {},
            meta: { current_page: 1 },
          });
    }
    if (url.includes('remotive.com')) {
      return handlers.remotive
        ? handlers.remotive()
        : Response.json(remotiveEnvelope());
    }
    if (url.includes('api.lever.co')) {
      return handlers.lever ? handlers.lever() : Response.json([]);
    }
    throw new Error(`Unexpected fetch URL in test: ${url}`);
  }) as typeof fetch;
}

describe('public job discovery orchestration', () => {
  it('uses default payload values', async () => {
    const repository = createRepository();
    const invocationOrder: string[] = [];
    const fetchImpl = mockFetchForSources({
      arbeitnow: async () => {
        invocationOrder.push('arbeitnow');
        return Response.json({
          data: [],
          links: {},
          meta: { current_page: 1 },
        });
      },
      remotive: async () => {
        invocationOrder.push('remotive');
        return Response.json(remotiveEnvelope());
      },
      lever: async () => {
        invocationOrder.push('lever');
        return Response.json([]);
      },
    });

    const result = await runPublicJobDiscoveryDryRun(
      {},
      {
        fetchImpl,
        repository,
        verifiedSkills: VERIFIED_SKILLS,
        now: () => new Date('2026-07-28T12:00:00.000Z'),
      },
    );

    expect(PublicJobDiscoveryDryRunPayloadSchema.parse({})).toMatchObject({
      arbeitnowEnabled: true,
      remotiveEnabled: true,
      leverEnabled: true,
      query: 'developer',
      remoteOnly: true,
      arbeitnowLimit: 50,
      remotiveLimit: 50,
      leverLimit: 50,
      leverCompanies: ['spotify', 'highspot', 'aleph'],
    });
    expect(result.mode).toBe('DRY_RUN');
    expect(result.query).toBe('developer');
    expect(result.persistenceEnabled).toBe(false);
    expect(result.applicationsCreated).toBe(0);
    expect(result.submissionsCreated).toBe(0);
    expect(invocationOrder).toEqual([
      'arbeitnow',
      'remotive',
      'lever',
      'lever',
      'lever',
    ]);
  });

  it('rejects invalid payload values and unknown properties', async () => {
    expect(() =>
      PublicJobDiscoveryDryRunPayloadSchema.parse({
        arbeitnowLimit: 0,
      }),
    ).toThrow();

    expect(() =>
      PublicJobDiscoveryDryRunPayloadSchema.parse({
        surprise: true,
      }),
    ).toThrow();

    await expect(
      runPublicJobDiscoveryDryRun({ leverLimit: 101 }),
    ).rejects.toBeInstanceOf(PublicJobDiscoveryValidationError);
  });

  it('rejects unknown Lever companies and arbitrary hosts', async () => {
    await expect(
      runPublicJobDiscoveryDryRun({
        arbeitnowEnabled: false,
        remotiveEnabled: false,
        leverEnabled: true,
        leverCompanies: ['unknown-company'],
      }),
    ).rejects.toThrow(/Unknown or disabled Lever company/);

    await expect(
      runPublicJobDiscoveryDryRun({
        arbeitnowEnabled: false,
        remotiveEnabled: false,
        leverEnabled: true,
        leverCompanies: ['https://evil.example'],
      }),
    ).rejects.toThrow(/URLs, hosts, or arbitrary paths/);
  });

  it('invokes all three sources sequentially', async () => {
    const repository = createRepository();
    const invocationOrder: string[] = [];
    const fetchImpl = mockFetchForSources({
      arbeitnow: async () => {
        invocationOrder.push('arbeitnow');
        return Response.json({
          data: [],
          links: {},
          meta: { current_page: 1 },
        });
      },
      remotive: async () => {
        invocationOrder.push('remotive');
        return Response.json(remotiveEnvelope());
      },
      lever: async () => {
        invocationOrder.push('lever');
        return Response.json([]);
      },
    });

    await runPublicJobDiscoveryDryRun(
      {},
      {
        fetchImpl,
        repository,
        verifiedSkills: VERIFIED_SKILLS,
        onSourceStart: (source) => {
          invocationOrder.push(`start:${source}`);
        },
      },
    );

    expect(invocationOrder).toEqual([
      'start:arbeitnow',
      'arbeitnow',
      'start:remotive',
      'remotive',
      'start:lever',
      'lever',
      'lever',
      'lever',
    ]);
  });

  it('skips disabled sources', async () => {
    const repository = createRepository();
    const fetchImpl = vi.fn(async () =>
      Response.json(remotiveEnvelope()),
    );

    const result = await runPublicJobDiscoveryDryRun(
      {
        arbeitnowEnabled: false,
        leverEnabled: false,
        remotiveEnabled: true,
      },
      {
        fetchImpl,
        repository,
        verifiedSkills: VERIFIED_SKILLS,
      },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('remotive.com');
    expect(result.sources.arbeitnow).toBeUndefined();
    expect(result.sources.lever).toBeUndefined();
    expect(result.sources.remotive?.status).toBe('SUCCESS');
  });

  it('continues when one source fails', async () => {
    const repository = createRepository();
    const fetchImpl = mockFetchForSources({
      arbeitnow: async () => {
        throw new Error('network unavailable');
      },
      remotive: async () =>
        Response.json(
          remotiveEnvelope([
            {
              id: 1,
              url: 'https://remotive.com/remote-jobs/software-dev/junior-typescript-developer-1234567',
              title: 'Junior TypeScript Developer',
              company_name: 'Example Co',
              category: 'Software Development',
              tags: ['typescript', 'developer'],
              publication_date: '2026-07-28T00:00:00.000Z',
              candidate_required_location: 'Worldwide',
              job_type: 'full_time',
              description:
                'Build TypeScript products with a remote developer team.',
            },
          ]),
        ),
      lever: async () => Response.json([]),
    });

    const result = await runPublicJobDiscoveryDryRun(
      {},
      {
        fetchImpl,
        repository,
        verifiedSkills: VERIFIED_SKILLS,
      },
    );

    expect(result.sources.arbeitnow?.status).toBe('FAILED');
    expect(result.sources.arbeitnow?.error?.code).toBe('SERVICE_UNAVAILABLE');
    expect(result.sources.remotive?.status).toBe('SUCCESS');
    expect(result.sources.lever?.status).toBe('SUCCESS');
  });

  it('combines totals across successful sources', () => {
    const combined = combinePublicJobDiscoveryTotals({
      arbeitnow: {
        status: 'SUCCESS',
        sourceRecordsFetched: 10,
        acceptedRecords: 9,
        invalidRecords: 1,
        excludedByFilters: 2,
        duplicates: 0,
        hardRejectedJobs: 1,
        eligibleScoredJobs: 1,
        pipelineErrors: 0,
        jobsThatWouldBePersisted: 2,
        jobsPersisted: 0,
        preview: [],
      },
      remotive: {
        status: 'FAILED',
        sourceRecordsFetched: 0,
        acceptedRecords: 0,
        invalidRecords: 0,
        excludedByFilters: 0,
        duplicates: 0,
        hardRejectedJobs: 0,
        eligibleScoredJobs: 0,
        pipelineErrors: 0,
        jobsThatWouldBePersisted: 0,
        jobsPersisted: 0,
        preview: [],
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Remotive is temporarily unavailable.',
        },
      },
      lever: {
        status: 'SUCCESS',
        sourceRecordsFetched: 5,
        acceptedRecords: 5,
        invalidRecords: 0,
        excludedByFilters: 4,
        duplicates: 0,
        hardRejectedJobs: 0,
        eligibleScoredJobs: 1,
        pipelineErrors: 0,
        jobsThatWouldBePersisted: 1,
        jobsPersisted: 0,
        preview: [],
      },
    });

    expect(combined).toEqual({
      sourceRecordsFetched: 15,
      acceptedRecords: 14,
      invalidRecords: 1,
      excludedByFilters: 6,
      duplicates: 0,
      hardRejectedJobs: 1,
      eligibleScoredJobs: 2,
      pipelineErrors: 0,
      jobsThatWouldBePersisted: 3,
      jobsPersisted: 0,
    });
  });

  it('never calls persistence during dry-run orchestration', async () => {
    const repository = createRepository();
    const fetchImpl = mockFetchForSources({
      arbeitnow: async () =>
        Response.json({
          data: [
            {
              slug: 'junior-typescript-developer-1',
              company_name: 'Example GmbH',
              title: 'Junior TypeScript Developer',
              description: 'Build TypeScript products with a remote developer team.',
              remote: true,
              url: 'https://www.arbeitnow.com/jobs/companies/example/junior-typescript-developer-1',
              tags: ['TypeScript', 'developer'],
              job_types: ['Full time'],
              location: 'Berlin',
              created_at: 1_753_651_200,
            },
          ],
          links: {},
          meta: { current_page: 1 },
        }),
      remotive: async () => Response.json(remotiveEnvelope()),
      lever: async () => Response.json([]),
    });

    await runPublicJobDiscoveryDryRun(
      {},
      {
        fetchImpl,
        repository,
        verifiedSkills: VERIFIED_SKILLS,
      },
    );

    expect(repository.persistBatch).not.toHaveBeenCalled();
  });

  it('does not modify the original SQLite files during dry-run orchestration', async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'job-discovery-immutability-'),
    );
    const sourceDb = path.resolve(__dirname, '../../../data/app.db');
    const databasePath = path.join(tempDir, 'app.db');
    fs.copyFileSync(sourceDb, databasePath);
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = `${sourceDb}${suffix}`;
      if (fs.existsSync(sidecar)) {
        fs.copyFileSync(sidecar, `${databasePath}${suffix}`);
      }
    }

    function hashFile(filePath: string): string {
      return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').toUpperCase();
    }
    function fileSnapshot(basePath: string) {
      const files = [basePath, `${basePath}-wal`, `${basePath}-shm`];
      return Object.fromEntries(
        files.map((filePath) => [
          path.basename(filePath),
          fs.existsSync(filePath)
            ? {
                exists: true,
                sha256: hashFile(filePath),
                size: fs.statSync(filePath).size,
              }
            : { exists: false },
        ]),
      );
    }

    const beforeSnapshot = fileSnapshot(databasePath);
    const fetchImpl = mockFetchForSources({
      arbeitnow: async () =>
        Response.json({
          data: [],
          links: {},
          meta: { current_page: 1 },
        }),
      remotive: async () => Response.json(remotiveEnvelope()),
      lever: async () => Response.json([]),
    });

    await runPublicJobDiscoveryDryRun(
      {
        arbeitnowEnabled: true,
        remotiveEnabled: true,
        leverEnabled: false,
      },
      {
        databasePath,
        fetchImpl,
        verifiedSkills: VERIFIED_SKILLS,
      },
    );

    const afterSnapshot = fileSnapshot(databasePath);
    expect(afterSnapshot).toEqual(beforeSnapshot);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('does not create application rows', async () => {
    const result = await runPublicJobDiscoveryDryRun(
      {
        arbeitnowEnabled: false,
        remotiveEnabled: false,
        leverEnabled: false,
      },
      {
        repository: createRepository(),
        verifiedSkills: VERIFIED_SKILLS,
      },
    );

    expect(result.applicationsCreated).toBe(0);
    expect(result.submissionsCreated).toBe(0);
  });

  it('omits descriptions and sensitive values from formatted output', async () => {
    const secretDescription =
      'FULL_PRIVATE_DESCRIPTION API_KEY=should-not-print';
    const repository = createRepository();
    const fetchImpl = mockFetchForSources({
      arbeitnow: async () =>
        Response.json({
          data: [
            {
              slug: 'junior-typescript-developer-1',
              company_name: 'Example GmbH',
              title: 'Junior TypeScript Developer',
              description: secretDescription,
              remote: true,
              url: 'https://www.arbeitnow.com/jobs/companies/example/junior-typescript-developer-1',
              tags: ['TypeScript', 'developer'],
              job_types: ['Full time'],
              location: 'Berlin',
              created_at: 1_753_651_200,
            },
          ],
          links: {},
          meta: { current_page: 1 },
        }),
      remotive: async () => Response.json(remotiveEnvelope()),
      lever: async () => Response.json([]),
    });

    const result = await runPublicJobDiscoveryDryRun(
      {},
      {
        fetchImpl,
        repository,
        verifiedSkills: VERIFIED_SKILLS,
      },
    );
    const output = formatPublicJobDiscoveryDryRunForLog(result);

    expect(output).toContain('Preview (descriptions omitted)');
    expect(output).not.toContain(secretDescription);
    expect(output).not.toContain('should-not-print');
    expect(result.sources.arbeitnow?.preview.length).toBeLessThanOrEqual(5);
  });

  it('does not use shell execution in orchestration or trigger task sources', () => {
    const files = [
      '../src/discovery/orchestration.ts',
      '../src/discovery/runtime.ts',
      '../../../src/trigger/public-job-discovery-dry-run.ts',
    ];
    const source = files
      .map((relative) =>
        fs.readFileSync(path.resolve(__dirname, relative), 'utf8'),
      )
      .join('\n');
    expect(source).not.toMatch(
      /child_process|execSync|exec\(|spawn\(|spawnSync\(|powershell|pnpm\s+discovery/,
    );
  });

  it('does not depend on Gemini in orchestration or trigger task sources', () => {
    const files = [
      '../src/discovery/orchestration.ts',
      '../src/discovery/runtime.ts',
      '../../../src/trigger/public-job-discovery-dry-run.ts',
    ];
    const source = files
      .map((relative) =>
        fs.readFileSync(path.resolve(__dirname, relative), 'utf8'),
      )
      .join('\n');
    expect(source).not.toMatch(
      /@google\/genai|extractJobWithGemini|GEMINI_API_KEY/,
    );
  });

  it('does not attach cron or recurring schedules to the trigger task', () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../../src/trigger/public-job-discovery-dry-run.ts',
      ),
      'utf8',
    );
    expect(source).not.toMatch(
      /schedules\.|cron\(|cron:|schedule\(|recurring/,
    );
  });

  it('keeps existing per-source limits enforced', async () => {
    await expect(
      runPublicJobDiscoveryDryRun({ arbeitnowLimit: 51 }),
    ).rejects.toBeInstanceOf(PublicJobDiscoveryValidationError);
    await expect(
      runPublicJobDiscoveryDryRun({ remotiveLimit: 0 }),
    ).rejects.toBeInstanceOf(PublicJobDiscoveryValidationError);
    await expect(
      runPublicJobDiscoveryDryRun({ leverLimit: 101 }),
    ).rejects.toBeInstanceOf(PublicJobDiscoveryValidationError);

    const arbeitnowFetchJobs = vi.spyOn(
      ArbeitnowAdapter.prototype,
      'fetchJobs',
    );
    const remotiveFetchJobs = vi.spyOn(
      RemotiveAdapter.prototype,
      'fetchJobs',
    );
    const leverFetchJobs = vi.spyOn(LeverAdapter.prototype, 'fetchJobs');
    const repository = createRepository();
    const fetchImpl = mockFetchForSources({
      arbeitnow: async () =>
        Response.json({
          data: [],
          links: {},
          meta: { current_page: 1 },
        }),
      remotive: async () => Response.json(remotiveEnvelope()),
      lever: async () => Response.json([]),
    });

    await runPublicJobDiscoveryDryRun(
      {
        arbeitnowLimit: 25,
        remotiveLimit: 30,
        leverLimit: 40,
      },
      {
        fetchImpl,
        repository,
        verifiedSkills: VERIFIED_SKILLS,
      },
    );

    expect(arbeitnowFetchJobs).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 25 }),
    );
    expect(remotiveFetchJobs).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 30 }),
    );
    expect(leverFetchJobs).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 40 }),
    );

    arbeitnowFetchJobs.mockRestore();
    remotiveFetchJobs.mockRestore();
    leverFetchJobs.mockRestore();
  });

  it('maps adapter failures to safe source errors without stack traces', async () => {
    const repository = createRepository();
    const fetchImpl = mockFetchForSources({
      arbeitnow: async () =>
        Response.json({
          data: [],
          links: {},
          meta: { current_page: 1 },
        }),
      remotive: async () => {
        throw new Error('network unavailable');
      },
      lever: async () => new Response(null, { status: 503 }),
    });

    const result = await runPublicJobDiscoveryDryRun(
      {},
      {
        fetchImpl,
        repository,
        verifiedSkills: VERIFIED_SKILLS,
      },
    );

    expect(result.sources.remotive?.error?.code).toBe('SERVICE_UNAVAILABLE');
    expect(result.sources.remotive?.error?.message).toContain('unavailable');
    expect(result.sources.lever?.error?.code).toBe('HTTP_ERROR');
    expect(JSON.stringify(result)).not.toMatch(/at\s+\w+/);
  });
});
