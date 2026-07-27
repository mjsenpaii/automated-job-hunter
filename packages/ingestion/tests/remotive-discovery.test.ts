import fs from 'node:fs';
import path from 'node:path';
import type { SkillEntry } from '@job-app/core';
import { getDb } from '@job-app/db/connection';
import { applications, jobs, job_scores } from '@job-app/db/schema';
import { describe, expect, it, vi } from 'vitest';
import {
  formatDiscoverySummary,
  parseRemotiveCliArgs,
} from '../src/discovery/cli.js';
import type {
  DiscoveredJob,
  DiscoveryFetchResult,
  DiscoveryRepository,
  DiscoverySourceAdapter,
} from '../src/discovery/contracts.js';
import { mapDiscoveredJobToRawInput } from '../src/discovery/mapper.js';
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
    sourceName: 'Remotive',
    sourceJobId: '12345',
    title: 'Junior TypeScript Developer',
    company: 'Example Remote Inc.',
    location: 'Worldwide',
    remote: true,
    employmentType: 'full time',
    category: 'Software Development',
    salaryText: '$60,000 - $80,000',
    description: 'Build accessible TypeScript products with a remote team.',
    tags: ['TypeScript', 'Accessibility'],
    publishedAt: '2026-07-28T08:30:00.000Z',
    sourceUrl:
      'https://remotive.com/remote-jobs/software-dev/junior-typescript-developer-12345',
    applicationUrl:
      'https://remotive.com/remote-jobs/software-dev/junior-typescript-developer-12345',
    ...overrides,
  };
}

function adapter(jobsToReturn: DiscoveredJob[]): DiscoverySourceAdapter {
  return {
    name: 'Remotive',
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
    category: string;
    apply: boolean;
  }> = {},
) {
  return {
    limit: 50,
    pages: 1,
    remoteOnly: false,
    query: '',
    category: '',
    apply: false,
    ...overrides,
  };
}

describe('Remotive discovery integration', () => {
  it('searches every required field case-insensitively', async () => {
    const repository: DiscoveryRepository = {
      async loadExistingJobs() {
        return [];
      },
      persistBatch: vi.fn(),
    };
    for (const query of [
      'JUNIOR',
      'REMOTE INC',
      'software DEVELOPMENT',
      'ACCESSIBILITY',
      'WORLDWIDE',
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

  it('filters categories by case-insensitive name or slug', async () => {
    const repository: DiscoveryRepository = {
      async loadExistingJobs() {
        return [];
      },
      persistBatch: vi.fn(),
    };
    for (const category of [
      'SOFTWARE DEVELOPMENT',
      'software-development',
      'software-dev',
    ]) {
      const summary = await runDiscovery(options({ category }), {
        adapter: adapter([discovered()]),
        repository,
        verifiedSkills: VERIFIED_SKILLS,
      });
      expect(summary.excludedByFilters).toBe(0);
    }
    const excluded = await runDiscovery(
      options({ category: 'customer-support' }),
      {
        adapter: adapter([discovered()]),
        repository,
        verifiedSkills: VERIFIED_SKILLS,
      },
    );
    expect(excluded.excludedByFilters).toBe(1);
  });

  it('preserves source salary text in the deterministic raw input only when present', () => {
    expect(mapDiscoveredJobToRawInput(discovered()).salary_text).toBe(
      '$60,000 - $80,000',
    );
    expect(
      mapDiscoveredJobToRawInput(
        discovered({ salaryText: null }),
      ).salary_text,
    ).toBeUndefined();
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

  it('persists apply-mode jobs through the shared in-memory path only', async () => {
    const database = getDb(':memory:');
    const summary = await runDiscovery(options({ apply: true }), {
      adapter: adapter([discovered()]),
      repository: createDiscoveryRepository(database),
      verifiedSkills: VERIFIED_SKILLS,
    });
    const storedJobs = database.select().from(jobs).all();
    expect(storedJobs).toHaveLength(1);
    expect(storedJobs[0]).toMatchObject({
      source_name: 'Remotive',
      source_job_id: '12345',
      status: 'DISCOVERED',
    });
    expect(database.select().from(job_scores).all()).toHaveLength(1);
    expect(database.select().from(applications).all()).toHaveLength(0);
    expect(summary.jobsPersisted).toBe(1);
    expect(summary.reviewStatus).toBe('DISCOVERED');
  });

  it('deduplicates repeated Remotive source records', async () => {
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

  it('reuses existing hard rejection and scoring without creating applications', async () => {
    const database = getDb(':memory:');
    const senior = discovered({
      sourceJobId: '67890',
      title: 'Senior TypeScript Engineer',
      description: 'This role requires 5+ years of professional experience.',
      sourceUrl:
        'https://remotive.com/remote-jobs/software-dev/senior-typescript-engineer-67890',
      applicationUrl:
        'https://remotive.com/remote-jobs/software-dev/senior-typescript-engineer-67890',
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

  it('has no Gemini dependency in the Remotive execution path', () => {
    const files = [
      '../src/adapters/remotive.ts',
      '../src/discovery/mapper.ts',
      '../src/discovery/runner.ts',
      '../src/discovery/repository.ts',
      '../src/discovery/remotive-cli.ts',
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

  it('validates Remotive CLI options and emits safe shared summaries', async () => {
    expect(
      parseRemotiveCliArgs([
        '--limit',
        '20',
        '--query',
        'Developer',
        '--category',
        'software-dev',
      ]).options,
    ).toMatchObject({
      limit: 20,
      pages: 1,
      remoteOnly: false,
      query: 'Developer',
      category: 'software-dev',
      apply: false,
    });
    expect(() =>
      parseRemotiveCliArgs(['--limit', '51']),
    ).toThrow();
    expect(() =>
      parseRemotiveCliArgs(['--host', 'https://example.com']),
    ).toThrow('Unknown option');
    expect(() =>
      parseRemotiveCliArgs(['--remote-only']),
    ).toThrow('Unknown option');

    const secretDescription =
      'FULL_PRIVATE_DESCRIPTION API_KEY=should-not-print';
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
});
