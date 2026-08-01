import { createHash } from 'node:crypto';
import { canonicalizeJobUrl } from '@job-app/classification';
import type { SkillEntry } from '@job-app/core';
import { cleanJobContent } from '../content-cleaner.js';
import {
  FREELANCE_LEARNING_HOURS_MAX,
  FREELANCE_LEARNING_HOURS_MIN,
  FreelanceOpportunitySchema,
  type FreelanceOpportunity,
  type FreelanceOpportunityCandidate,
  type FreelancePay,
  type FreelanceReadinessAssessment,
  type FreelanceRiskAssessment,
  type FreelanceRiskReason,
  type FreelanceOpportunityCategory,
  type FreelanceReadinessBlocker,
  type FreelanceScanReadinessDiagnostic,
  type FreelanceView,
} from './contracts.js';
import {
  FIRST_PARTY_ROLE_CLOSED_HINT,
  POTENTIALLY_STALE_FORUM_LISTING_HINT,
} from './forum-listing.js';

export interface ExplicitPayInput {
  kind: 'HOURLY' | 'FIXED_PRICE' | 'UNKNOWN';
  currency?: string | null;
  minimum?: number | null;
  maximum?: number | null;
  period?: 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | null;
  evidenceLabel?: string | null;
}

export function parseExplicitFreelancePayText(
  value: string | null | undefined,
  minimumHourlyUsd = 3,
): FreelancePay {
  const text = cleanJobContent(value ?? '').replace(/\u2013|\u2014/g, '-').trim();
  if (!text) return normalizeFreelancePay({ kind: 'UNKNOWN' }, minimumHourlyUsd);
  const currencyMatch = text.match(/\b(USD|EUR|GBP|PHP|AUD|CAD|NZD|SGD)\b/i);
  const symbolCurrency = text.includes('US$') ? 'USD'
    : text.includes('₱') ? 'PHP'
      : text.includes('£') ? 'GBP'
        : text.includes('€') ? 'EUR'
          : text.includes('$') ? null
            : null;
  const currency = currencyMatch?.[1]?.toUpperCase() ?? symbolCurrency;
  const hourly = /\b(per\s*hour|hourly|\/\s*h(?:ou)?r?)\b/i.test(text);
  const fixed = /\b(fixed(?:[- ]price)?|project budget|total budget)\b/i.test(text);
  const values = [...text.matchAll(/(?:USD|EUR|GBP|PHP|AUD|CAD|NZD|SGD|US\$|[$₱£€])?\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*[kK]?/g)]
    .map((match) => {
      const parsed = Number(match[1]?.replaceAll(',', ''));
      return /[kK]\s*$/.test(match[0]) ? parsed * 1_000 : parsed;
    })
    .filter((item) => Number.isFinite(item));
  if (!hourly && !fixed) {
    return normalizeFreelancePay({ kind: 'UNKNOWN', currency, evidenceLabel: text.slice(0, 240) }, minimumHourlyUsd);
  }
  return normalizeFreelancePay({
    kind: hourly ? 'HOURLY' : 'FIXED_PRICE',
    currency,
    minimum: values[0] ?? null,
    maximum: values[1] ?? values[0] ?? null,
    period: hourly ? 'HOUR' : null,
    evidenceLabel: text.slice(0, 240),
  }, minimumHourlyUsd);
}

export function normalizeFreelancePay(
  input: ExplicitPayInput,
  minimumHourlyUsd = 3,
): FreelancePay {
  const currency = input.currency?.trim().toUpperCase() || null;
  const minimum = Number.isFinite(input.minimum) ? input.minimum ?? null : null;
  const maximum = Number.isFinite(input.maximum) ? input.maximum ?? null : null;
  const hourly = input.kind === 'HOURLY' || input.period === 'HOUR';
  let classification: FreelancePay['classification'];
  if (input.kind === 'FIXED_PRICE') {
    classification = currency && currency !== 'USD'
      ? 'NON_USD_UNCONVERTED'
      : 'FIXED_PRICE_SCOPE_REQUIRED';
  } else if (!hourly || minimum === null || currency === null) {
    classification = 'UNKNOWN';
  } else if (currency !== 'USD') {
    classification = 'NON_USD_UNCONVERTED';
  } else {
    classification = minimum > minimumHourlyUsd
      ? 'ABOVE_MINIMUM'
      : 'BELOW_MINIMUM';
  }
  return {
    kind: input.kind,
    originalCurrency: currency,
    minimum,
    maximum,
    period: input.period ?? null,
    statedHourlyMinimum: hourly ? minimum : null,
    statedHourlyMaximum: hourly ? maximum : null,
    estimatedEffectiveHourlyRate: null,
    classification,
    evidenceLabel: input.evidenceLabel?.trim().slice(0, 240) || null,
  };
}

