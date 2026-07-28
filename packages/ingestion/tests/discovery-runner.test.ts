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
  DiscoveryOptions,
  DiscoveryDeduplicationContext,
  DiscoveredJob,
  DiscoveryFetchResult,
  DiscoveryRepository,
  DiscoverySourceAdapter,
} from '../src/discovery/contracts.js';
import { createDiscoveryRepository } from '../src/discovery/repository.js';
import {
  finalizeDiscoveryDeduplicationContext,
  materializeDiscoveryRunSummary,
  runDiscovery,
} from '../src/discovery/runner.js';

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
  overrides: Partial<DiscoveryOptions> = {},
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

  it('scores one multi-profile job only once and marks unmatched as untargeted', async () => {
    const summary = await runDiscovery(
      options({
        query: '',
        activeProfileIds: [
          'software_development',
          'ai_automation',
          'ai_augmented_development',
          'low_code_no_code',
        ],
      }),
      {
        adapter: adapter([
          discovered({
            title: 'AI Automation Developer',
            description:
              'Build n8n workflow automation in TypeScript for production software.',
            tags: ['n8n', 'TypeScript'],
          }),
          discovered({
            sourceJobId: 'head-of-marketing',
            sourceUrl:
              'https://www.arbeitnow.com/jobs/companies/example/head-of-marketing',
            applicationUrl:
              'https://www.arbeitnow.com/jobs/companies/example/head-of-marketing',
            title: 'Head of Marketing & Communications',
            description: 'Lead communications strategy and branding.',
            tags: ['marketing'],
          }),
        ]),
        repository: {
          async loadExistingJobs() {
            return [];
          },
          persistBatch: vi.fn(),
        },
        verifiedSkills: VERIFIED_SKILLS,
      },
    );

    expect(summary.eligibleScoredJobs).toBe(1);
    expect(summary.jobsThatWouldBePersisted).toBe(1);
    expect(summary.untargeted).toBe(1);
    expect(summary.profileStats.some((p) => p.profileId === 'ai_automation')).toBe(
      true,
    );
    expect(
      summary.profileStats.some((p) => p.profileId === 'software_development'),
    ).toBe(true);
    expect(summary.preview[0]?.matchedProfileEvidence.length).toBeGreaterThan(0);
    expect(
      summary.preview[0]?.matchedProfileEvidence.every(
        (match) => match.evidence.length > 0,
      ),
    ).toBe(true);
    expect(summary.vibeCodingRolesFound).toBe(0);
  });

  it('counts vibe-coding roles from actual job evidence, not profile configuration', async () => {
    const repository: DiscoveryRepository = {
      async loadExistingJobs() {
        return [];
      },
      persistBatch: vi.fn(),
    };

    const noMatches = await runDiscovery(
      options({
        activeProfileIds: ['ai_augmented_development'],
      }),
      {
        adapter: adapter([
          discovered({
            title: 'Staff Software Engineer, Product',
            description: 'Build reliable product software.',
            tags: ['software'],
          }),
        ]),
        repository,
        verifiedSkills: VERIFIED_SKILLS,
      },
    );
    expect(noMatches.vibeCodingRolesFound).toBe(0);
    expect(noMatches.untargeted).toBe(1);

    const actualMatch = await runDiscovery(
      options({
        activeProfileIds: ['ai_augmented_development'],
      }),
      {
        adapter: adapter([
          discovered({
            title:
              'AI-Augmented Developer - Vibe Coding & Script Automation',
            description:
              'Use a coding-agent workflow for rapid AI application prototyping.',
            tags: ['vibe coding'],
          }),
        ]),
        repository,
        verifiedSkills: VERIFIED_SKILLS,
      },
    );
    expect(actualMatch.vibeCodingRolesFound).toBe(1);
    expect(actualMatch.preview[0]?.matchedProfileEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          profileId: 'ai_augmented_development',
          evidence: expect.arrayContaining([
            { type: 'title_phrase', value: 'vibe coding' },
          ]),
        }),
      ]),
    );
  });

  it('shares the existing deduplication rules across source runs', async () => {
    const repository: DiscoveryRepository = {
      async loadExistingJobs() {
        return [];
      },
      persistBatch: vi.fn(),
    };
    const deduplicationContext: DiscoveryDeduplicationContext = {
      knownJobs: [],
    };
    const canonicalUrl = 'https://jobs.example.com/typescript-developer';
    const first = await runDiscovery(
      options({ activeProfileIds: ['software_development'] }),
      {
        adapter: adapter([
          discovered({
            sourceName: 'Source A',
            sourceJobId: 'source-a-1',
            sourceUrl: canonicalUrl,
            applicationUrl: canonicalUrl,
          }),
        ]),
        repository,
        verifiedSkills: VERIFIED_SKILLS,
        deduplicationContext,
      },
    );
    const second = await runDiscovery(
      options({ activeProfileIds: ['software_development'] }),
      {
        adapter: adapter([
          discovered({
            sourceName: 'Source B',
            sourceJobId: 'source-b-1',
            sourceUrl: `${canonicalUrl}?ref=second-source`,
            applicationUrl: `${canonicalUrl}?ref=second-source`,
          }),
        ]),
        repository,
        verifiedSkills: VERIFIED_SKILLS,
        deduplicationContext,
      },
    );

    expect(first.eligibleScoredJobs).toBe(1);
    expect(second.eligibleScoredJobs).toBe(0);
    expect(second.duplicates).toBe(1);
    expect(second.jobsThatWouldBePersisted).toBe(0);
    expect(second.preview).toEqual([]);
    expect(second.profileStats[0]).toMatchObject({
      recordsMatched: 0,
      duplicates: 1,
      jobsThatWouldBePersisted: 0,
    });
    expect(deduplicationContext.knownJobs).toHaveLength(1);
  });

  it('promotes an earlier untargeted identity when a later source adds valid profile evidence', async () => {
    const repository: DiscoveryRepository = {
      async loadExistingJobs() {
        return [];
      },
      persistBatch: vi.fn(),
    };
    const deduplicationContext: DiscoveryDeduplicationContext = {
      knownJobs: [],
    };
    const sharedUrl = 'https://jobs.example.com/business-systems-role';
    const first = await runDiscovery(
      options({ activeProfileIds: ['low_code_no_code'] }),
      {
        adapter: adapter([
          discovered({
            sourceName: 'Source A',
            sourceJobId: 'source-a-untargeted',
            title: 'Business Systems Specialist',
            description: 'Coordinate internal business systems.',
            tags: [],
            sourceUrl: sharedUrl,
            applicationUrl: sharedUrl,
          }),
        ]),
        repository,
        verifiedSkills: VERIFIED_SKILLS,
        deduplicationContext,
      },
    );
    const firstSnapshot = JSON.stringify(first);
    const second = await runDiscovery(
      options({ activeProfileIds: ['low_code_no_code'] }),
      {
        adapter: adapter([
          discovered({
            sourceName: 'Source B',
            sourceJobId: 'source-b-targeted',
            title: 'Business Systems Specialist',
            description:
              'The successful candidate will build FlutterFlow applications.',
            tags: ['FlutterFlow'],
            sourceUrl: sharedUrl,
            applicationUrl: sharedUrl,
          }),
        ]),
        repository,
        verifiedSkills: VERIFIED_SKILLS,
        deduplicationContext,
      },
    );

    expect(JSON.stringify(first)).toBe(firstSnapshot);
    expect(first).toMatchObject({
      untargeted: 1,
      duplicates: 0,
      eligibleScoredJobs: 0,
      jobsThatWouldBePersisted: 0,
    });
    expect(materializeDiscoveryRunSummary(first)).toMatchObject({
      untargeted: 0,
      duplicates: 1,
    });
    expect(second).toMatchObject({
      untargeted: 0,
      duplicates: 0,
      eligibleScoredJobs: 1,
      jobsThatWouldBePersisted: 1,
    });
    expect(second.preview).toHaveLength(1);
    expect(second.preview[0]).toMatchObject({
      sourceName: 'Source B',
      additionalSourceNames: ['Source A'],
      matchedProfileIds: ['low_code_no_code'],
    });
    expect(second.profileStats[0]).toMatchObject({
      recordsMatched: 1,
      eligibleScoredJobs: 1,
      jobsThatWouldBePersisted: 1,
    });
    expect(deduplicationContext.knownJobs).toHaveLength(1);
    expect(repository.persistBatch).not.toHaveBeenCalled();
  });

  it('keeps two untargeted source variants as one unscored identity', async () => {
    const repository: DiscoveryRepository = {
      async loadExistingJobs() {
        return [];
      },
      persistBatch: vi.fn(),
    };
    const deduplicationContext: DiscoveryDeduplicationContext = {
      knownJobs: [],
    };
    const sharedUrl = 'https://jobs.example.com/operations-role';
    const first = await runDiscovery(
      options({ activeProfileIds: ['ai_augmented_development'] }),
      {
        adapter: adapter([
          discovered({
            sourceName: 'Source A',
            sourceJobId: 'operations-a',
            title: 'Operations Coordinator',
            description: 'Coordinate business reporting.',
            tags: [],
            sourceUrl: sharedUrl,
            applicationUrl: sharedUrl,
          }),
        ]),
        repository,
        verifiedSkills: VERIFIED_SKILLS,
        deduplicationContext,
      },
    );
    const second = await runDiscovery(
      options({ activeProfileIds: ['ai_augmented_development'] }),
      {
        adapter: adapter([
          discovered({
            sourceName: 'Source B',
            sourceJobId: 'operations-b',
            title: 'Operations Coordinator',
            description: 'Coordinate business reporting and documentation.',
            tags: [],
            sourceUrl: sharedUrl,
            applicationUrl: sharedUrl,
          }),
        ]),
        repository,
        verifiedSkills: VERIFIED_SKILLS,
        deduplicationContext,
      },
    );

    expect(first).toMatchObject({
      untargeted: 1,
      duplicates: 0,
      eligibleScoredJobs: 0,
    });
    expect(second).toMatchObject({
      untargeted: 0,
      duplicates: 1,
      eligibleScoredJobs: 0,
      jobsThatWouldBePersisted: 0,
    });
    expect(deduplicationContext.knownJobs).toHaveLength(1);
  });

  it('registers a filtered identity before a later targeted duplicate promotes it', async () => {
    const repository: DiscoveryRepository = {
      async loadExistingJobs() {
        return [];
      },
      persistBatch: vi.fn(),
    };
    const deduplicationContext: DiscoveryDeduplicationContext = {
      knownJobs: [],
      registeredVariants: [],
    };
    const sharedUrl = 'https://jobs.example.com/shared-filtered-targeted';

    const filtered = await runDiscovery(
      options({
        remoteOnly: true,
        activeProfileIds: ['ai_augmented_development'],
      }),
      {
        adapter: adapter([
          discovered({
            sourceName: 'Source A',
            sourceJobId: 'filtered-a',
            title: 'AI-Augmented Developer',
            description: 'You will use Cursor to develop applications.',
            remote: false,
            sourceUrl: sharedUrl,
            applicationUrl: sharedUrl,
          }),
        ]),
        repository,
        verifiedSkills: VERIFIED_SKILLS,
        deduplicationContext,
      },
    );
    const filteredSnapshot = JSON.stringify(filtered);

    expect(filtered).toMatchObject({
      excludedByFilters: 1,
      eligibleScoredJobs: 0,
      jobsThatWouldBePersisted: 0,
    });
    expect(deduplicationContext.registeredVariants).toEqual([
      expect.objectContaining({
        sourceName: 'Source A',
        passedLocalFilters: false,
        state: 'FILTERED',
      }),
    ]);

    const targeted = await runDiscovery(
      options({
        remoteOnly: true,
        activeProfileIds: ['ai_augmented_development'],
      }),
      {
        adapter: adapter([
          discovered({
            sourceName: 'Source B',
            sourceJobId: 'targeted-b',
            title: 'AI-Augmented Developer - Vibe Coding',
            description:
              'You will use Cursor and Claude Code to develop applications.',
            remote: true,
            sourceUrl: sharedUrl,
            applicationUrl: sharedUrl,
          }),
        ]),
        repository,
        verifiedSkills: VERIFIED_SKILLS,
        deduplicationContext,
      },
    );
    const finalized = finalizeDiscoveryDeduplicationContext(
      deduplicationContext,
      ['ai_augmented_development'],
    );
    const materializedFiltered =
      materializeDiscoveryRunSummary(filtered);

    expect(JSON.stringify(filtered)).toBe(filteredSnapshot);
    expect(filtered).toMatchObject({ excludedByFilters: 1, duplicates: 0 });
    expect(materializedFiltered).toMatchObject({
      excludedByFilters: 1,
      duplicates: 1,
    });
    expect(targeted).toMatchObject({
      eligibleScoredJobs: 1,
      jobsThatWouldBePersisted: 1,
    });
    expect(targeted.preview).toEqual([
      expect.objectContaining({
        sourceName: 'Source B',
        additionalSourceNames: ['Source A'],
      }),
    ]);
    expect(deduplicationContext.registeredVariants).toHaveLength(2);
    expect(finalized).toMatchObject({
      acceptedRecords: 1,
      eligibleScoredJobs: 1,
      jobsThatWouldBePersisted: 1,
      vibeCodingRolesFound: 1,
    });
    expect(finalized.preview).toHaveLength(1);
    expect(finalized.profileStats[0]).toMatchObject({
      recordsMatched: 1,
      eligibleScoredJobs: 1,
    });
    expect(repository.persistBatch).not.toHaveBeenCalled();
  });

  it('keeps an earlier targeted summary immutable while final provenance evolves', async () => {
    const repository: DiscoveryRepository = {
      async loadExistingJobs() {
        return [];
      },
      persistBatch: vi.fn(),
    };
    const deduplicationContext: DiscoveryDeduplicationContext = {
      knownJobs: [],
    };
    const sharedUrl = 'https://jobs.example.com/immutable-summary';
    const first = await runDiscovery(
      options({ activeProfileIds: ['software_development'] }),
      {
        adapter: adapter([
          discovered({
            sourceName: 'Source A',
            sourceJobId: 'immutable-a',
            sourceUrl: sharedUrl,
            applicationUrl: sharedUrl,
          }),
        ]),
        repository,
        verifiedSkills: VERIFIED_SKILLS,
        deduplicationContext,
      },
    );
    const firstSnapshot = JSON.stringify(first);

    const second = await runDiscovery(
      options({ activeProfileIds: ['software_development'] }),
      {
        adapter: adapter([
          discovered({
            sourceName: 'Source B',
            sourceJobId: 'immutable-b',
            sourceUrl: sharedUrl,
            applicationUrl: sharedUrl,
          }),
        ]),
        repository,
        verifiedSkills: VERIFIED_SKILLS,
        deduplicationContext,
      },
    );

    expect(JSON.stringify(first)).toBe(firstSnapshot);
    expect(first.preview[0]?.additionalSourceNames).toEqual([]);
    expect(second).toMatchObject({ duplicates: 1, eligibleScoredJobs: 0 });
    expect(
      materializeDiscoveryRunSummary(first).preview[0],
    ).toMatchObject({
      sourceName: 'Source A',
      additionalSourceNames: ['Source B'],
    });
  });

  it('keeps filtered duplicates as one identity with zero scoring and persistence', async () => {
    const repository: DiscoveryRepository = {
      async loadExistingJobs() {
        return [];
      },
      persistBatch: vi.fn(),
    };
    const deduplicationContext: DiscoveryDeduplicationContext = {
      knownJobs: [],
    };
    const sharedUrl = 'https://jobs.example.com/shared-filtered';
    for (const sourceName of ['Source A', 'Source B']) {
      await runDiscovery(options({ remoteOnly: true }), {
        adapter: adapter([
          discovered({
            sourceName,
            sourceJobId: `${sourceName}-filtered`,
            remote: false,
            sourceUrl: sharedUrl,
            applicationUrl: sharedUrl,
          }),
        ]),
        repository,
        verifiedSkills: VERIFIED_SKILLS,
        deduplicationContext,
      });
    }
    expect(
      finalizeDiscoveryDeduplicationContext(
        deduplicationContext,
        ['software_development'],
      ),
    ).toMatchObject({
      acceptedRecords: 1,
      eligibleScoredJobs: 0,
      jobsThatWouldBePersisted: 0,
      untargeted: 0,
    });
    expect(repository.persistBatch).not.toHaveBeenCalled();
  });

  it('promotes a filtered identity to untargeted without scoring it', async () => {
    const repository: DiscoveryRepository = {
      async loadExistingJobs() {
        return [];
      },
      persistBatch: vi.fn(),
    };
    const deduplicationContext: DiscoveryDeduplicationContext = {
      knownJobs: [],
    };
    const sharedUrl = 'https://jobs.example.com/shared-filtered-untargeted';
    await runDiscovery(
      options({
        remoteOnly: true,
        activeProfileIds: ['ai_augmented_development'],
      }),
      {
        adapter: adapter([
          discovered({
            sourceName: 'Source A',
            title: 'Operations Coordinator',
            description: 'Coordinate reports.',
            tags: [],
            remote: false,
            sourceUrl: sharedUrl,
            applicationUrl: sharedUrl,
          }),
        ]),
        repository,
        verifiedSkills: VERIFIED_SKILLS,
        deduplicationContext,
      },
    );
    await runDiscovery(
      options({
        remoteOnly: true,
        activeProfileIds: ['ai_augmented_development'],
      }),
      {
        adapter: adapter([
          discovered({
            sourceName: 'Source B',
            title: 'Operations Coordinator',
            description: 'Coordinate reports.',
            tags: [],
            remote: true,
            sourceUrl: sharedUrl,
            applicationUrl: sharedUrl,
          }),
        ]),
        repository,
        verifiedSkills: VERIFIED_SKILLS,
        deduplicationContext,
      },
    );
    expect(
      finalizeDiscoveryDeduplicationContext(
        deduplicationContext,
        ['ai_augmented_development'],
      ),
    ).toMatchObject({
      acceptedRecords: 1,
      untargeted: 1,
      eligibleScoredJobs: 0,
      jobsThatWouldBePersisted: 0,
    });
  });

  it('seeds identity checks from persisted repository jobs', async () => {
    const database = getDb(':memory:');
    const repository = createDiscoveryRepository(database);
    await runDiscovery(options({ apply: true }), {
      adapter: adapter([discovered()]),
      repository,
      verifiedSkills: VERIFIED_SKILLS,
    });

    const duplicate = await runDiscovery(options(), {
      adapter: adapter([
        discovered({
          sourceName: 'Another Source',
          sourceJobId: 'another-source-id',
        }),
      ]),
      repository,
      verifiedSkills: VERIFIED_SKILLS,
    });

    expect(duplicate).toMatchObject({
      duplicates: 1,
      eligibleScoredJobs: 0,
      jobsThatWouldBePersisted: 0,
      jobsPersisted: 0,
    });
    expect(database.select().from(jobs).all()).toHaveLength(1);
    expect(database.select().from(job_scores).all()).toHaveLength(1);
  });

  it('does not deduplicate the same title at different companies', async () => {
    const repository: DiscoveryRepository = {
      async loadExistingJobs() {
        return [];
      },
      persistBatch: vi.fn(),
    };
    const deduplicationContext: DiscoveryDeduplicationContext = {
      knownJobs: [],
    };
    for (const [index, company] of ['First Company', 'Second Company'].entries()) {
      const summary = await runDiscovery(
        options({ activeProfileIds: ['software_development'] }),
        {
          adapter: adapter([
            discovered({
              company,
              sourceJobId: `different-company-${index}`,
              sourceUrl: `https://jobs.example.com/company-${index}`,
              applicationUrl: `https://jobs.example.com/company-${index}`,
            }),
          ]),
          repository,
          verifiedSkills: VERIFIED_SKILLS,
          deduplicationContext,
        },
      );
      expect(summary.duplicates).toBe(0);
      expect(summary.eligibleScoredJobs).toBe(1);
    }
    expect(deduplicationContext.knownJobs).toHaveLength(2);
  });

  it('does not deduplicate materially different roles at the same company', async () => {
    const repository: DiscoveryRepository = {
      async loadExistingJobs() {
        return [];
      },
      persistBatch: vi.fn(),
    };
    const deduplicationContext: DiscoveryDeduplicationContext = {
      knownJobs: [],
    };
    const roles = [
      {
        title: 'Frontend Developer',
        description: 'Build frontend applications with TypeScript and React.',
      },
      {
        title: 'Backend Developer',
        description: 'Build backend services with TypeScript and Node.js.',
      },
    ];
    for (const [index, role] of roles.entries()) {
      const summary = await runDiscovery(
        options({ activeProfileIds: ['software_development'] }),
        {
          adapter: adapter([
            discovered({
              ...role,
              sourceJobId: `material-role-${index}`,
              sourceUrl: `https://jobs.example.com/material-role-${index}`,
              applicationUrl: `https://jobs.example.com/material-role-${index}`,
            }),
          ]),
          repository,
          verifiedSkills: VERIFIED_SKILLS,
          deduplicationContext,
        },
      );
      expect(summary.duplicates).toBe(0);
      expect(summary.eligibleScoredJobs).toBe(1);
    }
    expect(deduplicationContext.knownJobs).toHaveLength(2);
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
