/**
 * Classification tests — PH vs International category
 *
 * Tests the classifyCategory function against the test matrix from
 * docs/IMPLEMENTATION_ROADMAP.md
 */

import { describe, it, expect } from 'vitest';
import { classifyCategory } from '../src/category.js';
import {
  PH_REMOTE_MANILA,
  PH_HYBRID_MAKATI,
  PH_ONSITE_BOAC,
  PH_ONSITE_CEBU,
  INTL_REMOTE_WORLDWIDE,
  INTL_REMOTE_APAC,
  INTL_REMOTE_US_ONLY,
  INTL_REMOTE_EU_ONLY,
  INTL_HYBRID_SINGAPORE,
  INTL_REMOTE_NO_REGION,
} from '../../../tests/fixtures/jobs.js';

describe('classifyCategory', () => {
  describe('Philippine jobs', () => {
    it('classifies PH remote job in Manila as PH', () => {
      expect(classifyCategory(PH_REMOTE_MANILA)).toBe('PH');
    });

    it('classifies PH hybrid job in Makati as PH', () => {
      expect(classifyCategory(PH_HYBRID_MAKATI)).toBe('PH');
    });

    it('classifies PH onsite job in Boac as PH', () => {
      expect(classifyCategory(PH_ONSITE_BOAC)).toBe('PH');
    });

    it('classifies PH onsite job in Cebu as PH', () => {
      expect(classifyCategory(PH_ONSITE_CEBU)).toBe('PH');
    });
  });

  describe('International jobs', () => {
    it('classifies worldwide remote as INTERNATIONAL', () => {
      expect(classifyCategory(INTL_REMOTE_WORLDWIDE)).toBe('INTERNATIONAL');
    });

    it('classifies APAC remote as INTERNATIONAL', () => {
      expect(classifyCategory(INTL_REMOTE_APAC)).toBe('INTERNATIONAL');
    });

    it('classifies US-only remote as INTERNATIONAL', () => {
      expect(classifyCategory(INTL_REMOTE_US_ONLY)).toBe('INTERNATIONAL');
    });

    it('classifies EU-only remote as INTERNATIONAL', () => {
      expect(classifyCategory(INTL_REMOTE_EU_ONLY)).toBe('INTERNATIONAL');
    });

    it('classifies Singapore hybrid as INTERNATIONAL', () => {
      expect(classifyCategory(INTL_HYBRID_SINGAPORE)).toBe('INTERNATIONAL');
    });

    it('classifies remote with no region as INTERNATIONAL', () => {
      expect(classifyCategory(INTL_REMOTE_NO_REGION)).toBe('INTERNATIONAL');
    });
  });
});
