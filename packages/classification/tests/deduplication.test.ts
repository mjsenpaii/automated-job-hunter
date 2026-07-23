/**
 * Deduplication tests
 */

import { describe, it, expect } from 'vitest';
import { checkDuplicate } from '../src/deduplication.js';
import {
  DUP_ORIGINAL,
  DUP_SAME_SOURCE,
  DUP_CROSS_SOURCE,
  DUP_DIFFERENT_JOB,
} from '../../../tests/fixtures/jobs.js';

describe('checkDuplicate', () => {
  it('detects exact duplicate from same source with same source_job_id', () => {
    const result = checkDuplicate(DUP_SAME_SOURCE, [DUP_ORIGINAL]);
    expect(result.is_duplicate).toBe(true);
    expect(result.confidence).toBe(1.0);
    expect(result.duplicate_of_id).toBe('dup-original');
  });

  it('detects cross-source duplicate with similar title and same company', () => {
    const result = checkDuplicate(DUP_CROSS_SOURCE, [DUP_ORIGINAL]);
    expect(result.is_duplicate).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.duplicate_of_id).toBe('dup-original');
  });

  it('does NOT flag a different job from the same company as duplicate', () => {
    const result = checkDuplicate(DUP_DIFFERENT_JOB, [DUP_ORIGINAL]);
    expect(result.is_duplicate).toBe(false);
  });

  it('returns not duplicate when no existing jobs', () => {
    const result = checkDuplicate(DUP_ORIGINAL, []);
    expect(result.is_duplicate).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it('detects duplicate by URL even from different sources', () => {
    const sameUrlJob = {
      ...DUP_CROSS_SOURCE,
      original_url: 'https://www.jobstreet.com.ph/job/12345',
    };
    const result = checkDuplicate(sameUrlJob, [DUP_ORIGINAL]);
    expect(result.is_duplicate).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });
});
