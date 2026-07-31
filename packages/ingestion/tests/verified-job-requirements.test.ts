import { describe, expect, it } from 'vitest';
import {
  GeminiJobRequirementsProposalSchema,
  type GeminiCandidateDecision,
  type GeminiJobRequirementsProposal,
  type JobRequirementCandidate,
} from '../src/job-requirements-contracts.js';
import {
  enumerateJobRequirementCandidates,
  normalizeJobSourceUrl,
  normalizeProviderDate,
  parseExplicitSalary,
  preprocessJobDescription,
} from '../src/job-requirements-preprocessor.js';
import {
  canonicalizeTimezoneDisplayValue,
  reconcileVerifiedExtractionWithProvider,
  verifyGeminiCandidateClassifications,
  verifyGeminiJobRequirements,
} from '../src/job-requirements-verifier.js';
import {
  A_TEAM_REQUIREMENTS_FIXTURE,
  LAWNSTARTER_REQUIREMENTS_FIXTURE,
  SPOTIFY_BACKEND_ENGINEER_DESCRIPTION,
} from './fixtures/saved-job-descriptions.js';

function ignoredCandidate(candidate: JobRequirementCandidate): GeminiCandidateDecision {
  return {
    candidateId: candidate.candidateId,
    classification: 'IGNORE',
  };
}

function spotifyCandidateDecision(candidate: JobRequirementCandidate): GeminiCandidateDecision {
  const decision = ignoredCandidate(candidate);
  const text = candidate.evidence;
  if (text.includes('some data engineering experience as a bonus')) {
    return { ...decision, classification: 'PREFERRED' };
  }
  if (text.includes('3+ years of working experience')) {
    return { ...decision, classification: 'REQUIRED' };
  }
  if (text.startsWith('You are proficient in Java')) {
    return { ...decision, classification: 'REQUIRED' };
  }
  if (text.startsWith('You are a strong advocate for code quality')) {
    return { ...decision, classification: 'REQUIRED' };
  }
  if (text.startsWith('You have experience with distributed systems')) {
    return { ...decision, classification: 'REQUIRED' };
  }
  if (text.startsWith('You are familiar with APIs')) {
    return { ...decision, classification: 'REQUIRED' };
  }
  if (text.startsWith('Knowledge of algorithms')) {
    return { ...decision, classification: 'REQUIRED' };
  }
  if (text.includes('United States base range')) {
    return {
      ...decision,
      classification: 'COMPENSATION',
      salarySemantics: { compensationType: 'BASE_SALARY', period: null },
    };
  }
  if (text.includes('within the North America region')) {
    return {
      ...decision,
      classification: 'LOCATION_RESTRICTION',
      workSetup: null,
      geographicRestrictions: ['North America'],
    };
  }
  if (text.includes('Eastern Standard time zone')) {
    return { ...decision, classification: 'TIMEZONE_REQUIREMENT', collaborationTimezone: 'Eastern Standard time zone' };
  }
  if (candidate.candidateId === 'provider-work-setup') {
    return {
      ...decision,
      classification: 'LOCATION_RESTRICTION',
      workSetup: 'REMOTE',
      geographicRestrictions: [],
    };
  }
  if (candidate.sectionType === 'RESPONSIBILITIES') {
    return { ...decision, classification: 'RESPONSIBILITY' };
  }
  return decision;
}

const evidence = (quote: string, section: string | null) => ({
  quote,
  section,
});

