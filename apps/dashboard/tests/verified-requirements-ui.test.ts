import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { VerifiedJobRequirementsExtraction } from '@job-app/ingestion/job-requirements-contracts';
import {
  getUserFacingRequirementReviewMessages,
  VerifiedRequirementsSummary,
} from '../src/components/VerifiedRequirementsSummary';

const extraction: VerifiedJobRequirementsExtraction = {
  schemaVersion: 2,
  contentHash: 'a'.repeat(64),
  modelIdentifier: 'safe-model-label',
  extractedAt: '2026-07-29T00:00:00.000Z',
  extractionStatus: 'PARTIAL',
  extractionFailureReason: null,
  candidateAudit: [],
  experienceRequirements: [
    {
      minimumYears: 3,
      maximumYears: null,
      requirementType: 'REQUIRED',
      status: 'VERIFIED',
      source: 'DESCRIPTION_GEMINI_VERIFIED',
      reasonCode: 'VERIFIED_EXACT_EVIDENCE',
      evidence: {
        quote: '3+ years of working experience',
        section: 'Who You Are',
      },
      affectedScoring: true,
    },
  ],
  requiredQualifications: [
    {
      name: 'Java',
      requirementType: 'REQUIRED',
      status: 'VERIFIED',
      source: 'DESCRIPTION_GEMINI_VERIFIED',
      reasonCode: 'VERIFIED_EXACT_EVIDENCE',
      evidence: {
        quote: 'You are proficient in Java',
        section: 'Who You Are',
      },
      affectedScoring: true,
    },
  ],
  preferredQualifications: [],
  degreeRequirements: [],
  certifications: [],
  languages: [],
  salary: {
    currency: 'USD',
    minimum: 132_949,
    maximum: 189_927,
    period: null,
    additionalCompensation: ['equity'],
    currencyStatus: 'VERIFIED',
    minimumStatus: 'VERIFIED',
    maximumStatus: 'VERIFIED',
    periodStatus: 'MISSING',
    additionalCompensationStatus: 'VERIFIED',
    status: 'PARTIAL',
    source: 'DESCRIPTION_GEMINI_VERIFIED',
    reasonCode: 'VERIFIED_EXACT_EVIDENCE',
    evidence: {
      quote:
        'The United States base range for this position is $132,949.00 - 189,927.00, plus equity.',
      section: null,
    },
    affectedScoring: false,
  },
  workArrangement: {
    setup: {
      value: 'REMOTE',
      status: 'VERIFIED',
      source: 'PROVIDER_METADATA',
      reasonCode: 'VERIFIED_PROVIDER_METADATA',
      evidence: null,
      affectedScoring: true,
    },
    geographicRestrictions: [
      {
        value: 'North America',
        status: 'VERIFIED',
        source: 'DESCRIPTION_GEMINI_VERIFIED',
        reasonCode: 'VERIFIED_EXACT_EVIDENCE',
        evidence: {
          quote: 'within the North America region',
          section: "Where You'll Be",
        },
        affectedScoring: true,
      },
    ],
    collaborationTimezone: {
      value: 'Eastern Standard time zone',
      status: 'VERIFIED',
      source: 'DESCRIPTION_GEMINI_VERIFIED',
      reasonCode: 'VERIFIED_EXACT_EVIDENCE',
      evidence: {
        quote: 'Eastern Standard time zone for collaboration',
        section: "Where You'll Be",
      },
      affectedScoring: false,
    },
    scheduleRequirements: [],
  },
  employmentType: {
    value: 'FULL_TIME',
    status: 'VERIFIED',
    source: 'PROVIDER_METADATA',
    reasonCode: 'VERIFIED_PROVIDER_METADATA',
    evidence: null,
    affectedScoring: false,
  },
  reviewItems: [
    {
      candidateId: 'compensation-01',
      category: 'SALARY',
      reasonCode: 'AMBIGUOUS_PERIOD',
      audience: 'USER',
      normalizedLabel: 'Salary',
    },
  ],
};

describe('verified requirements dashboard presentation', () => {
  it('renders verified values, evidence, provenance, and scoring impact without provider diagnostics', () => {
    const html = renderToStaticMarkup(
      React.createElement(VerifiedRequirementsSummary, { extraction }),
    );
    expect(html).toContain('3+ years');
    expect(html).toContain('Java');
    expect(html).toContain('USD 132,949–189,927 plus equity');
    expect(html).toContain('North America');
    expect(html).toContain('Eastern Standard time zone');
    expect(html).toContain('Used in scoring');
    expect(html).toContain('DESCRIPTION GEMINI VERIFIED');
    expect(html).not.toContain('safe-model-label');
    expect(html).not.toContain('GEMINI_API_KEY');
  });

  it('hides audit-only candidate IDs and deduplicates meaningful review messages', () => {
    const withReviews: VerifiedJobRequirementsExtraction = {
      ...extraction,
      reviewItems: [
        {
          candidateId: 'requirements-01',
          category: 'QUALIFICATION',
          reasonCode: 'UNSUPPORTED_SKILL_ALIAS',
          audience: 'AUDIT',
          normalizedLabel: null,
        },
        {
          candidateId: 'requirements-02',
          category: 'QUALIFICATION',
          reasonCode: 'UNSUPPORTED_SKILL_ALIAS',
          audience: 'USER',
          normalizedLabel: 'ImaginaryDB',
        },
        {
          candidateId: 'requirements-03',
          category: 'QUALIFICATION',
          reasonCode: 'REQUIREMENT_TYPE_AMBIGUOUS',
          audience: 'USER',
          normalizedLabel: 'Java',
        },
        {
          candidateId: 'requirements-03',
          category: 'QUALIFICATION',
          reasonCode: 'REQUIREMENT_TYPE_AMBIGUOUS',
          audience: 'USER',
          normalizedLabel: 'Java',
        },
        {
          candidateId: 'compensation-01',
          category: 'SALARY',
          reasonCode: 'AMBIGUOUS_CURRENCY',
          audience: 'USER',
          normalizedLabel: 'Salary',
        },
        {
          candidateId: 'compensation-01',
          category: 'SALARY',
          reasonCode: 'AMBIGUOUS_PERIOD',
          audience: 'USER',
          normalizedLabel: 'Salary',
        },
      ],
    };
    const messages = getUserFacingRequirementReviewMessages(withReviews);
    const html = renderToStaticMarkup(
      React.createElement(VerifiedRequirementsSummary, {
        extraction: withReviews,
      }),
    );

    expect(messages.map((item) => item.message)).toEqual([
      'ImaginaryDB needs review.',
      'Java needs review.',
      'Salary range detected, but currency or pay period requires review.',
    ]);
    expect(html).not.toContain('requirements-01');
    expect(html).not.toContain('Candidate requirements-');
    expect(html.match(/ImaginaryDB needs review\./g)).toHaveLength(1);
    expect(html.match(/Java needs review\./g)).toHaveLength(1);
    expect(
      html.match(
        /Salary range detected, but currency or pay period requires review\./g,
      ),
    ).toHaveLength(1);
  });
});
