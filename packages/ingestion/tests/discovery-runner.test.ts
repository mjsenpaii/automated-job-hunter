import fs from 'node:fs';
import path from 'node:path';
import type { SkillEntry } from '@job-app/core';
import { getDb } from '@job-app/db/connection';
import { applications, jobs, job_scores } from '@job-app/db/schema';
import { describe, expect, it, vi } from 'vitest';
import {
  formatDiscoverySummary,
  parseArbeitnowCliArgs,
} from '../src/discovery/cli.js';
import type {
  DiscoveredJob,
  DiscoveryFetchResult,
  DiscoveryRepository,
  DiscoverySourceAdapter,
} from '../src/discovery/contracts.js';
import { createDiscoveryRepository } from '../src/discovery/repository.js';
import { runDiscovery } from '../src/discovery/runner.js';

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
  overrides: Partial<DiscoveredJob> = {},
): DiscoveredJob {
  return {
    sourceName: 'Arbeitnow',
    sourceJobId: 'junior-developer-1',
    title: 'Junior TypeScript Developer',
    company: 'Example GmbH',
    location: 'Berlin',
    remote: true,
    employmentType: 'Full time',
    description: 'Build TypeScript products with a remote team.',
    tags: ['TypeScript'],
    publishedAt: '2026-07-28T00:00:00.000Z',
    sourceUrl:
      'https://www.arbeitnow.com/jobs/companies/example/junior-developer-1',
    applicationUrl:
      'https://www.arbeitnow.com/jobs/companies/example/junior-developer-1',
    ...overrides,
  };
}

function adapter(jobsToReturn: DiscoveredJob[]): DiscoverySourceAdapter {
  return {
    name: 'Arbeitnow',
    async fetchJobs(): Promise<DiscoveryFetchResult> {
      return {
        sourceRecordsFetched: jobsToReturn.length,
        acceptedRecords: jobsToReturn.length,
        invalidRecords: 0,
        pagesFetched: 1,
        jobs: jobsToReturn,
      };
    },
  };
}

function options(
  overrides: Partial<{
    limit: number;
    pages: number;
    remoteOnly: boolean;
    query: string;
    apply: boolean;
  }> = {},
) {
  return {
    limit: 50,
    pages: 1,
    remoteOnly: false,
    query: '',
    apply: false,
    ...overrides,
  };
}

