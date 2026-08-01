import { cleanJobContent } from '../content-cleaner.js';
import { extractFromJsonLd } from '../adapters/url-extractor.js';
import { extractFreelanceQualificationSkills } from './classification.js';

export type FreelancePageType =
  | 'INDIVIDUAL_OPPORTUNITY'
  | 'SEARCH_OR_CATEGORY_PAGE'
  | 'ARTICLE_OR_GUIDE'
  | 'SERVICE_OR_PROFILE_PAGE'
  | 'REPOST_OR_AGGREGATOR'
  | 'UNKNOWN';

export type FreelancePageQualityOutcome =
  | 'VALID_INDIVIDUAL_OPPORTUNITY'
  | 'REVIEW_SCOPE_MANUALLY'
  | 'NON_OPPORTUNITY_PAGE';

export type FreelancePageQualityReason =
  | 'ORIGINAL_PAGE_HAS_USABLE_SCOPE'
  | 'ORIGINAL_PAGE_HAS_TOO_LITTLE_SCOPE'
  | 'SEARCH_OR_CATEGORY_PAGE_NOT_AN_OPPORTUNITY'
  | 'ARTICLE_OR_GUIDE_NOT_AN_OPPORTUNITY'
  | 'SERVICE_OR_PROFILE_PAGE_NOT_AN_OPPORTUNITY'
  | 'DUPLICATE_OR_REPOST_WITH_WEAKER_EVIDENCE'
  | 'UNSUPPORTED_OR_AMBIGUOUS_PAGE_TYPE';

export interface FreelancePageQualityAssessment {
  pageType: FreelancePageType;
  outcome: FreelancePageQualityOutcome;
  reason: FreelancePageQualityReason;
  taskScopeEvidenceCount: number;
  requiredSkillEvidenceCount: number;
}

const ARTICLE_TITLE = /\b(?:best|top)\s+(?:\d+\s+)?(?:freelance\s+)?(?:jobs?|websites?|platforms?)\b|\b(?:guide|how to|salary guide)\b/i;
const CATEGORY_TITLE = /\b(?:freelance|remote|javascript|developer|contract|part[- ]time)\s+jobs?\s+(?:in|for|at|—|-)\b|^freelance jobs\b|\bfreelance\b.{0,80}\bprojects?(?:\s+in\s+\d{4})?\b|^\d+\s+results?\s+for\b|\bjobs?\s+in\s+[A-Z][A-Za-z ]+(?:\||$)|\bjobs?\s+with\s+top\b|\bhiring\b.{0,80}\bjobs?\b|\bjobs accepting\b/i;
const SERVICE_TITLE = /\bhire\s+(?:top\s+)?(?:freelance\s+)?(?:developers?|talent|professionals?)\b|\bfind\s+(?:a\s+)?freelancer\b|^expert application$/i;
const ARTICLE_PATH = /\/(?:blog|articles?|guides?|resources?|news)(?:\/|$)/i;
const CATEGORY_PATH = /\/(?:categories?|tags?|topics?|skillsearch|job-search|remote-jobs)(?:\/|$)|\/jobs\/(?:all|search)(?:\/|$)|\/jobs\/[^/]+\/in\/[^/]+\/?$|\/freelance\/(?:developers?|writers?|designers?|talent)\/?$|^\/freelance-[^/]+-jobs\/?$/i;
const SERVICE_PATH = /\/(?:hire-developers?|hire-freelancers?|freelancers?|talent|services?)(?:\/|$)/i;
const GENERIC_ROOT_PATH = /^\/$|^\/(?:jobs?|freelance-jobs?|careers?)\/?$/i;
const REPOST_HOST = /(?:^|\.)(?:bebee\.[a-z.]+|indeed\.com|jobstreet\.[a-z.]+|glassdoor\.[a-z.]+)$/i;
const NON_OPPORTUNITY_PLATFORM_HOST = /(?:^|\.)(?:facebook\.com|youtube\.com|reddit\.com|upwork\.com|freelancer\.com)$/i;

const TASK_ACTION = /\b(?:add|build|clean|configure|connect|convert|create|deliver|document|edit|fix|format|implement|integrate|label|maintain|migrate|optimize|prepare|publish|research|resize|review|set up|setup|test|transcribe|troubleshoot|update|upload|validate|verify)\b/i;
const TASK_OBJECT = /\b(?:api|article|automation|bug|caption|chatbot|cms|content|copy|data|database|document|faq|form|integration|landing page|listing|page|product|report|research|responsive|spreadsheet|test|transcript|video|website|workflow)\b/i;
const CONTRACT_EVIDENCE = /\b(?:freelance|contract(?:or)?|fixed[- ]price|hourly|part[- ]time|project[- ]based|short[- ]term|temporary|gig)\b/i;

function safeUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function classifyFreelanceDiscoveryLead(input: {
  url: string;
  title: string;
}): FreelancePageQualityAssessment | null {
  const parsed = safeUrl(input.url);
  if (!parsed) {
    return {
      pageType: 'UNKNOWN',
      outcome: 'NON_OPPORTUNITY_PAGE',
      reason: 'UNSUPPORTED_OR_AMBIGUOUS_PAGE_TYPE',
      taskScopeEvidenceCount: 0,
      requiredSkillEvidenceCount: 0,
    };
  }
  const title = cleanJobContent(input.title, 500);
  const path = parsed.pathname;
  if (NON_OPPORTUNITY_PLATFORM_HOST.test(parsed.hostname.toLocaleLowerCase())) {
    return {
      pageType: 'SEARCH_OR_CATEGORY_PAGE', outcome: 'NON_OPPORTUNITY_PAGE',
      reason: 'SEARCH_OR_CATEGORY_PAGE_NOT_AN_OPPORTUNITY',
      taskScopeEvidenceCount: 0, requiredSkillEvidenceCount: 0,
    };
  }
  if (ARTICLE_TITLE.test(title) || ARTICLE_PATH.test(path)) {
    return {
      pageType: 'ARTICLE_OR_GUIDE', outcome: 'NON_OPPORTUNITY_PAGE',
      reason: 'ARTICLE_OR_GUIDE_NOT_AN_OPPORTUNITY',
      taskScopeEvidenceCount: 0, requiredSkillEvidenceCount: 0,
    };
  }
  if (SERVICE_TITLE.test(title) || SERVICE_PATH.test(path)) {
    return {
      pageType: 'SERVICE_OR_PROFILE_PAGE', outcome: 'NON_OPPORTUNITY_PAGE',
      reason: 'SERVICE_OR_PROFILE_PAGE_NOT_AN_OPPORTUNITY',
      taskScopeEvidenceCount: 0, requiredSkillEvidenceCount: 0,
    };
  }
  if (CATEGORY_TITLE.test(title) || CATEGORY_PATH.test(path) || GENERIC_ROOT_PATH.test(path)) {
    return {
      pageType: 'SEARCH_OR_CATEGORY_PAGE', outcome: 'NON_OPPORTUNITY_PAGE',
      reason: 'SEARCH_OR_CATEGORY_PAGE_NOT_AN_OPPORTUNITY',
      taskScopeEvidenceCount: 0, requiredSkillEvidenceCount: 0,
    };
  }
  return null;
}

export function countFreelanceTaskScopeEvidence(value: string): number {
  const clauses = cleanJobContent(value)
    .split(/\r?\n|(?<=[.!?;])\s+/)
    .map((clause) => clause.replace(/^[-*\u2022]+\s*/, '').trim())
    .filter(Boolean);
  return clauses.filter((clause) => TASK_ACTION.test(clause) && TASK_OBJECT.test(clause)).length;
}

export function assessFreelanceOpportunityPage(input: {
  url: string;
  title: string;
  company: string;
  description: string;
  employmentType: string | null;
  html?: string;
}): FreelancePageQualityAssessment {
  const leadRejection = classifyFreelanceDiscoveryLead({ url: input.url, title: input.title });
  if (leadRejection) return leadRejection;

  const taskScopeEvidenceCount = countFreelanceTaskScopeEvidence(input.description);
  const skills = extractFreelanceQualificationSkills(input.description);
  const requiredSkillEvidenceCount = skills.required.length;
  const parsed = safeUrl(input.url);
  const repost = parsed ? REPOST_HOST.test(parsed.hostname.toLocaleLowerCase()) : false;
  const hasJobPosting = input.html ? extractFromJsonLd(input.html) !== null : false;
  const contractEvidence = CONTRACT_EVIDENCE.test(
    `${input.employmentType ?? ''}\n${input.description}`,
  );

  if (repost && taskScopeEvidenceCount === 0) {
    return {
      pageType: 'REPOST_OR_AGGREGATOR', outcome: 'REVIEW_SCOPE_MANUALLY',
      reason: 'DUPLICATE_OR_REPOST_WITH_WEAKER_EVIDENCE',
      taskScopeEvidenceCount, requiredSkillEvidenceCount,
    };
  }
  if (taskScopeEvidenceCount === 0 || (!hasJobPosting && !contractEvidence)) {
    return {
      pageType: repost ? 'REPOST_OR_AGGREGATOR' : 'INDIVIDUAL_OPPORTUNITY',
      outcome: 'REVIEW_SCOPE_MANUALLY',
      reason: 'ORIGINAL_PAGE_HAS_TOO_LITTLE_SCOPE',
      taskScopeEvidenceCount, requiredSkillEvidenceCount,
    };
  }
  return {
    pageType: repost ? 'REPOST_OR_AGGREGATOR' : 'INDIVIDUAL_OPPORTUNITY',
    outcome: 'VALID_INDIVIDUAL_OPPORTUNITY',
    reason: 'ORIGINAL_PAGE_HAS_USABLE_SCOPE',
    taskScopeEvidenceCount, requiredSkillEvidenceCount,
  };
}
