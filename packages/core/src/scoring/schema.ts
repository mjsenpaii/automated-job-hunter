/**
 * @job-app/core — Scoring schemas
 *
 * Zod schemas for the structured scoring system. Jobs are scored out of 100
 * using weighted factors. Hard rejection rules override numeric scores.
 */

import { z } from 'zod';
import { JobCategory, WorkSetup, EligibilityStatus } from '../jobs/schema.js';

// ---------------------------------------------------------------------------
// Hard Rejection
// ---------------------------------------------------------------------------

export const HardRejectReason = z.enum([
  'EXPIRED',
  'DUPLICATE',
  'INTERNATIONAL_NON_REMOTE',
  'COUNTRY_INELIGIBLE',
  'RELOCATION_REQUIRED',
  'SCAM_PATTERN',
  'REQUIRED_LICENSE_MISSING',
  'SENIORITY_MISMATCH',
  'BLACKLISTED_COMPANY',
  'UNPAID_OR_MLM',
]);
export type HardRejectReason = z.infer<typeof HardRejectReason>;

export const HardRejectResultSchema = z.object({
  rejected: z.boolean(),
  reasons: z.array(HardRejectReason),
  evidence: z.array(z.string()),
});
export type HardRejectResult = z.infer<typeof HardRejectResultSchema>;

// ---------------------------------------------------------------------------
// Score Factors (100-point model from spec)
// ---------------------------------------------------------------------------

export const ScoreFactorsSchema = z.object({
  /** Role/title fit — max 20 */
  role_fit: z.number().min(0).max(20),
  /** Verified technical match — max 25 */
  technical_match: z.number().min(0).max(25),
  /** Experience/seniority fit — max 15 */
  experience_fit: z.number().min(0).max(15),
  /** Location and hiring eligibility — max 15 */
  location_eligibility: z.number().min(0).max(15),
  /** Work-setup preference — max 10 */
  work_setup_fit: z.number().min(0).max(10),
  /** Employment and schedule fit — max 5 */
  employment_fit: z.number().min(0).max(5),
  /** Project/domain relevance — max 5 */
  project_relevance: z.number().min(0).max(5),
  /** Freshness and credibility — max 5 */
  freshness: z.number().min(0).max(5),
});
export type ScoreFactors = z.infer<typeof ScoreFactorsSchema>;

// ---------------------------------------------------------------------------
// Score Recommendation
// ---------------------------------------------------------------------------

export const ScoreRecommendation = z.enum([
  'PRIORITY_REVIEW',    // 85-100
  'STRONG_REVIEW',      // 75-84
  'REVIEW_IF_LEARNABLE', // 65-74
  'ARCHIVE',            // <65
  'HARD_REJECT',        // Hard rejection rule triggered
  'ELIGIBILITY_REVIEW', // Cannot confirm eligibility
]);
export type ScoreRecommendation = z.infer<typeof ScoreRecommendation>;

// ---------------------------------------------------------------------------
// Structured Score Output (matches spec Section 7)
// ---------------------------------------------------------------------------

export const StructuredScoreSchema = z.object({
  score: z.number().min(0).max(100),
  factors: ScoreFactorsSchema,
  category: JobCategory,
  recommendation: ScoreRecommendation,
  eligibility_status: EligibilityStatus,
  work_setup: WorkSetup,
  matched_verified_skills: z.array(z.string()),
  missing_required_skills: z.array(z.string()),
  optional_gaps: z.array(z.string()),
  risk_flags: z.array(z.string()),
  evidence: z.array(z.string()),
  reason: z.string(),
});
export type StructuredScore = z.infer<typeof StructuredScoreSchema>;

// ---------------------------------------------------------------------------
// Score-to-Recommendation Mapping
// ---------------------------------------------------------------------------

/**
 * Maps a numeric score to a recommendation tier.
 * Hard rejections override this mapping entirely.
 */
export function scoreToRecommendation(score: number, hardRejected: boolean): ScoreRecommendation {
  if (hardRejected) return 'HARD_REJECT';
  if (score >= 85) return 'PRIORITY_REVIEW';
  if (score >= 75) return 'STRONG_REVIEW';
  if (score >= 65) return 'REVIEW_IF_LEARNABLE';
  return 'ARCHIVE';
}
