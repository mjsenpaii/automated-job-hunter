import { describe, expect, it, vi } from 'vitest';
import { TAVILY_SEARCH_API_URL } from '../src/adapters/tavily.js';
import { TAVILY_EXTRACT_API_URL } from '../src/adapters/tavily-extract.js';
import { createSqliteWebDiscoveryStore } from '../src/discovery/web-discovery-store.js';
import {
  discoverFreelanceWebOpportunities,
  FREELANCE_WEB_QUERY_GROUPS,
} from '../src/freelance/web-discovery.js';
import {
  assessFreelanceOpportunityPage,
  classifyFreelanceDiscoveryLead,
} from '../src/freelance/page-quality.js';

const JOB_URL = 'https://client.example/jobs/contract-wordpress-123';
const JOB_HTML = `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify({
  '@type': 'JobPosting',
  title: 'WordPress landing page contractor',
  description: '<p>Requirements</p><p>WordPress is required.</p><p>Update one small landing page, configure a form, test the responsive layout, document changes, and deliver one preview during this short contract project.</p>',
  hiringOrganization: { name: 'Original Public Client' },
  employmentType: 'CONTRACTOR',
  datePosted: '2026-08-01',
  jobLocationType: 'TELECOMMUTE',
  applicantLocationRequirements: { name: 'Worldwide' },
  baseSalary: { currency: 'USD', value: { minValue: 8, maxValue: 12, unitText: 'HOUR' } },
})}</script></head><body><main>Original attributable job page.</main></body></html>`;

