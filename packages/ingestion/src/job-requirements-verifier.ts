import type { NormalizedJob } from '@job-app/core';
import {
  GeminiJobRequirementsProposalSchema,
  JOB_REQUIREMENTS_EXTRACTION_SCHEMA_VERSION,
  type ExtractionEvidence,
  type ExtractionAggregateStatus,
  type GeminiCandidateClassificationResponse,
  type GeminiJobRequirementsProposal,
  type JobRequirementReviewCategory,
  type JobRequirementReviewEntry,
  type JobRequirementCandidate,
  type RequirementType,
  type VerificationReasonCode,
  type VerificationStatus,
  type VerifiedExperienceRequirement,
  type VerifiedJobRequirementsExtraction,
  type VerifiedQualification,
  type VerifiedSalary,
  type VerifiedTextFact,
} from './job-requirements-contracts.js';
import {
  parseExplicitSalary,
  type PreprocessedJobDescription,
} from './job-requirements-preprocessor.js';

interface VerifyOptions {
  contentHash: string;
  modelIdentifier: string;
  extractedAt: string;
  providerMetadata?: {
    country?: string | null;
    workSetup?: string | null;
    employmentType?: string | null;
  };
}

interface VerifyCandidateOptions extends VerifyOptions {
  candidates: readonly JobRequirementCandidate[];
}

function evidenceText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function canonicalizeTimezoneDisplayValue(
  value: string,
  evidence: string,
): string {
  const trimmedValue = value.trim();
  const normalizedValue = evidenceText(trimmedValue);
  if (normalizedValue === 'eastern standard') {
    return 'Eastern Standard Time';
  }
  if (normalizedValue !== 'est') {
    return trimmedValue;
  }

  const explicitlyTimezoneQualified =
    /\best\b[^.!?;:\n]{0,24}\b(?:time\s*zone|timezone)\b/i.test(evidence) ||
    /\b(?:time\s*zone|timezone)\b[^.!?;:\n]{0,24}\best\b/i.test(evidence);
  return explicitlyTimezoneQualified ? 'Eastern Standard Time' : trimmedValue;
}

function verifyCanonicalTimezone(
  quote: string,
  originalValue: string,
  canonicalValue: string,
): boolean {
  if (!/\b(time ?zone|collaboration|overlap|hours)\b/i.test(quote)) {
    return false;
  }
  const normalizedQuote = evidenceText(quote);
  return (
    normalizedQuote.includes(evidenceText(canonicalValue)) ||
    (normalizedQuote.includes(evidenceText(originalValue)) &&
      canonicalizeTimezoneDisplayValue(originalValue, quote) === canonicalValue)
  );
}

interface EvidenceLocation {
  section: string | null;
  clause: string;
}

function locateEvidence(
  evidence: ExtractionEvidence,
  source: PreprocessedJobDescription,
): EvidenceLocation | null {
  const quote = evidenceText(evidence.quote);
  if (!quote) return null;
  for (const section of source.sections) {
    if (
      evidence.section &&
      section.normalizedHeading &&
      evidenceText(evidence.section) !== evidenceText(section.normalizedHeading)
    ) {
      continue;
    }
    for (const clause of section.clauses) {
      if (evidenceText(clause.text).includes(quote)) {
        return {
          section: section.normalizedHeading,
          clause: clause.text,
        };
      }
    }
  }
  return null;
}

