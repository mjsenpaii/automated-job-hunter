import fs from 'node:fs';
import path from 'node:path';
import type { SkillEntry } from '@job-app/core';
import { getDb } from '@job-app/db/connection';
import { applications, jobs, job_scores } from '@job-app/db/schema';
import { describe, expect, it, vi } from 'vitest';
import {
  formatDiscoverySummary,
  formatLeverCompanyList,
  parseLeverCliArgs,
  runLeverCli,
} from '../src/discovery/cli.js';
import type {
  DiscoveredJob,
  DiscoveryFetchResult,
  DiscoveryRepository,
  DiscoverySourceAdapter,
} from '../src/discovery/contracts.js';
import {
  LEVER_COMPANIES,
  type LeverCompany,
} from '../src/discovery/lever-companies.v1.js';
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
    sourceName: 'Lever',
    sourceJobId: 'posting-123',
    title: 'Backend Developer',
    company: 'Spotify',
    location: 'Worldwide',
    remote: true,
    employmentType: 'Permanent',
    category: null,
    team: 'Engineering',
    department: 'Research and Development',
    workplaceType: 'remote',
    salaryText: null,
    description: 'Build TypeScript services with the developer platform team.',
    tags: [],
    publishedAt: '2026-07-28T00:00:00.000Z',
    updatedAt: null,
    sourceUrl: 'https://jobs.lever.co/spotify/posting-123',
    applicationUrl: 'https://jobs.lever.co/spotify/posting-123',
    ...overrides,
  };
}

function adapter(jobsToReturn: DiscoveredJob[]): DiscoverySourceAdapter {
  return {
    name: 'Lever',
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
    limit: 100,
    pages: 1,
    remoteOnly: false,
    query: '',
    category: '',
    apply: false,
    ...overrides,
  };
}

