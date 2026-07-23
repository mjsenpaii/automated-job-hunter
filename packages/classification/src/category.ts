/**
 * Classify a job as PH (Philippine) or INTERNATIONAL based on location data.
 *
 * Rules from spec Section 3:
 * - PH: fully remote, hybrid, and onsite roles within the Philippines
 * - International: fully remote roles that explicitly permit PH applicants
 * - International onsite/hybrid: rejected (INELIGIBLE)
 */

import type { NormalizedJob, JobCategory } from '@job-app/core';

const PH_IDENTIFIERS = [
  'philippines', 'ph', 'phl', 'pilipinas',
  'manila', 'quezon city', 'makati', 'cebu', 'davao', 'taguig',
  'pasig', 'mandaluyong', 'bgc', 'ortigas', 'alabang', 'clark',
  'marinduque', 'boac', 'cavite', 'laguna', 'batangas', 'pampanga',
  'iloilo', 'bacolod', 'cagayan de oro', 'zamboanga',
];

/**
 * Determines whether a job is a Philippine or International listing.
 *
 * @param job - A normalized job listing
 * @returns 'PH' if the job is based in the Philippines, 'INTERNATIONAL' otherwise
 */
export function classifyCategory(job: NormalizedJob): JobCategory {
  const country = (job.country ?? '').toLowerCase().trim();
  const city = (job.city ?? '').toLowerCase().trim();
  const region = (job.region ?? '').toLowerCase().trim();
  const title = job.title.toLowerCase();
  const description = job.description.toLowerCase();

  // Check explicit country field
  if (isPHCountry(country)) return 'PH';

  // Check city/region against known PH locations
  if (PH_IDENTIFIERS.some((id) => city.includes(id) || region.includes(id))) {
    return 'PH';
  }

  // Check if the job description or title mentions PH locations prominently
  // (only as primary location, not in "allowed countries" context)
  if (country === '' && city === '') {
    const locationMentions = PH_IDENTIFIERS.filter(
      (id) => title.includes(id) || description.includes(`location: ${id}`) || description.includes(`based in ${id}`)
    );
    if (locationMentions.length > 0) return 'PH';
  }

  return 'INTERNATIONAL';
}

function isPHCountry(country: string): boolean {
  return (
    country === 'philippines' ||
    country === 'ph' ||
    country === 'phl' ||
    country === 'pilipinas' ||
    country === 'the philippines'
  );
}
