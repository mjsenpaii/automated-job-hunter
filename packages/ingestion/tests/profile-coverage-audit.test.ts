import type { SkillEntry } from '@job-app/core';
import { describe, expect, it, vi } from 'vitest';
import type { DiscoveryRepository } from '../src/discovery/contracts.js';
import { evaluateDiscoveryFilters } from '../src/discovery/filters.js';
import { diagnoseJobSearchProfileCoverage } from '../src/discovery/job-search-profiles.v1.js';
import {
  PROFILE_COVERAGE_REASON_CODES,
  runProfileMatcherCoverageAudit,
} from '../src/discovery/profile-coverage-audit.js';

const VERIFIED_SKILLS: SkillEntry[] = [];

function repository(): DiscoveryRepository {
  return {
    async loadExistingJobs() {
      return [];
    },
    async persistBatch() {
      throw new Error('Coverage audit must never persist.');
    },
  };
}

function arbeitnowRecord(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'typescript-developer-1',
    company_name: 'Example Co',
    title: 'TypeScript Developer',
    description: 'You will build React applications.',
    remote: true,
    url: 'https://www.arbeitnow.com/jobs/companies/example/typescript-developer-1',
    tags: ['TypeScript', 'React'],
    job_types: ['Full time'],
    location: 'Remote',
    created_at: 1_785_000_000,
    ...overrides,
  };
}

function remotiveRecord() {
  return {
    id: 200,
    url: 'https://remotive.com/remote-jobs/software-dev/product-manager-200',
    title: 'Product Manager',
    company_name: 'Product Co',
    category: 'Software Development',
    job_type: 'full_time',
    publication_date: '2026-08-01T08:30:00',
    candidate_required_location: 'Worldwide',
    salary: '',
    description: 'Work with engineers who develop software applications.',
    tags: ['TypeScript'],
  };
}

describe('profile matcher coverage audit', () => {
  it('uses the shared source configuration and stops safely when all are disabled', async () => {
    const fetchImpl = vi.fn();
    const result = await runProfileMatcherCoverageAudit({
      fetchImpl, repository: repository(), verifiedSkills: VERIFIED_SKILLS,
      sourceEnvironment: {},
    });
    expect(result.finalStatus).toBe('NO_DISCOVERY_SOURCES_ENABLED');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(Object.values(result.sources).every((source) => source?.status === 'DISABLED')).toBe(true);
  });

  it('keeps diagnostic filter reasons aligned with unchanged filter decisions', () => {
    const job = {
      sourceName: 'Test',
      sourceJobId: '1',
      title: 'TypeScript Developer',
      company: 'Example',
      location: 'Berlin',
      remote: false,
      employmentType: 'Full time',
      category: 'Engineering',
      description: 'You will build React applications.',
      tags: ['TypeScript'],
      publishedAt: null,
      sourceUrl: 'https://example.com/jobs/1',
      applicationUrl: null,
    };
    expect(
      evaluateDiscoveryFilters(job, {
        remoteOnly: true,
        query: '',
        category: 'software-dev',
      }),
    ).toEqual({
      matches: false,
      reasons: ['EXCLUDED_LOCATION', 'UNRELATED_ROLE_FAMILY'],
    });
  });

  it('reports supporting signals and the current exact matcher blocker safely', () => {
    const [decision] = diagnoseJobSearchProfileCoverage(
      {
        title: 'Product Manager',
        description: 'Work with engineers who develop software applications.',
        tags: ['TypeScript'],
        category: 'Software Development',
      },
      ['software_development'],
    );
    expect(decision).toMatchObject({
      profileId: 'software_development',
      matched: false,
      blocker: 'EXCLUDED_TITLE',
    });
    expect(decision?.positiveSignals).toEqual(
      expect.arrayContaining([
        { type: 'tag', value: 'typescript' },
        { type: 'source_category_alias', value: 'software development' },
      ]),
    );
  });

  it('produces a safe dry-run rejection breakdown and ranked near matches', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('arbeitnow.com')) {
        return Response.json({
          data: [
            arbeitnowRecord(),
            arbeitnowRecord({
              slug: 'typescript-developer-2',
              company_name: 'Onsite Co',
              remote: false,
              location: 'Berlin',
              url: 'https://www.arbeitnow.com/jobs/companies/onsite/typescript-developer-2',
            }),
          ],
          links: { next: null },
          meta: { current_page: 1 },
        });
      }
      if (url.includes('remotive.com')) {
        return Response.json({
          '0-legal-notice': 'Test fixture',
          'job-count': 1,
          jobs: [remotiveRecord()],
        });
      }
      if (url.includes('api.lever.co')) return Response.json([]);
      throw new Error('Unexpected URL');
    }) as typeof fetch;

    const result = await runProfileMatcherCoverageAudit({
      fetchImpl,
      repository: repository(),
      verifiedSkills: VERIFIED_SKILLS,
      sourceEnvironment: {
        JOB_DISCOVERY_ARBEITNOW_ENABLED: 'true',
        JOB_DISCOVERY_REMOTIVE_ENABLED: 'true',
        JOB_DISCOVERY_LEVER_ENABLED: 'true',
      },
      now: () => new Date('2026-08-01T00:00:00.000Z'),
    });

    expect(result).toMatchObject({
      mode: 'PROFILE_COVERAGE_AUDIT',
      dryRun: true,
      persistenceEnabled: false,
      geminiCalls: 0,
      applicationsCreated: 0,
      submissionsCreated: 0,
    });
    expect(PROFILE_COVERAGE_REASON_CODES).toContain('EXCLUDED_EMPLOYMENT_TYPE');
    expect(result.sources.arbeitnow?.reasonCounts.EXCLUDED_LOCATION).toBe(1);
    expect(result.sources.remotive?.reasonCounts.UNTARGETED).toBe(1);
    const software = result.profiles.find(
      (profile) => profile.profileId === 'software_development',
    );
    expect(software?.newUniqueMatchesAfterDeduplication).toBe(1);
    expect(software?.topNearMatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'TypeScript Developer',
          company: 'Onsite Co',
          exactBlocker: 'EXCLUDED_LOCATION',
          exclusionTiming: 'BEFORE_PROFILE_MATCHING',
          currentMatcherWouldMatch: true,
        }),
        expect.objectContaining({
          title: 'Product Manager',
          exactBlocker: 'EXCLUDED_TITLE',
          exclusionTiming: 'DURING_PROFILE_MATCHING',
          currentMatcherWouldMatch: false,
        }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain('Work with engineers');
    const automation = result.profiles.find(
      (profile) => profile.profileId === 'ai_automation',
    );
    expect(
      automation?.topNearMatches.find(
        (candidate) => candidate.title === 'TypeScript Developer',
      )?.exactBlocker,
    ).toBe('INSUFFICIENT_POSITIVE_EVIDENCE');
  });
});
