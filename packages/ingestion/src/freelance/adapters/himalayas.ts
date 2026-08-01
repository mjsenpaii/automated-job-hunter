import { z } from 'zod';
import { cleanJobContent } from '../../content-cleaner.js';
import {
  extractFreelanceQualificationSkills,
  normalizeFreelancePay,
} from '../classification.js';
import {
  FreelanceOpportunityCandidateSchema,
  type FreelanceContractType,
  type FreelanceOpportunityCandidate,
} from '../contracts.js';

export const HIMALAYAS_JOBS_SEARCH_API_URL =
  'https://himalayas.app/jobs/api/search' as const;
export const HIMALAYAS_MAX_PAGE_SIZE = 20 as const;
export const HIMALAYAS_MAX_PAGES_PER_SCAN = 4 as const;
export const HIMALAYAS_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;

const LocationRestrictionSchema = z.object({
  alpha2: z.string().trim().min(2).max(3).optional(),
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().min(1).max(120).optional(),
}).passthrough();

export const HimalayasJobSchema = z.object({
  title: z.string().trim().min(1).max(240),
  excerpt: z.string().optional().nullable(),
  companyName: z.string().trim().min(1).max(240),
  companySlug: z.string().trim().min(1).max(160),
  employmentType: z.enum([
    'Full Time', 'Part Time', 'Contractor', 'Temporary', 'Intern',
    'Volunteer', 'Other',
  ]),
  minSalary: z.number().finite().nonnegative().nullable(),
  maxSalary: z.number().finite().nonnegative().nullable(),
  salaryPeriod: z.enum(['hourly', 'weekly', 'fortnightly', 'monthly', 'annual']).optional().nullable(),
  currency: z.string().trim().min(3).max(10).optional().nullable(),
  seniority: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  locationRestrictions: z.array(LocationRestrictionSchema).max(50).default([]),
  timezoneRestrictions: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  categories: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  parentCategories: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  description: z.string().min(1).max(500_000),
  pubDate: z.union([z.number().int(), z.string()]),
  expiryDate: z.union([z.number().int(), z.string()]).nullable().optional(),
  applicationLink: z.string().url(),
  guid: z.string().trim().min(1).max(240),
}).passthrough();
export type HimalayasJob = z.infer<typeof HimalayasJobSchema>;

const HimalayasEnvelopeSchema = z.object({
  updatedAt: z.union([z.number(), z.string()]).optional(),
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().max(HIMALAYAS_MAX_PAGE_SIZE).optional(),
  totalCount: z.number().int().nonnegative().optional(),
  jobs: z.array(z.unknown()).max(HIMALAYAS_MAX_PAGE_SIZE),
}).passthrough();

export interface HimalayasSearchOptions {
  query?: string;
  country?: string;
  worldwide?: boolean;
  seniority?: readonly string[];
  employmentTypes?: readonly string[];
  sort?: 'relevant' | 'recent' | 'salaryAsc' | 'salaryDesc' | 'nameAToZ' | 'nameZToA' | 'jobs';
  pages?: number;
  pageSize?: number;
}

