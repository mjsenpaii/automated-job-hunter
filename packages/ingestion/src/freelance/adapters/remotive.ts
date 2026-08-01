import { RemotiveAdapter } from '../../adapters/remotive.js';
import {
  extractFreelanceQualificationSkills,
  parseExplicitFreelancePayText,
} from '../classification.js';
import {
  FreelanceOpportunityCandidateSchema,
  type FreelanceContractType,
  type FreelanceOpportunityCandidate,
} from '../contracts.js';
import type { FreelanceAdapterResult } from './himalayas.js';

const CLEAR_FREELANCE_TYPE = new Map<string, FreelanceContractType>([
  ['freelance', 'PROJECT'],
  ['contract', 'CONTRACTOR'],
  ['part time', 'PART_TIME'],
  ['part-time', 'PART_TIME'],
  ['temporary', 'TEMPORARY'],
  ['internship', 'INTERN'],
]);

export function mapRemotiveFreelanceJob(job: Awaited<ReturnType<RemotiveAdapter['fetchJobs']>>['jobs'][number]): FreelanceOpportunityCandidate | null {
  const sourceType = job.employmentType?.trim().toLocaleLowerCase() ?? '';
  let type = CLEAR_FREELANCE_TYPE.get(sourceType) ?? null;
  if (!type && /\b(freelance|independent contractor|project[- ]based|temporary contract|part[- ]time)\b/i.test(`${job.title}\n${job.description}`)) {
    type = 'CONTRACTOR';
  }
  if (!type) return null;
  const skills = extractFreelanceQualificationSkills(job.description);
  return FreelanceOpportunityCandidateSchema.parse({
    source: 'REMOTIVE',
    sourceIdentifier: job.sourceJobId,
    canonicalUrl: job.sourceUrl,
    title: job.title,
    clientOrCompany: job.company,
    publicDescription: job.description,
    publishedAt: job.publishedAt,
    expiresAt: null,
    clientCountry: null,
    applicantGeographicRestrictions: job.location ? [job.location] : [],
    timezoneRestrictions: [],
    remote: job.remote,
    contractType: type,
    pay: parseExplicitFreelancePayText(job.salaryText),
    requiredSkills: skills.required,
    preferredSkills: skills.preferred,
    minimumExperienceYears: null,
    seniority: [],
    categoryHints: [...new Set([job.category, ...job.tags].filter((value): value is string => Boolean(value)))],
    sourceAttributions: [{
      source: 'REMOTIVE',
      sourceIdentifier: job.sourceJobId,
      sourceUrl: job.sourceUrl,
      costClassification: 'FREE_PUBLIC_API_NO_KEY',
    }],
  });
}

export class RemotiveFreelanceAdapter {
  readonly name = 'Remotive';

  constructor(private readonly adapter: RemotiveAdapter) {}

  async fetchOpportunities(limit = 50): Promise<FreelanceAdapterResult> {
    const fetched = await this.adapter.fetchJobs({ limit: Math.min(50, Math.max(1, limit)), pages: 1 });
    const candidates = fetched.jobs.flatMap((job) => {
      const candidate = mapRemotiveFreelanceJob(job);
      return candidate ? [candidate] : [];
    });
    return {
      requestsAttempted: 1,
      requestsCompleted: 1,
      recordsFetched: fetched.sourceRecordsFetched,
      invalidRecords: fetched.invalidRecords,
      rejectedNonFreelance: Math.max(0, fetched.jobs.length - candidates.length),
      candidates,
      failures: [],
    };
  }
}
