/**
 * Factor scoring tests
 */

import { describe, it, expect } from 'vitest';
import { scoreJob } from '../src/factor-scoring.js';
import {
  PH_REMOTE_MANILA,
  PH_ONSITE_BOAC,
  INTL_REMOTE_WORLDWIDE,
  INTL_REMOTE_APAC,
  SENIOR_ROLE,
  VERIFIED_SKILLS,
} from '../../../tests/fixtures/jobs.js';

describe('scoreJob', () => {
  describe('score bounds', () => {
    it('score is between 0 and 100', () => {
      const result = scoreJob({
        job: PH_REMOTE_MANILA,
        verifiedSkills: VERIFIED_SKILLS,
        eligibilityStatus: 'ELIGIBLE',
        workSetup: 'REMOTE',
      });
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('all factor components respect their max weights', () => {
      const result = scoreJob({
        job: PH_REMOTE_MANILA,
        verifiedSkills: VERIFIED_SKILLS,
        eligibilityStatus: 'ELIGIBLE',
        workSetup: 'REMOTE',
      });
      expect(result.factors.role_fit).toBeLessThanOrEqual(20);
      expect(result.factors.technical_match).toBeLessThanOrEqual(25);
      expect(result.factors.experience_fit).toBeLessThanOrEqual(15);
      expect(result.factors.location_eligibility).toBeLessThanOrEqual(15);
      expect(result.factors.work_setup_fit).toBeLessThanOrEqual(10);
      expect(result.factors.employment_fit).toBeLessThanOrEqual(5);
      expect(result.factors.project_relevance).toBeLessThanOrEqual(5);
      expect(result.factors.freshness).toBeLessThanOrEqual(5);
    });

    it('factor sum equals total score', () => {
      const result = scoreJob({
        job: PH_REMOTE_MANILA,
        verifiedSkills: VERIFIED_SKILLS,
        eligibilityStatus: 'ELIGIBLE',
        workSetup: 'REMOTE',
      });
      const factorSum = Object.values(result.factors).reduce((s, v) => s + v, 0);
      expect(result.score).toBe(factorSum);
    });
  });

  describe('verified skills only', () => {
    it('only counts verified skills in matched_verified_skills', () => {
      const result = scoreJob({
        job: PH_REMOTE_MANILA,
        verifiedSkills: VERIFIED_SKILLS,
        eligibilityStatus: 'ELIGIBLE',
        workSetup: 'REMOTE',
      });
      // PH_REMOTE_MANILA requires typescript, react, node.js
      // Only typescript is verified
      expect(result.matched_verified_skills).toContain('typescript');
      expect(result.missing_required_skills).toContain('react');
      expect(result.missing_required_skills).toContain('node.js');
    });

    it('reports empty matches when no skills verified', () => {
      const result = scoreJob({
        job: PH_REMOTE_MANILA,
        verifiedSkills: [],
        eligibilityStatus: 'ELIGIBLE',
        workSetup: 'REMOTE',
      });
      expect(result.matched_verified_skills).toHaveLength(0);
      expect(result.factors.technical_match).toBe(0);
    });
  });

  describe('recommendation tiers', () => {
    it('strong match gets PRIORITY_REVIEW or STRONG_REVIEW', () => {
      // INTL_REMOTE_APAC requires flutter, dart — both verified
      const result = scoreJob({
        job: INTL_REMOTE_APAC,
        verifiedSkills: VERIFIED_SKILLS,
        eligibilityStatus: 'ELIGIBLE',
        workSetup: 'REMOTE',
      });
      expect(['PRIORITY_REVIEW', 'STRONG_REVIEW']).toContain(result.recommendation);
    });

    it('senior role with no matching experience scores low', () => {
      const result = scoreJob({
        job: SENIOR_ROLE,
        verifiedSkills: VERIFIED_SKILLS,
        eligibilityStatus: 'ELIGIBLE',
        workSetup: 'HYBRID',
      });
      // Should score low due to seniority mismatch and missing skills
      expect(result.score).toBeLessThan(65);
      expect(result.recommendation).toBe('ARCHIVE');
    });
  });

  describe('eligibility impact', () => {
    it('ELIGIBLE gives full location score', () => {
      const result = scoreJob({
        job: PH_REMOTE_MANILA,
        verifiedSkills: VERIFIED_SKILLS,
        eligibilityStatus: 'ELIGIBLE',
        workSetup: 'REMOTE',
      });
      expect(result.factors.location_eligibility).toBe(15);
    });

    it('REQUIRES_REVIEW gives partial location score', () => {
      const result = scoreJob({
        job: PH_REMOTE_MANILA,
        verifiedSkills: VERIFIED_SKILLS,
        eligibilityStatus: 'REQUIRES_REVIEW',
        workSetup: 'REMOTE',
      });
      expect(result.factors.location_eligibility).toBeLessThan(15);
      expect(result.risk_flags.length).toBeGreaterThan(0);
    });

    it('INELIGIBLE gives zero location score', () => {
      const result = scoreJob({
        job: PH_REMOTE_MANILA,
        verifiedSkills: VERIFIED_SKILLS,
        eligibilityStatus: 'INELIGIBLE',
        workSetup: 'REMOTE',
      });
      expect(result.factors.location_eligibility).toBe(0);
    });
  });

  describe('work setup scoring', () => {
    it('remote gets highest work setup score', () => {
      const result = scoreJob({
        job: PH_REMOTE_MANILA,
        verifiedSkills: VERIFIED_SKILLS,
        eligibilityStatus: 'ELIGIBLE',
        workSetup: 'REMOTE',
      });
      expect(result.factors.work_setup_fit).toBe(10);
    });

    it('onsite gets lower work setup score than remote', () => {
      const remote = scoreJob({
        job: PH_REMOTE_MANILA,
        verifiedSkills: VERIFIED_SKILLS,
        eligibilityStatus: 'ELIGIBLE',
        workSetup: 'REMOTE',
      });
      const onsite = scoreJob({
        job: PH_ONSITE_BOAC,
        verifiedSkills: VERIFIED_SKILLS,
        eligibilityStatus: 'ELIGIBLE',
        workSetup: 'ONSITE',
      });
      expect(remote.factors.work_setup_fit).toBeGreaterThan(onsite.factors.work_setup_fit);
    });
  });

  describe('output structure', () => {
    it('produces valid StructuredScore shape', () => {
      const result = scoreJob({
        job: PH_REMOTE_MANILA,
        verifiedSkills: VERIFIED_SKILLS,
        eligibilityStatus: 'ELIGIBLE',
        workSetup: 'REMOTE',
      });
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('factors');
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('recommendation');
      expect(result).toHaveProperty('eligibility_status');
      expect(result).toHaveProperty('work_setup');
      expect(result).toHaveProperty('matched_verified_skills');
      expect(result).toHaveProperty('missing_required_skills');
      expect(result).toHaveProperty('optional_gaps');
      expect(result).toHaveProperty('risk_flags');
      expect(result).toHaveProperty('evidence');
      expect(result).toHaveProperty('reason');
      expect(typeof result.reason).toBe('string');
      expect(result.reason.length).toBeGreaterThan(0);
    });
  });
});
