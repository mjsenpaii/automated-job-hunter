import {
  checkEligibility,
  classifyCategory,
} from '@job-app/classification';
import { checkHardReject, scoreJob } from '@job-app/scoring';
import type { SkillEntry } from '@job-app/core';
import {
  extractVerifiedJobRequirements,
  type ExtractVerifiedJobRequirementsOptions,
  type JobRequirementsExtractionInput,
} from './gemini-job-requirements.server.js';
import {
  applyVerifiedRequirementsToJob,
  reconcileVerifiedExtractionWithProvider,
} from './job-requirements-verifier.js';
import type {
  DiscoveryPersistenceRecord,
} from './discovery/contracts.js';
import type {
  IngestionResult,
} from './types.js';
import type { VerifiedJobRequirementsExtraction } from './job-requirements-contracts.js';

export type DiscoveryRequirementsExtractor = (
  input: JobRequirementsExtractionInput,
  options?: ExtractVerifiedJobRequirementsOptions,
) => ReturnType<typeof extractVerifiedJobRequirements>;

export function recomputeIngestionWithVerifiedRequirements(
  original: NonNullable<IngestionResult['normalized_job']>,
  extraction: VerifiedJobRequirementsExtraction,
  verifiedSkills: SkillEntry[],
): IngestionResult {
  const normalized = applyVerifiedRequirementsToJob(original, extraction);
  const category = normalized.category ?? classifyCategory(normalized);
  normalized.category = category;
  const eligibility = checkEligibility(
    normalized,
    category,
    normalized.work_setup,
    { verifiedRestrictionsOnly: true },
  );
  normalized.eligibility_status = eligibility.status;
  const hardReject = checkHardReject(normalized, {
    isInternationalNonRemote:
      category === 'INTERNATIONAL' &&
      normalized.work_setup !== 'REMOTE',
    isCountryIneligible: eligibility.status === 'INELIGIBLE',
    verifiedRequirementsOnly: true,
  });
  if (hardReject.rejected) {
    return {
      job_id: normalized.id,
      status: 'HARD_REJECTED',
      rejection_reasons: hardReject.reasons,
      normalized_job: normalized,
    };
  }
  const score = scoreJob({
    job: normalized,
    verifiedSkills,
    eligibilityStatus: eligibility.status,
    workSetup: normalized.work_setup,
    verifiedRequirementsOnly: true,
  });
  return {
    job_id: normalized.id,
    status: 'INGESTED',
    score: score.score,
    recommendation: score.recommendation,
    normalized_job: normalized,
    score_detail: score,
  };
}

export async function enrichControlledPersistenceCandidate(
  record: DiscoveryPersistenceRecord,
  verifiedSkills: SkillEntry[],
  extractor: DiscoveryRequirementsExtractor =
    extractVerifiedJobRequirements,
): Promise<DiscoveryPersistenceRecord> {
  const original = record.result.normalized_job;
  if (!original) {
    throw new Error('Selected candidate has no normalized job.');
  }
  const proposed = await extractor({
    title: record.discovered.title,
    company: record.discovered.company,
    rawDescription: record.discovered.description,
    providerMetadata: {
      sourceName: record.discovered.sourceName,
      sourceJobId: record.discovered.sourceJobId,
      originalUrl: record.discovered.sourceUrl,
      country: original.country,
      workSetup: original.work_setup,
      employmentType: original.employment_type,
      salaryText: record.discovered.salaryText ?? null,
      location: record.discovered.location,
      tags: record.discovered.tags,
    },
  });
  const extraction = reconcileVerifiedExtractionWithProvider(proposed, {
    salaryMin: original.salary_min,
    salaryMax: original.salary_max,
    salaryCurrency: original.salary_currency,
    workSetup: original.work_setup,
    employmentType: original.employment_type,
  });
  const result = recomputeIngestionWithVerifiedRequirements(
    original,
    extraction,
    verifiedSkills,
  );
  return {
    ...record,
    result,
    persistedStatus:
      result.status === 'HARD_REJECTED' ? 'HARD_REJECTED' : 'DISCOVERED',
    verifiedExtraction: extraction,
  };
}
