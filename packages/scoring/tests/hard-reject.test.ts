/**
 * Hard rejection tests
 */

import { describe, it, expect } from 'vitest';
import { checkHardReject } from '../src/hard-reject.js';
import {
  PH_REMOTE_MANILA,
  SCAM_MLM,
  SENIOR_ROLE,
  EXPIRED_JOB,
  REQUIRES_CLEARANCE,
  INTL_HYBRID_SINGAPORE,
} from '../../../tests/fixtures/jobs.js';

describe('checkHardReject', () => {
  it('does NOT reject a valid junior PH remote job', () => {
    const result = checkHardReject(PH_REMOTE_MANILA);
    expect(result.rejected).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });

  it('rejects expired listing', () => {
    const result = checkHardReject(EXPIRED_JOB);
    expect(result.rejected).toBe(true);
    expect(result.reasons).toContain('EXPIRED');
  });

  it('rejects scam/MLM pattern', () => {
    const result = checkHardReject(SCAM_MLM);
    expect(result.rejected).toBe(true);
    expect(result.reasons).toContain('SCAM_PATTERN');
  });

  it('rejects senior role (10+ years)', () => {
    const result = checkHardReject(SENIOR_ROLE);
    expect(result.rejected).toBe(true);
    expect(result.reasons).toContain('SENIORITY_MISMATCH');
  });

  it('rejects a role requiring 5+ years for a fresh graduate', () => {
    const fiveYearRole = {
      ...PH_REMOTE_MANILA,
      title: 'Senior Frontend Engineer',
      description: 'Senior Frontend Engineer. 5+ years of React and TypeScript experience required.',
      seniority: 'SENIOR' as const,
      years_experience_min: 5,
    };
    const result = checkHardReject(fiveYearRole);
    expect(result.rejected).toBe(true);
    expect(result.reasons).toContain('SENIORITY_MISMATCH');
  });

  it('rejects job requiring security clearance', () => {
    const result = checkHardReject(REQUIRES_CLEARANCE);
    expect(result.rejected).toBe(true);
    expect(result.reasons).toContain('REQUIRED_LICENSE_MISSING');
  });

  it('rejects duplicate when flagged', () => {
    const result = checkHardReject(PH_REMOTE_MANILA, { isDuplicate: true });
    expect(result.rejected).toBe(true);
    expect(result.reasons).toContain('DUPLICATE');
  });

  it('rejects international non-remote when flagged', () => {
    const result = checkHardReject(INTL_HYBRID_SINGAPORE, { isInternationalNonRemote: true });
    expect(result.rejected).toBe(true);
    expect(result.reasons).toContain('INTERNATIONAL_NON_REMOTE');
  });

  it('rejects country-ineligible when flagged', () => {
    const result = checkHardReject(PH_REMOTE_MANILA, { isCountryIneligible: true });
    expect(result.rejected).toBe(true);
    expect(result.reasons).toContain('COUNTRY_INELIGIBLE');
  });

  it('rejects blacklisted company', () => {
    const result = checkHardReject(PH_REMOTE_MANILA, {
      blacklistedCompanies: ['techstartup ph'],
    });
    expect(result.rejected).toBe(true);
    expect(result.reasons).toContain('BLACKLISTED_COMPANY');
  });

  it('rejects relocation-required jobs', () => {
    const result = checkHardReject(INTL_HYBRID_SINGAPORE);
    expect(result.rejected).toBe(true);
    expect(result.reasons).toContain('RELOCATION_REQUIRED');
  });

  it('can return multiple rejection reasons', () => {
    const result = checkHardReject(SCAM_MLM, { isExpired: true });
    expect(result.rejected).toBe(true);
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
  });
});