describe('Lever discovery integration', () => {
  it('lists the versioned configured companies without fetching', async () => {
    const fetchImpl = vi.fn();
    const output: string[] = [];
    const result = await runLeverCli(['--list-companies'], {
      fetchImpl,
      log: (message) => output.push(message),
    });
    expect(result).toEqual({ exitCode: 0, summary: null });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(output.join('\n')).toBe(formatLeverCompanyList());
    for (const company of LEVER_COMPANIES) {
      expect(output.join('\n')).toContain(
        `${company.displayName} (${company.site})`,
      );
    }
  });

  it('parses repeated configured companies, filters duplicates, and rejects invalid selection', () => {
    const parsed = parseLeverCliArgs([
      '--company',
      'spotify',
      '--company',
      'Spotify',
      '--company',
      'Highspot',
      '--limit',
      '50',
      '--remote-only',
      '--query',
      'developer',
    ]);
    expect(parsed.companies.map((company) => company.site)).toEqual([
      'spotify',
      'highspot',
    ]);
    expect(parsed.options).toMatchObject({
      limit: 50,
      remoteOnly: true,
      query: 'developer',
      apply: false,
    });
    expect(() => parseLeverCliArgs([])).toThrow('Select at least one');
    expect(() =>
      parseLeverCliArgs(['--company', 'unknown']),
    ).toThrow('Unknown or disabled');
    expect(() =>
      parseLeverCliArgs([
        '--company',
        'https://api.example.com/v0/postings/company',
      ]),
    ).toThrow('does not accept URLs');
    expect(() =>
      parseLeverCliArgs([
        '--company',
        'spotify',
        '--all-companies',
      ]),
    ).toThrow('not both');
    expect(() =>
      parseLeverCliArgs(['--all-companies', '--limit', '101']),
    ).toThrow();
    expect(() =>
      parseLeverCliArgs(['--host', 'https://api.lever.co']),
    ).toThrow('Unknown option');
  });

  it('enforces the ten-company selection maximum', () => {
    const companies: LeverCompany[] = Array.from(
      { length: 11 },
      (_, index) => ({
        displayName: `Company ${index}`,
        site: `company-${index}`,
        enabled: true,
      }),
    );
    expect(() =>
      parseLeverCliArgs(['--all-companies'], companies),
    ).toThrow('at most ten');
  });

  it('filters only explicitly remote jobs', async () => {
    const summary = await runDiscovery(options({ remoteOnly: true }), {
      adapter: adapter([
        discovered(),
        discovered({
          sourceJobId: 'hybrid',
          remote: false,
          workplaceType: 'hybrid',
          sourceUrl: 'https://jobs.lever.co/spotify/hybrid',
          applicationUrl: 'https://jobs.lever.co/spotify/hybrid',
        }),
        discovered({
          sourceJobId: 'unknown',
          remote: null,
          workplaceType: 'unspecified',
          sourceUrl: 'https://jobs.lever.co/spotify/unknown',
          applicationUrl: 'https://jobs.lever.co/spotify/unknown',
        }),
      ]),
      repository: {
        async loadExistingJobs() {
          return [];
        },
        persistBatch: vi.fn(),
      },
      verifiedSkills: VERIFIED_SKILLS,
    });
    expect(summary.excludedByFilters).toBe(2);
    expect(summary.eligibleScoredJobs).toBe(1);
  });

  it('searches title, company, team, location, commitment, and description case-insensitively', async () => {
    const repository: DiscoveryRepository = {
      async loadExistingJobs() {
        return [];
      },
      persistBatch: vi.fn(),
    };
    for (const query of [
      'BACKEND',
      'SPOTIFY',
      'ENGINEERING',
      'WORLDWIDE',
      'PERMANENT',
      'developer PLATFORM',
      '',
    ]) {
      const summary = await runDiscovery(options({ query }), {
        adapter: adapter([discovered()]),
        repository,
        verifiedSkills: VERIFIED_SKILLS,
      });
      expect(summary.excludedByFilters).toBe(0);
    }
    const excluded = await runDiscovery(options({ query: 'accounting' }), {
      adapter: adapter([discovered()]),
      repository,
      verifiedSkills: VERIFIED_SKILLS,
    });
    expect(excluded.excludedByFilters).toBe(1);
  });

  it('performs no writes in dry-run mode', async () => {
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

  it('uses the shared atomic apply path with an in-memory database only', async () => {
    const database = getDb(':memory:');
    const summary = await runDiscovery(options({ apply: true }), {
      adapter: adapter([discovered()]),
      repository: createDiscoveryRepository(database),
      verifiedSkills: VERIFIED_SKILLS,
    });
    expect(database.select().from(jobs).all()).toHaveLength(1);
    expect(database.select().from(jobs).get()).toMatchObject({
      source_name: 'Lever',
      source_job_id: 'posting-123',
      status: 'DISCOVERED',
    });
    expect(database.select().from(job_scores).all()).toHaveLength(1);
    expect(database.select().from(applications).all()).toHaveLength(0);
    expect(summary).toMatchObject({
      reviewStatus: 'DISCOVERED',
      jobsPersisted: 1,
    });
  });

  it('deduplicates repeated Lever posting identities', async () => {
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

  it('reuses shared scoring and hard rejection without creating applications', async () => {
    const database = getDb(':memory:');
    const senior = discovered({
      sourceJobId: 'senior-posting',
      title: 'Senior Backend Engineer',
      description: 'This role requires 5+ years of professional experience.',
      sourceUrl: 'https://jobs.lever.co/spotify/senior-posting',
      applicationUrl: 'https://jobs.lever.co/spotify/senior-posting',
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
    expect(database.select().from(applications).all()).toHaveLength(0);
  });

  it('contains no Gemini dependency and emits safe CLI previews', async () => {
    const files = [
      '../src/adapters/lever.ts',
      '../src/discovery/lever-companies.v1.ts',
      '../src/discovery/mapper.ts',
      '../src/discovery/runner.ts',
      '../src/discovery/repository.ts',
      '../src/discovery/lever-cli.ts',
    ];
    const source = files
      .map((relative) =>
        fs.readFileSync(path.resolve(__dirname, relative), 'utf8'),
      )
      .join('\n');
    expect(source).not.toMatch(
      /@google\/genai|extractJobWithGemini|GEMINI_API_KEY/,
    );

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