const SKILL_CATALOG = [
  ['HTML', ['html']],
  ['CSS', ['css', 'responsive design']],
  ['JavaScript', ['javascript', 'js']],
  ['TypeScript', ['typescript']],
  ['React', ['react']],
  ['Next.js', ['next.js', 'nextjs']],
  ['Node.js', ['node.js', 'nodejs']],
  ['PHP', ['php']],
  ['WordPress', ['wordpress']],
  ['CMS', ['cms', 'content management system']],
  ['REST APIs', ['rest api', 'restful api', 'api integration']],
  ['n8n', ['n8n']],
  ['Zapier', ['zapier']],
  ['Make.com', ['make.com', 'integromat']],
  ['Google Sheets', ['google sheets']],
  ['Excel', ['excel', 'spreadsheet']],
  ['Web research', ['web research', 'internet research']],
  ['Data entry', ['data entry']],
  ['Data cleanup', ['data cleanup', 'data cleaning']],
  ['Manual QA', ['manual testing', 'website qa', 'qa tester']],
  ['Technical writing', ['technical documentation', 'documentation formatting']],
  ['Canva', ['canva']],
  ['Product listing', ['product listing']],
  ['Transcription', ['transcription', 'caption correction']],
  ['Data labeling', ['data labeling', 'data annotation']],
  ['Video editing', ['video clipping', 'video editing', 'captions']],
  ['Chatbot setup', ['chatbot', 'faq assistant']],
  ['Documented internal tool', ['documented internal tool', 'client internal tool']],
  ['SQL', ['sql', 'database cleanup']],
] as const;

function normalized(value: string): string {
  return cleanJobContent(value).toLocaleLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim();
}

