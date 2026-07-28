import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  JOB_SEARCH_PROFILE_IDS,
  JOB_SEARCH_PROFILES_SEED_V1,
  JobSearchProfileMatchSchema,
  JobSearchProfileIdListSchema,
  JobSearchProfilesSeedSchema,
  isPrimaryProfileEvidence,
  matchJobSearchProfiles,
  matchJobSearchProfilesWithEvidence,
  type JobSearchProfileId,
} from '../src/discovery/job-search-profiles.v1.js';

describe('job search profiles v1', () => {
  it('validates the versioned profile configuration', () => {
    expect(JOB_SEARCH_PROFILES_SEED_V1.version).toBe(1);
    expect(JOB_SEARCH_PROFILES_SEED_V1.profiles.length).toBeGreaterThan(0);
  });

  it('rejects duplicate profile IDs in seed config', () => {
    expect(() =>
      JobSearchProfilesSeedSchema.parse({
        version: 1,
        profiles: [
          JOB_SEARCH_PROFILES_SEED_V1.profiles[0],
          JOB_SEARCH_PROFILES_SEED_V1.profiles[0],
        ],
      }),
    ).toThrow(/Duplicate job search profile ID/);
  });

  it('rejects duplicate selection profile IDs', () => {
    expect(() =>
      JobSearchProfileIdListSchema.parse([
        'software_development',
        'software_development',
      ]),
    ).toThrow(/Duplicate profile ID selection/);
  });

  it('keeps profile IDs as a literal union and rejects unknown external IDs', () => {
    expectTypeOf<JobSearchProfileId>().toEqualTypeOf<
      | 'software_development'
      | 'ai_automation'
      | 'ai_augmented_development'
      | 'low_code_no_code'
    >();
    expect(JOB_SEARCH_PROFILE_IDS).toEqual([
      'software_development',
      'ai_automation',
      'ai_augmented_development',
      'low_code_no_code',
    ]);
    expect(
      JobSearchProfileIdListSchema.safeParse(['unknown_profile']).success,
    ).toBe(false);
  });

  it('matches n8n automation specialist to ai_automation', () => {
    const matched = matchJobSearchProfiles({
      title: 'n8n Automation Specialist',
      description: 'Build workflow automation and API integrations using n8n.',
      tags: ['n8n', 'automation'],
    });
    expect(matched).toContain('ai_automation');
  });

  it('matches AI-Augmented Developer with vibe coding alias', () => {
    const matched = matchJobSearchProfiles({
      title: 'AI-Augmented Developer - Vibe Coding',
      description: 'Build script automation with Claude Code and Cursor IDE.',
      tags: ['vibe coding', 'claude code'],
    });
    expect(matched).toContain('ai_augmented_development');
  });

  it('does not match an AI cinematic video editor to AI-augmented development', () => {
    const matched = matchJobSearchProfiles({
      title: 'Mid/Senior AI Cinematic Video Editor',
      description:
        'Create cinematic AI video, edit footage, and deliver creative media.',
      tags: ['AI', 'video editing', 'creative production'],
    });
    expect(matched).not.toContain('ai_augmented_development');
  });

  it('does not match a generic product software engineer to AI-augmented development', () => {
    const matched = matchJobSearchProfiles({
      title: 'Staff Software Engineer, Product',
      description: 'Build reliable product software with a cross-functional team.',
      tags: ['software', 'product'],
    });
    expect(matched).toContain('software_development');
    expect(matched).not.toContain('ai_augmented_development');
  });

  it.each([
    ['AI Marketing Manager', 'Plan AI marketing campaigns and brand strategy.'],
    ['AI Content Producer', 'Produce AI-assisted editorial content.'],
    ['AI Video Editor', 'Edit generative video and cinematic footage.'],
    ['AI Design Specialist', 'Create visual designs and campaign assets.'],
    ['Creative AI Producer', 'Coordinate creative production workflows.'],
  ])(
    'does not match non-coding role %s to a development profile',
    (title, description) => {
      const matched = matchJobSearchProfiles(
        { title, description, tags: ['AI'] },
        ['software_development', 'ai_augmented_development'],
      );
      expect(matched).toEqual([]);
    },
  );

  it.each([
    [
      'AI Content Producer',
      'Create campaign content for software development teams and publish React product demos.',
    ],
    [
      'AI Design Specialist',
      'Create visual campaign pages in Webflow and promote the platform.',
    ],
    [
      'AI Marketing Manager',
      'Market our GitHub Copilot development offering to enterprise buyers.',
    ],
    [
      'Content Writer',
      'Collaborate with software engineers and learn about TypeScript.',
    ],
    [
      'Technical Recruiter',
      'Hire Flutter developers and review React engineering resumes.',
    ],
    [
      'Product Manager',
      'Work with engineers who develop software applications in React.',
    ],
    [
      'Product Marketing Specialist',
      'Market a Cursor product while engineers develop software.',
    ],
    [
      'Customer Success Manager',
      'Help customers build FlutterFlow applications.',
    ],
    [
      'Developer Advocate',
      'Teach Cursor to developers while another team develops software.',
    ],
  ])(
    'does not treat incidental development wording in %s as role intent',
    (title, description) => {
      expect(
        matchJobSearchProfiles(
          { title, description, tags: [] },
          [
            'software_development',
            'ai_augmented_development',
            'low_code_no_code',
          ],
        ),
      ).toEqual([]);
    },
  );

  it('requires hands-on low-code responsibility rather than platform familiarity', () => {
    const mentionedOnly = matchJobSearchProfiles(
      {
        title: 'Product Marketing Specialist',
        description: 'Familiarity with FlutterFlow and Retool is useful for demos.',
        tags: ['FlutterFlow', 'Retool'],
      },
      ['low_code_no_code'],
    );
    const handsOn = matchJobSearchProfiles(
      {
        title: 'Business Systems Specialist',
        description:
          'The successful candidate will build FlutterFlow applications.',
        tags: ['FlutterFlow'],
      },
      ['low_code_no_code'],
    );
    expect(mentionedOnly).toEqual([]);
    expect(handsOn).toEqual(['low_code_no_code']);
  });

  it('matches legitimate domain-specific software roles with primary role evidence', () => {
    for (const job of [
      {
        title: 'Healthcare Software Developer',
        description: 'Maintain patient workflow software APIs.',
      },
      {
        title: 'Finance Software Engineer',
        description: 'Build financial reporting services.',
      },
      {
        title: 'Design Systems Engineer',
        description: 'Write accessible React components and test UI code.',
      },
    ]) {
      expect(
        matchJobSearchProfiles(job, ['software_development']),
      ).toContain('software_development');
    }
  });

  it('matches explicit Cursor and Claude Code development context', () => {
    const matched = matchJobSearchProfiles({
      title: 'Developer using Cursor and Claude Code for rapid prototyping',
      description: 'Build and test application prototypes.',
      tags: [],
    });
    expect(matched).toContain('ai_augmented_development');
  });

  it('matches FlutterFlow developer to low_code_no_code', () => {
    const matched = matchJobSearchProfiles({
      title: 'FlutterFlow Developer',
      description: 'Build low-code apps and no-code workflow automations.',
      tags: ['flutterflow', 'no-code'],
    });
    expect(matched).toContain('low_code_no_code');
  });

  it('matches Junior TypeScript Developer to software_development', () => {
    const matched = matchJobSearchProfiles({
      title: 'Junior TypeScript Developer',
      description: 'Build web applications in TypeScript and React.',
      tags: ['typescript', 'react'],
    });
    expect(matched).toContain('software_development');
  });

  it('does not match Head of Marketing & Communications', () => {
    const matched = matchJobSearchProfiles({
      title: 'Head of Marketing & Communications',
      description: 'Lead global brand strategy and communications.',
      tags: ['marketing'],
      category: 'Marketing',
    });
    expect(matched).toEqual([]);
  });

  it('matches marketing automation engineer when technical automation evidence exists', () => {
    const matched = matchJobSearchProfiles({
      title: 'Marketing Automation Engineer',
      description: 'Build n8n workflows and CRM integration automation.',
      tags: ['n8n', 'api automation'],
    });
    expect(matched).toContain('ai_automation');
  });

  it('matches applicant-directed responsibilities for each technical profile', () => {
    expect(
      matchJobSearchProfiles(
        {
          title: 'Software Engineer',
          description: 'You will build React applications.',
        },
        ['software_development'],
      ),
    ).toEqual(['software_development']);
    expect(
      matchJobSearchProfiles(
        {
          title: 'Business Automation Specialist',
          description: 'In this role, you will create n8n workflows.',
        },
        ['ai_automation'],
      ),
    ).toEqual(['ai_automation']);
    expect(
      matchJobSearchProfiles(
        {
          title: 'Business Systems Specialist',
          description:
            'The successful candidate will build FlutterFlow applications.',
        },
        ['low_code_no_code'],
      ),
    ).toEqual(['low_code_no_code']);
    expect(
      matchJobSearchProfiles(
        {
          title: 'Developer',
          description:
            'You will use Cursor and Claude Code to develop and ship applications.',
        },
        ['ai_augmented_development'],
      ),
    ).toEqual(['ai_augmented_development']);
  });

  it('rejects matches that contain supporting evidence without primary evidence', () => {
    expect(
      JobSearchProfileMatchSchema.safeParse({
        profileId: 'software_development',
        evidence: [
          { type: 'strong_technology', value: 'react' },
          { type: 'source_category_alias', value: 'software-dev' },
        ],
      }).success,
    ).toBe(false);
  });

  it('does not exclude healthcare software developer with technical evidence', () => {
    const matched = matchJobSearchProfiles({
      title: 'Healthcare Software Developer',
      description: 'Develop patient workflow software APIs with TypeScript.',
      tags: ['typescript', 'api'],
      category: 'Software Development',
    });
    expect(matched).toContain('software_development');
  });

  it('does not match generic AI without technical context', () => {
    const matched = matchJobSearchProfiles({
      title: 'AI',
      description: 'Artificial intelligence initiatives.',
      tags: [],
    });
    expect(matched).toEqual([]);
  });

  it('does not match generic Cursor without development context', () => {
    const matched = matchJobSearchProfiles({
      title: 'Cursor',
      description: 'Manage design-system cursor tokens for marketing pages.',
      tags: [],
    });
    expect(matched).toEqual([]);
  });

  it('does not match a generic Cursor mention even in an ordinary software role', () => {
    const matched = matchJobSearchProfiles({
      title: 'Staff Software Engineer, Product',
      description: 'The team cursor is visible in our collaborative product.',
      tags: ['software'],
    });
    expect(matched).not.toContain('ai_augmented_development');
  });

  it('returns deterministic configured evidence for every match', () => {
    const matches = matchJobSearchProfilesWithEvidence({
      title: 'AI-Augmented Developer - Vibe Coding & Script Automation',
      description:
        'Use Cursor-based development and Claude Code development for prototypes.',
      tags: ['vibe coding'],
      category: 'Software Development',
    });

    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((match) => match.evidence.length > 0)).toBe(true);
    expect(
      matches.every((match) =>
        match.evidence.some((item) =>
          [
            'title_phrase',
            'title_role',
            'applicant_responsibility',
          ].includes(item.type),
        ),
      ),
    ).toBe(true);
    expect(
      matches.every((match) =>
        match.evidence.every(
          (item) =>
            item.value.length <= 80 &&
            !item.value.includes('Use Cursor-based development'),
        ),
      ),
    ).toBe(true);
    expect(
      matches.find(
        (match) => match.profileId === 'ai_augmented_development',
      ),
    ).toMatchObject({
      evidence: expect.arrayContaining([
        { type: 'title_phrase', value: 'vibe coding' },
        { type: 'contextual_phrase', value: 'cursor-based development' },
      ]),
    });
    expect(
      matches.every((match) =>
        match.evidence.some((item) => isPrimaryProfileEvidence(item)),
      ),
    ).toBe(true);
    expect(matches.map((match) => match.profileId)).toEqual(
      [...matches.map((match) => match.profileId)].sort(
        (left, right) =>
          JOB_SEARCH_PROFILES_SEED_V1.profiles.find(
            (profile) => profile.id === left,
          )!.priority -
          JOB_SEARCH_PROFILES_SEED_V1.profiles.find(
            (profile) => profile.id === right,
          )!.priority,
      ),
    );
  });

  it('allows one job to match multiple profiles in deterministic order', () => {
    const matched = matchJobSearchProfiles({
      title: 'AI Automation Developer',
      description:
        'You will write TypeScript software. You will build workflow automation with n8n.',
      tags: ['n8n', 'typescript'],
    });
    expect(matched).toEqual(
      expect.arrayContaining(['software_development', 'ai_automation']),
    );
    const softwareIndex = matched.indexOf('software_development');
    const automationIndex = matched.indexOf('ai_automation');
    expect(softwareIndex).toBeLessThan(automationIndex);
  });

  it.each([
    [
      'Partnership Manager',
      'Building relationships with partners who develop software applications.',
    ],
    [
      'Community Manager',
      'Building programs for users who develop software applications.',
    ],
    [
      'Developer Relations Engineer',
      'You will use Cursor to teach developers to develop and ship applications.',
    ],
    [
      'Customer Success Manager',
      'You will help customers build FlutterFlow applications.',
    ],
    [
      'Technical Recruiter',
      'You will recruit engineers who build Flutter applications.',
    ],
    [
      'Product Marketing Specialist',
      'You will market a Cursor product that helps users write code.',
    ],
    [
      'Technical Writer',
      'You will document software built by the engineering team.',
    ],
  ])(
    'does not attribute third-party development work to %s',
    (title, description) => {
      expect(
        matchJobSearchProfiles(
          {
            title,
            description,
            tags: ['React', 'FlutterFlow', 'Cursor'],
            category: 'software-dev',
            team: 'Engineering',
          },
          JOB_SEARCH_PROFILE_IDS,
        ),
      ).toEqual([]);
    },
  );

  it.each([
    [
      'Operations Associate',
      'You will build relationships;engineers develop React applications.',
    ],
    [
      'Community Operations Lead',
      'You will build community programs.Users develop software applications.',
    ],
    [
      'Business Analyst',
      'You will build relationships, while engineers develop React applications.',
    ],
    [
      'Program Lead',
      'You will build a community where users develop software applications.',
    ],
    [
      'Operations Associate',
      'You will use Cursor to document how developers build applications.',
    ],
    [
      'Partnership Manager',
      'Building relationships with partners who develop software applications.',
    ],
  ])(
    'rejects the bounded-grammar adversarial fixture for %s',
    (title, description) => {
      expect(
        matchJobSearchProfiles(
          { title, description, tags: [] },
          JOB_SEARCH_PROFILE_IDS,
        ),
      ).toEqual([]);
    },
  );

  it('ends a responsibility section at a later plain or HTML heading', () => {
    for (const description of [
      'Responsibilities:\n- Coordinate projects.\nAbout Acme\nBuild software products for customers worldwide.',
      '<h2>Responsibilities</h2><ul><li>Coordinate projects.</li></ul><h2>About Acme</h2><p>Build software products for customers worldwide.</p>',
    ]) {
      expect(
        matchJobSearchProfiles(
          {
            title: 'Operations Associate',
            description,
            tags: [],
          },
          JOB_SEARCH_PROFILE_IDS,
        ),
      ).toEqual([]);
    }
  });

  it('recognizes HTML responsibility bullets without leaking across HTML blocks', () => {
    expect(
      matchJobSearchProfiles(
        {
          title: 'Business Systems Specialist',
          description:
            '<h2>Responsibilities</h2><ul><li>Build FlutterFlow applications.</li></ul><h2>Requirements</h2><p>Experience preferred.</p>',
          tags: [],
        },
        JOB_SEARCH_PROFILE_IDS,
      ),
    ).toContain('low_code_no_code');
  });

  it('does not assemble primary evidence across source fields', () => {
    expect(
      matchJobSearchProfiles(
        {
          title: 'Project Coordinator',
          description: 'Your responsibilities include building.',
          tags: ['software applications'],
          requiredSkills: ['React'],
          category: 'software-dev',
          team: 'Engineering',
          department: 'Product Development',
        },
        JOB_SEARCH_PROFILE_IDS,
      ),
    ).toEqual([]);
  });

  it.each([
    [
      'Software Engineer',
      'You will build React applications.',
      'software_development',
    ],
    [
      'Business Systems Specialist',
      'In this role, you will create n8n workflows.',
      'ai_automation',
    ],
    [
      'Business Systems Specialist',
      'Responsibilities:\n- Build FlutterFlow applications.',
      'low_code_no_code',
    ],
    [
      'Application Developer',
      'You will use Cursor and Claude Code to develop applications.',
      'ai_augmented_development',
    ],
    [
      'Marketing Automation Engineer',
      'You will build n8n workflows for marketing operations.',
      'ai_automation',
    ],
    [
      'Healthcare Software Developer',
      'You will maintain patient software services.',
      'software_development',
    ],
    [
      'Design Systems Engineer',
      'You will write React components.',
      'software_development',
    ],
    [
      'Developer Experience Engineer',
      'You will build developer tooling.',
      'software_development',
    ],
    [
      'Customer Platform Engineer',
      'You will implement platform APIs.',
      'software_development',
    ],
  ])(
    'matches same-clause applicant responsibility for %s',
    (title, description, expectedProfile) => {
      const matches = matchJobSearchProfilesWithEvidence(
        { title, description, tags: [] },
        JOB_SEARCH_PROFILE_IDS,
      );
      expect(matches.map((match) => match.profileId)).toContain(
        expectedProfile,
      );
      expect(
        matches.every((match) =>
          match.evidence.some((item) =>
            isPrimaryProfileEvidence(item),
          ),
        ),
      ).toBe(true);
      expect(
        matches.flatMap((match) => match.evidence).every(
          (item) =>
            item.value.length <= 80 &&
            !item.value.includes(description),
        ),
      ).toBe(true);
    },
  );

  it('keeps profile and evidence ordering deterministic', () => {
    const job = {
      title: 'AI Automation Developer',
      description:
        'You will build software applications. You will create n8n workflows.',
      tags: ['n8n', 'typescript'],
      category: 'software-dev',
    };
    const first = matchJobSearchProfilesWithEvidence(
      job,
      JOB_SEARCH_PROFILE_IDS,
    );
    const second = matchJobSearchProfilesWithEvidence(
      job,
      JOB_SEARCH_PROFILE_IDS,
    );
    expect(second).toEqual(first);
  });
});