describe('reusable discovery runner', () => {
  it('applies remote-only filtering deterministically', async () => {
    const repository: DiscoveryRepository = {
      async loadExistingJobs() {
        return [];
      },
      persistBatch: vi.fn(),
    };
    const summary = await runDiscovery(
      options({ remoteOnly: true }),
      {
        adapter: adapter([
          discovered(),
          discovered({
            sourceJobId: 'onsite-1',
            remote: false,
            sourceUrl: 'https://www.arbeitnow.com/jobs/onsite-1',
            applicationUrl: 'https://www.arbeitnow.com/jobs/onsite-1',
          }),
        ]),
        repository,
        verifiedSkills: VERIFIED_SKILLS,
      },
    );
    expect(summary.excludedByFilters).toBe(1);
    expect(summary.eligibleScoredJobs).toBe(1);
  });

  it('searches title, company, tags, location, and description case-insensitively', async () => {
    const repository: DiscoveryRepository = {
      async loadExistingJobs() {
        return [];
      },
      persistBatch: vi.fn(),
    };
    for (const query of [
      'JUNIOR',
      'example GMBH',
      'typescript',
      'BERLIN',
      'REMOTE TEAM',
      '',
    ]) {
      const summary = await runDiscovery(options({ query }), {
        adapter: adapter([discovered()]),
        repository,
        verifiedSkills: VERIFIED_SKILLS,
      });
      expect(summary.excludedByFilters).toBe(0);
    }
    const excluded = await runDiscovery(options({ query: 'python' }), {
      adapter: adapter([discovered()]),
      repository,
      verifiedSkills: VERIFIED_SKILLS,
    });
    expect(excluded.excludedByFilters).toBe(1);
  });

  it('does not write to the database in dry-run mode', async () => {
    const database = getDb(':memory:');
    const repository = createDiscoveryRepository(database);
    const persistSpy = vi.spyOn(repository, 'persistBatch');
    const summary = await runDiscovery(options(), {
      adapter: adapter([discovered()]),
      repository,
      verifiedSkills: VERIFIED_SKILLS,
    });
    expect(persistSpy).not.toHaveBeenCalled();
    expect(database.select().from(jobs).all()).toHaveLength(0);
    expect(summary.jobsThatWouldBePersisted).toBe(1);
    expect(summary.jobsPersisted).toBe(0);
  });

  it('persists apply-mode jobs atomically to an in-memory database only', async () => {
    const database = getDb(':memory:');
    const summary = await runDiscovery(options({ apply: true }), {
      adapter: adapter([discovered()]),
      repository: createDiscoveryRepository(database),
      verifiedSkills: VERIFIED_SKILLS,
    });
    const storedJobs = database.select().from(jobs).all();
    expect(storedJobs).toHaveLength(1);
    expect(storedJobs[0]).toMatchObject({
      source_name: 'Arbeitnow',
      source_job_id: 'junior-developer-1',
      status: 'DISCOVERED',
    });
    expect(database.select().from(job_scores).all()).toHaveLength(1);
    expect(database.select().from(applications).all()).toHaveLength(0);
    expect(summary.jobsPersisted).toBe(1);
    expect(summary.reviewStatus).toBe('DISCOVERED');
  });

  it('deduplicates repeated records using stable source identity', async () => {
    const database = getDb(':memory:');
    const summary = await runDiscovery(options({ apply: true }), {
      adapter: adapter([discovered(), discovered()]),
      repository: createDiscoveryRepository(database),
      verifiedSkills: VERIFIED_SKILLS,
    });
    expect(summary.duplicates).toBe(1);
    expect(summary.jobsPersisted).toBe(1);
    expect(database.select().from(jobs).all()).toHaveLength(1);
  });

  it('reuses hard-rejection and scoring behavior from the existing pipeline', async () => {
    const database = getDb(':memory:');
    const senior = discovered({
      sourceJobId: 'senior-1',
      title: 'Senior TypeScript Engineer',
      description: 'This role requires 5+ years of professional experience.',
      sourceUrl: 'https://www.arbeitnow.com/jobs/senior-1',
      applicationUrl: 'https://www.arbeitnow.com/jobs/senior-1',
    });
    const summary = await runDiscovery(options({ apply: true }), {
      adapter: adapter([discovered(), senior]),
      repository: createDiscoveryRepository(database),
      verifiedSkills: VERIFIED_SKILLS,
    });
    expect(summary.eligibleScoredJobs).toBe(1);
    expect(summary.hardRejectedJobs).toBe(1);
    expect(database.select().from(jobs).all().map((row) => row.status).sort())
      .toEqual(['DISCOVERED', 'HARD_REJECTED']);
    expect(database.select().from(job_scores).all()).toHaveLength(1);
    expect(database.select().from(applications).all()).toHaveLength(0);
  });

  it('does not partially persist when the source fetch fails', async () => {
    const persistBatch = vi.fn();
    await expect(
      runDiscovery(options({ apply: true }), {
        adapter: {
          name: 'Arbeitnow',
          async fetchJobs() {
            throw new Error('safe fetch failure');
          },
        },
        repository: {
          async loadExistingJobs() {
            return [];
          },
          persistBatch,
        },
        verifiedSkills: VERIFIED_SKILLS,
      }),
    ).rejects.toThrow('safe fetch failure');
    expect(persistBatch).not.toHaveBeenCalled();
  });

  it('has no Gemini dependency in the discovery execution path', () => {
    const files = [
      '../src/adapters/arbeitnow.ts',
      '../src/discovery/mapper.ts',
      '../src/discovery/runner.ts',
      '../src/discovery/repository.ts',
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

  it('formats safe CLI output without descriptions or sensitive values', async () => {
    const secretDescription =
      'FULL_PRIVATE_DESCRIPTION GEMINI_API_KEY=should-not-print';
    const summary = await runDiscovery(options(), {
      adapter: adapter([
        discovered({ description: secretDescription }),
      ]),
      repository: {
        async loadExistingJobs() {
          return [];
        },
        persistBatch: vi.fn(),
      },
      verifiedSkills: VERIFIED_SKILLS,
    });
    const output = formatDiscoverySummary(summary);
    expect(output).toContain('Preview (descriptions omitted)');
    expect(output).not.toContain(secretDescription);
    expect(output).not.toContain('should-not-print');
  });

  it('validates CLI bounds and supported options', () => {
    expect(
      parseArbeitnowCliArgs([
        '--limit',
        '10',
        '--pages',
        '3',
        '--remote-only',
        '--query',
        'TypeScript',
      ]).options,
    ).toMatchObject({
      limit: 10,
      pages: 3,
      remoteOnly: true,
      query: 'TypeScript',
      apply: false,
    });
    expect(() =>
      parseArbeitnowCliArgs(['--limit', '51']),
    ).toThrow();
    expect(() =>
      parseArbeitnowCliArgs(['--pages', '4']),
    ).toThrow();
    expect(() =>
      parseArbeitnowCliArgs(['--host', 'https://example.com']),
    ).toThrow('Unknown option');
  });
});
