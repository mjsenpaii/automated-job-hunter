import type { SkillEntry } from '@job-app/core';
import { describe, expect, it } from 'vitest';
import {
  assessFreelanceReadiness,
  assessFreelanceRisk,
  buildFreelanceOpportunity,
  diagnoseFreelanceOpportunityReadiness,
  deriveFreelanceOpportunityCategories,
  deriveFreelanceViews,
  normalizeFreelancePay,
  scoreFreelanceOpportunity,
  truthfulFreelancePreparationWording,
} from '../src/freelance/classification.js';
import type {
  FreelanceOpportunityCandidate,
  FreelanceRiskAssessment,
} from '../src/freelance/contracts.js';

const NOW = new Date('2026-08-01T03:00:00.000Z');

function skill(name: string): SkillEntry {
  return {
    name,
    category: 'other',
    proficiency: 'intermediate',
    verification_status: 'VERIFIED',
    source: 'USER_CONFIRMED',
    source_reference: 'freelance-readiness-fixture',
    evidence_level: 'personal_project',
    allowed_in_resume: true,
  };
}

function candidate(overrides: Partial<FreelanceOpportunityCandidate> = {}): FreelanceOpportunityCandidate {
  const canonicalUrl = overrides.canonicalUrl ?? 'https://client.example/projects/wordpress-landing-page';
  return {
    source: 'MANUAL',
    sourceIdentifier: 'fixture-opportunity',
    canonicalUrl,
    title: 'WordPress landing page update',
    clientOrCompany: 'Example Client',
    publicDescription: 'Update one small WordPress landing page using supplied copy and design references. Configure the contact form, verify the responsive layout, document the changes, and provide one practice preview before delivery.',
    publishedAt: NOW.toISOString(),
    expiresAt: null,
    clientCountry: 'United States',
    applicantGeographicRestrictions: ['Worldwide'],
    timezoneRestrictions: [],
    remote: true,
    contractType: 'PROJECT',
    pay: normalizeFreelancePay({ kind: 'HOURLY', currency: 'USD', minimum: 8, maximum: 12, period: 'HOUR' }),
    requiredSkills: ['WordPress'],
    preferredSkills: [],
    minimumExperienceYears: null,
    seniority: [],
    categoryHints: ['Technical Quick Wins'],
    sourceAttributions: [{
      source: 'MANUAL',
      sourceIdentifier: 'fixture-opportunity',
      sourceUrl: canonicalUrl,
      costClassification: 'MANUAL_PUBLIC_URL',
    }],
    ...overrides,
  };
}

const lowRisk: FreelanceRiskAssessment = {
  level: 'LOW',
  reasons: [],
  displayMessage: null,
};

describe('freelance pay and view classification', () => {
  it('uses a strict greater-than USD 3 hourly comparison', () => {
    expect(normalizeFreelancePay({ kind: 'HOURLY', currency: 'USD', minimum: 3, period: 'HOUR' }).classification).toBe('BELOW_MINIMUM');
    expect(normalizeFreelancePay({ kind: 'HOURLY', currency: 'USD', minimum: 3.01, period: 'HOUR' }).classification).toBe('ABOVE_MINIMUM');
  });

  it('does not convert non-USD, guess fixed-price hours, or hide unknown pay in the domain', () => {
    const nonUsd = normalizeFreelancePay({ kind: 'HOURLY', currency: 'PHP', minimum: 300, period: 'HOUR' });
    const fixed = normalizeFreelancePay({ kind: 'FIXED_PRICE', currency: 'USD', minimum: 100 });
    const unknown = normalizeFreelancePay({ kind: 'UNKNOWN' });
    expect(nonUsd.classification).toBe('NON_USD_UNCONVERTED');
    expect(nonUsd.estimatedEffectiveHourlyRate).toBeNull();
    expect(fixed.classification).toBe('FIXED_PRICE_SCOPE_REQUIRED');
    expect(fixed.estimatedEffectiveHourlyRate).toBeNull();
    expect(unknown.classification).toBe('UNKNOWN');
  });

  it('allows overlapping Philippines, international-client, and worldwide views without duplication', () => {
    expect(deriveFreelanceViews(candidate())).toEqual([
      'PHILIPPINES',
      'INTERNATIONAL_CLIENTS',
      'WORLDWIDE_REMOTE',
    ]);
  });

  it('assigns only deterministic curated beginner categories', () => {
    expect(deriveFreelanceOpportunityCategories(candidate())).toContain('TECHNICAL_QUICK_WINS');
    expect(deriveFreelanceOpportunityCategories(candidate({
      title: 'n8n workflow automation project',
      publicDescription: `${candidate().publicDescription} Configure one n8n workflow from documented API endpoints.`,
    }))).toContain('AI_AUTOMATION');
  });
});

