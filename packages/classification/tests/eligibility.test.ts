/**
 * Country eligibility tests
 *
 * Critical spec rule: ambiguous eligibility NEVER becomes automatic approval.
 */

import { describe, it, expect } from 'vitest';
import { checkEligibility } from '../src/country-eligibility.js';
import {
  PH_REMOTE_MANILA,
  PH_ONSITE_BOAC,
  INTL_REMOTE_WORLDWIDE,
  INTL_REMOTE_APAC,
  INTL_REMOTE_US_ONLY,
  INTL_REMOTE_EU_ONLY,
  INTL_HYBRID_SINGAPORE,
  INTL_REMOTE_NO_REGION,
} from '../../../tests/fixtures/jobs.js';

describe('checkEligibility', () => {
  describe('PH jobs — generally eligible', () => {
    it('PH remote is eligible', () => {
      const result = checkEligibility(PH_REMOTE_MANILA, 'PH', 'REMOTE');
      expect(result.status).toBe('ELIGIBLE');
    });

    it('PH onsite in home location is eligible', () => {
      const result = checkEligibility(PH_ONSITE_BOAC, 'PH', 'ONSITE');
      expect(result.status).toBe('ELIGIBLE');
    });
  });

  describe('International remote — eligible regions', () => {
    it('worldwide remote is eligible', () => {
      const result = checkEligibility(INTL_REMOTE_WORLDWIDE, 'INTERNATIONAL', 'REMOTE');
      expect(result.status).toBe('ELIGIBLE');
      expect(result.evidence).toContain('worldwide');
    });

    it('APAC remote is eligible', () => {
      const result = checkEligibility(INTL_REMOTE_APAC, 'INTERNATIONAL', 'REMOTE');
      expect(result.status).toBe('ELIGIBLE');
    });
  });

  describe('International remote — ineligible regions', () => {
    it('US-only remote is ineligible', () => {
      const result = checkEligibility(INTL_REMOTE_US_ONLY, 'INTERNATIONAL', 'REMOTE');
      expect(result.status).toBe('INELIGIBLE');
    });

    it('EU-only remote is ineligible', () => {
      const result = checkEligibility(INTL_REMOTE_EU_ONLY, 'INTERNATIONAL', 'REMOTE');
      expect(result.status).toBe('INELIGIBLE');
    });
  });

  describe('International non-remote — always ineligible', () => {
    it('international hybrid is ineligible', () => {
      const result = checkEligibility(INTL_HYBRID_SINGAPORE, 'INTERNATIONAL', 'HYBRID');
      expect(result.status).toBe('INELIGIBLE');
    });
  });

  describe('Ambiguous eligibility — NEVER auto-approve', () => {
    it('remote with no region info requires review', () => {
      const result = checkEligibility(INTL_REMOTE_NO_REGION, 'INTERNATIONAL', 'REMOTE');
      expect(result.status).toBe('REQUIRES_REVIEW');
      expect(result.evidence).toBeTruthy();
    });
  });
});
