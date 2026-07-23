/**
 * Deterministic factor scoring — 100-point model.
 *
 * From spec Section 7: scores a job against the verified candidate profile
 * using weighted factors. Only verified skills count positively.
 *
 * This is the deterministic layer. AI-assisted scoring (for nuanced role-fit
 * analysis) is added in Phase 3.
 */

import type { NormalizedJob, SkillEntry } from '@job-app/core';
import type { ScoreFactors, StructuredScore, EligibilityStatus, WorkSetup } from '@job-app/core';
import { scoreToRecommendation } from '@job-app/core';

/** Target role families from spec Section 3 */
const TARGET_ROLE_KEYWORDS: Record<string, string[]> = {
  'full_stack': ['full stack', 'fullstack', 'full-stack', 'web developer', 'software developer', 'software engineer'],
  'frontend': ['front end', 'frontend', 'front-end', 'react', 'vue', 'angular', 'ui developer'],
  'mobile': ['mobile', 'flutter', 'android', 'ios', 'react native', 'app developer'],
  'ai_automation': ['ai', 'artificial intelligence', 'machine learning', 'ml', 'automation', 'agentic', 'llm'],
  'nocode': ['flutterflow', 'no-code', 'no code', 'low-code', 'low code', 'bubble', 'webflow'],
  'uiux': ['ui/ux', 'ui ux', 'ux designer', 'ui designer', 'product designer', 'figma'],
  'technical_support': ['technical support', 'it support', 'help desk', 'helpdesk', 'tech support', 'support engineer'],
  'graduate': ['graduate', 'fresh grad', 'entry level', 'entry-level', 'junior', 'intern', 'trainee'],
};

interface ScoringInput {
  job: NormalizedJob;
  verifiedSkills: SkillEntry[];
  eligibilityStatus: EligibilityStatus;
  workSetup: WorkSetup;
}

/**
 * Scores a job against the candidate profile using the 100-point factor model.
 *
 * Factor weights:
 * - Role/title fit: 20
 * - Verified technical match: 25
 * - Experience/seniority fit: 15
 * - Location and eligibility: 15
 * - Work-setup preference: 10
 * - Employment and schedule fit: 5
 * - Project/domain relevance: 5
 * - Freshness and credibility: 5
 */
