import * as cheerio from 'cheerio';
import { canonicalizeJobUrl } from '@job-app/classification';
import {
  JobRequirementCandidateSchema,
  ExtractionSectionHintSchema,
  type ExtractionCandidatePossibleType,
  type ExtractionSectionHint,
  type JobRequirementCandidate,
} from './job-requirements-contracts.js';

export interface PreprocessedJobClause {
  text: string;
  bullet: boolean;
  normalizedStart: number;
  normalizedEnd: number;
}

export interface PreprocessedJobSection {
  rawHeading: string | null;
  normalizedHeading: string | null;
  hint: ExtractionSectionHint;
  clauses: PreprocessedJobClause[];
}

export interface PreprocessedJobDescription {
  rawDescription: string;
  cleanedDescription: string;
  sections: PreprocessedJobSection[];
}

const BLOCK_SELECTOR = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'li',
  'blockquote',
  'pre',
  'dt',
  'dd',
].join(',');

const REMOVE_SELECTOR = [
  'script',
  'style',
  'noscript',
  'template',
  'iframe',
  'svg',
  'canvas',
  '[hidden]',
  '[aria-hidden="true"]',
].join(',');

function normalizeText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*?>/i.test(value);
}

function classifyHeading(heading: string | null): ExtractionSectionHint {
  if (!heading) return 'UNKNOWN';
  const value = heading
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (
    /^(responsibilities|key responsibilities|what you will do|what you'll do|duties|your role)$/.test(
      value,
    )
  ) {
    return 'RESPONSIBILITIES';
  }
  if (
    /^(who you are|requirements|required qualifications|minimum qualifications|qualifications|what you bring)$/.test(
      value,
    )
  ) {
    return 'REQUIRED_QUALIFICATIONS';
  }
  if (
    /^(preferred qualifications|nice to have|bonus|preferred|desired qualifications)$/.test(
      value,
    )
  ) {
    return 'PREFERRED_QUALIFICATIONS';
  }
  if (/^(compensation|salary|pay|salary and benefits)$/.test(value)) {
    return 'COMPENSATION';
  }
  if (
    /^(location|where you'll be|where you will be|work location|work arrangement)$/.test(
      value,
    )
  ) {
    return 'LOCATION';
  }
  if (/^(company|about|about us|who we are|the company)$/.test(value)) {
    return 'COMPANY';
  }
  return 'UNKNOWN';
}

