/**
 * Classify the work setup of a job listing.
 *
 * Determines whether a job is REMOTE, HYBRID, ONSITE, TEMPORARY_REMOTE, or UNCLEAR
 * based on structured fields and text analysis.
 */

import type { NormalizedJob, WorkSetup } from '@job-app/core';

interface WorkSetupResult {
  work_setup: WorkSetup;
  confidence: number;
  evidence: string;
}

const REMOTE_SIGNALS = [
  'remote', 'work from home', 'wfh', 'work from anywhere',
  'distributed', 'telecommute', 'telework', 'virtual position',
  'anywhere in the world', 'location independent',
];

const ONSITE_SIGNALS = [
  'onsite', 'on-site', 'on site', 'in-office', 'in office',
  'office-based', 'must be located', 'must be based',
  'report to office', 'office location',
];

const HYBRID_SIGNALS = [
  'hybrid', 'flexible', 'mix of remote and onsite',
  'days in office', 'days remote', 'partial remote',
  'remote with occasional', 'some onsite',
];

const TEMPORARY_REMOTE_SIGNALS = [
  'temporarily remote', 'temporary remote', 'remote during covid',
  'remote for now', 'return to office', 'rto',
];

/**
 * Classifies the work setup of a job.
 *
 * Priority: structured field > text signals > UNCLEAR fallback.
 */
export function classifyWorkSetup(job: NormalizedJob): WorkSetupResult {
  // Trust the structured field if it's already set with high confidence
  if (job.work_setup !== 'UNCLEAR' && job.work_setup_confidence >= 0.8) {
    return {
      work_setup: job.work_setup,
      confidence: job.work_setup_confidence,
      evidence: job.work_setup_evidence ?? 'Pre-classified with high confidence',
    };
  }

  const text = `${job.title} ${job.description}`.toLowerCase();

  // Check for temporary remote (highest priority — looks remote but isn't)
  const tempRemoteMatch = TEMPORARY_REMOTE_SIGNALS.find((s) => text.includes(s));
  if (tempRemoteMatch) {
    return {
      work_setup: 'TEMPORARY_REMOTE',
      confidence: 0.7,
      evidence: `Contains temporary remote signal: "${tempRemoteMatch}"`,
    };
  }

  // Count signal matches
  const remoteMatches = REMOTE_SIGNALS.filter((s) => text.includes(s));
  const onsiteMatches = ONSITE_SIGNALS.filter((s) => text.includes(s));
  const hybridMatches = HYBRID_SIGNALS.filter((s) => text.includes(s));

  // Hybrid: explicit hybrid signals, or both remote AND onsite signals
  if (hybridMatches.length > 0) {
    return {
      work_setup: 'HYBRID',
      confidence: 0.8,
      evidence: `Hybrid signals: ${hybridMatches.join(', ')}`,
    };
  }

  if (remoteMatches.length > 0 && onsiteMatches.length > 0) {
    return {
      work_setup: 'HYBRID',
      confidence: 0.6,
      evidence: `Both remote (${remoteMatches[0]}) and onsite (${onsiteMatches[0]}) signals found`,
    };
  }

  // Pure remote
  if (remoteMatches.length > 0 && onsiteMatches.length === 0) {
    return {
      work_setup: 'REMOTE',
      confidence: Math.min(0.5 + remoteMatches.length * 0.15, 0.95),
      evidence: `Remote signals: ${remoteMatches.join(', ')}`,
    };
  }

  // Pure onsite
  if (onsiteMatches.length > 0 && remoteMatches.length === 0) {
    return {
      work_setup: 'ONSITE',
      confidence: Math.min(0.5 + onsiteMatches.length * 0.15, 0.95),
      evidence: `Onsite signals: ${onsiteMatches.join(', ')}`,
    };
  }

  // Fallback: no signals found
  return {
    work_setup: 'UNCLEAR',
    confidence: 0.2,
    evidence: 'No clear work setup signals detected in title or description',
  };
}