const SPOTIFY_PROPOSAL: GeminiJobRequirementsProposal = {
  experienceRequirements: [
    {
      minimumYears: 3,
      maximumYears: null,
      requirementType: 'REQUIRED',
      evidence: evidence(
        'You are an experienced Backend Engineer with 3+ years of working experience, passionate about delivering high-quality code',
        'Who You Are',
      ),
    },
  ],
  qualifications: [
    ['Java', 'You are proficient in Java, with a desire to expand knowledge into additional languages like Scala'],
    ['distributed systems', 'You have experience with distributed systems, high-volume services, production deployment, big data processing technologies, and system design'],
    ['high-volume services', 'You have experience with distributed systems, high-volume services, production deployment, big data processing technologies, and system design'],
    ['production deployment', 'You have experience with distributed systems, high-volume services, production deployment, big data processing technologies, and system design'],
    ['big-data processing technologies', 'You have experience with distributed systems, high-volume services, production deployment, big data processing technologies, and system design'],
    ['system design', 'You have experience with distributed systems, high-volume services, production deployment, big data processing technologies, and system design'],
    ['APIs', 'You are familiar with APIs, stakeholders, and agile methodologies'],
    ['algorithms', 'Knowledge of algorithms, data structures, and software engineering principles'],
    ['data structures', 'Knowledge of algorithms, data structures, and software engineering principles'],
    ['software-engineering principles', 'Knowledge of algorithms, data structures, and software engineering principles'],
    ['code quality', 'You are a strong advocate for code quality, testing, and automation'],
    ['testing', 'You are a strong advocate for code quality, testing, and automation'],
    ['automation', 'You are a strong advocate for code quality, testing, and automation'],
  ].map(([name, quote]) => ({
    name: name as string,
    requirementType: 'REQUIRED' as const,
    evidence: evidence(quote as string, 'Who You Are'),
  })).concat([
    {
      name: 'data-engineering experience',
      requirementType: 'PREFERRED' as const,
      evidence: evidence(
        'some data engineering experience as a bonus',
        null,
      ),
    },
    {
      name: 'Scala',
      requirementType: 'PREFERRED' as const,
      evidence: evidence(
        'You are proficient in Java, with a desire to expand knowledge into additional languages like Scala',
        'Who You Are',
      ),
    },
  ]),
  degreeRequirements: [],
  certifications: [],
  languages: [],
  salary: {
    currency: 'USD',
    minimum: 132_949,
    maximum: 189_927,
    period: null,
    additionalCompensation: ['equity'],
    evidence: evidence(
      'The United States base range for this position is $132,949.00 - 189,927.00, plus equity.',
      null,
    ),
  },
  workArrangement: {
    setup: null,
    geographicRestrictions: [
      {
        value: 'North America',
        evidence: evidence(
          'For this role, it can be within the North America region in which we have a work location.',
          "Where You'll Be",
        ),
      },
    ],
    collaborationTimezone: {
      value: 'Eastern Standard time zone',
      evidence: evidence(
        'This team operates within the Eastern Standard time zone for collaboration',
        "Where You'll Be",
      ),
    },
    scheduleRequirements: [],
    evidence: [],
  },
  employmentType: null,
  missingOrAmbiguousCriticalInformation: [
    'The salary pay period is not explicit.',
  ],
};

function verify(
  proposal: unknown,
  description = SPOTIFY_BACKEND_ENGINEER_DESCRIPTION,
) {
  return verifyGeminiJobRequirements(
    proposal,
    preprocessJobDescription(description),
    {
      contentHash: 'a'.repeat(64),
      modelIdentifier: 'configured-test-model',
      extractedAt: '2026-07-29T00:00:00.000Z',
      providerMetadata: { country: null },
    },
  );
}

describe('deterministic job-requirements preprocessing', () => {
  it('preserves headings, bullets, section order, and the raw description', () => {
    const raw = `<h2>Who You Are</h2><ul><li>You have 3+ years of experience.</li><li>You are proficient in Java.</li></ul>`;
    const result = preprocessJobDescription(raw);
    expect(result.rawDescription).toBe(raw);
    expect(result.cleanedDescription).toContain(
      'Who You Are\n- You have 3+ years of experience.\n- You are proficient in Java.',
    );
    expect(result.sections[0]).toMatchObject({
      normalizedHeading: 'Who You Are',
      hint: 'REQUIRED_QUALIFICATIONS',
    });
  });

  it('removes script/style content without mutating the retained raw source', () => {
    const raw =
      '<style>.secret{}</style><h2>Requirements</h2><script>alert(1)</script><p>Must know Java.</p>';
    const result = preprocessJobDescription(raw);
    expect(result.rawDescription).toBe(raw);
    expect(result.cleanedDescription).toBe('Requirements\nMust know Java.');
    expect(result.cleanedDescription).not.toContain('alert');
  });

  it('normalizes seconds, milliseconds, and ISO dates and rejects ambiguity', () => {
    expect(normalizeProviderDate(1_786_000_000).iso).toBe(
      new Date(1_786_000_000_000).toISOString(),
    );
    expect(normalizeProviderDate(1_786_000_000_000).iso).toBe(
      new Date(1_786_000_000_000).toISOString(),
    );
    expect(normalizeProviderDate('2026-07-29T08:00:00+08:00').iso).toBe(
      '2026-07-29T00:00:00.000Z',
    );
    expect(normalizeProviderDate('07/29/26')).toMatchObject({
      iso: null,
      status: 'REQUIRES_REVIEW',
    });
    expect(normalizeProviderDate('2026-02-30')).toMatchObject({
      iso: null,
      status: 'REQUIRES_REVIEW',
    });
  });

  it('reuses canonical job URL rules while retaining meaningful job IDs', () => {
    expect(
      normalizeJobSourceUrl(
        'HTTPS://Example.com/jobs/?jobId=123&utm_source=email&ref=x',
      ),
    ).toBe('https://example.com/jobs?jobId=123');
    expect(normalizeJobSourceUrl('file:///etc/passwd')).toBeNull();
  });

  it('parses explicit currencies, ranges, k suffixes, and periods', () => {
    expect(parseExplicitSalary('PHP 35,000 monthly')).toMatchObject({
      currency: 'PHP',
      minimum: 35_000,
      maximum: null,
      period: 'MONTH',
      status: 'VERIFIED',
    });
    expect(parseExplicitSalary('₱25k–₱40k/month')).toMatchObject({
      currency: 'PHP',
      minimum: 25_000,
      maximum: 40_000,
      period: 'MONTH',
    });
    expect(parseExplicitSalary('£45,000 per year')).toMatchObject({
      currency: 'GBP',
      minimum: 45_000,
      period: 'YEAR',
    });
    expect(parseExplicitSalary('$45,000 per year')).toMatchObject({
      currency: null,
      status: 'REQUIRES_REVIEW',
    });
  });
});

