import { describe, it, expect } from 'vitest';
import {
  validateConfirmScoreRequest,
  getMissingConfirmFields,
  computeMissingExtractionFields,
  toJobImportResult,
  parseJobImportResponse,
  apiError,
} from '../src/import-contracts.js';

describe('import-contracts — confirm validation', () => {
  const valid = {
    title: 'Junior Developer',
    company: 'Acme PH',
    description: 'Build web apps with TypeScript and React for our remote team.',
    url: 'https://example.com/jobs/1',
    country: 'Philippines',
    city: '',
    work_setup: 'REMOTE' as const,
  };

  it('accepts a complete eligible draft', () => {
    const result = validateConfirmScoreRequest(valid);
    expect(result.ok).toBe(true);
  });

  it('rejects missing company after extraction', () => {
    const result = validateConfirmScoreRequest({ ...valid, company: '   ' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.company).toMatch(/required/i);
    }
  });

  it('rejects missing description after extraction', () => {
    const result = validateConfirmScoreRequest({ ...valid, description: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.description).toMatch(/required/i);
    }
  });

  it('rejects missing location after extraction', () => {
    const result = validateConfirmScoreRequest({
      ...valid,
      country: '',
      city: '  ',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.country).toMatch(/location|country/i);
    }
  });

  it('allows city alone to satisfy location', () => {
    const result = validateConfirmScoreRequest({
      ...valid,
      country: '',
      city: 'Manila',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects invalid URL', () => {
    const result = validateConfirmScoreRequest({ ...valid, url: 'not-a-url' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.url).toBeDefined();
    }
  });

  it('partially extracted job can be completed manually', () => {
    expect(
      getMissingConfirmFields({
        title: 'Engineer',
        company: null,
        description: 'Role description long enough.',
        url: 'https://example.com/j',
        country: null,
        city: null,
        work_setup: 'REMOTE',
      }),
    ).toEqual(expect.arrayContaining(['company', 'location']));

    const completed = validateConfirmScoreRequest({
      title: 'Engineer',
      company: 'User Entered Co',
      description: 'Role description long enough to pass validation rules.',
      url: 'https://example.com/j',
      country: 'Philippines',
      work_setup: 'REMOTE',
    });
    expect(completed.ok).toBe(true);
  });

  it('Confirm & Score remains disabled while required fields are missing', () => {
    const missing = getMissingConfirmFields({
      title: '',
      company: 'Acme',
      description: 'desc',
      url: 'https://example.com',
      country: 'PH',
      work_setup: 'REMOTE',
    });
    expect(missing).toContain('title');
    expect(missing.length).toBeGreaterThan(0);
  });

  it('missing optional salary does not fail validation', () => {
    const result = validateConfirmScoreRequest({ ...valid, salary_text: null });
    expect(result.ok).toBe(true);
  });

  it('allows reviewed pasted content without inventing a source URL', () => {
    const result = validateConfirmScoreRequest({
      ...valid,
      url: null,
      country: null,
      city: null,
      location: 'Remote — global',
    });
    expect(result.ok).toBe(true);
  });
});

describe('import-contracts — extraction missing fields', () => {
  it('flags missing company, description, and location', () => {
    expect(
      computeMissingExtractionFields({
        title: 'Dev',
        company: null,
        description: null,
        country: null,
        city: null,
        work_setup: null,
      }),
    ).toEqual(['company', 'description', 'location', 'work_setup']);
  });
});

describe('import-contracts — JobImportResult narrowing', () => {
  it('hard-rejected result has score null', () => {
    const result = toJobImportResult({
      status: 'HARD_REJECTED',
      job_id: 'job-1',
      rejection_reasons: ['SENIORITY_MISMATCH'],
      title: 'Senior Frontend Engineer',
      company: 'TechCorp',
    });
    expect('success' in result && result.success).toBe(true);
    if ('status' in result && result.status === 'HARD_REJECTED') {
      expect(result.score).toBeNull();
      expect(result.rejectionReasons).toContain('SENIORITY_MISMATCH');
    } else {
      throw new Error('expected HARD_REJECTED');
    }
  });

  it('country-ineligible result is INELIGIBLE with score null', () => {
    const result = toJobImportResult({
      status: 'HARD_REJECTED',
      job_id: 'job-2',
      rejection_reasons: ['COUNTRY_INELIGIBLE'],
    });
    expect('status' in result && result.status).toBe('INELIGIBLE');
    if ('status' in result && result.status === 'INELIGIBLE') {
      expect(result.score).toBeNull();
    }
  });

  it('duplicate result has score null and duplicateOfId', () => {
    const result = toJobImportResult({
      status: 'DUPLICATE',
      job_id: 'new-id',
      duplicate_of_id: 'existing-id',
    });
    expect('status' in result && result.status).toBe('DUPLICATE');
    if ('status' in result && result.status === 'DUPLICATE') {
      expect(result.score).toBeNull();
      expect(result.duplicateOfId).toBe('existing-id');
    }
  });

  it('eligible scored job renders a valid score summary', () => {
    const result = toJobImportResult({
      status: 'INGESTED',
      job_id: 'job-3',
      score: 72,
      recommendation: 'REVIEW_IF_LEARNABLE',
      score_detail: {
        score: 72,
        recommendation: 'REVIEW_IF_LEARNABLE',
        factors: {
          role_fit: 14,
          technical_match: 18,
          experience_fit: 12,
          location_eligibility: 15,
          work_setup_fit: 10,
          employment_fit: 5,
          project_relevance: 0,
          freshness: 3,
        },
        matched_verified_skills: ['typescript'],
        missing_required_skills: [],
        risk_flags: [],
        reason: 'Good match with minor gaps.',
      },
      title: 'Junior Developer',
      company: 'Acme',
    });
    expect('status' in result && result.status).toBe('SCORED');
    if ('status' in result && result.status === 'SCORED') {
      expect(result.score.score).toBe(72);
      expect(result.score.factors).toBeDefined();
    }
  });

  it('missing factor details do not crash narrowing — factors optional', () => {
    const result = toJobImportResult({
      status: 'INGESTED',
      job_id: 'job-4',
      score: 70,
      score_detail: {
        score: 70,
        recommendation: 'REVIEW_IF_LEARNABLE',
      },
    });
    expect('status' in result && result.status).toBe('SCORED');
    if ('status' in result && result.status === 'SCORED') {
      expect(result.score.score).toBe(70);
      expect(result.score.factors).toBeUndefined();
    }
  });

  it('invalid API JSON does not throw — returns structured error', () => {
    const parsed = parseJobImportResponse('<html>error</html>');
    expect(parsed.success).toBe(false);
    if (parsed.success === false) {
      expect(parsed.code).toBe('INVALID_JSON');
    }
  });

  it('API 500-shaped payload preserves a clear message', () => {
    const parsed = parseJobImportResponse(
      apiError('INTERNAL_ERROR', 'Unable to save and score this job. Try again.'),
    );
    expect(parsed.success).toBe(false);
    if (parsed.success === false) {
      expect(parsed.message).toMatch(/try again/i);
    }
  });

  it('never invents a score when hard-rejected with no score_detail', () => {
    const result = toJobImportResult({
      status: 'HARD_REJECTED',
      job_id: 'job-5',
      rejection_reasons: ['SENIORITY_MISMATCH'],
      score: undefined,
      score_detail: null,
    });
    if ('status' in result) {
      expect(result.status).toBe('HARD_REJECTED');
      expect(result.score).toBeNull();
    }
  });

  it('does not invent a fallback reason when a rejected result has none', () => {
    const result = toJobImportResult({
      status: 'HARD_REJECTED',
      job_id: 'job-with-broken-legacy-result',
      rejection_reasons: [],
    });
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        code: 'UNPROCESSABLE',
      }),
    );
  });
});