function isHeadingLine(value: string): boolean {
  const normalized = normalizeText(value).replace(/:$/, '');
  if (!normalized || normalized.length > 80) return false;
  if (classifyHeading(normalized) !== 'UNKNOWN') return true;
  return (
    /^(about(?: us| the company)?|benefits|our product|the company|company overview)$/i.test(
      normalized,
    ) ||
    (/^[A-Z][A-Za-z'’ ]{1,50}$/.test(normalized) &&
      normalized.split(/\s+/).length <= 6)
  );
}

interface RawBlock {
  text: string;
  heading: boolean;
  bullet: boolean;
}

function splitParagraphClauses(text: string): string[] {
  return text
    .split(/(?:(?<=[!?;])|(?<=[^\d]\.))\s*(?=[A-Z0-9"'(])/)
    .map(normalizeText)
    .filter(Boolean);
}

function candidateSlug(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70) || 'unheaded';
}

function possibleTypesForClause(
  text: string,
  section: ExtractionSectionHint,
): ExtractionCandidatePossibleType[] {
  const types: ExtractionCandidatePossibleType[] = [];
  if (/\b\d{1,2}\s*(?:\+|[-â€“â€”]|to)?\s*years?\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+years?\b/i.test(text)) {
    types.push('EXPERIENCE');
  }
  if (/\b(?:USD|PHP|GBP|EUR)\b|[$Â£â‚±â‚¬]\s*\d|\b(?:salary|base range|compensation|equity|bonus|commission)\b/i.test(text)) {
    types.push('COMPENSATION');
  }
  if (/\b(?:remote|hybrid|on[- ]?site|work location|located in|region|eligible to work)\b/i.test(text)) {
    types.push('LOCATION', 'WORK_SETUP');
  }
  if (/\b(?:time ?zone|collaboration hours|overlap|EST|PST|CST|UTC)\b/i.test(text)) {
    types.push('TIMEZONE');
  }
  if (/\b(?:full[- ]?time|part[- ]?time|contract|temporary|internship|employment type)\b/i.test(text)) {
    types.push('EMPLOYMENT_TYPE');
  }
  if (
    section === 'REQUIRED_QUALIFICATIONS' ||
    section === 'PREFERRED_QUALIFICATIONS' ||
    /\b(?:required|preferred|proficient|experience with|experience as a bonus|knowledge of|familiar with|understanding of|must have|you have|you are)\b/i.test(text)
  ) {
    types.push('QUALIFICATION');
  }
  if (section === 'RESPONSIBILITIES') types.push('RESPONSIBILITY');
  return types.length > 0 ? [...new Set(types)] : ['OTHER'];
}

export interface CandidateProviderMetadata {
  salaryText?: string | null;
  location?: string | null;
  workSetup?: string | null;
  employmentType?: string | null;
}

/**
 * Enumerates the complete, ordered evidence universe supplied to Gemini.
 * Candidate text is owned by deterministic code; the model can only classify
 * these IDs and cannot provide replacement evidence.
 */
export function enumerateJobRequirementCandidates(
  source: PreprocessedJobDescription,
  providerMetadata: CandidateProviderMetadata = {},
): JobRequirementCandidate[] {
  const candidates: JobRequirementCandidate[] = [];
  const slugCounts = new Map<string, number>();
  for (const section of source.sections) {
    const base = candidateSlug(section.normalizedHeading ?? 'unheaded');
    const occurrence = (slugCounts.get(base) ?? 0) + 1;
    slugCounts.set(base, occurrence);
    const sectionSlug = occurrence === 1 ? base : `${base}-${occurrence}`;
    if (section.normalizedHeading) {
      candidates.push(JobRequirementCandidateSchema.parse({
        candidateId: `${sectionSlug}-heading`,
        source: 'DESCRIPTION',
        sectionType: section.hint,
        section: section.normalizedHeading,
        evidence: section.normalizedHeading,
        originalStart: null,
        originalEnd: null,
        possibleTypes: ['OTHER'],
      }));
    }
    section.clauses.forEach((clause, index) => {
      const rawIndex = source.rawDescription.indexOf(clause.text);
      candidates.push(JobRequirementCandidateSchema.parse({
        candidateId: `${sectionSlug}-${String(index + 1).padStart(2, '0')}`,
        source: 'DESCRIPTION',
        sectionType: section.hint,
        section: section.normalizedHeading,
        evidence: clause.text,
        originalStart: rawIndex >= 0 ? rawIndex : null,
        originalEnd: rawIndex >= 0 ? rawIndex + clause.text.length : null,
        possibleTypes: possibleTypesForClause(clause.text, section.hint),
      }));
    });
  }

  const providerCandidates: Array<{
    id: string;
    value: string | null | undefined;
    type: ExtractionCandidatePossibleType;
    section: ExtractionSectionHint;
  }> = [
    { id: 'provider-salary', value: providerMetadata.salaryText, type: 'COMPENSATION', section: 'COMPENSATION' },
    { id: 'provider-location', value: providerMetadata.location, type: 'LOCATION', section: 'LOCATION' },
    { id: 'provider-work-setup', value: providerMetadata.workSetup, type: 'WORK_SETUP', section: 'LOCATION' },
    { id: 'provider-employment-type', value: providerMetadata.employmentType, type: 'EMPLOYMENT_TYPE', section: 'UNKNOWN' },
  ];
  for (const item of providerCandidates) {
    const evidence = item.value?.trim();
    if (!evidence) continue;
    candidates.push(JobRequirementCandidateSchema.parse({
      candidateId: item.id,
      source: 'PROVIDER_METADATA',
      sectionType: item.section,
      section: null,
      evidence,
      originalStart: null,
      originalEnd: null,
      possibleTypes: [item.type],
    }));
  }
  return candidates;
}

function htmlBlocks(input: string): RawBlock[] {
  const $ = cheerio.load(input);
  $(REMOVE_SELECTOR).remove();
  const blocks: RawBlock[] = [];
  $(BLOCK_SELECTOR).each((_, element) => {
    const tag = String($(element).prop('tagName') ?? '').toLowerCase();
    if (tag !== 'li' && $(element).parents('li').length > 0) return;
    const text = normalizeText($(element).text());
    if (!text) return;
    const heading = /^h[1-6]$/.test(tag);
    const bullet = tag === 'li';
    const clauses = heading || bullet ? [text] : splitParagraphClauses(text);
    clauses.forEach((clause) =>
      blocks.push({ text: clause, heading, bullet }),
    );
  });
  if (blocks.length > 0) return blocks;
  const text = normalizeText($.root().text());
  return text ? [{ text, heading: false, bullet: false }] : [];
}

function splitPlainLine(line: string): RawBlock[] {
  const normalized = normalizeText(line);
  if (!normalized) return [];
  if (isHeadingLine(normalized)) {
    return [{ text: normalized.replace(/:$/, ''), heading: true, bullet: false }];
  }
  const explicitBullet = /^[-*•]\s+/.test(normalized);
  const body = normalized.replace(/^[-*•]\s+/, '');
  const parts = body
    .split(explicitBullet ? /\s+-\s+(?=[A-Z0-9])/ : /$^/)
    .map(normalizeText)
    .filter(Boolean);
  return parts.flatMap((text, index) => {
    const bullet = explicitBullet || parts.length > 1 || index > 0;
    return (bullet ? [text] : splitParagraphClauses(text)).map((clause) => ({
      text: clause,
      heading: false,
      bullet,
    }));
  });
}

function plainBlocks(input: string): RawBlock[] {
  return input
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .flatMap(splitPlainLine);
}

function emptySection(
  rawHeading: string | null,
): PreprocessedJobSection {
  const normalizedHeading = rawHeading ? normalizeText(rawHeading) : null;
  return {
    rawHeading,
    normalizedHeading,
    hint: ExtractionSectionHintSchema.parse(
      classifyHeading(normalizedHeading),
    ),
    clauses: [],
  };
}

export function preprocessJobDescription(
  rawDescription: string,
): PreprocessedJobDescription {
  const blocks = looksLikeHtml(rawDescription)
    ? htmlBlocks(rawDescription)
    : plainBlocks(rawDescription);
  const sections: PreprocessedJobSection[] = [emptySection(null)];
  let current = sections[0] as PreprocessedJobSection;

  for (const block of blocks) {
    if (block.heading || isHeadingLine(block.text)) {
      current = emptySection(block.text.replace(/:$/, ''));
      sections.push(current);
      continue;
    }
    current.clauses.push({
      text: block.text,
      bullet: block.bullet,
      normalizedStart: 0,
      normalizedEnd: 0,
    });
  }

  const meaningful = sections.filter(
    (section, index) => section.clauses.length > 0 || index > 0,
  );
  const output: string[] = [];
  let position = 0;
  for (const section of meaningful) {
    if (section.normalizedHeading) {
      if (output.length > 0) {
        output.push('');
        position += 1;
      }
      output.push(section.normalizedHeading);
      position += section.normalizedHeading.length + 1;
    }
    for (const clause of section.clauses) {
      const line = clause.bullet ? `- ${clause.text}` : clause.text;
      clause.normalizedStart = position + (clause.bullet ? 2 : 0);
      clause.normalizedEnd = clause.normalizedStart + clause.text.length;
      output.push(line);
      position += line.length + 1;
    }
  }

  return {
    rawDescription,
    cleanedDescription: output.join('\n').trim(),
    sections: meaningful,
  };
}

export interface NormalizedProviderDate {
  iso: string | null;
  original: string | number | null;
  status: 'NORMALIZED' | 'MISSING' | 'REQUIRES_REVIEW';
}

export function normalizeProviderDate(
  value: string | number | null | undefined,
): NormalizedProviderDate {
  if (value === null || value === undefined || value === '') {
    return { iso: null, original: value ?? null, status: 'MISSING' };
  }
  let date: Date;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) {
      return { iso: null, original: value, status: 'REQUIRES_REVIEW' };
    }
    const milliseconds = value < 100_000_000_000 ? value * 1_000 : value;
    date = new Date(milliseconds);
  } else {
    const trimmed = value.trim();
    if (
      !/^\d{4}-\d{2}-\d{2}(?:[T ][0-9:.+-]+Z?)?$/.test(trimmed)
    ) {
      return { iso: null, original: value, status: 'REQUIRES_REVIEW' };
    }
    const dateParts = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
    if (dateParts) {
      const year = Number(dateParts[1]);
      const month = Number(dateParts[2]);
      const day = Number(dateParts[3]);
      const maximumDay =
        month >= 1 && month <= 12
          ? new Date(Date.UTC(year, month, 0)).getUTCDate()
          : 0;
      if (day < 1 || day > maximumDay) {
        return { iso: null, original: value, status: 'REQUIRES_REVIEW' };
      }
    }
    date = new Date(trimmed);
  }
  if (Number.isNaN(date.getTime())) {
    return { iso: null, original: value, status: 'REQUIRES_REVIEW' };
  }
  return {
    iso: date.toISOString(),
    original: value,
    status: 'NORMALIZED',
  };
}

export function normalizeJobSourceUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return canonicalizeJobUrl(value);
  } catch {
    return null;
  }
}

