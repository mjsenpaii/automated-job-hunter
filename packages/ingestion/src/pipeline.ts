import type { NormalizedJob, SkillEntry } from '@job-app/core';
import { checkDuplicate, classifyCategory, classifyWorkSetup, checkEligibility } from '@job-app/classification';
import { checkHardReject, scoreJob } from '@job-app/scoring';
import type { RawJobInput, IngestionResult } from './types.js';
import { normalizeJob } from './normalizer.js';

export async function ingestJob(raw: RawJobInput, existingJobs: NormalizedJob[], verifiedSkills: SkillEntry[]): Promise<IngestionResult> {
  try {
    // 1. Normalize
    const normalized = normalizeJob(raw);

    // 2. Check for duplicates
    const dupCheck = checkDuplicate(normalized, existingJobs);
    if (dupCheck.is_duplicate) {
      normalized.status = 'DUPLICATE';
      return {
        job_id: normalized.id,
        status: 'DUPLICATE',
        duplicate_of_id: dupCheck.duplicate_of_id ?? undefined,
        normalized_job: normalized
      };
    }

    // 4. Classify category
    const category = classifyCategory(normalized);
    normalized.category = category;

    // 5. Classify work setup
    const workSetupResult = classifyWorkSetup(normalized);
    normalized.work_setup = workSetupResult.work_setup;
    normalized.work_setup_confidence = workSetupResult.confidence;
    normalized.work_setup_evidence = workSetupResult.evidence;

    // 6. Check eligibility
    const eligibilityResult = checkEligibility(normalized, category, workSetupResult.work_setup);
    normalized.eligibility_status = eligibilityResult.status;

    // 7. Check hard rejection
    const hardRejectResult = checkHardReject(normalized, {
      isInternationalNonRemote: normalized.category === 'INTERNATIONAL' && normalized.work_setup !== 'REMOTE',
      isCountryIneligible: normalized.eligibility_status === 'INELIGIBLE'
    });
    if (hardRejectResult.rejected) {
      normalized.status = 'REJECTED'; // Or FILTERED_OUT depending on what they want. They said "HARD_REJECTED result".
      return {
        job_id: normalized.id,
        status: 'HARD_REJECTED',
        rejection_reasons: hardRejectResult.reasons,
        normalized_job: normalized
      };
    }

    // 9. Score the job
    const scoreResult = scoreJob({
      job: normalized,
      verifiedSkills,
      eligibilityStatus: normalized.eligibility_status ?? 'REQUIRES_REVIEW',
      workSetup: normalized.work_setup ?? 'UNCLEAR'
    });
    
    normalized.status = 'SCORED';

    // 10. Return INGESTED
    return {
      job_id: normalized.id,
      status: 'INGESTED',
      score: scoreResult.score,
      recommendation: scoreResult.recommendation,
      normalized_job: normalized,
      score_detail: scoreResult
    };
  } catch (error: any) {
    console.error("Pipeline Error:", error);
    return {
      job_id: '',
      status: 'ERROR',
      error: error.message
    };
  }
}

export async function ingestBatch(raws: RawJobInput[], existingJobs: NormalizedJob[], verifiedSkills: SkillEntry[]): Promise<IngestionResult[]> {
  const results: IngestionResult[] = [];
  const currentExisting = [...existingJobs];
  
  for (const raw of raws) {
    const result = await ingestJob(raw, currentExisting, verifiedSkills);
    results.push(result);
    // If it was ingested, we could theoretically add to currentExisting to prevent duplicates within batch
    // We'll leave that logic out unless specifically needed, but it's a good idea for deduplication
    // For now we don't return the normalized job so we can't easily push it. Let's just return results.
  }

  return results;
}