describe('strict Gemini proposal and deterministic evidence verification', () => {
  it('rejects unknown structured-output fields', () => {
    expect(
      GeminiJobRequirementsProposalSchema.safeParse({
        ...SPOTIFY_PROPOSAL,
        confidence: 0.99,
      }).success,
    ).toBe(false);
  });

  it('verifies the exact Spotify experience, qualifications, salary, and restrictions', () => {
    const extraction = reconcileVerifiedExtractionWithProvider(
      verify(SPOTIFY_PROPOSAL),
      {
        workSetup: 'REMOTE',
        employmentType: 'FULL_TIME',
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
      },
    );
    expect(extraction.experienceRequirements[0]).toMatchObject({
      minimumYears: 3,
      maximumYears: null,
      requirementType: 'REQUIRED',
      status: 'VERIFIED',
    });
    expect(
      extraction.requiredQualifications
        .filter((item) => item.status === 'VERIFIED')
        .map((item) => item.name),
    ).toEqual([
      'Java',
      'distributed systems',
      'high-volume services',
      'production deployment',
      'big-data processing technologies',
      'system design',
      'APIs',
      'algorithms',
      'data structures',
      'software-engineering principles',
      'code quality',
      'testing',
      'automation',
    ]);
    expect(
      extraction.preferredQualifications
        .filter((item) => item.status === 'VERIFIED')
        .map((item) => item.name),
    ).toEqual(['data-engineering experience', 'Scala']);
    expect(
      [
        ...extraction.requiredQualifications,
        ...extraction.preferredQualifications,
      ].map((item) => item.name),
    ).not.toEqual(
      expect.arrayContaining(['Scio', 'Storm', 'Spark', 'Google Cloud Platform']),
    );
    expect(extraction.salary).toMatchObject({
      currency: 'USD',
      minimum: 132_949,
      maximum: 189_927,
      period: null,
      periodStatus: 'MISSING',
      additionalCompensation: ['equity'],
      status: 'VERIFIED',
    });
    expect(extraction.workArrangement.setup).toMatchObject({
      value: 'REMOTE',
      status: 'VERIFIED',
      source: 'PROVIDER_METADATA',
    });
    expect(extraction.workArrangement.geographicRestrictions[0]).toMatchObject({
      value: 'North America',
      status: 'VERIFIED',
    });
    expect(extraction.workArrangement.collaborationTimezone).toMatchObject({
      value: 'Eastern Standard time zone',
      status: 'VERIFIED',
    });
  });

  it('rejects missing, paraphrased, cross-clause, and conflicting evidence', () => {
    const missing = structuredClone(SPOTIFY_PROPOSAL);
    missing.experienceRequirements[0]!.evidence.quote =
      'The applicant has three years of backend experience';
    expect(verify(missing).experienceRequirements[0]?.status).toBe(
      'REQUIRES_REVIEW',
    );

    const conflict = structuredClone(SPOTIFY_PROPOSAL);
    conflict.experienceRequirements[0]!.minimumYears = 4;
    expect(verify(conflict).experienceRequirements[0]?.status).toBe('CONFLICT');

    const salary = structuredClone(SPOTIFY_PROPOSAL);
    salary.salary!.maximum = 189_972;
    expect(verify(salary).salary.status).toBe('CONFLICT');

    const crossClause = structuredClone(SPOTIFY_PROPOSAL);
    crossClause.experienceRequirements[0]!.evidence.quote =
      'You have at least 3 years of experience. You work with Java';
    const crossClauseResult = verify(
      crossClause,
      'Requirements\nYou have at least 3 years of experience. You work with Java.',
    );
    expect(crossClauseResult.experienceRequirements[0]?.status).toBe(
      'REQUIRES_REVIEW',
    );
  });

  it('does not accept another team technology or responsibilities as requirements', () => {
    const proposal: GeminiJobRequirementsProposal = {
      ...SPOTIFY_PROPOSAL,
      experienceRequirements: [],
      qualifications: [
        {
          name: 'React',
          requirementType: 'REQUIRED',
          evidence: evidence(
            'Our engineering team uses React',
            'About Us',
          ),
        },
      ],
      salary: null,
      workArrangement: {
        setup: null,
        geographicRestrictions: [],
        collaborationTimezone: null,
        scheduleRequirements: [],
        evidence: [],
      },
    };
    const result = verify(
      proposal,
      'About Us\nOur engineering team uses React\nResponsibilities\nBuild customer relationships.',
    );
    expect(result.requiredQualifications[0]?.status).toBe('REQUIRES_REVIEW');
    expect(result.requiredQualifications[0]?.affectedScoring).toBe(false);
  });

  it('keeps preferred skills separate from mandatory scoring inputs', () => {
    const proposal = structuredClone(SPOTIFY_PROPOSAL);
    proposal.qualifications = [
      {
        name: 'Scala',
        requirementType: 'PREFERRED',
        evidence: evidence(
          'You are proficient in Java, with a desire to expand knowledge into additional languages like Scala',
          'Who You Are',
        ),
      },
    ];
    const result = verify(proposal);
    expect(result.requiredQualifications).toHaveLength(0);
    expect(result.preferredQualifications[0]).toMatchObject({
      name: 'Scala',
      status: 'VERIFIED',
      affectedScoring: false,
    });
  });

  it('covers two additional saved-job layouts without company special cases', () => {
    const lawn = preprocessJobDescription(LAWNSTARTER_REQUIREMENTS_FIXTURE);
    expect(lawn.sections.map((section) => section.normalizedHeading)).toEqual([
      null,
      'Requirements',
      'Who You Are',
      "Tech You'll Touch",
      'Compensation',
    ]);
    expect(parseExplicitSalary(lawn.cleanedDescription)).toMatchObject({
      currency: 'USD',
      minimum: 80_000,
      maximum: 100_000,
      period: 'YEAR',
    });

    const aTeam = preprocessJobDescription(A_TEAM_REQUIREMENTS_FIXTURE);
    expect(aTeam.cleanedDescription).toContain(
      'You must be located in the Americas, Europe, or Israel to apply.',
    );
    expect(parseExplicitSalary('$90-$150+/hr', { country: 'US' })).toMatchObject(
      {
        currency: 'USD',
        minimum: 90,
        maximum: 150,
        period: 'HOUR',
      },
    );
  });

  it('keeps the exact Spotify raw description byte-identical', () => {
    expect(
      preprocessJobDescription(SPOTIFY_BACKEND_ENGINEER_DESCRIPTION)
        .rawDescription,
    ).toBe(SPOTIFY_BACKEND_ENGINEER_DESCRIPTION);
  });
});

