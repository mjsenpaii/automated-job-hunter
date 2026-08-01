import { createHash } from 'node:crypto';
import type { DiscoveredJob } from '../discovery/contracts.js';
import type { WebSearchIntent } from '../discovery/web-search-query-groups.v1.js';
import {
  normalizeWebSearchRequest,
  type WebDiscoveryCachedUrl,
  type WebDiscoveryQuotaCaps,
  type WebDiscoveryStore,
} from '../discovery/web-discovery-store.js';
import {
  runGeminiWebSearch,
  type GeminiSearchClientFactory,
  type GeminiSearchReport,
} from '../adapters/gemini-web-search.server.js';
import {
  canonicalizeTavilyJobUrl,
  performTavilyBasicSearch,
  parseOriginalJobPage,
} from '../adapters/tavily.js';
import {
  runTavilyBasicExtract,
  type TavilyExtractReport,
} from '../adapters/tavily-extract.js';
import {
  parseTavilyExtractedJobPage,
  isSpecificPublicJobUrl,
} from '../adapters/combined-web-discovery.js';
import {
  readCappedText,
  resolveHostToPublicIps,
  safeFetch,
} from '../adapters/url-extractor.js';
import {
  extractFreelanceQualificationSkills,
  parseExplicitFreelancePayText,
} from './classification.js';
import {
  FreelanceOpportunityCandidateSchema,
  type FreelanceOpportunityCandidate,
} from './contracts.js';
import {
  assessFreelanceOpportunityPage,
  classifyFreelanceDiscoveryLead,
  type FreelancePageQualityAssessment,
} from './page-quality.js';
import {
  FIRST_PARTY_ROLE_CLOSED_HINT,
  POTENTIALLY_STALE_FORUM_LISTING_HINT,
} from './forum-listing.js';

export const FREELANCE_WEB_QUERY_GROUP_IDS = [
  'TECHNICAL_QUICK_WINS',
  'AI_AUTOMATION',
  'BEGINNER_REMOTE_WORK',
  'PHILIPPINES_APAC',
] as const;
export type FreelanceWebQueryGroupId =
  (typeof FREELANCE_WEB_QUERY_GROUP_IDS)[number];

export interface FreelanceWebQueryGroup {
  id: FreelanceWebQueryGroupId;
  label: string;
  intents: readonly WebSearchIntent[];
}

function intents(prefix: string, values: readonly string[]): WebSearchIntent[] {
  return values.map((value, index) => ({
    id: `${prefix}-${String(index + 1).padStart(2, '0')}`,
    label: value,
    tavilyQuery: value,
    geminiPromptIntent: value,
  }));
}

export const FREELANCE_WEB_QUERY_GROUPS: readonly FreelanceWebQueryGroup[] = [
  {
    id: 'TECHNICAL_QUICK_WINS',
    label: 'Technical quick wins',
    intents: intents('quick', [
      '"small WordPress fix" freelance remote',
      '"update website content" contract remote',
      '"landing page edits" freelance',
      '"manual website testing" freelance remote',
      '"spreadsheet cleanup" freelance remote',
      '"data validation" short-term remote',
      '"API integration" short contract',
      '"CMS content upload" freelance',
    ]),
  },
  {
    id: 'AI_AUTOMATION',
    label: 'AI and automation',
    intents: intents('automation', [
      '"n8n workflow setup" freelance',
      '"Zapier automation" small project',
      '"Make.com workflow" small project remote',
      '"AI chatbot setup" short contract',
      '"spreadsheet automation" freelance remote',
      '"API workflow automation" short contract',
      '"FAQ assistant setup" freelance',
      '"lead generation automation" small project',
    ]),
  },
  {
    id: 'BEGINNER_REMOTE_WORK',
    label: 'Beginner remote work',
    intents: intents('beginner', [
      '"web research" short-term freelance remote',
      '"technical virtual assistant" part-time Philippines',
      '"data entry" "spreadsheet cleanup" remote',
      '"content upload" WordPress freelance',
      '"product listing" short-term remote',
      '"website QA" freelance remote',
      '"data annotation" project-based remote',
      '"transcription cleanup" freelance remote',
    ]),
  },
  {
    id: 'PHILIPPINES_APAC',
    label: 'Philippines and APAC',
    intents: intents('ph-apac', [
      '"project-based" web developer Philippines',
      '"landing page edits" freelance Philippines',
      '"technical virtual assistant" part-time Philippines',
      '"n8n workflow setup" Philippines freelance',
      '"website QA" short-term Philippines',
      '"remote contract" "Philippines applicants"',
      '"API integration" contract APAC remote',
      '"worldwide" freelance "entry level"',
    ]),
  },
];