describe('freelance public-web discovery', () => {
  it('keeps snippets and generated text out of evidence while a Gemini failure does not block Tavily', async () => {
    const geminiGenerate = vi.fn(async () => {
      throw new TypeError('network failure fixture');
    });
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === TAVILY_SEARCH_API_URL) {
        return Response.json({
          query: 'fixture', answer: null, images: [], response_time: 0.1,
          request_id: 'fixture-request', usage: { credits: 1 },
          results: [{
            title: 'Untrusted search title', url: JOB_URL,
            content: 'UNTRUSTED_SNIPPET_CLAIM: expert accountant, USD 500/hour.',
            score: 0.9, raw_content: null,
          }],
        });
      }
      if (url === JOB_URL) {
        return new Response(JOB_HTML, { status: 200, headers: { 'content-type': 'text/html' } });
      }
      throw new Error('Unexpected mocked request');
    });
    const result = await discoverFreelanceWebOpportunities({
      tavilyEnabled: true,
      geminiSearchEnabled: true,
      tavilyExtractEnabled: true,
      tavilyApiKey: 'mock-tavily-key',
      geminiApiKey: 'mock-gemini-key',
      geminiSearchModel: 'mock-search-model',
      store: createSqliteWebDiscoveryStore(':memory:'),
      caps: { tavilyDaily: 30, tavilyMonthly: 900, geminiSearchDaily: 60 },
      philippineDate: '2026-08-01',
      cacheStrategy: 'FRESH',
      fetchImpl: fetchImpl as typeof fetch,
      now: () => new Date('2026-08-01T03:00:00.000Z'),
      resolveHost: vi.fn(async () => ({ ok: true })),
      geminiClientFactory: () => ({ models: { generateContent: geminiGenerate } }),
    });
    expect(result.report.tavily.requestsCompleted).toBe(8);
    expect(result.report.geminiSearch.promptsAttempted).toBe(8);
    expect(result.report.geminiSearch.promptsCompleted).toBe(0);
    expect(geminiGenerate).toHaveBeenCalledTimes(8);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.title).toBe('WordPress landing page contractor');
    expect(result.candidates[0]?.clientOrCompany).toBe('Original Public Client');
    expect(result.candidates[0]?.publicDescription).not.toContain('UNTRUSTED_SNIPPET_CLAIM');
    expect(JSON.stringify(result.candidates)).not.toContain('expert accountant');
  });

  it('keeps deterministic freelance query groups bounded to eight intents', () => {
    expect(FREELANCE_WEB_QUERY_GROUPS).toHaveLength(4);
    expect(FREELANCE_WEB_QUERY_GROUPS.every((group) => group.intents.length === 8)).toBe(true);
    expect(JSON.stringify(FREELANCE_WEB_QUERY_GROUPS)).not.toMatch(/upwork|freelancer\.com/i);
  });

  it.each([
    ['https://example.com/jobs', 'Freelance Jobs in Philippines'],
    ['https://example.com/blog/best-freelance-sites', 'Best freelance jobs online for beginners'],
    ['https://example.com/hire-developers/philippines', 'Hire Top Freelance Developers in the Philippines'],
    ['https://example.com/tags/javascript', 'JavaScript Jobs — Remote Part-Time JS Jobs'],
    ['https://example.com/jobs/marketing-automation-specialists/in/philippines', 'Marketing Automation Specialist Jobs in Philippines'],
    ['https://www.peopleperhour.com/freelance-data-cleansing-jobs', 'Freelance Data Cleansing Projects in 2026 | PeoplePerHour'],
    ['https://www.peopleperhour.com/freelance-landing-page-design-jobs', 'Freelance Landing Page Design Projects | PeoplePerHour'],
    ['https://www.roberthalf.com/us/en/jobs/all/web-content-specialist', '69 Results for Web Content Specialist Jobs'],
    ['https://www.codeable.io/freelance-wordpress-developer-jobs', 'Find Freelance WordPress Developer Jobs at Codeable'],
    ['https://www.codeable.io/freelance-wordpress-developer-jobs', 'Expert Application'],
  ])('rejects search, category, article, and service leads before page fetching', (url, title) => {
    expect(classifyFreelanceDiscoveryLead({ url, title })).toMatchObject({
      outcome: 'NON_OPPORTUNITY_PAGE',
      taskScopeEvidenceCount: 0,
    });
  });

  it('accepts original JSON-LD JobPosting scope and visible task bullets as page evidence', () => {
    const jsonLd = assessFreelanceOpportunityPage({
      url: JOB_URL,
      title: 'WordPress landing page contractor',
      company: 'Original Public Client',
      description: 'Update one landing page. Configure one form. Test the responsive website and document the changes.',
      employmentType: 'CONTRACTOR',
      html: JOB_HTML,
    });
    expect(jsonLd).toMatchObject({
      pageType: 'INDIVIDUAL_OPPORTUNITY',
      outcome: 'VALID_INDIVIDUAL_OPPORTUNITY',
    });
    expect(jsonLd.taskScopeEvidenceCount).toBeGreaterThan(0);

    const visibleBullets = assessFreelanceOpportunityPage({
      url: 'https://client.example/projects/manual-qa-88',
      title: 'Manual website QA contract',
      company: 'Public Client',
      description: '- Test the supplied website form.\n- Validate the responsive page.\n- Document each bug in the report.\nThis is a short-term freelance contract.',
      employmentType: 'CONTRACTOR',
    });
    expect(visibleBullets.outcome).toBe('VALID_INDIVIDUAL_OPPORTUNITY');
    expect(visibleBullets.taskScopeEvidenceCount).toBe(3);
  });

  it('keeps a specific opportunity with missing scope in manual review instead of positive readiness', () => {
    expect(assessFreelanceOpportunityPage({
      url: 'https://jobs.example.com/opportunities/automation-specialist-42',
      title: 'Automation specialist contract',
      company: 'Public Client',
      description: 'A freelance automation opportunity is available. Full project details will be discussed with the selected contractor after initial contact.',
      employmentType: 'CONTRACTOR',
    })).toMatchObject({
      pageType: 'INDIVIDUAL_OPPORTUNITY',
      outcome: 'REVIEW_SCOPE_MANUALLY',
      reason: 'ORIGINAL_PAGE_HAS_TOO_LITTLE_SCOPE',
    });
  });

  it('does not fetch a non-opportunity lead or count it as a valid opportunity', async () => {
    const categoryUrl = 'https://directory.example.com/jobs';
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === TAVILY_SEARCH_API_URL) {
        return Response.json({
          query: 'fixture', answer: null, images: [], response_time: 0.1,
          request_id: 'fixture-request', usage: { credits: 1 },
          results: [{
            title: 'Freelance Jobs in Philippines', url: categoryUrl,
            content: 'A search snippet cannot supply task evidence.', score: 0.8, raw_content: null,
          }],
        });
      }
      throw new Error('A category lead must be rejected before original-page fetching.');
    });
    const result = await discoverFreelanceWebOpportunities({
      tavilyEnabled: true, geminiSearchEnabled: false, tavilyExtractEnabled: true,
      tavilyApiKey: 'mock-tavily-key', geminiApiKey: '', geminiSearchModel: null,
      store: createSqliteWebDiscoveryStore(':memory:'),
      caps: { tavilyDaily: 30, tavilyMonthly: 900, geminiSearchDaily: 60 },
      philippineDate: '2026-08-01', cacheStrategy: 'FRESH',
      fetchImpl: fetchImpl as typeof fetch,
      now: () => new Date('2026-08-01T03:00:00.000Z'),
      resolveHost: vi.fn(async () => ({ ok: true })),
    });
    expect(result.candidates).toHaveLength(0);
    expect(result.report.tavily.nonOpportunityPages).toBe(1);
    expect(result.report.tavily.validOpportunityPages).toBe(0);
    expect(result.report.tavily.extractCredits).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(8);
  });

  it('uses Extract only for a specific thin opportunity and keeps original evidence as a fallback', async () => {
    const thinUrl = 'https://client.example/jobs/contract-wordpress-44';
    const thinHtml = `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify({
      '@type': 'JobPosting', title: 'WordPress contract opportunity',
      description: 'A public freelance contract is available. The selected contractor will receive the detailed task scope after an initial review.',
      hiringOrganization: { name: 'Public Client' }, employmentType: 'CONTRACTOR',
    })}</script></head><body>Public contract opportunity.</body></html>`;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === TAVILY_SEARCH_API_URL) {
        return Response.json({
          query: 'fixture', answer: null, images: [], response_time: 0.1,
          request_id: 'fixture-request', usage: { credits: 1 },
          results: [{ title: 'WordPress contract opportunity', url: thinUrl, content: 'Lead only.', score: 0.9 }],
        });
      }
      if (url === thinUrl) {
        return new Response(thinHtml, { status: 200, headers: { 'content-type': 'text/html' } });
      }
      if (url === TAVILY_EXTRACT_API_URL) {
        return Response.json({
          results: [{
            url: thinUrl,
            raw_content: '# WordPress contract opportunity\nCompany: Public Client\nThis freelance contract requires the contractor to update one WordPress page, configure one form, test the responsive website, document the changes, and deliver a preview.',
          }],
          failed_results: [], usage: { credits: 1 },
        });
      }
      throw new Error('Unexpected mocked request');
    });
    const result = await discoverFreelanceWebOpportunities({
      tavilyEnabled: true, geminiSearchEnabled: false, tavilyExtractEnabled: true,
      tavilyApiKey: 'mock-tavily-key', geminiApiKey: '', geminiSearchModel: null,
      store: createSqliteWebDiscoveryStore(':memory:'),
      caps: { tavilyDaily: 30, tavilyMonthly: 900, geminiSearchDaily: 60 },
      philippineDate: '2026-08-01', cacheStrategy: 'FRESH',
      fetchImpl: fetchImpl as typeof fetch,
      now: () => new Date('2026-08-01T03:00:00.000Z'),
      resolveHost: vi.fn(async () => ({ ok: true })),
    });
    expect(fetchImpl.mock.calls.filter(([input]) => String(input) === TAVILY_EXTRACT_API_URL)).toHaveLength(1);
    expect(result.report.tavily.pagesRecoveredByExtract).toBe(1);
    expect(result.report.tavily.extractCredits).toBe(1);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.publicDescription).toContain('update one WordPress page');
  });

  it('keeps Extract disabled fail-closed while retaining a thin individual page for review', async () => {
    const thinUrl = 'https://client.example/jobs/contract-review-45';
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === TAVILY_SEARCH_API_URL) {
        return Response.json({
          query: 'fixture', answer: null, images: [], response_time: 0.1,
          request_id: 'fixture-request', usage: { credits: 1 },
          results: [{ title: 'Contract review opportunity', url: thinUrl, content: 'Lead only.', score: 0.9 }],
        });
      }
      if (url === thinUrl) {
        return new Response('<html><head><meta property="og:title" content="Contract review opportunity"><meta property="og:site_name" content="Public Client"><meta name="description" content="A freelance contract is available. Full task details will be discussed after the initial review with the selected contractor."></head></html>', { status: 200, headers: { 'content-type': 'text/html' } });
      }
      throw new Error('Extract must remain disabled.');
    });
    const result = await discoverFreelanceWebOpportunities({
      tavilyEnabled: true, geminiSearchEnabled: false, tavilyExtractEnabled: false,
      tavilyApiKey: 'mock-tavily-key', geminiApiKey: '', geminiSearchModel: null,
      store: createSqliteWebDiscoveryStore(':memory:'),
      caps: { tavilyDaily: 30, tavilyMonthly: 900, geminiSearchDaily: 60 },
      philippineDate: '2026-08-01', cacheStrategy: 'FRESH',
      fetchImpl: fetchImpl as typeof fetch,
      now: () => new Date('2026-08-01T03:00:00.000Z'),
      resolveHost: vi.fn(async () => ({ ok: true })),
    });
    expect(fetchImpl.mock.calls.some(([input]) => String(input) === TAVILY_EXTRACT_API_URL)).toBe(false);
    expect(result.report.tavily.extractCredits).toBe(0);
    expect(result.candidates).toHaveLength(1);
  });

  it('audits cached lead metadata without any provider request', () => {
    const fetchImpl = vi.fn();
    const cachedLeads = [
      { url: 'https://www.peopleperhour.com/freelance-data-cleansing-jobs', title: 'Freelance Data Cleansing Projects in 2026 | PeoplePerHour' },
      { url: 'https://www.roberthalf.com/us/en/jobs/all/web-content-specialist', title: '69 Results for Web Content Specialist Jobs' },
      { url: 'https://client.example/jobs/wordpress-fix-1', title: 'WordPress fix contract' },
    ];
    const outcomes = cachedLeads.map((lead) => classifyFreelanceDiscoveryLead(lead)?.outcome ?? 'FETCH_REQUIRED');
    expect(outcomes).toEqual(['NON_OPPORTUNITY_PAGE', 'NON_OPPORTUNITY_PAGE', 'FETCH_REQUIRED']);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