describe('LEARNABLE FAST WITH AI boundaries', () => {
  it('accepts a narrow adjacent gap and supplies a bounded deterministic practice plan', () => {
    const result = assessFreelanceReadiness({
      candidate: candidate(),
      verifiedSkills: [skill('HTML'), skill('CSS')],
      risk: lowRisk,
    });
    expect(result.classification).toBe('LEARNABLE_FAST_WITH_AI');
    expect(result.transferableSkills).toContain('HTML');
    expect(result.missingSkills).toEqual(['WordPress']);
    expect(result.learningHoursMinimum).toBeGreaterThanOrEqual(4);
    expect(result.learningHoursMaximum).toBeLessThanOrEqual(24);
    expect(result.suggestedSampleProject).toContain('WordPress landing page');
    expect(result.applicationReady).toBe(false);
  });

  it('does not restrict bounded general work to skills already possessed', () => {
    const value = candidate({
      title: 'Small product listing project',
      publicDescription: 'Upload and format ten supplied product listings in one documented CMS. Validate the supplied spreadsheet fields, check image dimensions, preview every listing, and document any missing source data before delivery.',
      requiredSkills: ['Product listing'],
      categoryHints: ['General Learnable Work'],
    });
    const result = assessFreelanceReadiness({
      candidate: value,
      verifiedSkills: [skill('Data entry')],
      risk: lowRisk,
    });
    expect(result.classification).toBe('LEARNABLE_FAST_WITH_AI');
    expect(result.missingSkills).toEqual(['Product listing']);
    expect(result.transferableSkills).toContain('Data entry');
  });

  it.each([
    ['Manual QA', 'HTML', 'Test one small website flow and format a bounded bug report using the supplied acceptance checklist.'],
    ['Google Sheets', 'Excel', 'Clean one supplied spreadsheet, configure formulas, test validation rules, and document the result.'],
    ['Web research', 'Data entry', 'Research one bounded public topic, format the supplied fields, validate each source, and document duplicates.'],
    ['Data entry', 'Excel', 'Enter one supplied dataset, clean the rows, test validation rules, and document incomplete source fields.'],
    ['CMS', 'HTML', 'Upload supplied copy to one CMS page, format the content, test links, and document the preview.'],
    ['REST APIs', 'JavaScript', 'Integrate one documented public API, test success and failure responses, and document the setup.'],
    ['n8n', 'REST APIs', 'Configure one small n8n workflow from documented endpoints, test failures, and document the setup.'],
    ['Data labeling', 'Manual QA', 'Label one small public dataset, test the supplied rubric, and document the quality review.'],
    ['Transcription', 'Technical writing', 'Clean one short transcript, format captions, test timing, and document corrections.'],
  ])('recognizes a bounded adjacent %s gap without claiming the skill is already possessed', (missingSkill, verifiedSkill, description) => {
    const result = assessFreelanceReadiness({
      candidate: candidate({
        title: `Small ${missingSkill} task`,
        publicDescription: `${description} A truthful practice sample can be prepared before applying. The client supplied clear acceptance criteria and a small bounded deliverable.`,
        requiredSkills: [missingSkill],
      }),
      verifiedSkills: [skill(verifiedSkill)],
      risk: lowRisk,
    });
    expect(result.classification).toBe('LEARNABLE_FAST_WITH_AI');
    expect(result.missingSkills).toEqual([missingSkill]);
    expect(result.transferableSkills).toContain(verifiedSkill);
    expect(result.learningHoursMinimum).toBeGreaterThanOrEqual(4);
    expect(result.learningHoursMaximum).toBeLessThanOrEqual(24);
  });

  it('does not treat AI availability as skill adjacency', () => {
    const result = assessFreelanceReadiness({
      candidate: candidate({
        title: 'Use AI to become a WordPress expert for a client project',
        publicDescription: `${candidate().publicDescription} AI will generate instructions and code for the selected freelancer.`,
      }),
      verifiedSkills: [skill('Web research')],
      risk: lowRisk,
    });
    expect(result.classification).toBe('NOT_READY');
  });

  it.each([
    ['material experience', candidate({ minimumExperienceYears: 3 })],
    ['mandatory certification', candidate({ publicDescription: `${candidate().publicDescription} A WordPress certification is required before taking ownership.` })],
    ['senior ownership', candidate({ title: 'Senior WordPress Production Owner' })],
  ])('keeps %s outside learnable-fast', (_label, value) => {
    const result = assessFreelanceReadiness({
      candidate: value,
      verifiedSkills: [skill('HTML')],
      risk: lowRisk,
    });
    expect(result.classification).toBe('NOT_READY');
    expect(result.applicationReady).toBe(false);
  });

  it('uses the explicit uncertain-learning message state when the bounded task has vague edges', () => {
    const result = assessFreelanceReadiness({
      candidate: candidate({
        publicDescription: `${candidate().publicDescription} The client may request various tasks as needed, with details to be discussed after reviewing the first preview.`,
      }),
      verifiedSkills: [skill('HTML')],
      risk: lowRisk,
    });
    expect(result.classification).toBe('LEARNABLE_FAST_WITH_AI');
    expect(result.learningTimeUncertain).toBe(true);
    expect(result.learningHoursMinimum).toBeNull();
    expect(result.learningHoursMaximum).toBeNull();
    expect(result.recommendedAction).toBe('REVIEW_SCOPE_WITH_CLIENT');
  });

  it('can rank a strong learnable opportunity above a weak ready-now opportunity', () => {
    const learnable = buildFreelanceOpportunity({
      candidate: candidate(),
      verifiedSkills: [skill('HTML')],
      now: NOW,
    });
    const readyCandidate = candidate({
      canonicalUrl: 'https://client.example/projects/basic-html',
      sourceIdentifier: 'ready-fixture',
      title: 'Basic HTML formatting task',
      requiredSkills: ['HTML'],
      pay: normalizeFreelancePay({ kind: 'UNKNOWN' }),
      sourceAttributions: [{
        source: 'MANUAL', sourceIdentifier: 'ready-fixture',
        sourceUrl: 'https://client.example/projects/basic-html',
        costClassification: 'MANUAL_PUBLIC_URL',
      }],
    });
    const ready = buildFreelanceOpportunity({ candidate: readyCandidate, verifiedSkills: [skill('HTML')], now: NOW });
    expect(learnable.readiness.classification).toBe('LEARNABLE_FAST_WITH_AI');
    expect(ready.readiness.classification).toBe('READY_NOW');
    expect(scoreFreelanceOpportunity({ candidate: learnable, readiness: learnable.readiness, risk: learnable.risk, now: NOW }))
      .toBeGreaterThan(scoreFreelanceOpportunity({ candidate: ready, readiness: ready.readiness, risk: ready.risk, now: NOW }));
  });

  it('keeps truthful wording from converting a learnable gap into claimed experience', () => {
    const wording = truthfulFreelancePreparationWording({
      transferableSkills: ['REST APIs'],
      missingSkills: ['n8n'],
      samplePrepared: true,
    }).join(' ');
    expect(wording).toContain('direct experience with n8n is limited');
    expect(wording).not.toMatch(/expert|years of experience|similar client projects|already know/i);
  });
});

