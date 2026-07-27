import { nanoid } from 'nanoid';
import type { NormalizedJob, EmploymentType, SeniorityLevel, WorkSetup } from '@job-app/core';
import type { RawJobInput } from './types.js';

export function normalizeJob(raw: RawJobInput): NormalizedJob {
  const { salary_min, salary_max, salary_currency, salary_period } = parseSalary(raw.salary_text);

  return {
    id: nanoid(),
    source_id: nanoid(),
    source_name: raw.source_name,
    source_job_id: raw.source_job_id ?? null,
    original_url: raw.original_url ?? null,
    title: raw.title,
    company: raw.company,
    description: raw.description,
    date_posted: raw.date_posted ?? null,
    date_expires: raw.date_expires ?? null,
    date_ingested: new Date().toISOString(),
    country: raw.country ?? null,
    city: raw.city ?? null,
    region: raw.region ?? null,
    work_setup: mapWorkSetup(raw.work_setup_hint),
    work_setup_confidence: 0.5,
    work_setup_evidence: null,
    onsite_days_per_week: null,
    relocation_required: null,
    allowed_countries: raw.allowed_countries ?? [],
    allowed_regions: raw.allowed_regions ?? [],
    eligibility_text: raw.eligibility_text ?? null,
    employment_type: mapEmploymentType(raw.employment_type),
    contract_type: null,
    schedule: raw.schedule ?? null,
    timezone_overlap: null,
    salary_min,
    salary_max,
    salary_currency,
    salary_period,
    seniority: mapSeniority(raw.seniority_hint),
    years_experience_min: parseYearsExperience(`${raw.title} ${raw.description}`),
    years_experience_max: null,
    required_skills: raw.required_skills ?? [],
    preferred_skills: raw.preferred_skills ?? [],
    required_education: null,
    required_licenses: [],
    application_url: raw.application_url ?? null,
    application_method: null,
    has_sensitive_questions: null,
    category: null,
    eligibility_status: null,
    status: 'DISCOVERED',
    raw_snapshot: raw.raw_html ?? null,
  };
}

/**
 * Extracts the minimum years of professional experience a listing demands.
 *
 * Only matches explicit experience phrasing ("5+ years", "at least 5 years",
 * "5 years of experience", "5-7 years") — never bare numbers — to avoid false
 * positives (e.g. "13th month pay"). Returns the highest stated minimum, since
 * that is the binding requirement a candidate must meet. Returns `null` when no
 * experience requirement is stated (the value is not invented).
 */
export function parseYearsExperience(text: string): number | null {
  const lower = text.toLowerCase();
  const found: number[] = [];

  const patterns: RegExp[] = [
    // "5+ years", "5 + yrs"
    /(\d{1,2})\s*\+\s*(?:years?|yrs?)/g,
    // "at least 5 years", "minimum of 5 years", "min 5 yrs"
    /(?:at least|minimum(?:\s+of)?|min\.?)\s+(\d{1,2})\s*\+?\s*(?:years?|yrs?)/g,
    // "5 years of experience", "5 yrs experience", "5 years' experience"
    /(\d{1,2})\s*\+?\s*(?:years?|yrs?)['’]?\s+(?:of\s+)?(?:[a-z0-9,\/&.\- ]{0,40}?\s+)?experience/g,
    // range "5-7 years" / "5 to 7 years" -> lower bound is the minimum
    /(\d{1,2})\s*(?:-|to)\s*\d{1,2}\s*(?:years?|yrs?)/g,
  ];

  for (const re of patterns) {
    for (const match of lower.matchAll(re)) {
      const captured = match[1];
      if (captured === undefined) continue;
      const n = parseInt(captured, 10);
      if (!Number.isNaN(n) && n > 0 && n <= 50) found.push(n);
    }
  }

  if (found.length === 0) return null;
  return Math.max(...found);
}

export function parseSalary(text?: string) {
  if (!text) {
    return { salary_min: null, salary_max: null, salary_currency: null, salary_period: null };
  }
  // A salary grade is a classification, not an offered amount. Keep it out of
  // the actual salary fields even though it contains a number.
  if (
    /^\s*(?:salary\s*grade|sg)\s*[-:]?\s*\d{1,2}(?:\s*,?\s*step\s*\d)?\s*$/i.test(
      text,
    )
  ) {
    return {
      salary_min: null,
      salary_max: null,
      salary_currency: null,
      salary_period: null,
    };
  }
  // Loose parsing implementation (can be improved)
  let currency = null;
  if (text.includes('$') || text.toLowerCase().includes('usd')) currency = 'USD';
  else if (text.toLowerCase().includes('php') || text.includes('₱')) currency = 'PHP';

  let period: 'hourly' | 'monthly' | 'yearly' | 'project' | null = null;
  if (text.toLowerCase().includes('hour') || text.toLowerCase().includes('/hr')) period = 'hourly';
  else if (text.toLowerCase().includes('month') || text.toLowerCase().includes('/mo')) period = 'monthly';
  else if (text.toLowerCase().includes('year') || text.toLowerCase().includes('/yr')) period = 'yearly';
  else if (text.toLowerCase().includes('project')) period = 'project';

  // Extract numbers
  const nums = text.match(/\d+(?:,\d+)*(?:\.\d+)?/g)?.map(n => parseFloat(n.replace(/,/g, '')));
  let min = null;
  let max = null;
  
  if (nums && nums.length > 0) {
    min = nums[0];
    if (nums.length > 1) {
      max = nums[1];
    }
  }

  return { salary_min: min ?? null, salary_max: max ?? null, salary_currency: currency, salary_period: period };
}

function mapWorkSetup(hint?: string): WorkSetup {
  if (!hint) return 'UNCLEAR';
  const l = hint.toLowerCase();
  if (l.includes('hybrid')) return 'HYBRID';
  if (l.includes('remote') || l.includes('work from home') || l.includes('wfh')) return 'REMOTE';
  if (l.includes('onsite') || l.includes('on-site') || l.includes('office')) return 'ONSITE';
  return 'UNCLEAR';
}

function mapEmploymentType(hint?: string): EmploymentType {
  if (!hint) return 'UNKNOWN';
  const l = hint.toLowerCase();
  if (l.includes('full-time') || l.includes('full time')) return 'FULL_TIME';
  if (l.includes('part-time') || l.includes('part time')) return 'PART_TIME';
  if (l.includes('contract')) return 'CONTRACT';
  if (l.includes('freelance')) return 'FREELANCE';
  if (l.includes('intern')) return 'INTERNSHIP';
  return 'UNKNOWN';
}

function mapSeniority(hint?: string): SeniorityLevel {
  if (!hint) return 'UNKNOWN';
  const l = hint.toLowerCase();
  if (l.includes('intern')) return 'INTERN';
  if (l.includes('junior') || l.includes('entry')) return 'JUNIOR';
  if (l.includes('senior')) return 'SENIOR';
  if (l.includes('lead')) return 'LEAD';
  if (l.includes('principal')) return 'PRINCIPAL';
  if (l.includes('executive') || l.includes('director')) return 'EXECUTIVE';
  if (l.includes('mid')) return 'MID';
  return 'UNKNOWN';
}