describe('timezone display canonicalization', () => {
  it('canonicalizes Eastern Standard without changing its source evidence', () => {
    const raw =
      'Location\nThis team operates within the Eastern Standard time zone for collaboration.';
    const prepared = preprocessJobDescription(raw);
    const candidates = enumerateJobRequirementCandidates(prepared);
    const timezoneCandidate = candidates.find((candidate) =>
      candidate.evidence.includes('Eastern Standard time zone'),
    );
    expect(timezoneCandidate).toBeDefined();
    const decisions = candidates.map((candidate) =>
      candidate.candidateId === timezoneCandidate?.candidateId
        ? {
            candidateId: candidate.candidateId,
            classification: 'TIMEZONE_REQUIREMENT' as const,
            collaborationTimezone: 'Eastern Standard',
          }
        : ignoredCandidate(candidate),
    );

    const extraction = verifyGeminiCandidateClassifications(
      { decisions },
      prepared,
      {
        candidates,
        contentHash: 'e'.repeat(64),
        modelIdentifier: 'test-model',
        extractedAt: '2026-08-01T00:00:00.000Z',
      },
    );

    expect(extraction.workArrangement.collaborationTimezone).toMatchObject({
      value: 'Eastern Standard Time',
      status: 'VERIFIED',
      evidence: {
        quote:
          'This team operates within the Eastern Standard time zone for collaboration.',
      },
    });
  });

  it('canonicalizes EST only when its evidence explicitly identifies a timezone', () => {
    expect(
      canonicalizeTimezoneDisplayValue(
        'EST',
        'Collaboration follows the EST time zone.',
      ),
    ).toBe('Eastern Standard Time');
    expect(
      canonicalizeTimezoneDisplayValue('EST', 'The delivery estimate is EST.'),
    ).toBe('EST');
    expect(
      canonicalizeTimezoneDisplayValue(
        'Eastern Standard',
        'Eastern Standard collaboration hours.',
      ),
    ).toBe('Eastern Standard Time');
  });
});