export interface HimalayasFreelanceAdapterDependencies {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface FreelanceAdapterResult {
  requestsAttempted: number;
  requestsCompleted: number;
  recordsFetched: number;
  invalidRecords: number;
  rejectedNonFreelance: number;
  candidates: FreelanceOpportunityCandidate[];
  failures: string[];
}

function dateValue(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const date = typeof value === 'number'
    ? new Date(value < 10_000_000_000 ? value * 1_000 : value)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function contractType(value: HimalayasJob['employmentType']): FreelanceContractType | null {
  if (value === 'Part Time') return 'PART_TIME';
  if (value === 'Contractor') return 'CONTRACTOR';
  if (value === 'Temporary') return 'TEMPORARY';
  if (value === 'Intern') return 'INTERN';
  if (value === 'Other') return 'OTHER';
  return null;
}

export function mapHimalayasFreelanceJob(
  job: HimalayasJob,
): FreelanceOpportunityCandidate | null {
  const description = cleanJobContent(job.description).trim();
  let type = contractType(job.employmentType);
  if (!type && /\b(freelance|independent contractor|project[- ]based|temporary contract)\b/i.test(description)) {
    type = 'CONTRACTOR';
  }
  if (type === 'OTHER' && !/\b(freelance|contract|project[- ]based|part[- ]time|temporary)\b/i.test(description)) {
    return null;
  }
  if (!type || description.length < 80) return null;
  const skills = extractFreelanceQualificationSkills(description);
  const period = job.salaryPeriod === 'hourly' ? 'HOUR'
    : job.salaryPeriod === 'weekly' || job.salaryPeriod === 'fortnightly' ? 'WEEK'
      : job.salaryPeriod === 'monthly' ? 'MONTH'
        : job.salaryPeriod === 'annual' ? 'YEAR'
          : null;
  return FreelanceOpportunityCandidateSchema.parse({
    source: 'HIMALAYAS',
    sourceIdentifier: job.guid,
    canonicalUrl: job.applicationLink,
    title: job.title,
    clientOrCompany: job.companyName,
    publicDescription: description,
    publishedAt: dateValue(job.pubDate),
    expiresAt: dateValue(job.expiryDate),
    clientCountry: null,
    applicantGeographicRestrictions: job.locationRestrictions.map((item) => item.name),
    timezoneRestrictions: job.timezoneRestrictions,
    remote: true,
    contractType: type,
    pay: normalizeFreelancePay({
      kind: period === 'HOUR' ? 'HOURLY' : 'UNKNOWN',
      currency: job.currency,
      minimum: job.minSalary,
      maximum: job.maxSalary,
      period,
      evidenceLabel: job.minSalary === null && job.maxSalary === null
        ? null
        : `${job.currency ?? 'Currency unstated'} ${job.minSalary ?? ''}-${job.maxSalary ?? ''} ${job.salaryPeriod ?? ''}`.trim(),
    }),
    requiredSkills: skills.required,
    preferredSkills: skills.preferred,
    minimumExperienceYears: null,
    seniority: job.seniority,
    categoryHints: [...new Set([...job.categories, ...job.parentCategories])],
    sourceAttributions: [{
      source: 'HIMALAYAS',
      sourceIdentifier: job.guid,
      sourceUrl: job.applicationLink,
      costClassification: 'FREE_NO_API_KEY',
    }],
  });
}

export class HimalayasFreelanceAdapter {
  readonly name = 'Himalayas';

  constructor(private readonly dependencies: HimalayasFreelanceAdapterDependencies = {}) {}

  async fetchOpportunities(options: HimalayasSearchOptions = {}): Promise<FreelanceAdapterResult> {
    const pages = Math.min(HIMALAYAS_MAX_PAGES_PER_SCAN, Math.max(1, options.pages ?? 1));
    const pageSize = Math.min(HIMALAYAS_MAX_PAGE_SIZE, Math.max(1, options.pageSize ?? HIMALAYAS_MAX_PAGE_SIZE));
    const result: FreelanceAdapterResult = {
      requestsAttempted: 0,
      requestsCompleted: 0,
      recordsFetched: 0,
      invalidRecords: 0,
      rejectedNonFreelance: 0,
      candidates: [],
      failures: [],
    };
    for (let page = 1; page <= pages; page += 1) {
      const url = new URL(HIMALAYAS_JOBS_SEARCH_API_URL);
      if (options.query?.trim()) url.searchParams.set('q', options.query.trim());
      if (options.country?.trim()) url.searchParams.set('country', options.country.trim());
      if (options.worldwide !== undefined) url.searchParams.set('worldwide', String(options.worldwide));
      if (options.seniority?.length) url.searchParams.set('seniority', options.seniority.join(','));
      url.searchParams.set('employment_type', (options.employmentTypes ?? ['Part Time', 'Contractor', 'Temporary', 'Intern', 'Other']).join(','));
      url.searchParams.set('sort', options.sort ?? 'recent');
      url.searchParams.set('page', String(page));
      url.searchParams.set('limit', String(pageSize));
      result.requestsAttempted += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.dependencies.timeoutMs ?? 10_000);
      let response: Response;
      try {
        response = await (this.dependencies.fetchImpl ?? fetch)(url, {
          method: 'GET',
          headers: { Accept: 'application/json', 'User-Agent': 'JobAppAI/1.0 (Freelance research)' },
          redirect: 'error',
          signal: controller.signal,
        });
      } catch {
        clearTimeout(timer);
        result.failures.push(controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_FAILURE');
        break;
      }
      clearTimeout(timer);
      if (!response.ok) {
        result.failures.push(response.status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR');
        break;
      }
      let payload: unknown;
      try { payload = await response.json(); } catch {
        result.failures.push('MALFORMED_JSON');
        break;
      }
      const envelope = HimalayasEnvelopeSchema.safeParse(payload);
      if (!envelope.success) {
        result.failures.push('SOURCE_SCHEMA_CHANGED');
        break;
      }
      result.requestsCompleted += 1;
      result.recordsFetched += envelope.data.jobs.length;
      for (const value of envelope.data.jobs) {
        const parsed = HimalayasJobSchema.safeParse(value);
        if (!parsed.success) {
          result.invalidRecords += 1;
          continue;
        }
        const candidate = mapHimalayasFreelanceJob(parsed.data);
        if (candidate) result.candidates.push(candidate);
        else result.rejectedNonFreelance += 1;
      }
      if (envelope.data.jobs.length < pageSize) break;
    }
    return result;
  }
}
