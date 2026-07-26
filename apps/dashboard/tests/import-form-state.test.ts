import { describe, it, expect } from 'vitest';
import {
  canConfirmAndScore,
  deriveResultState,
  deriveReviewState,
  isValidHttpUrl,
} from '../src/lib/import/form-state';
import { parseJobImportResponse, apiError } from '@job-app/ingestion/import-contracts';

describe('dashboard import form-state', () => {
  it('Confirm & Score remains disabled while required fields are missing', () => {
    expect(canConfirmAndScore('PARTIAL_RESULT', ['company', 'location'], false)).toBe(false);
  });

  it('double-clicking Confirm & Score sends only one active request (scoring lock)', () => {
    expect(canConfirmAndScore('READY_TO_SCORE', [], true)).toBe(false);
    expect(canConfirmAndScore('READY_TO_SCORE', [], false)).toBe(true);
  });

  it('invalid URL keeps scan disabled', () => {
    expect(isValidHttpUrl('')).toBe(false);
    expect(isValidHttpUrl('ftp://example.com')).toBe(false);
    expect(isValidHttpUrl('https://example.com/jobs/1')).toBe(true);
  });

  it('result states map correctly including ineligible', () => {
    expect(deriveResultState('SCORED')).toBe('SCORED');
    expect(deriveResultState('DUPLICATE')).toBe('DUPLICATE');
    expect(deriveResultState('INELIGIBLE')).toBe('INELIGIBLE');
    expect(deriveResultState('HARD_REJECTED')).toBe('HARD_REJECTED');
  });

  it('review state switches when fields completed', () => {
    expect(deriveReviewState(['description'])).toBe('PARTIAL_RESULT');
    expect(deriveReviewState([])).toBe('READY_TO_SCORE');
  });

  it('invalid API JSON does not destroy the page — returns structured error', () => {
    const parsed = parseJobImportResponse(null);
    expect(parsed.success).toBe(false);
  });

  it('API 500 preserves a retryable message envelope', () => {
    const err = apiError('INTERNAL_ERROR', 'Unable to save and score this job. Try again.');
    expect(err.success).toBe(false);
    expect(err.message).toMatch(/try again/i);
  });
});