const WORD_NUMBERS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function numeric(value: string): number | null {
  const lowered = value.toLowerCase();
  if (lowered in WORD_NUMBERS) return WORD_NUMBERS[lowered] ?? null;
  const parsed = Number(lowered);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseExperienceEvidence(
  value: string,
): { minimumYears: number; maximumYears: number | null } | null {
  const text = evidenceText(value);
  const range = text.match(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\s*(?:-|to)\s*(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\s+years?\b/,
  );
  if (range?.[1] && range[2]) {
    const minimumYears = numeric(range[1]);
    const maximumYears = numeric(range[2]);
    if (
      minimumYears !== null &&
      maximumYears !== null &&
      maximumYears >= minimumYears
    ) {
      return { minimumYears, maximumYears };
    }
  }
  const minimum = text.match(
    /\b(?:(?:at least|minimum(?: of)?|more than)\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\s*\+?\s+years?(?:\s+of|\s+working|\s+professional|\s+relevant|\s+hands-on|\s+industry|\s+experience|['']\s+experience)?\b/,
  );
  if (!minimum?.[1]) return null;
  const minimumYears = numeric(minimum[1]);
  return minimumYears === null ? null : { minimumYears, maximumYears: null };
}

const PREFERRED_CUE =
  /\b(preferred|bonus|nice to have|ideally|advantageous|desired but not required|as a plus|experience as a bonus|desire to expand)\b/i;
const REQUIRED_CUE =
  /\b(required|must|minimum qualification|you have|you are|you possess|proficient|experience with|knowledge of|familiar with|understanding of)\b/i;
const THIRD_PARTY_CUE =
  /\b(?:our|another|their)\s+(?:engineering|data|product|platform)\s+team\b|\b(?:customers?|users?|partners?|vendors?|clients?)\s+(?:who|that|to)\b|\b(?:teach|help|support|enable|recruit|hire|market)\s+(?:customers?|users?|developers?|engineers?|a product)\b/i;
const NON_APPLICANT_EXPERIENCE_SUBJECT =
  /\b(?:our|the|another)\s+(?:company|team|organization)\s+(?:has|have)\b|\b(?:engineers?|developers?|customers?|users?|partners?|clients?|vendors?)\s+(?:has|have|who|that)\b/i;

function requirementTypeFromEvidence(
  clause: string,
  sectionHint: string,
): RequirementType | null {
  if (PREFERRED_CUE.test(clause) || sectionHint === 'PREFERRED_QUALIFICATIONS') {
    return 'PREFERRED';
  }
  if (
    REQUIRED_CUE.test(clause) ||
    sectionHint === 'REQUIRED_QUALIFICATIONS'
  ) {
    return 'REQUIRED';
  }
  return null;
}

function requirementTypeForQualification(
  clause: string,
  name: string,
  sectionHint: string,
): RequirementType | null {
  const normalizedClause = evidenceText(clause);
  const nameIndex = normalizedClause.indexOf(normalizedSkill(name));
  const preferredMatch = PREFERRED_CUE.exec(normalizedClause);
  const requiredMatch = REQUIRED_CUE.exec(normalizedClause);
  if (
    preferredMatch &&
    (/\b(?:as a bonus|preferred|nice to have|ideally|advantageous)\b/i.test(
      preferredMatch[0],
    ) ||
      nameIndex >= preferredMatch.index)
  ) {
    return 'PREFERRED';
  }
  if (requiredMatch && (nameIndex < 0 || nameIndex >= requiredMatch.index)) {
    return 'REQUIRED';
  }
  return requirementTypeFromEvidence(clause, sectionHint);
}

function sectionHintForEvidence(
  evidence: ExtractionEvidence,
  source: PreprocessedJobDescription,
): string {
  const located = locateEvidence(evidence, source);
  if (!located) return 'UNKNOWN';
  const section = source.sections.find(
    (item) => item.normalizedHeading === located.section,
  );
  return section?.hint ?? 'UNKNOWN';
}

function failedQualification(
  name: string,
  evidence: ExtractionEvidence,
  status: VerificationStatus,
  reasonCode: VerificationReasonCode,
): VerifiedQualification {
  return {
    name,
    requirementType: null,
    status,
    source: 'DESCRIPTION_GEMINI_VERIFIED',
    reasonCode,
    evidence,
    affectedScoring: false,
  };
}

function normalizedSkill(value: string): string {
  return evidenceText(value)
    .replace(/\bgoogle cloud platform\b/g, 'gcp')
    .replace(/\bbig[- ]data\b/g, 'big data')
    .replace(/\bapplication programming interfaces?\b/g, 'api')
    .replace(/[^a-z0-9+#. ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SAFE_SKILL_ALIASES: Readonly<Record<string, readonly string[]>> = {
  apis: ['api', 'apis'],
  api: ['api', 'apis'],
  'big-data processing technologies': [
    'big data processing technologies',
    'big-data processing technologies',
  ],
  'production deployment': ['production deployment'],
  'software-engineering principles': [
    'software engineering principles',
    'software-engineering principles',
  ],
  testing: ['testing', 'automated testing', 'test automation'],
  automation: ['automation', 'automated'],
  'data-engineering experience': [
    'data engineering experience',
    'data-engineering experience',
  ],
  'high-volume services': ['high volume services', 'high-volume services'],
  'system design': ['system design'],
  'distributed systems': ['distributed systems'],
  algorithms: ['algorithms'],
  'data structures': ['data structures'],
  'code quality': ['code quality', 'high quality code', 'high-quality code'],
  java: ['java'],
  scala: ['scala'],
};

const QUALIFICATION_CONCEPT_CATALOG: ReadonlyArray<{
  canonical: string;
  aliases: readonly string[];
}> = [
  { canonical: 'Java', aliases: ['java'] },
  { canonical: 'Scala', aliases: ['scala'] },
  { canonical: 'distributed systems', aliases: ['distributed systems'] },
  { canonical: 'high-volume services', aliases: ['high-volume services', 'high volume services'] },
  { canonical: 'production deployment', aliases: ['production deployment', 'production deployments'] },
  { canonical: 'big-data processing technologies', aliases: ['big data processing technologies', 'big-data processing technologies', 'big data processing'] },
  { canonical: 'system design', aliases: ['system design'] },
  { canonical: 'APIs', aliases: ['apis', 'api', 'application programming interfaces'] },
  { canonical: 'algorithms', aliases: ['algorithms'] },
  { canonical: 'data structures', aliases: ['data structures'] },
  { canonical: 'software-engineering principles', aliases: ['software engineering principles', 'software-engineering principles'] },
  { canonical: 'code quality', aliases: ['code quality'] },
  { canonical: 'testing', aliases: ['testing', 'automated testing', 'test automation'] },
  { canonical: 'automation', aliases: ['automation', 'automated'] },
  { canonical: 'data-engineering experience', aliases: ['data engineering experience', 'data-engineering experience', 'data engineering'] },
];

function deterministicConcepts(evidence: string): string[] {
  const normalizedEvidence = normalizedSkill(evidence);
  return QUALIFICATION_CONCEPT_CATALOG
    .filter((concept) => concept.aliases.some((alias) =>
      normalizedEvidence.includes(normalizedSkill(alias)),
    ))
    .map((concept) => concept.canonical);
}

function qualificationSupported(name: string, quote: string): boolean {
  const normalizedName = normalizedSkill(name);
  const normalizedQuote = normalizedSkill(quote);
  const aliases = SAFE_SKILL_ALIASES[normalizedName] ?? [normalizedName];
  return aliases.some((alias) => normalizedQuote.includes(normalizedSkill(alias)));
}

function verifyQualification(
  proposal: GeminiJobRequirementsProposal['qualifications'][number],
  source: PreprocessedJobDescription,
): VerifiedQualification {
  const located = locateEvidence(proposal.evidence, source);
  if (!located) {
    return failedQualification(
      proposal.name,
      proposal.evidence,
      'REQUIRES_REVIEW',
      'EVIDENCE_NOT_FOUND',
    );
  }
  const normalizedQuote = evidenceText(proposal.evidence.quote);
  const skillIndex = normalizedQuote.indexOf(normalizedSkill(proposal.name));
  const thirdPartyIndex = normalizedQuote.search(THIRD_PARTY_CUE);
  if (thirdPartyIndex >= 0 && (skillIndex < 0 || thirdPartyIndex < skillIndex)) {
    return failedQualification(
      proposal.name,
      proposal.evidence,
      'REQUIRES_REVIEW',
      'THIRD_PARTY_CONTEXT',
    );
  }
  if (!qualificationSupported(proposal.name, proposal.evidence.quote)) {
    return failedQualification(
      proposal.name,
      proposal.evidence,
      'REQUIRES_REVIEW',
      'UNSUPPORTED_SKILL_ALIAS',
    );
  }
  const hint = sectionHintForEvidence(proposal.evidence, source);
  if (hint === 'RESPONSIBILITIES') {
    return failedQualification(
      proposal.name,
      proposal.evidence,
      'REQUIRES_REVIEW',
      'RESPONSIBILITY_NOT_QUALIFICATION',
    );
  }
  const localType = requirementTypeForQualification(
    located.clause,
    proposal.name,
    hint,
  );
  if (!localType) {
    return failedQualification(
      proposal.name,
      proposal.evidence,
      'REQUIRES_REVIEW',
      'REQUIREMENT_TYPE_AMBIGUOUS',
    );
  }
  if (localType !== proposal.requirementType) {
    return failedQualification(
      proposal.name,
      proposal.evidence,
      'CONFLICT',
      'REQUIREMENT_TYPE_CONFLICT',
    );
  }
  return {
    name: proposal.name,
    requirementType: localType,
    status: 'VERIFIED',
    source: 'DESCRIPTION_GEMINI_VERIFIED',
    reasonCode: 'VERIFIED_EXACT_EVIDENCE',
    evidence: proposal.evidence,
    affectedScoring: localType === 'REQUIRED',
  };
}

function verifyExperience(
  proposal: GeminiJobRequirementsProposal['experienceRequirements'][number],
  source: PreprocessedJobDescription,
): VerifiedExperienceRequirement {
  const located = locateEvidence(proposal.evidence, source);
  if (!located) {
    return {
      minimumYears: null,
      maximumYears: null,
      requirementType: null,
      status: 'REQUIRES_REVIEW',
      source: 'DESCRIPTION_GEMINI_VERIFIED',
      reasonCode: 'EVIDENCE_NOT_FOUND',
      evidence: proposal.evidence,
      affectedScoring: false,
    };
  }
  if (
    THIRD_PARTY_CUE.test(proposal.evidence.quote) ||
    NON_APPLICANT_EXPERIENCE_SUBJECT.test(proposal.evidence.quote)
  ) {
    return {
      minimumYears: null,
      maximumYears: null,
      requirementType: null,
      status: 'REQUIRES_REVIEW',
      source: 'DESCRIPTION_GEMINI_VERIFIED',
      reasonCode: 'THIRD_PARTY_CONTEXT',
      evidence: proposal.evidence,
      affectedScoring: false,
    };
  }
  const local = parseExperienceEvidence(located.clause);
  if (
    !local ||
    local.minimumYears !== proposal.minimumYears ||
    local.maximumYears !== proposal.maximumYears
  ) {
    return {
      minimumYears: local?.minimumYears ?? null,
      maximumYears: local?.maximumYears ?? null,
      requirementType: null,
      status: 'CONFLICT',
      source: 'DESCRIPTION_GEMINI_VERIFIED',
      reasonCode: 'VALUE_MISMATCH',
      evidence: proposal.evidence,
      affectedScoring: false,
    };
  }
  const localType = requirementTypeFromEvidence(
    located.clause,
    sectionHintForEvidence(proposal.evidence, source),
  );
  if (!localType) {
    return {
      minimumYears: local.minimumYears,
      maximumYears: local.maximumYears,
      requirementType: null,
      status: 'REQUIRES_REVIEW',
      source: 'DESCRIPTION_GEMINI_VERIFIED',
      reasonCode: 'REQUIREMENT_TYPE_AMBIGUOUS',
      evidence: proposal.evidence,
      affectedScoring: false,
    };
  }
  const sectionHint = sectionHintForEvidence(proposal.evidence, source);
  const explicitRequiredApplicantExperience =
    localType === 'REQUIRED' &&
    sectionHint === 'REQUIRED_QUALIFICATIONS' &&
    !THIRD_PARTY_CUE.test(located.clause);
  if (
    localType !== proposal.requirementType &&
    !explicitRequiredApplicantExperience
  ) {
    return {
      minimumYears: local.minimumYears,
      maximumYears: local.maximumYears,
      requirementType: null,
      status: 'CONFLICT',
      source: 'DESCRIPTION_GEMINI_VERIFIED',
      reasonCode: 'REQUIREMENT_TYPE_CONFLICT',
      evidence: proposal.evidence,
      affectedScoring: false,
    };
  }
  return {
    minimumYears: local.minimumYears,
    maximumYears: local.maximumYears,
    requirementType: explicitRequiredApplicantExperience
      ? 'REQUIRED'
      : localType,
    status: 'VERIFIED',
    source: 'DESCRIPTION_GEMINI_VERIFIED',
    reasonCode: 'VERIFIED_EXACT_EVIDENCE',
    evidence: proposal.evidence,
    affectedScoring: localType === 'REQUIRED',
  };
}

function missingTextFact(): VerifiedTextFact {
  return {
    value: null,
    status: 'MISSING',
    source: 'DESCRIPTION_GEMINI_VERIFIED',
    reasonCode: 'NO_EVIDENCE',
    evidence: null,
    affectedScoring: false,
  };
}

function verifyTextFact(
  value: string,
  evidence: ExtractionEvidence,
  source: PreprocessedJobDescription,
  validator: (quote: string, value: string) => boolean,
  affectsScoring = false,
): VerifiedTextFact {
  const located = locateEvidence(evidence, source);
  if (!located) {
    return {
      value,
      status: 'REQUIRES_REVIEW',
      source: 'DESCRIPTION_GEMINI_VERIFIED',
      reasonCode: 'EVIDENCE_NOT_FOUND',
      evidence,
      affectedScoring: false,
    };
  }
  if (!validator(located.clause, value)) {
    return {
      value,
      status: 'REQUIRES_REVIEW',
      source: 'DESCRIPTION_GEMINI_VERIFIED',
      reasonCode: 'REQUIREMENT_TYPE_AMBIGUOUS',
      evidence,
      affectedScoring: false,
    };
  }
  return {
    value,
    status: 'VERIFIED',
    source: 'DESCRIPTION_GEMINI_VERIFIED',
    reasonCode: 'VERIFIED_EXACT_EVIDENCE',
    evidence,
    affectedScoring: affectsScoring,
  };
}

function verifySalary(
  proposal: GeminiJobRequirementsProposal['salary'],
  source: PreprocessedJobDescription,
  country: string | null | undefined,
): VerifiedSalary {
  if (!proposal) {
    return {
      currency: null,
      minimum: null,
      maximum: null,
      period: null,
      additionalCompensation: [],
      currencyStatus: 'MISSING',
      minimumStatus: 'MISSING',
      maximumStatus: 'MISSING',
      periodStatus: 'MISSING',
      additionalCompensationStatus: 'MISSING',
      status: 'MISSING',
      source: 'DESCRIPTION_GEMINI_VERIFIED',
      reasonCode: 'NO_EVIDENCE',
      evidence: null,
      affectedScoring: false,
    };
  }
  const located = locateEvidence(proposal.evidence, source);
  if (!located) {
    return {
      ...proposal,
      currencyStatus: 'REQUIRES_REVIEW',
      minimumStatus: 'REQUIRES_REVIEW',
      maximumStatus: proposal.maximum === null ? 'MISSING' : 'REQUIRES_REVIEW',
      periodStatus: 'REQUIRES_REVIEW',
      additionalCompensationStatus: proposal.additionalCompensation.length > 0 ? 'REQUIRES_REVIEW' : 'MISSING',
      status: 'REQUIRES_REVIEW',
      source: 'DESCRIPTION_GEMINI_VERIFIED',
      reasonCode: 'EVIDENCE_NOT_FOUND',
      affectedScoring: false,
    };
  }
  const local = parseExplicitSalary(proposal.evidence.quote, { country });
  const amountsAgree =
    local.minimum === proposal.minimum &&
    local.maximum === proposal.maximum &&
    local.currency === proposal.currency;
  const extrasAgree = proposal.additionalCompensation.every((item) =>
    local.additionalCompensation.includes(item.toLowerCase()),
  );
  if (!amountsAgree || !extrasAgree) {
    return {
      currency: local.currency,
      minimum: local.minimum,
      maximum: local.maximum,
      period: local.period,
      additionalCompensation: local.additionalCompensation,
      currencyStatus: local.currency ? 'VERIFIED' : 'REQUIRES_REVIEW',
      minimumStatus: local.minimum === null ? 'MISSING' : 'VERIFIED',
      maximumStatus: local.maximum === null ? 'MISSING' : 'VERIFIED',
      periodStatus: local.period ? 'VERIFIED' : 'MISSING',
      additionalCompensationStatus: local.additionalCompensation.length > 0 ? 'VERIFIED' : 'MISSING',
      status: 'CONFLICT',
      source: 'DESCRIPTION_GEMINI_VERIFIED',
      reasonCode: 'VALUE_MISMATCH',
      evidence: proposal.evidence,
      affectedScoring: false,
    };
  }
  if (local.status !== 'VERIFIED') {
    return {
      currency: local.currency,
      minimum: local.minimum,
      maximum: local.maximum,
      period: local.period,
      additionalCompensation: local.additionalCompensation,
      currencyStatus: 'REQUIRES_REVIEW',
      minimumStatus: local.minimum === null ? 'MISSING' : 'VERIFIED',
      maximumStatus: local.maximum === null ? 'MISSING' : 'VERIFIED',
      periodStatus: local.period ? 'VERIFIED' : 'MISSING',
      additionalCompensationStatus: local.additionalCompensation.length > 0 ? 'VERIFIED' : 'MISSING',
      status: 'REQUIRES_REVIEW',
      source: 'DESCRIPTION_GEMINI_VERIFIED',
      reasonCode: 'AMBIGUOUS_CURRENCY',
      evidence: proposal.evidence,
      affectedScoring: false,
    };
  }
  if (proposal.period !== local.period) {
    return {
      currency: local.currency,
      minimum: local.minimum,
      maximum: local.maximum,
      period: local.period,
      additionalCompensation: local.additionalCompensation,
      currencyStatus: 'VERIFIED',
      minimumStatus: local.minimum === null ? 'MISSING' : 'VERIFIED',
      maximumStatus: local.maximum === null ? 'MISSING' : 'VERIFIED',
      periodStatus: proposal.period === null && local.period === null
        ? 'MISSING'
        : 'CONFLICT',
      additionalCompensationStatus: local.additionalCompensation.length > 0 ? 'VERIFIED' : 'MISSING',
      status: 'VERIFIED',
      source: 'DESCRIPTION_GEMINI_VERIFIED',
      reasonCode: 'VERIFIED_EXACT_EVIDENCE',
      evidence: proposal.evidence,
      affectedScoring: false,
    };
  }
  return {
    currency: local.currency,
    minimum: local.minimum,
    maximum: local.maximum,
    period: local.period,
    additionalCompensation: local.additionalCompensation,
    currencyStatus: 'VERIFIED',
    minimumStatus: local.minimum === null ? 'MISSING' : 'VERIFIED',
    maximumStatus: local.maximum === null ? 'MISSING' : 'VERIFIED',
    periodStatus: local.period ? 'VERIFIED' : 'MISSING',
    additionalCompensationStatus: local.additionalCompensation.length > 0 ? 'VERIFIED' : 'MISSING',
    status: 'VERIFIED',
    source: 'DESCRIPTION_GEMINI_VERIFIED',
    reasonCode: 'VERIFIED_EXACT_EVIDENCE',
    evidence: proposal.evidence,
    affectedScoring: false,
  };
}

export function verifyGeminiJobRequirements(
  untrustedProposal: unknown,
  source: PreprocessedJobDescription,
  options: VerifyOptions,
): VerifiedJobRequirementsExtraction {
  const proposal = GeminiJobRequirementsProposalSchema.parse(untrustedProposal);
  const experienceRequirements = proposal.experienceRequirements.map((item) =>
    verifyExperience(item, source),
  );
  const qualifications = proposal.qualifications.map((item) => ({
    proposedType: item.requirementType,
    verified: verifyQualification(item, source),
  }));
  const verifyOther = (
    values: typeof proposal.degreeRequirements,
  ): VerifiedQualification[] =>
    values.map((item) => verifyQualification(item, source));
  const degreeRequirements = verifyOther(proposal.degreeRequirements);
  const certifications = verifyOther(proposal.certifications);
  const languages = verifyOther(proposal.languages);
  const scheduleRequirements = verifyOther(
    proposal.workArrangement.scheduleRequirements,
  );

  const setupEvidence =
    proposal.workArrangement.evidence.find((item) =>
      /\b(remote|hybrid|on[- ]?site|onsite)\b/i.test(item.quote),
    ) ?? null;
  const setup =
    proposal.workArrangement.setup && setupEvidence
      ? verifyTextFact(
          proposal.workArrangement.setup,
          setupEvidence,
          source,
          (quote, value) =>
            value === 'REMOTE'
              ? /\bremote\b/i.test(quote)
              : value === 'HYBRID'
                ? /\bhybrid\b/i.test(quote)
                : value === 'ONSITE'
                  ? /\bon[- ]?site\b|\bonsite\b/i.test(quote)
                  : false,
          true,
        )
      : missingTextFact();
  const geographicRestrictions =
    proposal.workArrangement.geographicRestrictions.map((item) =>
      verifyTextFact(
        item.value,
        item.evidence,
        source,
        (quote, value) =>
          evidenceText(quote).includes(evidenceText(value)) &&
          /\b(within|only|must be|located in|region|eligible|work location)\b/i.test(
            quote,
          ),
        true,
      ),
    );
  const timezone = proposal.workArrangement.collaborationTimezone
    ? verifyTextFact(
        canonicalizeTimezoneDisplayValue(
          proposal.workArrangement.collaborationTimezone.value,
          proposal.workArrangement.collaborationTimezone.evidence.quote,
        ),
        proposal.workArrangement.collaborationTimezone.evidence,
        source,
        (quote, value) =>
          verifyCanonicalTimezone(
            quote,
            proposal.workArrangement.collaborationTimezone!.value,
            value,
          ),
      )
    : missingTextFact();
  const employmentType = proposal.employmentType
    ? verifyTextFact(
        proposal.employmentType.value,
        proposal.employmentType.evidence,
        source,
        (quote, value) =>
          evidenceText(quote).includes(evidenceText(value)),
      )
    : missingTextFact();
  const salary = verifySalary(
    proposal.salary,
    source,
    options.providerMetadata?.country,
  );
  const allStatuses = [
    ...experienceRequirements,
    ...qualifications.map((item) => item.verified),
    ...degreeRequirements,
    ...certifications,
    ...languages,
    ...scheduleRequirements,
    salary,
    setup,
    ...geographicRestrictions,
    timezone,
    employmentType,
  ].map((item) => item.status);
  const legacyReviewItems: JobRequirementReviewEntry[] =
    proposal.missingOrAmbiguousCriticalInformation.map((_, index) => ({
      candidateId: `legacy-review-${String(index + 1).padStart(2, '0')}`,
      category: 'MISSING_CRITICAL_INFORMATION',
      reasonCode: 'REQUIREMENT_TYPE_AMBIGUOUS',
      audience: 'AUDIT',
      normalizedLabel: null,
    }));
  const extractionStatus: ExtractionAggregateStatus = allStatuses.includes('CONFLICT')
    ? 'CONFLICT'
    : allStatuses.includes('REQUIRES_REVIEW') || legacyReviewItems.length > 0
      ? 'REQUIRES_REVIEW'
      : allStatuses.some((status) => status === 'VERIFIED')
        ? 'VERIFIED'
        : 'MISSING';

  return {
    schemaVersion: JOB_REQUIREMENTS_EXTRACTION_SCHEMA_VERSION,
    contentHash: options.contentHash,
    modelIdentifier: options.modelIdentifier,
    extractedAt: options.extractedAt,
    extractionStatus,
    extractionFailureReason: null,
    candidateAudit: [],
    experienceRequirements,
    requiredQualifications: qualifications
      .filter((item) => item.proposedType === 'REQUIRED')
      .map((item) => item.verified),
    preferredQualifications: qualifications
      .filter((item) => item.proposedType === 'PREFERRED')
      .map((item) => item.verified),
    degreeRequirements,
    certifications,
    languages,
    salary,
    workArrangement: {
      setup,
      geographicRestrictions,
      collaborationTimezone: timezone,
      scheduleRequirements,
    },
    employmentType,
    reviewItems: legacyReviewItems,
  };
}

function candidateEvidence(candidate: JobRequirementCandidate): ExtractionEvidence {
  return { quote: candidate.evidence, section: candidate.section };
}

function aggregateStatus(
  statuses: readonly VerificationStatus[],
): ExtractionAggregateStatus {
  if (statuses.includes('CONFLICT')) return 'CONFLICT';
  const hasVerified = statuses.includes('VERIFIED');
  if (
    statuses.includes('REQUIRES_REVIEW') ||
    (hasVerified && statuses.includes('MISSING'))
  ) {
    return 'PARTIAL';
  }
  if (hasVerified) return 'VERIFIED';
  return statuses.includes('EXTRACTION_FAILED') ? 'EXTRACTION_FAILED' : 'MISSING';
}

function deduplicateReviewItems(
  items: readonly JobRequirementReviewEntry[],
): JobRequirementReviewEntry[] {
  const unique = new Map<string, JobRequirementReviewEntry>();
  for (const item of items) {
    const key = [
      item.candidateId,
      item.category,
      item.normalizedLabel ?? '',
      item.reasonCode,
    ].join(':');
    const previous = unique.get(key);
    if (!previous || (previous.audience === 'AUDIT' && item.audience === 'USER')) {
      unique.set(key, item);
    }
  }
  return [...unique.values()];
}

function emptyCandidateSalary(): VerifiedSalary {
  return {
    currency: null,
    minimum: null,
    maximum: null,
    period: null,
    additionalCompensation: [],
    currencyStatus: 'MISSING',
    minimumStatus: 'MISSING',
    maximumStatus: 'MISSING',
    periodStatus: 'MISSING',
    additionalCompensationStatus: 'MISSING',
    status: 'MISSING',
    source: 'DETERMINISTIC_DESCRIPTION',
    reasonCode: 'NO_EVIDENCE',
    evidence: null,
    affectedScoring: false,
  };
}

function verifyCandidateSalary(
  candidate: JobRequirementCandidate,
  decision: GeminiCandidateClassificationResponse['decisions'][number],
  country: string | null | undefined,
): VerifiedSalary {
  const parsed = parseExplicitSalary(candidate.evidence, { country });
  if (parsed.minimum === null) return emptyCandidateSalary();
  const salarySemantics =
    decision.classification === 'COMPENSATION'
      ? decision.salarySemantics
      : null;
  const classifiedAsBase =
    salarySemantics?.compensationType === 'BASE_SALARY';
  const currencyStatus: VerificationStatus =
    parsed.currency && parsed.status === 'VERIFIED'
      ? 'VERIFIED'
      : 'REQUIRES_REVIEW';
  const minimumStatus: VerificationStatus = classifiedAsBase
    ? 'VERIFIED'
    : 'REQUIRES_REVIEW';
  const maximumStatus: VerificationStatus =
    parsed.maximum === null
      ? 'MISSING'
      : classifiedAsBase
        ? 'VERIFIED'
        : 'REQUIRES_REVIEW';
  const periodStatus: VerificationStatus = parsed.period
    ? salarySemantics?.period === parsed.period
      ? 'VERIFIED'
      : 'REQUIRES_REVIEW'
    : salarySemantics?.period
      ? 'REQUIRES_REVIEW'
      : 'MISSING';
  const confirmedExtras = classifiedAsBase
    ? parsed.additionalCompensation
    : [];
  const additionalCompensationStatus: VerificationStatus =
    parsed.additionalCompensation.length === 0
      ? 'MISSING'
      : confirmedExtras.length === parsed.additionalCompensation.length
        ? 'VERIFIED'
        : 'REQUIRES_REVIEW';
  const factStatuses = [
    currencyStatus,
    minimumStatus,
    periodStatus,
    ...(parsed.kind === 'RANGE' ? [maximumStatus] : []),
    ...(parsed.additionalCompensation.length > 0
      ? [additionalCompensationStatus]
      : []),
  ];
  return {
    currency: parsed.currency,
    minimum: parsed.minimum,
    maximum: parsed.maximum,
    period: parsed.period,
    additionalCompensation: confirmedExtras,
    currencyStatus,
    minimumStatus,
    maximumStatus,
    periodStatus,
    additionalCompensationStatus,
    status: aggregateStatus(factStatuses),
    source: 'DETERMINISTIC_DESCRIPTION',
    reasonCode: factStatuses.includes('REQUIRES_REVIEW')
      ? parsed.currency
        ? 'AMBIGUOUS_PERIOD'
        : 'AMBIGUOUS_CURRENCY'
      : 'VERIFIED_EXACT_EVIDENCE',
    evidence: candidateEvidence(candidate),
    affectedScoring: false,
  };
}

/**
 * Verifies candidate-first model decisions. Gemini never supplies evidence or
 * scalar numbers: each fact is tied back to the deterministic candidate that
 * was sent to the model, and explicit numbers are parsed locally.
 */
export function verifyGeminiCandidateClassifications(
  response: GeminiCandidateClassificationResponse,
  source: PreprocessedJobDescription,
  options: VerifyCandidateOptions,
): VerifiedJobRequirementsExtraction {
  const candidateById = new Map(
    options.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const decisions = response.decisions.map((decision) => {
    const candidate = candidateById.get(decision.candidateId);
    if (!candidate) {
      throw new Error('Candidate classification references an unknown ID.');
    }
    return { decision, candidate };
  });
  const experienceRequirements: VerifiedExperienceRequirement[] = [];
  const requiredQualifications: VerifiedQualification[] = [];
  const preferredQualifications: VerifiedQualification[] = [];
  const degreeRequirements: VerifiedQualification[] = [];
  const certifications: VerifiedQualification[] = [];
  const languages: VerifiedQualification[] = [];
  const scheduleRequirements: VerifiedQualification[] = [];
  const geographicRestrictions: VerifiedTextFact[] = [];
  let collaborationTimezone = missingTextFact();
  let setup = missingTextFact();
  let employmentType = missingTextFact();
  let salary = emptyCandidateSalary();
  const reviewItems: JobRequirementReviewEntry[] = [];
  const candidateItemAudit = new Map<
    string,
    Array<{
      name: string;
      classification: 'REQUIRED' | 'PREFERRED' | 'RESPONSIBILITY' | 'PRESENT' | 'REQUIRES_REVIEW';
      kind: 'QUALIFICATION' | 'DEGREE' | 'CERTIFICATION' | 'LANGUAGE' | 'SCHEDULE' | 'ADDITIONAL_COMPENSATION';
      status: VerificationStatus;
      reasonCode: VerificationReasonCode;
    }>
  >();

  for (const { candidate, decision } of decisions) {
    const evidence = candidateEvidence(candidate);
    if (
      candidate.possibleTypes.includes('EXPERIENCE') &&
      (decision.classification === 'REQUIRED' ||
        decision.classification === 'PREFERRED')
    ) {
      const parsed = parseExperienceEvidence(candidate.evidence);
      if (parsed) {
        experienceRequirements.push(
          verifyExperience(
            {
              ...parsed,
              requirementType: decision.classification,
              evidence,
            },
            source,
          ),
        );
      }
    }

    const normalizedItems: Array<{
      name: string;
      classification:
        | 'REQUIRED'
        | 'PREFERRED'
        | 'RESPONSIBILITY'
        | 'PRESENT'
        | 'REQUIRES_REVIEW';
      kind:
        | 'QUALIFICATION'
        | 'DEGREE'
        | 'CERTIFICATION'
        | 'LANGUAGE'
        | 'SCHEDULE'
        | 'ADDITIONAL_COMPENSATION';
    }> = [];
    if (
      candidate.possibleTypes.includes('QUALIFICATION') &&
      (decision.classification === 'REQUIRED' ||
        decision.classification === 'PREFERRED' ||
        decision.classification === 'RESPONSIBILITY')
    ) {
      for (const concept of deterministicConcepts(candidate.evidence)) {
        const localType = requirementTypeForQualification(
          candidate.evidence,
          concept,
          candidate.sectionType,
        );
        normalizedItems.push({
          name: concept,
          classification:
            decision.classification === 'RESPONSIBILITY'
              ? 'RESPONSIBILITY'
              : localType ?? decision.classification,
          kind: 'QUALIFICATION',
        });
      }
    }

    for (const item of normalizedItems) {
      if (item.classification === 'RESPONSIBILITY') {
        candidateItemAudit.set(decision.candidateId, [
          ...(candidateItemAudit.get(decision.candidateId) ?? []),
          {
            ...item,
            status: 'VERIFIED',
            reasonCode: 'RESPONSIBILITY_NOT_QUALIFICATION',
          },
        ]);
        continue;
      }
      if (
        item.kind === 'QUALIFICATION' &&
        /\b(?:backend|frontend|software|mobile|full[- ]?stack)\s+(?:engineer|developer)\b/i.test(item.name)
      ) {
        candidateItemAudit.set(decision.candidateId, [
          ...(candidateItemAudit.get(decision.candidateId) ?? []),
          {
            ...item,
            status: 'REQUIRES_REVIEW',
            reasonCode: 'REQUIREMENT_TYPE_AMBIGUOUS',
          },
        ]);
        continue;
      }
      if (
        item.classification !== 'REQUIRED' &&
        item.classification !== 'PREFERRED'
      ) {
        candidateItemAudit.set(decision.candidateId, [
          ...(candidateItemAudit.get(decision.candidateId) ?? []),
          {
            ...item,
            status: 'REQUIRES_REVIEW',
            reasonCode: 'REQUIREMENT_TYPE_AMBIGUOUS',
          },
        ]);
        continue;
      }
      const verified = verifyQualification(
        {
          name: item.name,
          requirementType: item.classification,
          evidence,
        },
        source,
      );
      candidateItemAudit.set(decision.candidateId, [
        ...(candidateItemAudit.get(decision.candidateId) ?? []),
        {
          ...item,
          status: verified.status,
          reasonCode: verified.reasonCode,
        },
      ]);
      if (item.kind === 'QUALIFICATION') {
        (item.classification === 'REQUIRED'
          ? requiredQualifications
          : preferredQualifications
        ).push(verified);
      } else if (item.kind === 'DEGREE') degreeRequirements.push(verified);
      else if (item.kind === 'CERTIFICATION') certifications.push(verified);
      else if (item.kind === 'LANGUAGE') languages.push(verified);
      else if (item.kind === 'SCHEDULE') scheduleRequirements.push(verified);
    }

    if (
      candidate.possibleTypes.includes('QUALIFICATION') &&
      !candidate.candidateId.endsWith('-heading') &&
      normalizedItems.filter((item) =>
        ['QUALIFICATION', 'DEGREE', 'CERTIFICATION', 'LANGUAGE'].includes(item.kind),
      ).length === 0 &&
      (decision.classification === 'REQUIRED' ||
        decision.classification === 'PREFERRED' ||
        decision.classification === 'REQUIRES_REVIEW')
    ) {
      reviewItems.push({
        candidateId: candidate.candidateId,
        category: 'QUALIFICATION',
        reasonCode: 'UNSUPPORTED_SKILL_ALIAS',
        audience: 'AUDIT',
        normalizedLabel: null,
      });
    }

    if (
      candidate.possibleTypes.includes('COMPENSATION') &&
      parseExplicitSalary(candidate.evidence, {
        country: options.providerMetadata?.country,
      }).minimum !== null &&
      salary.minimum === null
    ) {
      salary = verifyCandidateSalary(
        candidate,
        decision,
        options.providerMetadata?.country,
      );
    }

    const proposedWorkSetup =
      decision.classification === 'LOCATION_RESTRICTION'
        ? decision.workSetup
        : null;
    const proposedGeographicRestrictions =
      decision.classification === 'LOCATION_RESTRICTION'
        ? decision.geographicRestrictions
        : [];
    const proposedTimezone =
      decision.classification === 'TIMEZONE_REQUIREMENT'
        ? decision.collaborationTimezone
        : null;
    const proposedEmploymentType =
      decision.classification === 'EMPLOYMENT_METADATA'
        ? decision.employmentType
        : null;
    if (
      decision.classification === 'REQUIRES_REVIEW' &&
      candidate.possibleTypes.some((type) =>
        ['LOCATION', 'TIMEZONE', 'WORK_SETUP', 'EMPLOYMENT_TYPE'].includes(type),
      )
    ) {
      const category: JobRequirementReviewCategory =
        candidate.possibleTypes.includes('TIMEZONE')
          ? 'TIMEZONE'
          : candidate.possibleTypes.includes('EMPLOYMENT_TYPE')
            ? 'EMPLOYMENT'
            : 'LOCATION';
      reviewItems.push({
        candidateId: candidate.candidateId,
        category,
        reasonCode: 'REQUIREMENT_TYPE_AMBIGUOUS',
        audience: 'USER',
        normalizedLabel:
          category === 'TIMEZONE'
            ? 'Timezone requirement'
            : category === 'EMPLOYMENT'
              ? 'Employment type'
              : 'Location or work setup',
      });
    }
    if (
      decision.classification === 'REQUIRES_REVIEW' &&
      !reviewItems.some((item) => item.candidateId === candidate.candidateId)
    ) {
      reviewItems.push({
        candidateId: candidate.candidateId,
        category: 'OTHER',
        reasonCode: 'REQUIREMENT_TYPE_AMBIGUOUS',
        audience: 'AUDIT',
        normalizedLabel: null,
      });
    }
    if (proposedWorkSetup && setup.status === 'MISSING') {
      setup = candidate.source === 'PROVIDER_METADATA'
        ? {
            value: /^(REMOTE|HYBRID|ONSITE|TEMPORARY_REMOTE|UNCLEAR)$/.test(candidate.evidence)
              ? candidate.evidence
              : proposedWorkSetup,
            status: 'VERIFIED',
            source: 'PROVIDER_METADATA',
            reasonCode: 'VERIFIED_PROVIDER_METADATA',
            evidence,
            affectedScoring: true,
          }
        : verifyTextFact(
            proposedWorkSetup,
            evidence,
            source,
            (quote, value) =>
              value === 'REMOTE'
                ? /\bremote\b/i.test(quote)
                : value === 'HYBRID'
                  ? /\bhybrid\b/i.test(quote)
                  : value === 'ONSITE'
                    ? /\bon[- ]?site\b|\bonsite\b/i.test(quote)
                    : false,
            true,
          );
    }
    const uniqueGeographicRestrictions = [
      ...new Map(
        proposedGeographicRestrictions.map((value) => [
          normalizedSkill(value),
          value,
        ]),
      ).values(),
    ];
    for (const value of candidate.source === 'DESCRIPTION'
      ? uniqueGeographicRestrictions
      : []) {
      geographicRestrictions.push(
        verifyTextFact(
          value,
          evidence,
          source,
          (quote, proposed) =>
            evidenceText(quote).includes(evidenceText(proposed)) &&
            /\b(within|only|must be|located in|region|eligible|work location)\b/i.test(quote),
          true,
        ),
      );
    }
    if (proposedTimezone && collaborationTimezone.status === 'MISSING') {
      const canonicalTimezone = canonicalizeTimezoneDisplayValue(
        proposedTimezone,
        candidate.evidence,
      );
      collaborationTimezone = verifyTextFact(
        canonicalTimezone,
        evidence,
        source,
        (quote, value) =>
          verifyCanonicalTimezone(quote, proposedTimezone, value),
      );
    }
    if (proposedEmploymentType && employmentType.status === 'MISSING') {
      employmentType = candidate.source === 'PROVIDER_METADATA'
        ? {
            value: candidate.evidence,
            status: 'VERIFIED',
            source: 'PROVIDER_METADATA',
            reasonCode: 'VERIFIED_PROVIDER_METADATA',
            evidence,
            affectedScoring: false,
          }
        : verifyTextFact(
            proposedEmploymentType,
            evidence,
            source,
            (quote, value) => evidenceText(quote).includes(evidenceText(value)),
          );
    }
  }

  const uniqueQualifications = (items: VerifiedQualification[]) => {
    const unique = new Map<string, VerifiedQualification>();
    for (const item of items) {
      const key = `${normalizedSkill(item.name)}:${item.requirementType ?? ''}`;
      const previous = unique.get(key);
      if (!previous || (previous.status !== 'VERIFIED' && item.status === 'VERIFIED')) {
        unique.set(key, item);
      }
    }
    return [...unique.values()];
  };
  const uniqueRequired = uniqueQualifications(requiredQualifications);
  const uniquePreferred = uniqueQualifications(preferredQualifications);
  const candidateIdForEvidence = (
    evidence: ExtractionEvidence | null,
    fallback: string,
  ): string => {
    if (!evidence) return fallback;
    const quote = evidenceText(evidence.quote);
    return options.candidates.find(
      (candidate) => evidenceText(candidate.evidence) === quote,
    )?.candidateId ?? fallback;
  };
  const addFactReview = (
    fact: {
      status: VerificationStatus;
      reasonCode: VerificationReasonCode;
      evidence: ExtractionEvidence | null;
    },
    category: JobRequirementReviewCategory,
    normalizedLabel: string,
    fallbackCandidateId: string,
  ) => {
    if (fact.status !== 'REQUIRES_REVIEW' && fact.status !== 'CONFLICT') {
      return;
    }
    reviewItems.push({
      candidateId: candidateIdForEvidence(
        fact.evidence,
        fallbackCandidateId,
      ),
      category,
      reasonCode: fact.reasonCode,
      audience: 'USER',
      normalizedLabel,
    });
  };

  for (const item of experienceRequirements) {
    const years = item.minimumYears === null
      ? 'Experience requirement'
      : item.maximumYears === null
        ? `${item.minimumYears}+ years experience`
        : `${item.minimumYears}-${item.maximumYears} years experience`;
    addFactReview(item, 'EXPERIENCE', years, 'experience-review');
  }
  for (const item of [...uniqueRequired, ...uniquePreferred]) {
    addFactReview(item, 'QUALIFICATION', item.name, 'qualification-review');
  }
  for (const item of [
    ...degreeRequirements,
    ...certifications,
    ...languages,
  ]) {
    addFactReview(
      item,
      'DEGREE_CERTIFICATION_LANGUAGE',
      item.name,
      'qualification-metadata-review',
    );
  }
  for (const item of scheduleRequirements) {
    addFactReview(item, 'TIMEZONE', item.name, 'schedule-review');
  }
  addFactReview(setup, 'LOCATION', 'Work setup', 'provider-work-setup');
  for (const item of geographicRestrictions) {
    addFactReview(
      item,
      'LOCATION',
      item.value ?? 'Location restriction',
      'location-review',
    );
  }
  addFactReview(
    collaborationTimezone,
    'TIMEZONE',
    collaborationTimezone.value ?? 'Timezone requirement',
    'timezone-review',
  );
  addFactReview(
    employmentType,
    'EMPLOYMENT',
    employmentType.value ?? 'Employment type',
    'provider-employment-type',
  );
  if (
    salary.status === 'PARTIAL' ||
    salary.status === 'REQUIRES_REVIEW' ||
    salary.status === 'CONFLICT'
  ) {
    reviewItems.push({
      candidateId: candidateIdForEvidence(
        salary.evidence,
        'provider-salary',
      ),
      category: 'SALARY',
      reasonCode: salary.reasonCode,
      audience: 'USER',
      normalizedLabel: 'Salary',
    });
  }
  const finalReviewItems = deduplicateReviewItems(reviewItems);
  const allFacts = [
    ...experienceRequirements,
    ...uniqueRequired,
    ...uniquePreferred,
    ...degreeRequirements,
    ...certifications,
    ...languages,
    ...scheduleRequirements,
    setup,
    ...geographicRestrictions,
    collaborationTimezone,
    employmentType,
  ];
  const salaryFactStatuses: VerificationStatus[] = [
    salary.currencyStatus,
    salary.minimumStatus,
    salary.maximumStatus,
    salary.periodStatus,
    salary.additionalCompensationStatus,
  ];
  const statuses = [...allFacts.map((fact) => fact.status), ...salaryFactStatuses];
  if (finalReviewItems.length > 0) statuses.push('REQUIRES_REVIEW');

  return {
    schemaVersion: JOB_REQUIREMENTS_EXTRACTION_SCHEMA_VERSION,
    contentHash: options.contentHash,
    modelIdentifier: options.modelIdentifier,
    extractedAt: options.extractedAt,
    extractionStatus: aggregateStatus(statuses),
    extractionFailureReason: null,
    candidateAudit: decisions.map(({ decision }) => ({
      candidateId: decision.candidateId,
      classification: decision.classification,
      status: decision.classification === 'REQUIRES_REVIEW'
        ? 'REQUIRES_REVIEW'
        : 'VERIFIED',
      reasonCode: decision.classification === 'REQUIRES_REVIEW'
        ? 'REQUIREMENT_TYPE_AMBIGUOUS'
        : 'VERIFIED_EXACT_EVIDENCE',
      normalizedItems: candidateItemAudit.get(decision.candidateId) ?? [],
    })),
    experienceRequirements,
    requiredQualifications: uniqueRequired,
    preferredQualifications: uniquePreferred,
    degreeRequirements,
    certifications,
    languages,
    salary,
    workArrangement: {
      setup,
      geographicRestrictions,
      collaborationTimezone,
      scheduleRequirements,
    },
    employmentType,
    reviewItems: finalReviewItems,
  };
}

export function applyVerifiedRequirementsToJob(
  job: NormalizedJob,
  extraction: VerifiedJobRequirementsExtraction,
): NormalizedJob {
  const requiredExperience = extraction.experienceRequirements
    .filter(
      (item) =>
        item.status === 'VERIFIED' &&
        item.requirementType === 'REQUIRED' &&
        item.minimumYears !== null,
    )
    .map((item) => item.minimumYears as number);
  const verifiedRequired = extraction.requiredQualifications
    .filter((item) => item.status === 'VERIFIED')
    .map((item) => item.name);
  const verifiedPreferred = extraction.preferredQualifications
    .filter((item) => item.status === 'VERIFIED')
    .map((item) => item.name);
  const setup = extraction.workArrangement.setup;
  const verifiedSetup =
    setup.status === 'VERIFIED' && setup.value
      ? (setup.value as NormalizedJob['work_setup'])
      : job.work_setup;
  const restrictions = extraction.workArrangement.geographicRestrictions
    .filter(
      (item): item is typeof item & { value: string } =>
        item.status === 'VERIFIED' && item.value !== null,
    )
    .map((item) => item.value);
  return {
    ...job,
    years_experience_min:
      requiredExperience.length > 0 ? Math.max(...requiredExperience) : null,
    years_experience_max: null,
    required_skills: verifiedRequired,
    preferred_skills: verifiedPreferred,
    work_setup: verifiedSetup,
    work_setup_confidence: setup.status === 'VERIFIED' ? 1 : job.work_setup_confidence,
    work_setup_evidence:
      setup.status === 'VERIFIED' ? setup.evidence?.quote ?? null : null,
    allowed_regions: restrictions,
    eligibility_text:
      restrictions.length > 0 ? restrictions.join(' · ') : job.eligibility_text,
    salary_min:
      extraction.salary.minimumStatus === 'VERIFIED'
        ? extraction.salary.minimum
        : job.salary_min,
    salary_max:
      extraction.salary.maximumStatus === 'VERIFIED'
        ? extraction.salary.maximum
        : job.salary_max,
    salary_currency:
      extraction.salary.currencyStatus === 'VERIFIED'
        ? extraction.salary.currency
        : job.salary_currency,
    salary_period:
      extraction.salary.periodStatus === 'VERIFIED'
        ? extraction.salary.period === 'YEAR'
          ? 'yearly'
          : extraction.salary.period === 'MONTH'
            ? 'monthly'
            : extraction.salary.period === 'HOUR'
              ? 'hourly'
              : null
        : job.salary_period,
  };
}

export function reconcileVerifiedExtractionWithProvider(
  extraction: VerifiedJobRequirementsExtraction,
  provider: {
    salaryMin?: number | null;
    salaryMax?: number | null;
    salaryCurrency?: string | null;
    workSetup?: string | null;
    employmentType?: string | null;
  },
): VerifiedJobRequirementsExtraction {
  let salary = extraction.salary;
  const providerHasSalary =
    provider.salaryMin !== null &&
    provider.salaryMin !== undefined;
  if (
    providerHasSalary &&
    salary.minimumStatus === 'VERIFIED' &&
    (provider.salaryMin !== salary.minimum ||
      (provider.salaryMax != null &&
        provider.salaryMax !== salary.maximum) ||
      (provider.salaryCurrency &&
        provider.salaryCurrency !== salary.currency))
  ) {
    salary = {
      ...salary,
      status: 'CONFLICT',
      minimumStatus:
        provider.salaryMin !== salary.minimum ? 'CONFLICT' : salary.minimumStatus,
      maximumStatus:
        provider.salaryMax != null && provider.salaryMax !== salary.maximum
          ? 'CONFLICT'
          : salary.maximumStatus,
      currencyStatus:
        provider.salaryCurrency && provider.salaryCurrency !== salary.currency
          ? 'CONFLICT'
          : salary.currencyStatus,
      reasonCode: 'PROVIDER_DESCRIPTION_CONFLICT',
      affectedScoring: false,
    };
  }

  let setup = extraction.workArrangement.setup;
  if (
    provider.workSetup &&
    provider.workSetup !== 'UNCLEAR' &&
    setup.status === 'MISSING'
  ) {
    setup = {
      value: provider.workSetup,
      status: 'VERIFIED',
      source: 'PROVIDER_METADATA',
      reasonCode: 'VERIFIED_PROVIDER_METADATA',
      evidence: null,
      affectedScoring: true,
    };
  }
  if (
    provider.workSetup &&
    provider.workSetup !== 'UNCLEAR' &&
    setup.status === 'VERIFIED' &&
    setup.value &&
    provider.workSetup !== setup.value
  ) {
    setup = {
      ...setup,
      status: 'CONFLICT',
      reasonCode: 'PROVIDER_DESCRIPTION_CONFLICT',
      affectedScoring: false,
    };
  }

  let employmentType = extraction.employmentType;
  if (
    provider.employmentType &&
    provider.employmentType !== 'UNKNOWN' &&
    employmentType.status === 'MISSING'
  ) {
    employmentType = {
      value: provider.employmentType,
      status: 'VERIFIED',
      source: 'PROVIDER_METADATA',
      reasonCode: 'VERIFIED_PROVIDER_METADATA',
      evidence: null,
      affectedScoring: false,
    };
  }
  if (
    provider.employmentType &&
    provider.employmentType !== 'UNKNOWN' &&
    employmentType.status === 'VERIFIED' &&
    employmentType.value &&
    evidenceText(provider.employmentType) !==
      evidenceText(employmentType.value)
  ) {
    employmentType = {
      ...employmentType,
      status: 'CONFLICT',
      reasonCode: 'PROVIDER_DESCRIPTION_CONFLICT',
      affectedScoring: false,
    };
  }
  const conflict =
    salary.status === 'CONFLICT' ||
    setup.status === 'CONFLICT' ||
    employmentType.status === 'CONFLICT';
  const reconciledReviewItems = extraction.reviewItems.filter((item) =>
    !(
      (salary.status === 'CONFLICT' && item.category === 'SALARY') ||
      (setup.status === 'CONFLICT' && item.category === 'LOCATION') ||
      (employmentType.status === 'CONFLICT' && item.category === 'EMPLOYMENT')
    ),
  );
  if (salary.status === 'CONFLICT') {
    reconciledReviewItems.push({
      candidateId: 'provider-salary',
      category: 'SALARY',
      reasonCode: salary.reasonCode,
      audience: 'USER',
      normalizedLabel: 'Salary',
    });
  }
  if (setup.status === 'CONFLICT') {
    reconciledReviewItems.push({
      candidateId: 'provider-work-setup',
      category: 'LOCATION',
      reasonCode: setup.reasonCode,
      audience: 'USER',
      normalizedLabel: 'Work setup',
    });
  }
  if (employmentType.status === 'CONFLICT') {
    reconciledReviewItems.push({
      candidateId: 'provider-employment-type',
      category: 'EMPLOYMENT',
      reasonCode: employmentType.reasonCode,
      audience: 'USER',
      normalizedLabel: 'Employment type',
    });
  }
  return {
    ...extraction,
    extractionStatus: conflict ? 'CONFLICT' : extraction.extractionStatus,
    salary,
    workArrangement: {
      ...extraction.workArrangement,
      setup,
    },
    employmentType,
    reviewItems: deduplicateReviewItems(reconciledReviewItems),
  };
}
