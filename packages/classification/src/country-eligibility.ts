/**
 * Check whether a job is accessible to a candidate in the Philippines.
 *
 * Rules from spec Section 3:
 * - PH jobs: eligible if remote/hybrid/onsite within acceptable locations
 * - International remote: eligible only if explicitly allows PH/APAC/SEA/Worldwide
 * - International onsite/hybrid: ineligible
 * - Ambiguous: requires review — never assume eligibility
 */

import type { NormalizedJob, EligibilityStatus, JobCategory, WorkSetup } from '@job-app/core';

interface EligibilityResult {
  status: EligibilityStatus;
  evidence: string;
}

/** Regions/keywords that include the Philippines */
const PH_INCLUSIVE_REGIONS = [
  'worldwide', 'global', 'anywhere', 'any country', 'all countries',
  'apac', 'asia pacific', 'asia-pacific',
  'southeast asia', 'south east asia', 'sea',
  'philippines', 'ph', 'phl',
  'asean',
];

/** Regions that explicitly exclude the Philippines */
const PH_EXCLUSIVE_REGIONS = [
  'us only', 'usa only', 'united states only',
  'us-based', 'us based',
  'eu only', 'europe only', 'european union only',
  'uk only', 'united kingdom only',
  'canada only',
  'us or canada', 'us/canada',
  'north america only',
  'us citizens', 'us citizen',
  'eu residents', 'eu citizen',
  'must be authorized to work in the us',
  'must be authorized to work in the united states',
  'us work authorization required',
  'requires us work authorization',
];

/**
 * Determines whether a Philippine-based candidate can apply to this job.
 */
export function checkEligibility(
  job: NormalizedJob,
  category: JobCategory,
  workSetup: WorkSetup,
): EligibilityResult {
  // PH jobs — generally eligible, but may need location review
  if (category === 'PH') {
    if (workSetup === 'REMOTE') {
      return { status: 'ELIGIBLE', evidence: 'Philippine remote role — no location constraint' };
    }
    // Onsite/hybrid PH jobs may need location review (outside candidate home area)
    // For now, mark eligible — location preference filtering happens at scoring
    return { status: 'ELIGIBLE', evidence: 'Philippine role — location preference check at scoring' };
  }

  // International jobs
  // Non-remote international jobs are ineligible
  if (workSetup === 'ONSITE' || workSetup === 'HYBRID') {
    return {
      status: 'INELIGIBLE',
      evidence: `International ${workSetup.toLowerCase()} role — requires physical presence outside Philippines`,
    };
  }

  // International remote — check if PH is explicitly allowed
  const allowedCountries = job.allowed_countries.map((c) => c.toLowerCase());
  const allowedRegions = job.allowed_regions.map((r) => r.toLowerCase());
  const eligibilityText = (job.eligibility_text ?? '').toLowerCase();
  const description = job.description.toLowerCase();

  // Check combined text for explicit inclusion
  const combinedText = [...allowedCountries, ...allowedRegions, eligibilityText, description].join(' ');

  // Check for explicit exclusion first (takes priority)
  for (const exclusive of PH_EXCLUSIVE_REGIONS) {
    if (combinedText.includes(exclusive)) {
      return {
        status: 'INELIGIBLE',
        evidence: `Eligibility text matches exclusion pattern: "${exclusive}"`,
      };
    }
  }

  // Check for visa/authorization requirements
  if (
    combinedText.includes('visa sponsorship') &&
    (combinedText.includes('not') || combinedText.includes('no '))
  ) {
    // "No visa sponsorship" + specific country usually means must already be authorized
    if (combinedText.includes('us') || combinedText.includes('united states') || combinedText.includes('uk')) {
      return {
        status: 'INELIGIBLE',
        evidence: 'No visa sponsorship for country-specific role',
      };
    }
  }

  // Check for explicit PH inclusion
  for (const inclusive of PH_INCLUSIVE_REGIONS) {
    if (
      allowedCountries.includes(inclusive) ||
      allowedRegions.includes(inclusive) ||
      eligibilityText.includes(inclusive)
    ) {
      return {
        status: 'ELIGIBLE',
        evidence: `Eligibility explicitly includes: "${inclusive}"`,
      };
    }
  }

  // Check for relocation requirement
  if (job.relocation_required === true) {
    return {
      status: 'INELIGIBLE',
      evidence: 'Relocation required — candidate preference is no international relocation',
    };
  }

  // If no explicit inclusion or exclusion — requires human review
  // NEVER assume eligibility (spec rule)
  if (allowedCountries.length === 0 && allowedRegions.length === 0 && eligibilityText === '') {
    return {
      status: 'REQUIRES_REVIEW',
      evidence: 'No country/region eligibility information found — cannot confirm PH applicants are accepted',
    };
  }

  return {
    status: 'REQUIRES_REVIEW',
    evidence: `Allowed regions [${allowedRegions.join(', ')}] / countries [${allowedCountries.join(', ')}] — cannot confirm PH eligibility`,
  };
}