describe('candidate-first Spotify verification', () => {
  it('keeps explicit applicant experience required when Gemini labels it preferred', () => {
    const prepared = preprocessJobDescription(
      'Requirements\n- You have 4+ years of experience.',
    );
    const candidates = enumerateJobRequirementCandidates(prepared);
    const experienceCandidate = candidates.find((candidate) =>
      candidate.possibleTypes.includes('EXPERIENCE'),
    );
    expect(experienceCandidate).toBeDefined();
    const decisions = candidates.map((candidate) =>
      candidate.candidateId === experienceCandidate?.candidateId
        ? {
            candidateId: candidate.candidateId,
            classification: 'PREFERRED' as const,
          }
        : ignoredCandidate(candidate),
    );
    const extraction = verifyGeminiCandidateClassifications(
      { decisions },
      prepared,
      {
        candidates,
        contentHash: '1'.repeat(64),
        modelIdentifier: 'test-model',
        extractedAt: '2026-08-01T00:00:00.000Z',
      },
    );

    expect(extraction.experienceRequirements).toContainEqual(
      expect.objectContaining({
        minimumYears: 4,
        maximumYears: null,
        requirementType: 'REQUIRED',
        status: 'VERIFIED',
        reasonCode: 'VERIFIED_EXACT_EVIDENCE',
        affectedScoring: true,
      }),
    );
    expect(extraction.reviewItems).not.toContainEqual(
      expect.objectContaining({ category: 'EXPERIENCE' }),
    );
  });

  it('does not make responsibility, company, or third-party experience automatically required', () => {
    const cases = [
      'Responsibilities\n- 4+ years of experience.',
      'About Us\nOur company has 4+ years of experience.',
      'Requirements\n- Engineers have 4+ years of experience.',
    ];
    for (const [index, raw] of cases.entries()) {
      const prepared = preprocessJobDescription(raw);
      const candidates = enumerateJobRequirementCandidates(prepared);
      const experienceCandidate = candidates.find((candidate) =>
        candidate.possibleTypes.includes('EXPERIENCE'),
      );
      expect(experienceCandidate).toBeDefined();
      const decisions = candidates.map((candidate) =>
        candidate.candidateId === experienceCandidate?.candidateId
          ? {
              candidateId: candidate.candidateId,
              classification: 'REQUIRED' as const,
            }
          : ignoredCandidate(candidate),
      );
      const extraction = verifyGeminiCandidateClassifications(
        { decisions },
        prepared,
        {
          candidates,
          contentHash: String(index + 2).repeat(64),
          modelIdentifier: 'test-model',
          extractedAt: '2026-08-01T00:00:00.000Z',
        },
      );
      expect(extraction.experienceRequirements[0]).toMatchObject({
        requirementType: null,
        status: 'REQUIRES_REVIEW',
        affectedScoring: false,
      });
    }
  });

  it('keeps unnamed unsupported candidates audit-only', () => {
    const prepared = preprocessJobDescription(
      'Requirements\n- You must know ImaginaryDB.',
    );
    const candidates = enumerateJobRequirementCandidates(prepared);
    const requirementCandidate = candidates.find((candidate) =>
      candidate.evidence.includes('ImaginaryDB'),
    );
    const decisions = candidates.map((candidate) =>
      candidate.candidateId === requirementCandidate?.candidateId
        ? {
            candidateId: candidate.candidateId,
            classification: 'REQUIRED' as const,
          }
        : ignoredCandidate(candidate),
    );
    const extraction = verifyGeminiCandidateClassifications(
      { decisions },
      prepared,
      {
        candidates,
        contentHash: '5'.repeat(64),
        modelIdentifier: 'test-model',
        extractedAt: '2026-08-01T00:00:00.000Z',
      },
    );

    expect(extraction.reviewItems).toEqual([
      expect.objectContaining({
        candidateId: requirementCandidate?.candidateId,
        category: 'QUALIFICATION',
        reasonCode: 'UNSUPPORTED_SKILL_ALIAS',
        audience: 'AUDIT',
        normalizedLabel: null,
      }),
    ]);
    expect(extraction.reviewItems.some((item) => item.audience === 'USER')).toBe(
      false,
    );
  });

  it('owns scalar values locally and accounts for every ordered candidate', () => {
    const prepared = preprocessJobDescription(SPOTIFY_BACKEND_ENGINEER_DESCRIPTION);
    const candidates = enumerateJobRequirementCandidates(prepared, {
      workSetup: 'REMOTE',
    });
    const decisions = candidates.map(spotifyCandidateDecision);
    const extraction = verifyGeminiCandidateClassifications(
      { decisions },
      prepared,
      {
        candidates,
        contentHash: 'b'.repeat(64),
        modelIdentifier: 'gemini-3.5-flash-lite',
        extractedAt: '2026-07-31T00:00:00.000Z',
        providerMetadata: { country: null, workSetup: 'REMOTE' },
      },
    );

    expect(extraction.candidateAudit.map((item) => item.candidateId)).toEqual(
      candidates.map((item) => item.candidateId),
    );
    expect(extraction.experienceRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          minimumYears: 3,
          maximumYears: null,
          requirementType: 'REQUIRED',
          status: 'VERIFIED',
        }),
      ]),
    );
    expect(
      extraction.requiredQualifications
        .filter((item) => item.status === 'VERIFIED')
        .map((item) => item.name),
    ).toEqual([
      'Java',
      'code quality',
      'testing',
      'automation',
      'distributed systems',
      'high-volume services',
      'production deployment',
      'big-data processing technologies',
      'system design',
      'APIs',
      'algorithms',
      'data structures',
      'software-engineering principles',
    ]);
    expect(
      extraction.preferredQualifications
        .filter((item) => item.status === 'VERIFIED')
        .map((item) => item.name),
    ).toEqual(['data-engineering experience', 'Scala']);
    expect([
      ...extraction.requiredQualifications,
      ...extraction.preferredQualifications,
    ].map((item) => item.name)).not.toEqual(
      expect.arrayContaining(['Scio', 'Storm', 'Spark', 'Google Cloud Platform']),
    );
    expect(extraction.salary).toMatchObject({
      currency: 'USD',
      minimum: 132_949,
      maximum: 189_927,
      additionalCompensation: ['equity'],
      currencyStatus: 'VERIFIED',
      minimumStatus: 'VERIFIED',
      maximumStatus: 'VERIFIED',
      periodStatus: 'MISSING',
      additionalCompensationStatus: 'VERIFIED',
      status: 'PARTIAL',
    });
    expect(extraction.workArrangement.geographicRestrictions[0]).toMatchObject({
      value: 'North America',
      status: 'VERIFIED',
    });
    expect(extraction.workArrangement.collaborationTimezone).toMatchObject({
      value: 'Eastern Standard time zone',
      status: 'VERIFIED',
    });
  });

  it('keeps an unsupported period field-level review without invalidating verified salary numbers', () => {
    const raw = 'Compensation\nThe United States base salary is $100,000 - 120,000.';
    const prepared = preprocessJobDescription(raw);
    const candidates = enumerateJobRequirementCandidates(prepared);
    const decisions = candidates.map((candidate) => ({
      ...ignoredCandidate(candidate),
      ...(candidate.evidence.includes('$100,000')
        ? {
            classification: 'COMPENSATION' as const,
            salarySemantics: { compensationType: 'BASE_SALARY' as const, period: 'YEAR' as const },
          }
        : {}),
    }));
    const extraction = verifyGeminiCandidateClassifications(
      { decisions },
      prepared,
      {
        candidates,
        contentHash: 'c'.repeat(64),
        modelIdentifier: 'test-model',
        extractedAt: '2026-07-31T00:00:00.000Z',
        providerMetadata: {},
      },
    );
    expect(extraction.salary).toMatchObject({
      minimum: 100_000,
      maximum: 120_000,
      minimumStatus: 'VERIFIED',
      maximumStatus: 'VERIFIED',
      period: null,
      periodStatus: 'REQUIRES_REVIEW',
      status: 'PARTIAL',
    });
    expect(extraction.salary.status).not.toBe('CONFLICT');
  });

  it('does not allow separate candidates or responsibility technologies to create requirements', () => {
    const raw = [
      'Responsibilities',
      '- Build pipelines with Spark.',
      'Requirements',
      '- You are proficient in Java.',
      '- You must know ImaginaryDB.',
    ].join('\n');
    const prepared = preprocessJobDescription(raw);
    const candidates = enumerateJobRequirementCandidates(prepared);
    const decisions = candidates.map((candidate) => {
      if (candidate.evidence.includes('Spark')) {
        return { ...ignoredCandidate(candidate), classification: 'RESPONSIBILITY' as const };
      }
      if (candidate.evidence.includes('Java')) {
        return { ...ignoredCandidate(candidate), classification: 'REQUIRED' as const };
      }
      if (candidate.evidence.includes('ImaginaryDB')) {
        return { ...ignoredCandidate(candidate), classification: 'REQUIRED' as const };
      }
      return ignoredCandidate(candidate);
    });
    const extraction = verifyGeminiCandidateClassifications(
      { decisions },
      prepared,
      {
        candidates,
        contentHash: 'd'.repeat(64),
        modelIdentifier: 'test-model',
        extractedAt: '2026-07-31T00:00:00.000Z',
      },
    );
    expect(extraction.requiredQualifications.map((item) => item.name)).toEqual(['Java']);
    expect(extraction.requiredQualifications.map((item) => item.name)).not.toContain('ImaginaryDB');
    const responsibilityCandidate = candidates.find((candidate) =>
      candidate.evidence.includes('Spark'),
    );
    expect(
      extraction.candidateAudit.find(
        (item) => item.candidateId === responsibilityCandidate?.candidateId,
      )?.classification,
    ).toBe('RESPONSIBILITY');
    expect(
      extraction.reviewItems.some(
        (item) => item.audience === 'AUDIT' && item.normalizedLabel === null,
      ),
    ).toBe(true);
  });

  it('deduplicates exact restrictions, rejects invented broad regions, and preserves long-list review', () => {
    const raw = [
      'Location',
      'Applicants must be located in France or Germany.',
    ].join('\n');
    const prepared = preprocessJobDescription(raw);
    const candidates = enumerateJobRequirementCandidates(prepared);
    const locationCandidate = candidates.find((candidate) =>
      candidate.possibleTypes.includes('LOCATION'),
    );
    expect(locationCandidate).toBeDefined();
    const decisions = candidates.map((candidate) =>
      candidate.candidateId === locationCandidate?.candidateId
        ? {
            candidateId: candidate.candidateId,
            classification: 'LOCATION_RESTRICTION' as const,
            workSetup: null,
            geographicRestrictions: ['France', 'France', 'Germany', 'Europe'],
          }
        : ignoredCandidate(candidate),
    );
    const extraction = verifyGeminiCandidateClassifications(
      { decisions },
      prepared,
      {
        candidates,
        contentHash: '7'.repeat(64),
        modelIdentifier: 'test-model',
        extractedAt: '2026-08-01T00:00:00.000Z',
      },
    );
    expect(
      extraction.workArrangement.geographicRestrictions
        .filter((item) => item.status === 'VERIFIED')
        .map((item) => item.value),
    ).toEqual(['France', 'Germany']);
    expect(
      extraction.workArrangement.geographicRestrictions.find(
        (item) => item.value === 'Europe',
      ),
    ).toMatchObject({ status: 'REQUIRES_REVIEW' });

    const longListDecisions = candidates.map((candidate) =>
      candidate.candidateId === locationCandidate?.candidateId
        ? {
            candidateId: candidate.candidateId,
            classification: 'REQUIRES_REVIEW' as const,
          }
        : ignoredCandidate(candidate),
    );
    const longList = verifyGeminiCandidateClassifications(
      { decisions: longListDecisions },
      prepared,
      {
        candidates,
        contentHash: '8'.repeat(64),
        modelIdentifier: 'test-model',
        extractedAt: '2026-08-01T00:00:00.000Z',
      },
    );
    expect(
      longList.candidateAudit.find(
        (item) => item.candidateId === locationCandidate?.candidateId,
      ),
    ).toMatchObject({
      classification: 'REQUIRES_REVIEW',
      status: 'REQUIRES_REVIEW',
    });
    expect(longList.workArrangement.geographicRestrictions).toEqual([]);
    expect(longList.reviewItems).toContainEqual(
      expect.objectContaining({
        candidateId: locationCandidate?.candidateId,
        category: 'LOCATION',
        audience: 'USER',
      }),
    );
  });

  it('keeps the saved LawnStarter and A.Team layouts fail-closed under the shared candidate schema', () => {
    const lawnPrepared = preprocessJobDescription(LAWNSTARTER_REQUIREMENTS_FIXTURE);
    const lawnCandidates = enumerateJobRequirementCandidates(lawnPrepared);
    const lawnDecisions = lawnCandidates.map((candidate) => {
      if (candidate.evidence.includes('AI-native.')) {
        return {
          ...ignoredCandidate(candidate),
          classification: 'REQUIRED' as const,
        };
      }
      if (candidate.evidence.includes('USD $80,000')) {
        return {
          ...ignoredCandidate(candidate),
          classification: 'COMPENSATION' as const,
          salarySemantics: { compensationType: 'BASE_SALARY' as const, period: 'YEAR' as const },
        };
      }
      if (candidate.evidence.includes('located in Belo Horizonte')) {
        return {
          ...ignoredCandidate(candidate),
          classification: 'LOCATION_RESTRICTION' as const,
          workSetup: 'REMOTE' as const,
          geographicRestrictions: ['Belo Horizonte, Brazil'],
        };
      }
      return ignoredCandidate(candidate);
    });
    const lawn = verifyGeminiCandidateClassifications(
      { decisions: lawnDecisions },
      lawnPrepared,
      {
        candidates: lawnCandidates,
        contentHash: 'e'.repeat(64),
        modelIdentifier: 'test-model',
        extractedAt: '2026-07-31T00:00:00.000Z',
        providerMetadata: { country: 'Brazil', workSetup: 'REMOTE' },
      },
    );
    expect(lawn.requiredQualifications.map((item) => item.name)).not.toContain('Claude Code');
    expect(lawn.reviewItems.some((item) => item.audience === 'AUDIT')).toBe(true);
    expect(lawn.salary).toMatchObject({
      currency: 'USD',
      minimum: 80_000,
      maximum: 100_000,
      period: 'YEAR',
      status: 'VERIFIED',
    });

    const aTeamPrepared = preprocessJobDescription(A_TEAM_REQUIREMENTS_FIXTURE);
    const aTeamCandidates = enumerateJobRequirementCandidates(aTeamPrepared);
    const aTeamDecisions = aTeamCandidates.map((candidate) => {
      if (candidate.evidence.includes('must be located')) {
        return {
          ...ignoredCandidate(candidate),
          classification: 'LOCATION_RESTRICTION' as const,
          workSetup: null,
          geographicRestrictions: ['Americas', 'Europe', 'Israel'],
        };
      }
      if (candidate.evidence.includes('$90-$150')) {
        return {
          ...ignoredCandidate(candidate),
          classification: 'COMPENSATION' as const,
          salarySemantics: { compensationType: 'BASE_SALARY' as const, period: 'HOUR' as const },
        };
      }
      return ignoredCandidate(candidate);
    });
    const aTeam = verifyGeminiCandidateClassifications(
      { decisions: aTeamDecisions },
      aTeamPrepared,
      {
        candidates: aTeamCandidates,
        contentHash: 'f'.repeat(64),
        modelIdentifier: 'test-model',
        extractedAt: '2026-07-31T00:00:00.000Z',
      },
    );
    expect(aTeam.salary.currencyStatus).toBe('REQUIRES_REVIEW');
    expect(aTeam.salary.status).toBe('PARTIAL');
    expect(aTeam.experienceRequirements).toHaveLength(0);
    expect(aTeam.workArrangement.geographicRestrictions.filter((item) => item.status === 'VERIFIED').map((item) => item.value)).toEqual([
      'Americas',
      'Europe',
      'Israel',
    ]);
  });
});
