/**
 * Hard rejection rules — deterministic filters applied before scoring.
 *
 * From spec Section 7: "Hard Rejection Rules"
 * A hard-rejected job must never be applied to regardless of numeric score.
 */

import type { NormalizedJob } from '@job-app/core';
import type { HardRejectResult, HardRejectReason } from '@job-app/core';

/** Patterns indicating scam, MLM, or fraudulent postings */
const SCAM_PATTERNS = [
  'commission only', 'commission-only',
  'pay to apply', 'pay-to-apply', 'application fee',
  'mlm', 'multi-level marketing', 'multi level marketing',
  'network marketing', 'pyramid',
  'send money', 'wire transfer', 'western union',
  'purchase equipment', 'buy equipment', 'buy your own',
  'cryptocurrency investment', 'crypto trading',
  'check cashing',
  'too good to be true',
  'no experience needed guaranteed',
];

/**
 * Seniority markers indicating roles far beyond a fresh graduate (<1 year).
 * A minimum requirement of 5+ years is out of reach for the candidate, so the
 * 5/6/7-year phrasings are treated as hard mismatches alongside the 8/10-year ones.
 */
const SENIOR_MARKERS = [
  '10+ years', '10 years of experience',
  '8+ years', '8 years of experience',
  '7+ years', '7 years of experience',
  '6+ years', '6 years of experience',
  '5+ years', '5 years of experience',
  'principal engineer', 'staff engineer',
  'director of engineering', 'vp of engineering',
  'chief technology officer', 'cto',
  'engineering manager',
  'architect with 10',
];

/** Licenses/clearances a PH fresh graduate won't have */
const IMPOSSIBLE_REQUIREMENTS = [
  'security clearance', 'top secret clearance',
  'ts/sci', 'secret clearance',
  'prc license', // could have it, but needs verification
  'bar admission', 'law license',
  'medical license', 'nursing license',
  'cpa license',
];

/**
 * Runs all hard rejection rules against a job.
 * Returns a result indicating whether the job is rejected and why.
 */
export function checkHardReject(
  job: NormalizedJob,
  options: {
    isExpired?: boolean;
    isDuplicate?: boolean;
    isInternationalNonRemote?: boolean;
    isCountryIneligible?: boolean;
    isRelocationRequired?: boolean;
    blacklistedCompanies?: string[];
    verifiedRequirementsOnly?: boolean;
  } = {},
): HardRejectResult {
  const reasons: HardRejectReason[] = [];
  const evidence: string[] = [];
  const text = `${job.title} ${job.description}`.toLowerCase();

  // 1. Expired listing
  if (options.isExpired || isExpired(job)) {
    reasons.push('EXPIRED');
    evidence.push('Listing has expired or been removed');
  }

  // 2. Duplicate
  if (options.isDuplicate) {
    reasons.push('DUPLICATE');
    evidence.push('Duplicate of previously stored job');
  }

  // 3. International onsite/hybrid
  if (options.isInternationalNonRemote) {
    reasons.push('INTERNATIONAL_NON_REMOTE');
    evidence.push('International role requires physical presence');
  }

  // 4. Country ineligible
  if (options.isCountryIneligible) {
    reasons.push('COUNTRY_INELIGIBLE');
    evidence.push('Job explicitly excludes Philippine applicants');
  }

  // 5. Relocation required (when not willing)
  if (options.isRelocationRequired || job.relocation_required === true) {
    reasons.push('RELOCATION_REQUIRED');
    evidence.push('Relocation required — candidate does not relocate internationally');
  }

  // 6. Scam patterns
  for (const pattern of SCAM_PATTERNS) {
    if (text.includes(pattern)) {
      reasons.push('SCAM_PATTERN');
      evidence.push(`Scam pattern detected: "${pattern}"`);
      break; // One scam match is enough
    }
  }

  // 7. Unpaid or commission-only
  if (
    text.includes('unpaid') ||
    text.includes('volunteer position') ||
    (text.includes('commission') && text.includes('only'))
  ) {
    if (!reasons.includes('UNPAID_OR_MLM') && !reasons.includes('SCAM_PATTERN')) {
      reasons.push('UNPAID_OR_MLM');
      evidence.push('Unpaid, volunteer, or commission-only position');
    }
  }

  // 8. Required license/clearance
  if (!options.verifiedRequirementsOnly) {
    for (const req of IMPOSSIBLE_REQUIREMENTS) {
      if (text.includes(req)) {
        reasons.push('REQUIRED_LICENSE_MISSING');
        evidence.push(`Requires: "${req}" — candidate does not have this`);
        break;
      }
    }
  }

  // 9. Senior-level mismatch (fresh graduate with <1 year experience)
  const seniorityText = options.verifiedRequirementsOnly
    ? job.title.toLowerCase()
    : text;
  for (const marker of SENIOR_MARKERS) {
    if (seniorityText.includes(marker)) {
      reasons.push('SENIORITY_MISMATCH');
      evidence.push(`Senior-level requirement: "${marker}" — candidate is a fresh graduate`);
      break;
    }
  }

  // 10. Blacklisted company
  if (options.blacklistedCompanies && options.blacklistedCompanies.length > 0) {
    const normalizedCompany = job.company.toLowerCase().trim();
    if (options.blacklistedCompanies.some((b) => normalizedCompany.includes(b.toLowerCase()))) {
      reasons.push('BLACKLISTED_COMPANY');
      evidence.push(`Company "${job.company}" is on the blacklist`);
    }
  }

  // 11. Years of experience check from structured field.
  // A fresh graduate has <1 year, so any role demanding a 5+ year minimum is a
  // seniority mismatch (matches validation Scenario 7).
  if (job.years_experience_min !== null && job.years_experience_min >= 5) {
    if (!reasons.includes('SENIORITY_MISMATCH')) {
      reasons.push('SENIORITY_MISMATCH');
      evidence.push(`Requires ${job.years_experience_min}+ years — candidate has <1 year`);
    }
  }

  return {
    rejected: reasons.length > 0,
    reasons: [...new Set(reasons)],
    evidence,
  };
}

/** Check if a job listing has expired based on its expiry date */
function isExpired(job: NormalizedJob): boolean {
  if (!job.date_expires) return false;
  try {
    return new Date(job.date_expires) < new Date();
  } catch {
    return false;
  }
}