describe('freelance risk boundaries', () => {
  it('hard-rejects prohibited work without making a factual fraud accusation', () => {
    const risk = assessFreelanceRisk(candidate({
      publicDescription: `${candidate().publicDescription} Pay a fee before you start and share your one-time password with the coordinator.`,
    }));
    expect(risk.level).toBe('HARD_REJECTED');
    expect(risk.displayMessage).toBe('Potential risk indicators detected.');
    expect(risk.displayMessage).not.toMatch(/fraud|scam client/i);
  });
});

describe('freelance readiness diagnostics', () => {
  it('reports safe deterministic primary blockers without changing the readiness result', () => {
    const senior = buildFreelanceOpportunity({
      candidate: candidate({
        title: 'Head of Marketing and Communications',
        publicDescription: `${candidate().publicDescription} This role requires 8 years of professional experience.`,
        requiredSkills: [],
      }),
      verifiedSkills: [skill('HTML')],
      now: NOW,
    });
    const diagnostic = diagnoseFreelanceOpportunityReadiness(senior, [skill('HTML')]);
    expect(senior.readiness.classification).toBe('NOT_READY');
    expect(diagnostic.primaryBlocker).toBe('MANDATORY_EXPERIENCE_REQUIREMENT');
    expect(diagnostic.mandatoryExperienceYears).toBe(8);
    expect(diagnostic.blockerCodes).toEqual(expect.arrayContaining([
      'MANDATORY_EXPERIENCE_REQUIREMENT',
      'SENIOR_OR_LEAD_RESPONSIBILITY',
      'UNRELATED_JOB_FAMILY',
    ]));
    expect(JSON.stringify(diagnostic)).not.toContain(senior.publicDescription);
  });

  it('keeps an otherwise narrow task ineligible when its explicit geography excludes the Philippines', () => {
    const restricted = buildFreelanceOpportunity({
      candidate: candidate({
        title: 'Data labeling specialists',
        applicantGeographicRestrictions: ['USA'],
        requiredSkills: ['Data labeling'],
      }),
      verifiedSkills: [skill('Manual QA')],
      now: NOW,
    });
    const diagnostic = diagnoseFreelanceOpportunityReadiness(restricted, [skill('Manual QA')]);
    expect(restricted.readiness.classification).toBe('NOT_READY');
    expect(diagnostic.geographicEligibility).toBe('INELIGIBLE');
    expect(diagnostic.primaryBlocker).toBe('GEOGRAPHIC_RESTRICTION');
    expect(diagnostic.potentiallyWorthManualReview).toBe(false);
  });

  it('separates an evidence-poor valid opportunity into REVIEW SCOPE MANUALLY', () => {
    const vague = buildFreelanceOpportunity({
      candidate: candidate({
        title: 'Automation contractor opportunity',
        publicDescription: 'A remote freelance automation project is available worldwide. The selected contractor will receive the task details after initial scope review. Pay and the complete deliverables are not stated on this public opportunity page.',
        requiredSkills: [],
      }),
      verifiedSkills: [skill('REST APIs')],
      now: NOW,
    });
    const diagnostic = diagnoseFreelanceOpportunityReadiness(vague, [skill('REST APIs')]);
    expect(vague.readiness.classification).toBe('NOT_READY');
    expect(diagnostic.resultState).toBe('REVIEW_SCOPE_MANUALLY');
    expect(diagnostic.primaryBlocker).toBe('INSUFFICIENT_TASK_SCOPE_EVIDENCE');
    expect(diagnostic.individualOpportunityPage).toBe(true);
    expect(diagnostic.taskScopeEvidenceCount).toBe(0);
  });

  it('allows unresolved geography to remain manual scope review without promoting readiness', () => {
    const unresolved = buildFreelanceOpportunity({
      candidate: candidate({
        title: 'Automation contract opportunity',
        publicDescription: 'A public freelance automation contract is available. The exact deliverables, pay, and applicant location policy will be confirmed during a manual scope review.',
        clientCountry: null,
        applicantGeographicRestrictions: [],
        remote: null,
        requiredSkills: [],
      }),
      verifiedSkills: [skill('REST APIs')],
      now: NOW,
    });
    const diagnostic = diagnoseFreelanceOpportunityReadiness(unresolved, [skill('REST APIs')]);
    expect(diagnostic.geographicEligibility).toBe('REQUIRES_REVIEW');
    expect(diagnostic.resultState).toBe('REVIEW_SCOPE_MANUALLY');
    expect(diagnostic.readiness).toBe('NOT_READY');
    expect(diagnostic.potentiallyWorthManualReview).toBe(true);
  });
});