export interface DeterministicSalary {
  currency: string | null;
  minimum: number | null;
  maximum: number | null;
  period: 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | null;
  kind: 'EXACT' | 'RANGE' | null;
  additionalCompensation: string[];
  status: 'VERIFIED' | 'MISSING' | 'REQUIRES_REVIEW';
}

function amount(value: string, suffix: string | undefined): number {
  const parsed = Number(value.replace(/,/g, ''));
  return suffix?.toLowerCase() === 'k' ? parsed * 1_000 : parsed;
}

export function parseExplicitSalary(
  text: string,
  context: { country?: string | null } = {},
): DeterministicSalary {
  const normalized = normalizeText(text);
  const currencyToken = normalized.match(
    /\b(?:USD|PHP|GBP|EUR)\b(?=\s*[$£₱€]?\s*\d)|[$£₱€](?=\s*\d)/i,
  )?.[0];
  const numbers = [
    ...normalized.matchAll(
      /(?:USD|PHP|GBP|EUR|[$£₱€])?\s*(\d{1,3}(?:,\d{3})+|\d{2,9})(?:\.(\d{1,2}))?\s*(k)?/gi,
    ),
  ].map((match) =>
    amount(
      `${match[1] ?? ''}${match[2] ? `.${match[2]}` : ''}`,
      match[3],
    ),
  );
  if (!currencyToken || numbers.length === 0) {
    return {
      currency: null,
      minimum: null,
      maximum: null,
      period: null,
      kind: null,
      additionalCompensation: [],
      status: 'MISSING',
    };
  }

  let currency: string | null = null;
  const upper = currencyToken.toUpperCase();
  if (upper === 'PHP' || currencyToken === '₱') currency = 'PHP';
  else if (upper === 'GBP' || currencyToken === '£') currency = 'GBP';
  else if (upper === 'EUR' || currencyToken === '€') currency = 'EUR';
  else if (upper === 'USD') currency = 'USD';
  else if (
    currencyToken === '$' &&
    (/\bUnited States\b/i.test(normalized) ||
      /^(US|USA|United States)$/i.test(context.country ?? ''))
  ) {
    currency = 'USD';
  }

  const firstAmountIndex = normalized.search(/\d/);
  const salaryContext =
    firstAmountIndex >= 0
      ? normalized.slice(
          Math.max(0, firstAmountIndex - 30),
          Math.min(normalized.length, firstAmountIndex + 100),
        )
      : normalized;
  const period = /\/yr\b|\b(?:per\s+)?(?:year|annual(?:ly)?)\b/i.test(salaryContext)
    ? 'YEAR'
    : /\/mo\b|\b(?:per\s+)?(?:month|monthly)\b/i.test(salaryContext)
      ? 'MONTH'
      : /\/wk\b|\b(?:per\s+)?(?:week|weekly)\b/i.test(salaryContext)
        ? 'WEEK'
        : /\/day\b|\b(?:per\s+)?(?:day|daily)\b/i.test(salaryContext)
          ? 'DAY'
          : /\/hr\b|\b(?:per\s+)?(?:hour|hourly)\b/i.test(salaryContext)
            ? 'HOUR'
            : null;
  const additionalCompensation = [
    /\bequity\b/i.test(salaryContext) ? 'equity' : null,
    /\bbonus\b/i.test(salaryContext) ? 'bonus' : null,
    /\bcommission\b/i.test(salaryContext) ? 'commission' : null,
  ].filter((value): value is string => value !== null);

  return {
    currency,
    minimum: numbers[0] ?? null,
    maximum: numbers.length > 1 ? numbers[1] ?? null : null,
    period,
    kind: numbers.length > 1 ? 'RANGE' : 'EXACT',
    additionalCompensation,
    status: currency ? 'VERIFIED' : 'REQUIRES_REVIEW',
  };
}
