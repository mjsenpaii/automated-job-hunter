import { describe, expect, it, vi } from 'vitest';
import { RemotiveAdapter } from '../src/adapters/remotive.js';
import {
  HIMALAYAS_JOBS_SEARCH_API_URL,
  HIMALAYAS_MAX_PAGE_SIZE,
  HIMALAYAS_MAX_PAGES_PER_SCAN,
  HimalayasFreelanceAdapter,
} from '../src/freelance/adapters/himalayas.js';
import { RemotiveFreelanceAdapter } from '../src/freelance/adapters/remotive.js';

function himalayasJob(id: string) {
  return {
    title: 'Part-time website QA tester',
    excerpt: 'Test one small website release.',
    companyName: 'Public Client',
    companySlug: 'public-client',
    employmentType: 'Part Time',
    minSalary: 8,
    maxSalary: 12,
    salaryPeriod: 'hourly',
    currency: 'USD',
    seniority: ['Entry-level'],
    locationRestrictions: [{ name: 'Philippines', alpha2: 'PH' }],
    timezoneRestrictions: [],
    categories: ['Quality Assurance'],
    parentCategories: ['Technology'],
    description: '<p>Requirements</p><ul><li>Manual testing experience with clear bug reports.</li></ul><p>Test one small public website release, document reproducible issues, and retest the supplied fixes during a short part-time project.</p>',
    pubDate: '2026-08-01T00:00:00.000Z',
    expiryDate: null,
    applicationLink: `https://himalayas.app/companies/public-client/jobs/${id}`,
    guid: id,
  };
}

describe('Himalayas freelance adapter', () => {
  it('requires no API key, caps pagination/page size, and preserves attribution', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(`${url.origin}${url.pathname}`).toBe(HIMALAYAS_JOBS_SEARCH_API_URL);
      expect(url.searchParams.get('limit')).toBe(String(HIMALAYAS_MAX_PAGE_SIZE));
      const page = Number(url.searchParams.get('page'));
      return Response.json({
        offset: (page - 1) * HIMALAYAS_MAX_PAGE_SIZE,
        limit: HIMALAYAS_MAX_PAGE_SIZE,
        totalCount: HIMALAYAS_MAX_PAGE_SIZE * HIMALAYAS_MAX_PAGES_PER_SCAN,
        jobs: Array.from({ length: HIMALAYAS_MAX_PAGE_SIZE }, (_, index) => himalayasJob(`fixture-${page}-${index}`)),
      });
    });
    const adapter = new HimalayasFreelanceAdapter({ fetchImpl: fetchImpl as typeof fetch });
    const result = await adapter.fetchOpportunities({ pages: 99, pageSize: 99 });
    expect(fetchImpl).toHaveBeenCalledTimes(HIMALAYAS_MAX_PAGES_PER_SCAN);
    expect(result.candidates).toHaveLength(HIMALAYAS_MAX_PAGE_SIZE * HIMALAYAS_MAX_PAGES_PER_SCAN);
    expect(result.candidates[0]?.sourceAttributions[0]).toMatchObject({
      source: 'HIMALAYAS',
      costClassification: 'FREE_NO_API_KEY',
    });
    const requestInit = fetchImpl.mock.calls[0]?.[1];
    expect(requestInit?.headers).not.toHaveProperty('Authorization');
  });
});

describe('Remotive freelance classification', () => {
  it('accepts only clearly classified freelance work and preserves the Remotive link', async () => {
    const fetchImpl = vi.fn(async () => Response.json({
      '0-legal-notice': 'Jobs sourced from Remotive. Link back to Remotive.',
      'job-count': 3,
      jobs: [
        {
          id: 1,
          url: 'https://remotive.com/remote-jobs/software-dev/contract-api-integration-1',
          title: 'API Integration Developer', company_name: 'Contract Client',
          category: 'Software Development', job_type: 'contract',
          publication_date: '2026-08-01T00:00:00Z', candidate_required_location: 'Worldwide',
          salary: 'USD 12 per hour',
          description: '<p>Requirements</p><p>Experience with API integration.</p><p>Configure and test one documented API connection during this short project.</p>',
          tags: ['API'],
        },
        {
          id: 2,
          url: 'https://remotive.com/remote-jobs/software-dev/full-time-role-2',
          title: 'Full-time Software Engineer', company_name: 'Employer',
          category: 'Software Development', job_type: 'full_time',
          publication_date: '2026-08-01T00:00:00Z', candidate_required_location: 'Worldwide',
          salary: null,
          description: '<p>Build a permanent product engineering platform and own production systems as a regular full-time employee.</p>',
          tags: ['JavaScript'],
        },
        {
          id: 3,
          url: 'https://remotive.com/remote-jobs/qa/part-time-qa-3',
          title: 'Part-time QA Tester', company_name: 'QA Client',
          category: 'QA', job_type: 'part_time',
          publication_date: '2026-08-01T00:00:00Z', candidate_required_location: 'Philippines',
          salary: null,
          description: '<p>Execute a short manual testing plan, report reproducible browser issues, and retest fixes for this part-time engagement.</p>',
          tags: ['Testing'],
        },
      ],
    }));
    const adapter = new RemotiveFreelanceAdapter(new RemotiveAdapter({ fetchImpl: fetchImpl as typeof fetch }));
    const result = await adapter.fetchOpportunities();
    expect(result.recordsFetched).toBe(3);
    expect(result.candidates).toHaveLength(2);
    expect(result.rejectedNonFreelance).toBe(1);
    expect(result.candidates.every((item) => item.source === 'REMOTIVE')).toBe(true);
    expect(result.candidates[0]?.sourceAttributions[0]).toMatchObject({
      source: 'REMOTIVE', costClassification: 'FREE_PUBLIC_API_NO_KEY',
    });
  });
});