function hasAlias(text: string, alias: string): boolean {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped.replace(/\s+/g, '\\s+')}([^a-z0-9]|$)`, 'i').test(text);
}

export function extractSupportedFreelanceSkills(text: string): string[] {
  const source = normalized(text);
  return SKILL_CATALOG.flatMap(([name, aliases]) =>
    aliases.some((alias) => hasAlias(source, alias)) ? [name] : [],
  );
}

const REQUIREMENT_HEADING = /^(requirements?|qualifications?|what you(?:'ll| will) need|who you are|must have|minimum qualifications?)\s*:?$/i;
const PREFERRED_HEADING = /^(preferred qualifications?|nice to have|bonus|preferred)\s*:?$/i;
const OTHER_HEADING = /^(responsibilities?|what you(?:'ll| will) do|about|benefits?|company|the role|scope)\s*:?$/i;
const REQUIRED_CUE = /\b(required|must|you have|you are proficient|experience with|knowledge of|proficiency in|familiarity with)\b/i;
const PREFERRED_CUE = /\b(preferred|nice to have|bonus|ideally|a plus|advantageous|desired but not required)\b/i;

export function extractFreelanceQualificationSkills(description: string): {
  required: string[];
  preferred: string[];
} {
  const lines = cleanJobContent(description)
    .split(/\r?\n|(?<=[.!?;])\s+/)
    .map((line) => line.replace(/^[-*\u2022]+\s*/, '').trim())
    .filter(Boolean);
  let section: 'REQUIRED' | 'PREFERRED' | 'OTHER' = 'OTHER';
  const required = new Set<string>();
  const preferred = new Set<string>();
  for (const line of lines) {
    if (REQUIREMENT_HEADING.test(line)) {
      section = 'REQUIRED';
      continue;
    }
    if (PREFERRED_HEADING.test(line)) {
      section = 'PREFERRED';
      continue;
    }
    if (OTHER_HEADING.test(line)) {
      section = 'OTHER';
      continue;
    }
    const skills = extractSupportedFreelanceSkills(line);
    if (skills.length === 0) continue;
    const preferredLine = PREFERRED_CUE.test(line) || section === 'PREFERRED';
    const requiredLine = !preferredLine && (REQUIRED_CUE.test(line) || section === 'REQUIRED');
    if (preferredLine) skills.forEach((skill) => preferred.add(skill));
    else if (requiredLine) skills.forEach((skill) => required.add(skill));
  }
  for (const skill of preferred) required.delete(skill);
  return { required: [...required], preferred: [...preferred] };
}

const FAST_LEARNING = new Map<string, {
  adjacent: readonly string[];
  hours: readonly [number, number];
  practice: string;
  sample: string;
}>([
  ['WordPress', { adjacent: ['HTML', 'CSS', 'JavaScript', 'PHP', 'CMS'], hours: [8, 16], practice: 'Build and edit a local WordPress landing page.', sample: 'A responsive WordPress landing page with one form and documented edits.' }],
  ['CMS', { adjacent: ['WordPress', 'HTML', 'Technical writing'], hours: [4, 8], practice: 'Practice content entry, media handling, and rollback in a sample CMS.', sample: 'A formatted CMS article set with accessibility checks.' }],
  ['n8n', { adjacent: ['REST APIs', 'JavaScript', 'Node.js', 'Zapier', 'Make.com'], hours: [8, 16], practice: 'Build, test, and document one n8n webhook workflow.', sample: 'A webhook-to-spreadsheet n8n workflow with error handling.' }],
  ['Zapier', { adjacent: ['REST APIs', 'n8n', 'Make.com', 'Google Sheets'], hours: [4, 10], practice: 'Build and test a multi-step Zap with filters and failure handling.', sample: 'A form-to-sheet-to-email Zap with a test log.' }],
  ['Make.com', { adjacent: ['REST APIs', 'n8n', 'Zapier', 'Google Sheets'], hours: [6, 12], practice: 'Build a documented scenario with branching and error handling.', sample: 'A Make.com lead-routing scenario using test data.' }],
  ['Canva', { adjacent: ['Technical writing', 'CMS'], hours: [4, 8], practice: 'Practice resizing and exporting a small consistent asset set.', sample: 'A five-size campaign asset set using one design system.' }],
  ['Data labeling', { adjacent: ['Data entry', 'Data cleanup', 'Manual QA'], hours: [4, 8], practice: 'Label a small public dataset using a written rubric and self-audit.', sample: 'A labeled sample with an annotation guide and quality checklist.' }],
  ['Google Sheets', { adjacent: ['Excel', 'Data cleanup', 'Data entry'], hours: [4, 10], practice: 'Practice formulas, validation, deduplication, and protected ranges.', sample: 'A cleaned spreadsheet with formulas and a validation report.' }],
  ['Manual QA', { adjacent: ['HTML', 'CSS', 'JavaScript', 'Technical writing'], hours: [4, 10], practice: 'Write and execute browser test cases against a public demo site.', sample: 'A concise test plan, bug report set, and retest notes.' }],
  ['Transcription', { adjacent: ['Technical writing', 'Data entry'], hours: [4, 6], practice: 'Clean a short public transcript against a style guide.', sample: 'A before-and-after transcript with a correction checklist.' }],
  ['Video editing', { adjacent: ['Canva', 'Technical writing'], hours: [8, 20], practice: 'Clip, caption, and export a short practice video.', sample: 'A captioned sixty-second clip with source and export notes.' }],
  ['Chatbot setup', { adjacent: ['REST APIs', 'JavaScript', 'Technical writing'], hours: [12, 24], practice: 'Build a bounded FAQ bot from a small verified document set.', sample: 'A simple FAQ assistant with refusal and source-link tests.' }],
  ['REST APIs', { adjacent: ['JavaScript', 'TypeScript', 'Node.js', 'PHP', 'HTTP'], hours: [8, 16], practice: 'Connect to one documented public API and test success and failure responses.', sample: 'A documented API integration using test data and safe error handling.' }],
  ['Web research', { adjacent: ['Technical writing', 'Data entry', 'Google Sheets', 'Excel'], hours: [4, 8], practice: 'Research a bounded public topic and record sources using a supplied rubric.', sample: 'A sourced research sheet with validation notes and duplicate checks.' }],
  ['Data entry', { adjacent: ['Google Sheets', 'Excel', 'Data cleanup', 'Technical writing'], hours: [4, 6], practice: 'Enter and validate a small public fixture using a written field guide.', sample: 'A validated sample dataset with an error and completeness checklist.' }],
  ['Data cleanup', { adjacent: ['Google Sheets', 'Excel', 'SQL', 'Data entry'], hours: [4, 10], practice: 'Clean and deduplicate a small public dataset without changing source truth.', sample: 'A cleaned data file with a reversible transformation log.' }],
  ['Product listing', { adjacent: ['Data entry', 'CMS', 'Technical writing', 'Google Sheets'], hours: [4, 8], practice: 'Create a small product catalog from supplied public fixture data.', sample: 'Five consistent sample listings with an attribute and image checklist.' }],
  ['Documented internal tool', { adjacent: ['Technical writing', 'Web research', 'Data entry', 'CMS'], hours: [4, 12], practice: 'Follow a safe sandbox guide and document one end-to-end internal-tool workflow.', sample: 'A redacted workflow checklist using public or synthetic data.' }],
]);

const HARD_RISK_PATTERNS: ReadonlyArray<[RegExp, FreelanceRiskReason]> = [
  [/\b(pay|deposit|fee)\b.{0,35}\b(to get|before (?:you )?start|obtain)\b/i, 'PAY_TO_WORK'],
  [/\b(account rental|rent your account)\b/i, 'ACCOUNT_RENTAL'],
  [/\b(otp|one[- ]time password|share your password)\b/i, 'CREDENTIAL_OR_OTP_REQUEST'],
  [/\b(fake reviews?|fake engagement|buy likes)\b/i, 'FAKE_REVIEW_OR_ENGAGEMENT'],
  [/\bimpersonat(?:e|ion)\b/i, 'IMPERSONATION'],
  [/\b(do my homework|write my thesis|academic cheating|take my exam)\b/i, 'ACADEMIC_CHEATING'],
  [/\b(malware|credential theft|steal credentials|phishing kit)\b/i, 'MALWARE_OR_CREDENTIAL_THEFT'],
  [/\b(bypass (?:captcha|anti[- ]bot|platform protection)|scrape private)\b/i, 'PROHIBITED_AUTOMATION_OR_SCRAPING'],
  [/\b(crypto|bitcoin)\b.{0,30}\b(deposit|investment)\b/i, 'CRYPTO_DEPOSIT_OR_INVESTMENT'],
  [/\b(money laundering|reshipping|parcel mule)\b/i, 'MONEY_LAUNDERING_OR_RESHIPPING'],
  [/\b(use your identity|identity document misuse)\b/i, 'IDENTITY_DOCUMENT_MISUSE'],
  [/\b(adult content|pornograph)\b/i, 'ADULT_CONTENT'],
  [/\b(unlicensed medical|unlicensed legal|illegal activity)\b/i, 'ILLEGAL_OR_UNLICENSED_WORK'],
];

const REVIEW_RISK_PATTERNS: ReadonlyArray<[RegExp, FreelanceRiskReason]> = [
  [/\bunpaid (?:test|trial)\b/i, 'UNPAID_TEST_WORK'],
  [/\b(telegram only|whatsapp only)\b/i, 'MESSAGING_ONLY_RECRUITMENT'],
  [/\bpay off[- ]platform|off[- ]platform payment\b/i, 'OFF_PLATFORM_PAYMENT_REQUEST'],
  [/\bbuy (?:the )?equipment from\b/i, 'NAMED_SELLER_EQUIPMENT_PURCHASE'],
  [/\b(send|upload).{0,25}(passport|government id|identity document).{0,20}(immediately|urgent)\b/i, 'URGENT_PERSONAL_DOCUMENT_REQUEST'],
  [/\bbit\.ly\b|\btinyurl\.com\b|\bt\.co\b/i, 'SHORTENED_URL'],
];

export function assessFreelanceRisk(
  candidate: Pick<FreelanceOpportunityCandidate, 'title' | 'clientOrCompany' | 'publicDescription' | 'canonicalUrl' | 'categoryHints'>,
): FreelanceRiskAssessment {
  const text = `${candidate.title}\n${candidate.publicDescription}`;
  const reasons = new Set<FreelanceRiskReason>();
  for (const [pattern, reason] of HARD_RISK_PATTERNS) if (pattern.test(text)) reasons.add(reason);
  for (const [pattern, reason] of REVIEW_RISK_PATTERNS) if (pattern.test(text)) reasons.add(reason);
  if (candidate.clientOrCompany.trim().toLocaleLowerCase() === 'unknown') reasons.add('MISSING_CLIENT_IDENTITY');
  if (candidate.publicDescription.trim().length < 160) reasons.add('VAGUE_SCOPE');
  if (candidate.categoryHints.includes(POTENTIALLY_STALE_FORUM_LISTING_HINT)) {
    reasons.add('POTENTIALLY_STALE_LISTING');
  }
  const hard = [...reasons].some((reason) => HARD_RISK_PATTERNS.some(([, item]) => item === reason));
  const level = hard
    ? 'HARD_REJECTED'
    : reasons.size >= 2
      ? 'HIGH'
      : reasons.size === 1
        ? 'MEDIUM'
        : 'LOW';
  return {
    level,
    reasons: [...reasons].sort(),
    displayMessage: reasons.size > 0 ? 'Potential risk indicators detected.' : null,
  };
}

const SENIOR_OWNERSHIP = /\b(senior|lead|principal|architect|manager|director|head of|production owner|security owner)\b/i;
const REGULATED_OR_CERTIFIED = /(?:\b(?:mandatory|required)\b.{0,40}\b(?:certification|license|security clearance|bar admission|medical license|cpa)\b|\b(?:certification|license|security clearance|bar admission|medical license|cpa)\b.{0,40}\b(?:mandatory|required)\b|\b(?:medical diagnosis|legal representation|regulated financial advice|licensed engineering sign[- ]off)\b)/i;
const MATERIAL_EXPERIENCE = /\b(?:at least|minimum(?: of)?|requires?|must have)\s+(\d{1,2})\+?\s+years?\b|\b(\d{1,2})\+\s+years?\b|\b(\d{1,2})\s+years?\s+(?:of\s+)?(?:prior\s+|professional\s+)?experience\b/i;
const BOUNDED_SCOPE_ACTION = /\b(fix|update|configure|setup|set up|clean|format|upload|test|integrate|single|small|basic|simple|landing page|spreadsheet|workflow|listing|caption)\b/i;
const VAGUE_SCOPE_CUE = /\b(as needed|various tasks|details to be discussed|ongoing needs)\b/i;
const UNRELATED_ROLE_FAMILY = /\b(marketing|communications?|copywriter|writer|sales|account executive|recruiter|talent acquisition|bookkeeper|accountant)\b/i;

function explicitExperienceYears(candidate: FreelanceOpportunityCandidate): number | null {
  if (candidate.minimumExperienceYears !== null) {
    return candidate.minimumExperienceYears > 0 ? candidate.minimumExperienceYears : null;
  }
  const experienceMatch = `${candidate.title}\n${candidate.publicDescription}`.match(MATERIAL_EXPERIENCE);
  const years = Number(experienceMatch?.[1] ?? experienceMatch?.[2] ?? experienceMatch?.[3] ?? 0);
  return years > 0 ? years : null;
}

function candidateSkills(candidate: FreelanceOpportunityCandidate): string[] {
  return [...new Set([
    ...candidate.requiredSkills,
    ...extractSupportedFreelanceSkills(candidate.title),
  ])];
}

function verifiedSkillNames(skills: readonly SkillEntry[]): string[] {
  return [...new Set(skills
    .filter((skill) => skill.allowed_in_resume && ['VERIFIED', 'CV_STATED', 'USER_CONFIRMED', 'CERT'].includes(skill.verification_status))
    .map((skill) => skill.name.trim())
    .filter(Boolean))];
}

function matchesSkill(verified: readonly string[], required: string): boolean {
  const requiredText = normalized(required);
  return verified.some((skill) => {
    const skillText = normalized(skill);
    return skillText === requiredText || hasAlias(requiredText, skillText) || hasAlias(skillText, requiredText);
  });
}

function learningTemplate(skill: string) {
  return FAST_LEARNING.get(skill) ?? null;
}

export function assessFreelanceReadiness(options: {
  candidate: FreelanceOpportunityCandidate;
  verifiedSkills: readonly SkillEntry[];
  risk: FreelanceRiskAssessment;
  maxLearningHours?: number;
}): FreelanceReadinessAssessment {
  const { candidate, risk } = options;
  const maxLearningHours = Math.min(
    FREELANCE_LEARNING_HOURS_MAX,
    Math.max(FREELANCE_LEARNING_HOURS_MIN, options.maxLearningHours ?? FREELANCE_LEARNING_HOURS_MAX),
  );
  const verified = verifiedSkillNames(options.verifiedSkills);
  const required = candidateSkills(candidate);
  const transferableSkills = required.filter((skill) => matchesSkill(verified, skill));
  const missingSkills = required.filter((skill) => !matchesSkill(verified, skill));
  const text = `${candidate.title}\n${candidate.publicDescription}`;
  const explicitYears = explicitExperienceYears(candidate) ?? 0;
  const geographicallyEligible = deriveFreelanceViews(candidate).length > 0;
  const blocked = risk.level === 'HARD_REJECTED' ||
    SENIOR_OWNERSHIP.test(candidate.title) ||
    REGULATED_OR_CERTIFIED.test(text) ||
    explicitYears > 0 ||
    !geographicallyEligible;
  const learnable = missingSkills.map(learningTemplate);
  const everyGapLearnable = missingSkills.length > 0 && learnable.every(Boolean);
  const adjacency = missingSkills.flatMap((skill) => learningTemplate(skill)?.adjacent ?? []);
  const adjacentVerified = verified.filter((skill) => adjacency.some((adjacent) => matchesSkill([skill], adjacent)));
  const scopeClear = candidate.publicDescription.length >= 160 && BOUNDED_SCOPE_ACTION.test(text);
  const learningScopeUncertain = scopeClear && VAGUE_SCOPE_CUE.test(text);

  if (!blocked && missingSkills.length === 0 && required.length > 0) {
    return {
      classification: 'READY_NOW',
      transferableSkills: transferableSkills.slice(0, 20),
      missingSkills: [],
      learningHoursMinimum: null,
      learningHoursMaximum: null,
      learningTimeUncertain: false,
      narrowGapReasons: ['CORE_SKILLS_VERIFIED'],
      practiceBeforeApplying: [],
      suggestedSampleProject: null,
      deliveryRisks: risk.reasons.slice(0, 10),
      confidence: 'HIGH',
      recommendedAction: 'REVIEW_AND_APPLY_MANUALLY',
      applicationReady: true,
    };
  }

  if (
    !blocked &&
    everyGapLearnable &&
    adjacentVerified.length > 0 &&
    scopeClear
  ) {
    const minimum = Math.max(
      FREELANCE_LEARNING_HOURS_MIN,
      ...learnable.map((item) => item?.hours[0] ?? FREELANCE_LEARNING_HOURS_MIN),
    );
    const maximum = Math.min(
      maxLearningHours,
      Math.max(...learnable.map((item) => item?.hours[1] ?? maxLearningHours)),
    );
    if (minimum <= maximum) {
      const primary = learnable.find(Boolean)!;
      return {
        classification: 'LEARNABLE_FAST_WITH_AI',
        transferableSkills: [...new Set([...transferableSkills, ...adjacentVerified])].slice(0, 20),
        missingSkills: missingSkills.slice(0, 20),
        learningHoursMinimum: learningScopeUncertain ? null : minimum,
        learningHoursMaximum: learningScopeUncertain ? null : maximum,
        learningTimeUncertain: learningScopeUncertain,
        narrowGapReasons: ['ADJACENT_VERIFIED_SKILLS', 'BOUNDED_LOW_RISK_SCOPE', 'TRUTHFUL_SAMPLE_POSSIBLE'],
        practiceBeforeApplying: [...new Set(learnable.flatMap((item) => item ? [item.practice] : []))].slice(0, 8),
        suggestedSampleProject: primary.sample,
        deliveryRisks: [
          'Do not claim existing experience with an unverified tool.',
          'Confirm the complete scope before agreeing to delivery.',
          ...risk.reasons.map((reason) => reason.replaceAll('_', ' ').toLocaleLowerCase()),
        ].slice(0, 10),
        confidence: learningScopeUncertain ? 'LOW' : 'MEDIUM',
        recommendedAction: learningScopeUncertain ? 'REVIEW_SCOPE_WITH_CLIENT' : 'BUILD_SAMPLE_FIRST',
        applicationReady: false,
      };
    }
  }

  return {
    classification: 'NOT_READY',
    transferableSkills: transferableSkills.slice(0, 20),
    missingSkills: missingSkills.slice(0, 20),
    learningHoursMinimum: null,
    learningHoursMaximum: null,
    learningTimeUncertain: true,
    narrowGapReasons: blocked ? ['MANDATORY_OR_HIGH_RISK_BOUNDARY'] : ['UNVERIFIED_OR_UNBOUNDED_SKILL_GAP'],
    practiceBeforeApplying: [],
    suggestedSampleProject: null,
    deliveryRisks: risk.reasons.slice(0, 10),
    confidence: 'HIGH',
    recommendedAction: 'SKIP_FOR_NOW',
    applicationReady: false,
  };
}

export function diagnoseFreelanceOpportunityReadiness(
  opportunity: FreelanceOpportunity,
  verifiedSkills: readonly SkillEntry[],
): FreelanceScanReadinessDiagnostic {
  const text = `${opportunity.title}\n${opportunity.publicDescription}`;
  const required = candidateSkills(opportunity);
  const missing = opportunity.readiness.missingSkills;
  const experienceYears = explicitExperienceYears(opportunity);
  const geographicEligibility = opportunity.views.length > 0
    ? 'ELIGIBLE'
    : opportunity.applicantGeographicRestrictions.length > 0
      ? 'INELIGIBLE'
      : 'REQUIRES_REVIEW';
  const scopeClear = opportunity.publicDescription.length >= 160 && BOUNDED_SCOPE_ACTION.test(text);
  const vagueScope = VAGUE_SCOPE_CUE.test(text) || opportunity.risk.reasons.includes('VAGUE_SCOPE');
  const learnableTemplates = missing.map(learningTemplate);
  const unsupportedGap = missing.length > 0 && learnableTemplates.some((item) => item === null);
  const adjacency = missing.flatMap((skill) => learningTemplate(skill)?.adjacent ?? []);
  const verified = verifiedSkillNames(verifiedSkills);
  const hasAdjacentVerifiedSkill = verified.some((skill) =>
    adjacency.some((adjacent) => matchesSkill([skill], adjacent)),
  );
  const blockers = new Set<FreelanceReadinessBlocker>();

  if (opportunity.risk.level === 'HARD_REJECTED' || opportunity.ethicsComplianceStatus === 'HARD_REJECTED') {
    blockers.add('SCAM_OR_COMPLIANCE_BOUNDARY');
  }
  if (experienceYears !== null) blockers.add('MANDATORY_EXPERIENCE_REQUIREMENT');
  if (SENIOR_OWNERSHIP.test(opportunity.title)) blockers.add('SENIOR_OR_LEAD_RESPONSIBILITY');
  if (REGULATED_OR_CERTIFIED.test(text)) blockers.add('CERTIFICATION_OR_REGULATED_WORK');
  if (geographicEligibility === 'INELIGIBLE') blockers.add('GEOGRAPHIC_RESTRICTION');
  if (UNRELATED_ROLE_FAMILY.test(opportunity.title)) blockers.add('UNRELATED_JOB_FAMILY');
  if (required.length === 0 || !scopeClear) blockers.add('INSUFFICIENT_TASK_SCOPE_EVIDENCE');
  if (unsupportedGap || missing.length > 2) blockers.add('SKILL_GAP_TOO_BROAD');
  if (missing.length > 0 && !unsupportedGap && (!hasAdjacentVerifiedSkill || !scopeClear)) {
    blockers.add('LEARNING_ESTIMATE_CANNOT_BE_DEFENDED');
  }
  if (vagueScope) blockers.add('VAGUE_PROJECT_SCOPE');
  if (['UNKNOWN', 'FIXED_PRICE_SCOPE_REQUIRED', 'NON_USD_UNCONVERTED'].includes(opportunity.pay.classification)) {
    blockers.add('PAY_UNKNOWN');
  }

  const primaryOrder: readonly FreelanceReadinessBlocker[] = [
    'SCAM_OR_COMPLIANCE_BOUNDARY',
    'MANDATORY_EXPERIENCE_REQUIREMENT',
    'SENIOR_OR_LEAD_RESPONSIBILITY',
    'CERTIFICATION_OR_REGULATED_WORK',
    'GEOGRAPHIC_RESTRICTION',
    'UNRELATED_JOB_FAMILY',
    'SKILL_GAP_TOO_BROAD',
    'INSUFFICIENT_TASK_SCOPE_EVIDENCE',
    'LEARNING_ESTIMATE_CANNOT_BE_DEFENDED',
    'VAGUE_PROJECT_SCOPE',
    'OTHER_DETERMINISTIC_REASON',
  ];
  const primaryBlocker = opportunity.readiness.classification === 'NOT_READY'
    ? primaryOrder.find((code) => blockers.has(code)) ?? 'OTHER_DETERMINISTIC_REASON'
    : null;
  if (primaryBlocker !== null) blockers.add(primaryBlocker);

  const prohibitive = new Set<FreelanceReadinessBlocker>([
    'SCAM_OR_COMPLIANCE_BOUNDARY',
    'MANDATORY_EXPERIENCE_REQUIREMENT',
    'SENIOR_OR_LEAD_RESPONSIBILITY',
    'CERTIFICATION_OR_REGULATED_WORK',
    'GEOGRAPHIC_RESTRICTION',
  ]);
  const potentiallyWorthManualReview = opportunity.status !== 'HARD_REJECTED' &&
    opportunity.status !== 'EXPIRED' &&
    geographicEligibility !== 'INELIGIBLE' &&
    ![...blockers].some((code) => prohibitive.has(code));

  let sourceDomain = 'provider-record';
  try {
    sourceDomain = new URL(opportunity.canonicalUrl).hostname.toLocaleLowerCase();
  } catch {
    // The opportunity schema already validates URLs; retain a closed fallback.
  }
  const pageType = ['HIMALAYAS', 'REMOTIVE'].includes(opportunity.source)
    ? 'PROVIDER_OPPORTUNITY' as const
    : /(?:^|\.)(?:bebee\.[a-z.]+|indeed\.com|jobstreet\.[a-z.]+|glassdoor\.[a-z.]+)$/i.test(sourceDomain)
      ? 'REPOST_OR_AGGREGATOR' as const
      : 'INDIVIDUAL_OPPORTUNITY' as const;
  const taskScopeEvidenceCount = cleanJobContent(opportunity.publicDescription)
    .split(/\r?\n|(?<=[.!?;])\s+/)
    .filter((clause) => BOUNDED_SCOPE_ACTION.test(clause))
    .length;
  const reviewScopeManually = potentiallyWorthManualReview &&
    opportunity.readiness.classification === 'NOT_READY' &&
    (primaryBlocker === 'INSUFFICIENT_TASK_SCOPE_EVIDENCE' || primaryBlocker === 'VAGUE_PROJECT_SCOPE');
  const resultState = opportunity.risk.level === 'HARD_REJECTED'
    ? 'HARD_REJECTED' as const
    : opportunity.readiness.classification === 'READY_NOW'
      ? 'READY_NOW' as const
      : opportunity.readiness.classification === 'LEARNABLE_FAST_WITH_AI'
        ? 'LEARNABLE_FAST_WITH_AI' as const
        : reviewScopeManually
          ? 'REVIEW_SCOPE_MANUALLY' as const
          : 'NOT_READY' as const;

  return {
    title: opportunity.title,
    source: opportunity.source,
    contractType: opportunity.contractType,
    payClassification: opportunity.pay.classification,
    geographicEligibility,
    opportunityCategories: opportunity.opportunityCategories,
    readiness: opportunity.readiness.classification,
    resultState,
    sourceDomain,
    pageType,
    individualOpportunityPage: true,
    taskScopeEvidenceCount,
    requiredSkillEvidenceCount: opportunity.requiredSkills.length,
    transferableSkills: opportunity.readiness.transferableSkills.slice(0, 5),
    missingSkills: opportunity.readiness.missingSkills.slice(0, 5),
    mandatoryExperienceYears: experienceYears,
    learningHoursMinimum: opportunity.readiness.learningHoursMinimum,
    learningHoursMaximum: opportunity.readiness.learningHoursMaximum,
    learningTimeUncertain: opportunity.readiness.learningTimeUncertain,
    primaryBlocker,
    blockerCodes: [...blockers],
    scamRisk: opportunity.risk.level,
    complianceStatus: opportunity.ethicsComplianceStatus,
    potentiallyWorthManualReview,
  };
}

export function deriveFreelanceViews(
  candidate: FreelanceOpportunityCandidate,
): FreelanceView[] {
  const restrictions = candidate.applicantGeographicRestrictions.map(normalized);
  const clientCountry = normalized(candidate.clientCountry ?? '');
  const philippinesExcluded = restrictions.some((value) =>
    /\b(?:philippines|filipino)\b/.test(value) &&
    /\b(?:excluded?|not accepted|not accepting|not eligible|cannot|can't|will not|won't|unavailable)\b/.test(value),
  );
  if (philippinesExcluded) return [];
  const philippinesAccepted = restrictions.some((value) =>
    /\b(philippines|ph|apac|asia|worldwide|global|anywhere)\b/.test(value),
  );
  const worldwide = restrictions.length === 0 || restrictions.some((value) =>
    /\b(worldwide|global|anywhere|all countries)\b/.test(value),
  );
  const views: FreelanceView[] = [];
  if (clientCountry.includes('philippines') || philippinesAccepted) views.push('PHILIPPINES');
  if (clientCountry && !clientCountry.includes('philippines') && (philippinesAccepted || worldwide)) {
    views.push('INTERNATIONAL_CLIENTS');
  }
  if (candidate.remote === true && (worldwide || philippinesAccepted)) views.push('WORLDWIDE_REMOTE');
  return views;
}

export const FREELANCE_CATEGORY_PROFILES: ReadonlyArray<{
  id: FreelanceOpportunityCategory;
  label: string;
  patterns: readonly RegExp[];
}> = [
  {
    id: 'TECHNICAL_QUICK_WINS',
    label: 'Technical Quick Wins',
    patterns: [/\b(?:html|css|javascript|wordpress|cms|landing page|website (?:fix|update|maintenance)|api integration|manual (?:website )?testing|database cleanup|technical documentation)\b/i],
  },
  {
    id: 'AI_AUTOMATION',
    label: 'AI and Automation',
    patterns: [/\b(?:n8n|zapier|make\.com|workflow automation|spreadsheet automation|chatbot|faq assistant|ai output review|agent tool integration)\b/i],
  },
  {
    id: 'TECHNICAL_VIRTUAL_ASSISTANCE',
    label: 'Technical Virtual Assistance',
    patterns: [/\b(?:web research|lead list|cms content|product listing|spreadsheet management|data validation|documentation cleanup|customer support tools?|analytics reporting|technical virtual assistant)\b/i],
  },
  {
    id: 'GENERAL_LEARNABLE_WORK',
    label: 'General Learnable Work',
    patterns: [/\b(?:data entry|transcription|caption correction|data labeling|data annotation|canva|video clipping|document formatting)\b/i],
  },
] as const;

export function deriveFreelanceOpportunityCategories(
  candidate: FreelanceOpportunityCandidate,
): FreelanceOpportunityCategory[] {
  const text = `${candidate.title}\n${candidate.publicDescription}\n${candidate.categoryHints.join(' ')}`;
  return FREELANCE_CATEGORY_PROFILES
    .filter((profile) => profile.patterns.some((pattern) => pattern.test(text)))
    .map((profile) => profile.id);
}

export function scoreFreelanceOpportunity(options: {
  candidate: FreelanceOpportunityCandidate;
  readiness: FreelanceReadinessAssessment;
  risk: FreelanceRiskAssessment;
  now?: Date;
}): number {
  const { candidate, readiness, risk } = options;
  let score = readiness.classification === 'READY_NOW'
    ? 420
    : readiness.classification === 'LEARNABLE_FAST_WITH_AI'
      ? 360
      : 80;
  if (candidate.pay.classification === 'ABOVE_MINIMUM') {
    score += 180 + Math.min(100, Math.floor((candidate.pay.statedHourlyMinimum ?? 0) * 4));
  } else if (candidate.pay.classification === 'UNKNOWN') score += 60;
  else if (candidate.pay.classification === 'FIXED_PRICE_SCOPE_REQUIRED') score += 50;
  if (risk.level === 'LOW') score += 120;
  if (risk.level === 'MEDIUM') score += 50;
  if (risk.level === 'HIGH') score -= 180;
  if (risk.level === 'HARD_REJECTED') score = 0;
  if (candidate.publicDescription.length >= 300) score += 30;
  if (candidate.contractType !== 'OTHER') score += 25;
  if (/\b(single|small|short[- ]term|one[- ]time|bounded|defined scope)\b/i.test(candidate.publicDescription)) score += 25;
  if (['HIMALAYAS', 'REMOTIVE'].includes(candidate.source)) score += 35;
  else if (candidate.source === 'MANUAL') score += 20;
  else score += 15;
  if (candidate.remote === true) score += 25;
  if (readiness.classification === 'LEARNABLE_FAST_WITH_AI' &&
      readiness.learningHoursMaximum !== null) {
    score += Math.max(0, 60 - readiness.learningHoursMaximum * 2);
  }
  if (candidate.publishedAt) {
    const ageDays = Math.max(0, ((options.now ?? new Date()).getTime() - Date.parse(candidate.publishedAt)) / 86_400_000);
    score += Math.max(0, 45 - Math.floor(ageDays));
  }
  return Math.max(0, Math.min(1000, Math.round(score)));
}

export function freelanceIdentityKey(candidate: Pick<FreelanceOpportunityCandidate, 'canonicalUrl' | 'title' | 'clientOrCompany'>): string {
  const canonical = canonicalizeJobUrl(candidate.canonicalUrl) ?? candidate.canonicalUrl;
  return createHash('sha256').update(canonical).digest('hex');
}

export function freelanceSemanticIdentityKey(candidate: Pick<FreelanceOpportunityCandidate, 'title' | 'clientOrCompany' | 'publicDescription'>): string {
  const value = [candidate.title, candidate.clientOrCompany, candidate.publicDescription]
    .map(normalized)
    .join('\n');
  return createHash('sha256').update(value).digest('hex');
}

export function buildFreelanceOpportunity(options: {
  candidate: FreelanceOpportunityCandidate;
  verifiedSkills: readonly SkillEntry[];
  minimumHourlyUsd?: number;
  maxLearningHours?: number;
  now?: Date;
}): FreelanceOpportunity {
  const candidate = {
    ...options.candidate,
    pay: normalizeFreelancePay({
      kind: options.candidate.pay.kind,
      currency: options.candidate.pay.originalCurrency,
      minimum: options.candidate.pay.minimum,
      maximum: options.candidate.pay.maximum,
      period: options.candidate.pay.period,
      evidenceLabel: options.candidate.pay.evidenceLabel,
    }, options.minimumHourlyUsd ?? 3),
  };
  const risk = assessFreelanceRisk(candidate);
  const readiness = assessFreelanceReadiness({
    candidate,
    verifiedSkills: options.verifiedSkills,
    risk,
    maxLearningHours: options.maxLearningHours,
  });
  const identityKey = freelanceIdentityKey(candidate);
  const status = risk.level === 'HARD_REJECTED'
    ? 'HARD_REJECTED'
    : candidate.categoryHints.includes(FIRST_PARTY_ROLE_CLOSED_HINT)
      ? 'EXPIRED'
    : candidate.expiresAt && Date.parse(candidate.expiresAt) < (options.now ?? new Date()).getTime()
      ? 'EXPIRED'
      : 'NEW';
  return FreelanceOpportunitySchema.parse({
    ...candidate,
    id: `freelance_${identityKey.slice(0, 24)}`,
    identityKey,
    semanticIdentityKey: freelanceSemanticIdentityKey(candidate),
    descriptionHash: createHash('sha256').update(candidate.publicDescription).digest('hex'),
    views: deriveFreelanceViews(candidate),
    opportunityCategories: deriveFreelanceOpportunityCategories(candidate),
    readiness,
    risk,
    ethicsComplianceStatus: risk.level === 'HARD_REJECTED'
      ? 'HARD_REJECTED'
      : risk.level === 'LOW'
        ? 'PASS'
        : 'REQUIRES_REVIEW',
    rankingScore: scoreFreelanceOpportunity({ candidate, readiness, risk, now: options.now }),
    status,
    manualNote: null,
    preparation: {
      state: 'NOT_STARTED',
      learningCompleted: false,
      sampleCreated: false,
      sampleLinkOrNote: null,
      remainingConcerns: null,
      readinessConfirmedManually: false,
      completedAt: null,
    },
  });
}

export function truthfulFreelancePreparationWording(options: {
  transferableSkills: readonly string[];
  missingSkills: readonly string[];
  samplePrepared: boolean;
}): string[] {
  const lines: string[] = [];
  if (options.transferableSkills.length > 0) {
    lines.push(`I have experience with related ${options.transferableSkills.slice(0, 3).join(', ')} work.`);
  }
  if (options.samplePrepared) {
    lines.push('I reviewed the required tool and prepared a working sample.');
  }
  if (options.missingSkills.length > 0) {
    lines.push(`My direct experience with ${options.missingSkills.slice(0, 2).join(' and ')} is limited, but I have relevant transferable skills.`);
  }
  return lines;
}
