/**
 * Work setup classification tests
 */

import { describe, it, expect } from 'vitest';
import { classifyWorkSetup } from '../src/work-setup.js';
import type { NormalizedJob } from '@job-app/core';
import {
  PH_REMOTE_MANILA,
  PH_HYBRID_MAKATI,
  PH_ONSITE_BOAC,
  INTL_REMOTE_WORLDWIDE,
} from '../../../tests/fixtures/jobs.js';

/** Helper to create a minimal job with specific description text */
function jobWithDescription(description: string): NormalizedJob {
  return {
    ...PH_REMOTE_MANILA,
    id: 'test-work-setup',
    title: 'Developer',
    description,
    work_setup: 'UNCLEAR',
    work_setup_confidence: 0,
    work_setup_evidence: null,
  };
}

describe('classifyWorkSetup', () => {
  it('trusts pre-classified high-confidence remote', () => {
    const result = classifyWorkSetup(PH_REMOTE_MANILA);
    expect(result.work_setup).toBe('REMOTE');
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('trusts pre-classified high-confidence hybrid', () => {
    const result = classifyWorkSetup(PH_HYBRID_MAKATI);
    expect(result.work_setup).toBe('HYBRID');
  });

  it('trusts pre-classified high-confidence onsite', () => {
    const result = classifyWorkSetup(PH_ONSITE_BOAC);
    expect(result.work_setup).toBe('ONSITE');
  });

  it('detects remote from description text', () => {
    const job = jobWithDescription('This is a fully remote position. Work from home anywhere.');
    const result = classifyWorkSetup(job);
    expect(result.work_setup).toBe('REMOTE');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('detects onsite from description text', () => {
    const job = jobWithDescription('This is an on-site position. Must report to office daily.');
    const result = classifyWorkSetup(job);
    expect(result.work_setup).toBe('ONSITE');
  });

  it('detects hybrid from explicit hybrid keyword', () => {
    const job = jobWithDescription('This is a hybrid position. 3 days in office, 2 days remote.');
    const result = classifyWorkSetup(job);
    expect(result.work_setup).toBe('HYBRID');
  });

  it('detects hybrid when both remote and onsite signals present', () => {
    const job = jobWithDescription('Remote work is available but you must be in office for team meetings. On-site twice a week.');
    const result = classifyWorkSetup(job);
    expect(result.work_setup).toBe('HYBRID');
  });

  it('detects temporary remote', () => {
    const job = jobWithDescription('This position is temporarily remote due to office renovation. Return to office expected Q1 2027.');
    const result = classifyWorkSetup(job);
    expect(result.work_setup).toBe('TEMPORARY_REMOTE');
  });

  it('returns UNCLEAR when no signals found', () => {
    const job = jobWithDescription('Looking for a developer to join the team. Competitive salary and benefits.');
    const result = classifyWorkSetup(job);
    expect(result.work_setup).toBe('UNCLEAR');
    expect(result.confidence).toBeLessThan(0.5);
  });
});
