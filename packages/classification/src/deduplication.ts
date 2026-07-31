/**
 * Job deduplication logic.
 *
 * Detects duplicate listings across sources using title, company, location,
 * and date similarity. Designed to be deterministic (no AI needed).
 */

import type { NormalizedJob, DeduplicationResult } from '@job-app/core';

/**
 * Checks if a new job is a duplicate of any existing job.
 *
 * Match criteria (weighted):
 * - Same company (normalized) — required
 * - Similar title — required
 * - Same city/country — strong signal
 * - Posted within 14 days — strong signal
 * - Same source job ID — definitive match
 */
export function checkDuplicate(
  newJob: NormalizedJob,
  existingJobs: NormalizedJob[],
): DeduplicationResult {
  for (const existing of existingJobs) {
    const reasons: string[] = [];
    let confidence = 0;

    // Definitive: same source + same source job ID
    if (
      newJob.source_name === existing.source_name &&
      newJob.source_job_id !== null &&
      newJob.source_job_id === existing.source_job_id
    ) {
      return {
        is_duplicate: true,
        duplicate_of_id: existing.id,
        confidence: 1.0,
        match_reasons: ['Identical source and source_job_id'],
      };
    }

    // Company match (required for other checks)
    const companyMatch = normalizeCompany(newJob.company) === normalizeCompany(existing.company);
    if (!companyMatch) continue;
    reasons.push('Same company');
    confidence += 0.3;

    // Title similarity
    const titleSim = titleSimilarity(newJob.title, existing.title);
    if (titleSim < 0.5) continue; // Too different
    reasons.push(`Title similarity: ${(titleSim * 100).toFixed(0)}%`);
    confidence += titleSim * 0.35;

    // Location match
    if (
      newJob.city &&
      existing.city &&
      newJob.city.toLowerCase() === existing.city.toLowerCase()
    ) {
      reasons.push('Same city');
      confidence += 0.15;
    } else if (
      newJob.country &&
      existing.country &&
      newJob.country.toLowerCase() === existing.country.toLowerCase()
    ) {
      reasons.push('Same country');
      confidence += 0.1;
    }

    // Date proximity (within 14 days)
    if (newJob.date_posted && existing.date_posted) {
      const daysDiff = Math.abs(
        new Date(newJob.date_posted).getTime() - new Date(existing.date_posted).getTime()
      ) / (1000 * 60 * 60 * 24);
      if (daysDiff <= 14) {
        reasons.push(`Posted within ${daysDiff.toFixed(0)} days`);
        confidence += 0.1;
      }
    }

    // URL match (different sources, same job URL)
    if (
      newJob.original_url &&
      existing.original_url &&
      canonicalizeJobUrl(newJob.original_url) ===
        canonicalizeJobUrl(existing.original_url)
    ) {
      return {
        is_duplicate: true,
        duplicate_of_id: existing.id,
        confidence: 0.95,
        match_reasons: ['Same URL (normalized)'],
      };
    }

    if (confidence >= 0.7) {
      return {
        is_duplicate: true,
        duplicate_of_id: existing.id,
        confidence: Math.min(confidence, 1),
        match_reasons: reasons,
      };
    }
  }

  return {
    is_duplicate: false,
    duplicate_of_id: null,
    confidence: 0,
    match_reasons: [],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize company name for comparison */
function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,\-()]/g, '')
    .replace(/\b(inc|llc|ltd|corp|co|company|corporation|group|technologies|tech|solutions)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Simple word-overlap title similarity (0-1) */
function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeTitle(a).split(' '));
  const wordsB = new Set(normalizeTitle(b).split(' '));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

/** Normalize job title for comparison */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[.,\-()[\]\/]/g, ' ')
    .replace(
      /\b(junior|jr|senior|sr|lead|principal|staff|intern|i{1,3}|iv|v)\b/g,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalize URL by removing protocol, www, trailing slashes, and query params */
const TRACKING_QUERY_PARAMETERS = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'referrer',
  'source',
  'utm_campaign',
  'utm_content',
  'utm_medium',
  'utm_source',
  'utm_term',
]);

/**
 * Canonical URL identity shared by deduplication and extraction provenance.
 *
 * Meaningful provider/job identifiers remain in the query string. Only known
 * tracking parameters are removed.
 */
export function canonicalizeJobUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return url.trim().toLowerCase().replace(/\/+$/, '');
    }
    parsed.hostname = parsed.hostname.toLowerCase();
    for (const name of [...parsed.searchParams.keys()]) {
      if (
        TRACKING_QUERY_PARAMETERS.has(name.toLowerCase()) ||
        name.toLowerCase().startsWith('utm_')
      ) {
        parsed.searchParams.delete(name);
      }
    }
    parsed.hash = '';
    parsed.pathname =
      parsed.pathname === '/' ? '/' : parsed.pathname.replace(/\/+$/, '');
    const query = [...parsed.searchParams.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    );
    parsed.search = '';
    for (const [name, value] of query) parsed.searchParams.append(name, value);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`;
  } catch {
    return url.trim().toLowerCase().replace(/\/+$/, '');
  }
}