function daySeed(value: string): number {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function selectFreelanceWebQueryGroup(options: {
  philippineDate: string;
  cacheStrategy: 'CACHED' | 'FRESH';
  mostRecentGroupId?: FreelanceWebQueryGroupId | null;
}): FreelanceWebQueryGroup {
  const seeded = daySeed(options.philippineDate) % FREELANCE_WEB_QUERY_GROUPS.length;
  if (options.cacheStrategy === 'CACHED' && options.mostRecentGroupId) {
    return FREELANCE_WEB_QUERY_GROUPS.find((group) => group.id === options.mostRecentGroupId) ??
      FREELANCE_WEB_QUERY_GROUPS[seeded]!;
  }
  if (options.cacheStrategy === 'FRESH' && options.mostRecentGroupId) {
    const recent = FREELANCE_WEB_QUERY_GROUPS.findIndex((group) => group.id === options.mostRecentGroupId);
    return FREELANCE_WEB_QUERY_GROUPS[(recent + 1) % FREELANCE_WEB_QUERY_GROUPS.length]!;
  }
  return FREELANCE_WEB_QUERY_GROUPS[seeded]!;
}

export interface FreelanceWebSourceReport {
  queryGroupId: FreelanceWebQueryGroupId;
  tavily: {
    status: 'DISABLED' | 'COMPLETED' | 'PARTIAL_FAILURE' | 'FAILED' | 'CACHED' | 'DAILY_LIMIT_REACHED' | 'MONTHLY_LIMIT_REACHED';
    requestsAttempted: number;
    requestsCompleted: number;
    cacheHits: number;
    searchCredits: number;
    extractCredits: number;
    urlsDiscovered: number;
    originalPagesFetched: number;
    pagesParsed: number;
    validOpportunityPages: number;
    nonOpportunityPages: number;
    duplicateOrRepostPages: number;
    pagesRecoveredByExtract: number;
    pagesWithSufficientTaskScope: number;
    pagesWithInsufficientTaskScope: number;
    queriesUsed: string[];
    queryYields: Array<{
      queryId: string;
      urlsDiscovered: number;
      validIndividualOpportunities: number;
      nonOpportunityPages: number;
      duplicateOpportunities: number;
    }>;
    failures: string[];
  };
  geminiSearch: GeminiSearchReport;
  urlsBeforeDeduplication: number;
  uniqueUrls: number;
  pagesAttempted: number;
  originalPagesFetched: number;
  pagesRejected: number;
  validOpportunityPages: number;
  nonOpportunityPages: number;
  duplicateOrRepostPages: number;
  pagesWithSufficientTaskScope: number;
  pagesWithInsufficientTaskScope: number;
  usage: Awaited<ReturnType<WebDiscoveryStore['getUsage']>>;
}

export interface FreelanceWebDiscoveryDependencies {
  tavilyEnabled: boolean;
  geminiSearchEnabled: boolean;
  tavilyExtractEnabled: boolean;
  tavilyApiKey: string;
  geminiApiKey: string;
  geminiSearchModel: string | null;
  store: WebDiscoveryStore;
  caps: WebDiscoveryQuotaCaps;
  philippineDate: string;
  cacheStrategy: 'CACHED' | 'FRESH';
  mostRecentGroupId?: FreelanceWebQueryGroupId | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
  resolveHost?: typeof resolveHostToPublicIps;
  geminiClientFactory?: GeminiSearchClientFactory;
}

type Attribution = 'TAVILY' | 'GEMINI_SEARCH' | 'BOTH';

function webContractType(job: DiscoveredJob): FreelanceOpportunityCandidate['contractType'] | null {
  const sourceType = job.employmentType?.toLocaleLowerCase().replaceAll('_', ' ') ?? '';
  if (/freelance/.test(sourceType)) return 'PROJECT';
  if (/contract/.test(sourceType)) return 'CONTRACTOR';
  if (/part time|part-time/.test(sourceType)) return 'PART_TIME';
  if (/temporary/.test(sourceType)) return 'TEMPORARY';
  if (/intern/.test(sourceType)) return 'INTERN';
  if (/\b(freelance(?:r)?|independent contractor|short[- ]term contract|project[- ]based|part[- ]time gig)\b/i.test(`${job.title}\n${job.description}`)) {
    return 'PROJECT';
  }
  return null;
}

function sourceAttributions(
  attribution: Attribution,
  sourceIdentifier: string,
  sourceUrl: string,
): FreelanceOpportunityCandidate['sourceAttributions'] {
  return [
    ...(attribution === 'TAVILY' || attribution === 'BOTH'
      ? [{ source: 'TAVILY' as const, sourceIdentifier, sourceUrl, costClassification: 'API_CREDITS' as const }]
      : []),
    ...(attribution === 'GEMINI_SEARCH' || attribution === 'BOTH'
      ? [{ source: 'GEMINI_SEARCH' as const, sourceIdentifier, sourceUrl, costClassification: 'API_QUOTA' as const }]
      : []),
  ];
}

export function mapFreelanceWebJob(
  job: DiscoveredJob,
  attribution: Attribution,
): FreelanceOpportunityCandidate | null {
  const contractType = webContractType(job);
  if (!contractType) return null;
  const skills = extractFreelanceQualificationSkills(job.description);
  const sourceIdentifier = createHash('sha256').update(job.sourceUrl).digest('hex');
  const source = attribution === 'GEMINI_SEARCH' ? 'GEMINI_SEARCH' : 'TAVILY';
  const forum = job.forumListingContext ?? null;
  const categoryHints = [
    job.category,
    ...job.tags,
    ...(forum?.potentiallyStale ? [POTENTIALLY_STALE_FORUM_LISTING_HINT] : []),
    ...(forum?.roleClosed ? [FIRST_PARTY_ROLE_CLOSED_HINT] : []),
  ].filter((value): value is string => Boolean(value));
  return FreelanceOpportunityCandidateSchema.parse({
    source,
    sourceIdentifier,
    canonicalUrl: job.sourceUrl,
    title: job.title,
    clientOrCompany: job.company,
    publicDescription: job.description,
    publishedAt: job.publishedAt,
    expiresAt: forum?.roleClosed
      ? forum.latestFirstPartyUpdateAt ?? forum.originalPostPublishedAt
      : null,
    clientCountry: null,
    applicantGeographicRestrictions: forum && forum.geographicRestrictions.length > 0
      ? forum.geographicRestrictions
      : job.location ? [job.location] : [],
    timezoneRestrictions: forum?.timezoneRestrictions ?? [],
    remote: job.remote,
    contractType,
    pay: parseExplicitFreelancePayText(forum?.payUpdateText ?? job.salaryText),
    requiredSkills: skills.required,
    preferredSkills: skills.preferred,
    minimumExperienceYears: forum?.minimumExperienceYears ?? null,
    seniority: [],
    categoryHints: [...new Set(categoryHints)],
    sourceAttributions: sourceAttributions(attribution, sourceIdentifier, job.sourceUrl),
  });
}

async function fetchPage(
  item: WebDiscoveryCachedUrl,
  dependencies: FreelanceWebDiscoveryDependencies,
): Promise<{
  job: DiscoveredJob | null;
  extractEligible: boolean;
  fetched: boolean;
  quality: FreelancePageQualityAssessment | null;
}> {
  const leadQuality = classifyFreelanceDiscoveryLead({ url: item.url, title: item.title });
  if (leadQuality) {
    return { job: null, extractEligible: false, fetched: false, quality: leadQuality };
  }
  const fetched = await safeFetch(item.url, {
    fetchImpl: dependencies.fetchImpl,
    timeoutMs: dependencies.timeoutMs,
    resolveHost: dependencies.resolveHost,
  });
  if (!fetched.response || !fetched.response.ok) {
    return { job: null, extractEligible: isSpecificPublicJobUrl(item.url), fetched: false, quality: null };
  }
  const contentType = fetched.response.headers.get('content-type') ?? '';
  if (!contentType.toLocaleLowerCase().includes('text/html')) {
    return { job: null, extractEligible: isSpecificPublicJobUrl(item.url), fetched: true, quality: null };
  }
  const html = await readCappedText(fetched.response);
  if (html === null) return { job: null, extractEligible: isSpecificPublicJobUrl(item.url), fetched: true, quality: null };
  const parsed = parseOriginalJobPage(html, item.url, {
    now: dependencies.now?.() ?? new Date(),
  });
  if (!parsed) {
    return { job: null, extractEligible: isSpecificPublicJobUrl(item.url), fetched: true, quality: null };
  }
  const quality = assessFreelanceOpportunityPage({
    url: parsed.sourceUrl,
    title: parsed.title,
    company: parsed.company,
    description: parsed.description,
    employmentType: parsed.employmentType,
    html,
  });
  if (quality.outcome === 'NON_OPPORTUNITY_PAGE') {
    return { job: null, extractEligible: false, fetched: true, quality };
  }
  return {
    job: parsed,
    extractEligible:
      quality.outcome === 'REVIEW_SCOPE_MANUALLY' &&
      isSpecificPublicJobUrl(item.url),
    fetched: true,
    quality,
  };
}

export async function discoverFreelanceWebOpportunities(
  dependencies: FreelanceWebDiscoveryDependencies,
): Promise<{ candidates: FreelanceOpportunityCandidate[]; report: FreelanceWebSourceReport }> {
  const now = dependencies.now ?? (() => new Date());
  const group = selectFreelanceWebQueryGroup({
    philippineDate: dependencies.philippineDate,
    cacheStrategy: dependencies.cacheStrategy,
    mostRecentGroupId: dependencies.mostRecentGroupId,
  });
  const tavilyUrls: WebDiscoveryCachedUrl[] = [];
  const tavilyUrlQueryIds = new Map<string, Set<string>>();
  const queryUrlCounts = new Map<string, number>();
  const rememberQueryUrls = (queryId: string, urls: readonly WebDiscoveryCachedUrl[]) => {
    queryUrlCounts.set(queryId, urls.length);
    for (const item of urls) {
      const ids = tavilyUrlQueryIds.get(item.url) ?? new Set<string>();
      ids.add(queryId);
      tavilyUrlQueryIds.set(item.url, ids);
    }
  };
  const tavilyReport: FreelanceWebSourceReport['tavily'] = {
    status: dependencies.tavilyEnabled ? 'FAILED' : 'DISABLED',
    requestsAttempted: 0,
    requestsCompleted: 0,
    cacheHits: 0,
    searchCredits: 0,
    extractCredits: 0,
    urlsDiscovered: 0,
    originalPagesFetched: 0,
    pagesParsed: 0,
    validOpportunityPages: 0,
    nonOpportunityPages: 0,
    duplicateOrRepostPages: 0,
    pagesRecoveredByExtract: 0,
    pagesWithSufficientTaskScope: 0,
    pagesWithInsufficientTaskScope: 0,
    queriesUsed: group.intents.map((intent) => intent.tavilyQuery),
    queryYields: [],
    failures: [],
  };
  if (dependencies.tavilyEnabled && !dependencies.tavilyApiKey.trim()) {
    tavilyReport.failures.push('MISSING_API_KEY');
  } else if (dependencies.tavilyEnabled) {
    for (const intent of group.intents.slice(0, 8)) {
      const request = normalizeWebSearchRequest(intent.tavilyQuery);
      const reservation = await dependencies.store.reserveSearch({
        provider: 'TAVILY',
        operation: 'SEARCH',
        normalizedRequest: request,
        cacheOnly: dependencies.cacheStrategy === 'CACHED',
        philippineDate: dependencies.philippineDate,
        now: now(),
        caps: dependencies.caps,
      });
      if (reservation.status === 'CACHE_HIT') {
        tavilyReport.cacheHits += 1;
        tavilyReport.requestsCompleted += 1;
        tavilyUrls.push(...reservation.urls);
        rememberQueryUrls(intent.id, reservation.urls);
        continue;
      }
      if (reservation.status === 'CACHE_MISS') continue;
      if (reservation.status === 'DAILY_LIMIT_REACHED') {
        tavilyReport.failures.push('TAVILY_DAILY_CREDIT_LIMIT_REACHED');
        tavilyReport.status = 'DAILY_LIMIT_REACHED';
        break;
      }
      if (reservation.status === 'MONTHLY_LIMIT_REACHED') {
        tavilyReport.failures.push('TAVILY_MONTHLY_CREDIT_LIMIT_REACHED');
        tavilyReport.status = 'MONTHLY_LIMIT_REACHED';
        break;
      }
      if (reservation.status === 'IN_FLIGHT') {
        tavilyReport.failures.push('QUERY_IN_FLIGHT');
        continue;
      }
      if (reservation.status !== 'RESERVED') continue;
      tavilyReport.requestsAttempted += 1;
      try {
        const searched = await performTavilyBasicSearch(request, {
          apiKey: dependencies.tavilyApiKey,
          fetchImpl: dependencies.fetchImpl,
          timeoutMs: dependencies.timeoutMs,
        });
        await dependencies.store.completeSearch({
          provider: 'TAVILY',
          normalizedRequest: request,
          reservationToken: reservation.reservationToken,
          urls: searched.urls,
          now: now(),
        });
        tavilyReport.requestsCompleted += 1;
        tavilyReport.searchCredits += 1;
        tavilyUrls.push(...searched.urls);
        rememberQueryUrls(intent.id, searched.urls);
      } catch {
        await dependencies.store.failSearch({
          provider: 'TAVILY',
          normalizedRequest: request,
          reservationToken: reservation.reservationToken,
          now: now(),
        });
        tavilyReport.failures.push('API_ERROR');
      }
    }
  }

  const gemini = await runGeminiWebSearch({
    intents: group.intents,
    enabled: dependencies.geminiSearchEnabled,
    cacheOnly: dependencies.cacheStrategy === 'CACHED',
    apiKey: dependencies.geminiApiKey,
    model: dependencies.geminiSearchModel,
    store: dependencies.store,
    caps: dependencies.caps,
    philippineDate: dependencies.philippineDate,
    now,
    maxPrompts: 8,
    clientFactory: dependencies.geminiClientFactory,
  });

  const attributed = new Map<string, { item: WebDiscoveryCachedUrl; attribution: Attribution }>();
  for (const item of tavilyUrls) attributed.set(item.url, { item, attribution: 'TAVILY' });
  for (const item of gemini.urls) {
    const existing = attributed.get(item.url);
    attributed.set(item.url, { item: existing?.item ?? item, attribution: existing ? 'BOTH' : 'GEMINI_SEARCH' });
  }
  const unique = [...attributed.values()].slice(0, 250);
  const directJobs: Array<{ job: DiscoveredJob; attribution: Attribution }> = [];
  const extractQueue: Array<{
    item: WebDiscoveryCachedUrl;
    attribution: Attribution;
    fallbackJob: DiscoveredJob | null;
  }> = [];
  const qualityByUrl = new Map<string, FreelancePageQualityAssessment>();
  let pagesAttempted = 0;
  let originalPagesFetched = 0;
  let originalTavilyPagesFetched = 0;
  for (let start = 0; start < unique.length; start += 5) {
    const batch = unique.slice(start, start + 5);
    const attempts = await Promise.all(batch.map(async (entry) => ({
      entry,
      result: await fetchPage(entry.item, dependencies),
    })));
    pagesAttempted += attempts.filter((attempt) => attempt.result.fetched || attempt.result.quality === null).length;
    for (const attempt of attempts) {
      if (attempt.result.fetched) {
        originalPagesFetched += 1;
        if (attempt.entry.attribution !== 'GEMINI_SEARCH') originalTavilyPagesFetched += 1;
      }
      if (attempt.result.quality) qualityByUrl.set(attempt.entry.item.url, attempt.result.quality);
      if (attempt.result.extractEligible) {
        extractQueue.push({
          ...attempt.entry,
          fallbackJob: attempt.result.job,
        });
      } else if (attempt.result.job) {
        directJobs.push({ job: attempt.result.job, attribution: attempt.entry.attribution });
      }
    }
  }

  let extractReport: TavilyExtractReport = {
    enabled: false, status: 'DISABLED', urlsAttempted: 0, successfulExtractions: 0,
    failedExtractions: 0, pagesRecovered: 0, pagesStillRejected: 0,
    creditsConsumed: 0, sourceFailures: [],
  };
  const recoveredExtractUrls = new Set<string>();
  const rejectedExtractUrls = new Set<string>();
  if (dependencies.tavilyExtractEnabled && dependencies.tavilyEnabled && dependencies.tavilyApiKey.trim()) {
    for (let start = 0; start < Math.min(25, extractQueue.length); start += 5) {
      const batch = extractQueue.slice(start, start + 5);
      const extracted = await runTavilyBasicExtract({
        urls: batch.map((entry) => entry.item.url),
        apiKey: dependencies.tavilyApiKey,
        store: dependencies.store,
        caps: dependencies.caps,
        philippineDate: dependencies.philippineDate,
        now,
        fetchImpl: dependencies.fetchImpl,
        timeoutMs: dependencies.timeoutMs,
      });
      extractReport = {
        ...extractReport,
        enabled: true,
        status: extracted.report.status,
        urlsAttempted: extractReport.urlsAttempted + extracted.report.urlsAttempted,
        successfulExtractions: extractReport.successfulExtractions + extracted.report.successfulExtractions,
        failedExtractions: extractReport.failedExtractions + extracted.report.failedExtractions,
        pagesRecovered: extractReport.pagesRecovered,
        pagesStillRejected: extractReport.pagesStillRejected + extracted.report.pagesStillRejected,
        creditsConsumed: extractReport.creditsConsumed + extracted.report.creditsConsumed,
        sourceFailures: [...extractReport.sourceFailures, ...extracted.report.sourceFailures],
      };
      for (const recovered of extracted.recovered) {
        const queued = batch.find((entry) => canonicalizeTavilyJobUrl(entry.item.url) === canonicalizeTavilyJobUrl(recovered.url));
        if (!queued) continue;
        const queuedUrl = canonicalizeTavilyJobUrl(queued.item.url);
        const job = parseTavilyExtractedJobPage(recovered.content, {
          ...queued.item,
          attribution: queued.attribution,
        });
        if (job) {
          const quality = assessFreelanceOpportunityPage({
            url: job.sourceUrl,
            title: job.title,
            company: job.company,
            description: job.description,
            employmentType: job.employmentType,
          });
          qualityByUrl.set(queued.item.url, quality);
          if (quality.outcome !== 'NON_OPPORTUNITY_PAGE') {
            directJobs.push({ job, attribution: queued.attribution });
            extractReport.pagesRecovered += 1;
            if (queuedUrl) recoveredExtractUrls.add(queuedUrl);
          } else if (queuedUrl) {
            rejectedExtractUrls.add(queuedUrl);
          }
        }
      }
    }
  }
  for (const queued of extractQueue) {
    const canonicalUrl = canonicalizeTavilyJobUrl(queued.item.url);
    if (!queued.fallbackJob || (canonicalUrl && (
      recoveredExtractUrls.has(canonicalUrl) || rejectedExtractUrls.has(canonicalUrl)
    ))) continue;
    directJobs.push({ job: queued.fallbackJob, attribution: queued.attribution });
  }
  const candidates = directJobs.flatMap(({ job, attribution }) => {
    const candidate = mapFreelanceWebJob(job, attribution);
    return candidate ? [candidate] : [];
  });
  tavilyReport.urlsDiscovered = tavilyUrls.length;
  const tavilyUrlSet = new Set(tavilyUrls.map((item) => item.url));
  const allQualities = [...qualityByUrl.values()];
  const tavilyQualities = [...qualityByUrl.entries()]
    .filter(([url]) => tavilyUrlSet.has(url))
    .map(([, quality]) => quality);
  tavilyReport.originalPagesFetched = originalTavilyPagesFetched;
  tavilyReport.pagesParsed = directJobs.filter((entry) => entry.attribution !== 'GEMINI_SEARCH').length;
  tavilyReport.validOpportunityPages = tavilyQualities.filter(
    (quality) => quality.outcome !== 'NON_OPPORTUNITY_PAGE',
  ).length;
  tavilyReport.nonOpportunityPages = tavilyQualities.filter(
    (quality) => quality.outcome === 'NON_OPPORTUNITY_PAGE',
  ).length;
  tavilyReport.duplicateOrRepostPages = tavilyQualities.filter(
    (quality) => quality.pageType === 'REPOST_OR_AGGREGATOR',
  ).length;
  tavilyReport.pagesRecoveredByExtract = extractReport.pagesRecovered;
  tavilyReport.pagesWithSufficientTaskScope = tavilyQualities.filter(
    (quality) => quality.taskScopeEvidenceCount > 0,
  ).length;
  tavilyReport.pagesWithInsufficientTaskScope = tavilyQualities.filter(
    (quality) => quality.outcome !== 'NON_OPPORTUNITY_PAGE' && quality.taskScopeEvidenceCount === 0,
  ).length;
  tavilyReport.queryYields = group.intents.map((intent) => {
    const urls = [...tavilyUrlQueryIds.entries()]
      .filter(([, ids]) => ids.has(intent.id))
      .map(([url]) => url);
    const qualities = urls.flatMap((url) => {
      const quality = qualityByUrl.get(url);
      return quality ? [quality] : [];
    });
    return {
      queryId: intent.id,
      urlsDiscovered: queryUrlCounts.get(intent.id) ?? 0,
      validIndividualOpportunities: qualities.filter(
        (quality) => quality.outcome !== 'NON_OPPORTUNITY_PAGE',
      ).length,
      nonOpportunityPages: qualities.filter(
        (quality) => quality.outcome === 'NON_OPPORTUNITY_PAGE',
      ).length,
      duplicateOpportunities: Math.max(0, (queryUrlCounts.get(intent.id) ?? 0) - new Set(urls).size),
    };
  });
  tavilyReport.extractCredits = extractReport.creditsConsumed;
  if (dependencies.tavilyEnabled && !['DAILY_LIMIT_REACHED', 'MONTHLY_LIMIT_REACHED'].includes(tavilyReport.status)) {
    tavilyReport.status = tavilyReport.requestsCompleted === 0 && tavilyReport.cacheHits === 0
      ? 'FAILED'
      : tavilyReport.failures.length > 0
        ? 'PARTIAL_FAILURE'
        : tavilyReport.requestsAttempted === 0 && tavilyReport.cacheHits > 0
          ? 'CACHED'
          : 'COMPLETED';
  }
  return {
    candidates,
    report: {
      queryGroupId: group.id,
      tavily: tavilyReport,
      geminiSearch: gemini.report,
      urlsBeforeDeduplication: tavilyUrls.length + gemini.urls.length,
      uniqueUrls: unique.length,
      pagesAttempted,
      originalPagesFetched,
      pagesRejected: Math.max(0, unique.length - directJobs.length),
      validOpportunityPages: allQualities.filter(
        (quality) => quality.outcome !== 'NON_OPPORTUNITY_PAGE',
      ).length,
      nonOpportunityPages: allQualities.filter(
        (quality) => quality.outcome === 'NON_OPPORTUNITY_PAGE',
      ).length,
      duplicateOrRepostPages: allQualities.filter(
        (quality) => quality.pageType === 'REPOST_OR_AGGREGATOR',
      ).length,
      pagesWithSufficientTaskScope: allQualities.filter(
        (quality) => quality.taskScopeEvidenceCount > 0,
      ).length,
      pagesWithInsufficientTaskScope: allQualities.filter(
        (quality) => quality.outcome !== 'NON_OPPORTUNITY_PAGE' && quality.taskScopeEvidenceCount === 0,
      ).length,
      usage: await dependencies.store.getUsage({
        philippineDate: dependencies.philippineDate,
        caps: dependencies.caps,
      }),
    },
  };
}