export function scoreJob(input: ScoringInput): StructuredScore {
  const { job, verifiedSkills, eligibilityStatus, workSetup } = input;
  const titleLower = job.title.toLowerCase();
  const descLower = job.description.toLowerCase();
  const text = `${titleLower} ${descLower}`;

  const verifiedSkillNames = verifiedSkills
    .filter((s) => s.allowed_in_resume)
    .map((s) => s.name.toLowerCase());

  // --- Factor 1: Role/title fit (max 20) ---
  let roleFit = 0;
  let matchedRoleFamily = '';
  for (const [family, keywords] of Object.entries(TARGET_ROLE_KEYWORDS)) {
    const matches = keywords.filter((kw) => titleLower.includes(kw));
    if (matches.length > 0) {
      const familyScore = Math.min(matches.length * 7, 20);
      if (familyScore > roleFit) {
        roleFit = familyScore;
        matchedRoleFamily = family;
      }
    }
  }

  // --- Factor 2: Verified technical match (max 25) ---
  const requiredSkills = job.required_skills.map((s) => s.toLowerCase());
  const preferredSkills = job.preferred_skills.map((s) => s.toLowerCase());
  const allJobSkills = [...new Set([...requiredSkills, ...preferredSkills])];

  const matchedSkills: string[] = [];
  const missingRequired: string[] = [];
  const optionalGaps: string[] = [];

  for (const req of requiredSkills) {
    if (verifiedSkillNames.some((vs) => vs.includes(req) || req.includes(vs))) {
      matchedSkills.push(req);
    } else {
      missingRequired.push(req);
    }
  }
  for (const pref of preferredSkills) {
    if (!matchedSkills.includes(pref)) {
      if (verifiedSkillNames.some((vs) => vs.includes(pref) || pref.includes(vs))) {
        matchedSkills.push(pref);
      } else {
        optionalGaps.push(pref);
      }
    }
  }

  let technicalMatch = 0;
  if (allJobSkills.length > 0) {
    technicalMatch = Math.round((matchedSkills.length / allJobSkills.length) * 25);
  } else {
    // No skills listed — check description for verified skill mentions
    const descMatches = verifiedSkillNames.filter((vs) => text.includes(vs));
    technicalMatch = Math.min(descMatches.length * 5, 20);
    matchedSkills.push(...descMatches);
  }

  // --- Factor 3: Experience/seniority fit (max 15) ---
  let experienceFit = 0;
  const seniority = job.seniority;
  if (seniority === 'INTERN' || seniority === 'JUNIOR') {
    experienceFit = 15; // Perfect match for fresh graduate
  } else if (seniority === 'UNKNOWN') {
    experienceFit = 10; // Could be junior
    if (titleLower.includes('junior') || titleLower.includes('entry') || titleLower.includes('graduate')) {
      experienceFit = 14;
    }
  } else if (seniority === 'MID') {
    experienceFit = 5; // Stretch but possible
  } else {
    experienceFit = 0; // Senior+ is unrealistic
  }

  // Check years requirement
  if (job.years_experience_min !== null) {
    if (job.years_experience_min <= 1) experienceFit = Math.max(experienceFit, 13);
    else if (job.years_experience_min <= 2) experienceFit = Math.min(experienceFit, 8);
    else if (job.years_experience_min <= 3) experienceFit = Math.min(experienceFit, 4);
    else experienceFit = Math.min(experienceFit, 1);
  }

  // --- Factor 4: Location and eligibility (max 15) ---
  let locationEligibility = 0;
  if (eligibilityStatus === 'ELIGIBLE') locationEligibility = 15;
  else if (eligibilityStatus === 'REQUIRES_REVIEW') locationEligibility = 7;
  else if (eligibilityStatus === 'LOCATION_REVIEW') locationEligibility = 10;
  else locationEligibility = 0;

  // --- Factor 5: Work-setup preference (max 10) ---
  let workSetupFit = 0;
  if (workSetup === 'REMOTE') workSetupFit = 10; // Best for candidate
  else if (workSetup === 'HYBRID') workSetupFit = 7;
  else if (workSetup === 'ONSITE') workSetupFit = 5;
  else if (workSetup === 'TEMPORARY_REMOTE') workSetupFit = 4;
  else workSetupFit = 3; // UNCLEAR

  // --- Factor 6: Employment and schedule fit (max 5) ---
  let employmentFit = 3; // Default
  if (job.employment_type === 'FULL_TIME') employmentFit = 5;
  else if (job.employment_type === 'FREELANCE' || job.employment_type === 'CONTRACT') employmentFit = 4;
  else if (job.employment_type === 'INTERNSHIP') employmentFit = 5;
  else if (job.employment_type === 'PART_TIME') employmentFit = 3;

  // --- Factor 7: Project/domain relevance (max 5) ---
  let projectRelevance = 0;
  // Check if job domain matches verified project domains
  if (text.includes('food') || text.includes('delivery') || text.includes('marketplace')) projectRelevance += 2; // HAPAG
  if (text.includes('government') || text.includes('public sector')) projectRelevance += 2; // DOST
  if (text.includes('social') || text.includes('community') || text.includes('hangout')) projectRelevance += 2; // Paampom
  projectRelevance = Math.min(projectRelevance, 5);

  // --- Factor 8: Freshness and credibility (max 5) ---
  let freshness = 3; // Default
  if (job.date_posted) {
    const daysOld = (Date.now() - new Date(job.date_posted).getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld <= 3) freshness = 5;
    else if (daysOld <= 7) freshness = 4;
    else if (daysOld <= 14) freshness = 3;
    else if (daysOld <= 30) freshness = 2;
    else freshness = 1;
  }

  // --- Compute total ---
  const factors: ScoreFactors = {
    role_fit: roleFit,
    technical_match: technicalMatch,
    experience_fit: experienceFit,
    location_eligibility: locationEligibility,
    work_setup_fit: workSetupFit,
    employment_fit: employmentFit,
    project_relevance: projectRelevance,
    freshness,
  };

  const score = Object.values(factors).reduce((sum, v) => sum + v, 0);

  // Risk flags
  const riskFlags: string[] = [];
  if (missingRequired.length > requiredSkills.length / 2) {
    riskFlags.push(`Missing ${missingRequired.length}/${requiredSkills.length} required skills`);
  }
  if (eligibilityStatus === 'REQUIRES_REVIEW') {
    riskFlags.push('Eligibility unconfirmed — needs human review');
  }
  if (workSetup === 'UNCLEAR') {
    riskFlags.push('Work setup unclear');
  }

  const evidence: string[] = [];
  if (matchedRoleFamily) evidence.push(`Matched role family: ${matchedRoleFamily}`);
  if (matchedSkills.length > 0) evidence.push(`Matched skills: ${matchedSkills.join(', ')}`);
  if (eligibilityStatus === 'ELIGIBLE') evidence.push('Eligibility confirmed');

  const reason = buildReason(score, matchedSkills, missingRequired, seniority, eligibilityStatus);

  return {
    score,
    factors,
    category: job.category ?? 'INTERNATIONAL',
    recommendation: scoreToRecommendation(score, false),
    eligibility_status: eligibilityStatus,
    work_setup: workSetup,
    matched_verified_skills: matchedSkills,
    missing_required_skills: missingRequired,
    optional_gaps: optionalGaps,
    risk_flags: riskFlags,
    evidence,
    reason,
  };
}

function buildReason(
  score: number,
  matched: string[],
  missing: string[],
  seniority: string,
  eligibility: EligibilityStatus,
): string {
  const parts: string[] = [];
  if (score >= 85) parts.push('Strong overall match.');
  else if (score >= 75) parts.push('Good match with minor gaps.');
  else if (score >= 65) parts.push('Moderate match — review if gaps are learnable.');
  else parts.push('Weak match — significant gaps.');

  if (matched.length > 0) parts.push(`${matched.length} verified skill(s) matched.`);
  if (missing.length > 0) parts.push(`${missing.length} required skill(s) missing.`);
  if (seniority === 'MID') parts.push('Mid-level role — stretch for fresh graduate.');
  if (eligibility === 'REQUIRES_REVIEW') parts.push('Eligibility needs human verification.');

  return parts.join(' ');
}
