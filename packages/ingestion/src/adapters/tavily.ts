import { createHash } from 'node:crypto';
import { canonicalizeJobUrl } from '@job-app/classification';
import { z } from 'zod';
import { cleanJobContent } from '../content-cleaner.js';
import {
  DiscoveredJobSchema,
  DiscoveryOptionsSchema,
  type DiscoveredJob,
  type DiscoveryFetchResult,
  type DiscoverySourceAdapter,
  type TavilyFetchReport,
  type TavilySourceFailureCode,
} from '../discovery/contracts.js';
import {
  normalizeTavilyQuery,
  type TavilyCachedUrl,
  type TavilySearchStore,
} from '../discovery/tavily-search-store.js';
import {
  extractFromHtml,
  extractFromJsonLd,
  extractFromMetaTags,
  readCappedText,
  resolveHostToPublicIps,
  safeFetch,
  type ExtractedPageData,
} from './url-extractor.js';
import {
  extractForumListingContext,
  forumListingDescription,
} from '../freelance/forum-listing.js';

export const TAVILY_SEARCH_API_URL = 'https://api.tavily.com/search';
export const TAVILY_USER_AGENT =
  'AutomatedJobHunter/0.1 (+https://github.com/mjsenpaii/automated-job-hunter)';
export const TAVILY_MAX_SEARCHES_PER_SCAN = 8 as const;
export const TAVILY_MAX_RESULTS_PER_QUERY = 10 as const;

export const TAVILY_JOB_SEARCH_QUERIES = [
  'remote junior software developer Philippines',
  'remote backend developer APAC',
  'remote full-stack developer worldwide',
  'remote Android engineer',
  'remote AI automation engineer',
  'n8n Zapier Make automation jobs',
  'LLM workflow automation developer',
  'remote developer automation jobs Lever Greenhouse Ashby Workable careers',
] as const;

const TavilyResultSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    url: z.string().url(),
    content: z.string(),
    score: z.number().finite().optional(),
    raw_content: z.null().optional(),
    favicon: z.string().url().nullable().optional(),
  })
  .passthrough();

const TavilyEnvelopeSchema = z
  .object({
    query: z.string(),
    results: z.array(TavilyResultSchema).max(TAVILY_MAX_RESULTS_PER_QUERY),
    answer: z.null().optional(),
    images: z.array(z.unknown()).max(0).optional(),
    response_time: z.number().finite().nonnegative().optional(),
    request_id: z.string().optional(),
    usage: z
      .object({ credits: z.number().int().nonnegative() })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type TavilySafeFailureCode =
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'MALFORMED_JSON'
  | 'SOURCE_SCHEMA_CHANGED'
  | 'NETWORK_ERROR';

export class TavilyDiscoveryError extends Error {
  constructor(
    readonly code: TavilySafeFailureCode,
    message: string,
  ) {
    super(message);
    this.name = 'TavilyDiscoveryError';
  }
}

export interface TavilyAdapterDependencies {
  apiKey: string;
  searchStore: TavilySearchStore;
  philippineDate: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
  resolveHost?: typeof resolveHostToPublicIps;
}

const BLOCKED_PATH_SEGMENTS = [
  'login', 'log-in', 'signin', 'sign-in', 'account', 'captcha',
  'search', 'search-results', 'apply', 'application', 'submit',
] as const;
const ATS_HOSTS = new Set([
  'jobs.lever.co',
  'boards.greenhouse.io',
  'job-boards.greenhouse.io',
  'jobs.ashbyhq.com',
  'apply.workable.com',
]);

export function isDirectEmployerOrAtsJobUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLocaleLowerCase();
    if (ATS_HOSTS.has(hostname)) return true;
    return /\/(careers?|jobs?)\//i.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function canonicalizeTavilyJobUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    const pathSegments = parsed.pathname
      .toLocaleLowerCase()
      .split('/')
      .filter(Boolean);
    if (BLOCKED_PATH_SEGMENTS.some((part) => pathSegments.includes(part))) {
      return null;
    }
    for (const [name, content] of parsed.searchParams.entries()) {
      const valueLower = content.toLocaleLowerCase();
      if (
        ['login', 'signin', 'captcha', 'application', 'submit'].includes(
          name.toLocaleLowerCase(),
        ) ||
        ['login', 'signin', 'captcha'].includes(valueLower)
      ) {
        return null;
      }
    }
    return canonicalizeJobUrl(parsed.toString());
  } catch {
    return null;
  }
}

function queryId(index: number): string {
  return `query-${String(index + 1).padStart(2, '0')}`;
}

export async function performTavilyBasicSearch(
  query: string,
  dependencies: Pick<
    TavilyAdapterDependencies,
    'apiKey' | 'fetchImpl' | 'timeoutMs'
  >,
): Promise<{ urls: TavilyCachedUrl[]; rejectedUrls: number }> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    dependencies.timeoutMs ?? 10_000,
  );
  let response: Response;
  try {
    response = await (dependencies.fetchImpl ?? fetch)(TAVILY_SEARCH_API_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dependencies.apiKey}`,
        'User-Agent': TAVILY_USER_AGENT,
      },
      body: JSON.stringify({
        query,
        topic: 'general',
        search_depth: 'basic',
        max_results: TAVILY_MAX_RESULTS_PER_QUERY,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
        auto_parameters: false,
      }),
      redirect: 'error',
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    throw new TavilyDiscoveryError(
      controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
      'Tavily Basic Search failed safely.',
    );
  }
  clearTimeout(timer);
  if (!response.ok) {
    throw new TavilyDiscoveryError(
      'HTTP_ERROR',
      'Tavily Basic Search returned a non-success response.',
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new TavilyDiscoveryError(
      'MALFORMED_JSON',
      'Tavily Basic Search returned malformed JSON.',
    );
  }
  const parsed = TavilyEnvelopeSchema.safeParse(payload);
  if (!parsed.success) {
    throw new TavilyDiscoveryError(
      'SOURCE_SCHEMA_CHANGED',
      'Tavily Basic Search returned an unsupported response shape.',
    );
  }
  let rejectedUrls = 0;
  const urls = parsed.data.results.flatMap((result) => {
    const url = canonicalizeTavilyJobUrl(result.url);
    if (!url) rejectedUrls += 1;
    return url
      ? [{
          url,
          title: result.title,
          directEmployerOrAts: isDirectEmployerOrAtsJobUrl(url),
        }]
      : [];
  });
  return { urls, rejectedUrls };
}

function mergePageData(
  primary: ExtractedPageData | null,
  fallback: ExtractedPageData | null,
): ExtractedPageData {
  return { ...(fallback ?? {}), ...(primary ?? {}) };
}

export function parseOriginalJobPage(
  html: string,
  sourceUrl: string,
  options: { now?: Date } = {},
): DiscoveredJob | null {
  const safePageText = cleanJobContent(html).slice(0, 2_000);
  if (/\b(captcha|verify you are human|access denied)\b/i.test(safePageText)) {
    return null;
  }
  const jsonLd = extractFromJsonLd(html);
  const meta = extractFromMetaTags(html);
  const heuristic = extractFromHtml(html);
  const extracted = mergePageData(jsonLd, mergePageData(meta, heuristic));
  const forumListingContext = extractForumListingContext(html, options);
  if (forumListingContext) {
    extracted.description = forumListingDescription(forumListingContext);
    extracted.date_posted ??= forumListingContext.originalPostPublishedAt ?? undefined;
  }
  let sourceHost: string;
  try {
    sourceHost = new URL(sourceUrl).hostname.toLocaleLowerCase();
  } catch {
    return null;
  }
  if (ATS_HOSTS.has(sourceHost) && !jsonLd?.company) return null;
  const title = cleanJobContent(extracted.title ?? '').trim();
  const company = cleanJobContent(extracted.company ?? '').trim();
  const description = cleanJobContent(extracted.description ?? '').trim();
  if (!title || !company || description.length < 120) return null;

  const locations = [extracted.city, extracted.region, extracted.country]
    .map((value) => cleanJobContent(value ?? '').trim())
    .filter(Boolean);
  const location = [...new Set(locations)].join(', ') || null;
  const workSetup = extracted.work_setup?.trim().toUpperCase();
  const remote = workSetup === 'REMOTE' ? true : workSetup === 'ONSITE' ? false : null;
  const canonicalUrl = canonicalizeTavilyJobUrl(sourceUrl);
  if (!canonicalUrl) return null;
  const applicationUrl = extracted.application_url
    ? canonicalizeTavilyJobUrl(extracted.application_url)
    : canonicalUrl;
  const publishedAt = extracted.date_posted && !Number.isNaN(Date.parse(extracted.date_posted))
    ? new Date(extracted.date_posted).toISOString()
    : null;
  const tags = [
    ...(extracted.required_skills ?? []),
    ...(extracted.preferred_skills ?? []),
  ].map((value) => cleanJobContent(value).trim()).filter(Boolean);

  const parsed = DiscoveredJobSchema.safeParse({
    sourceName: 'Tavily',
    sourceJobId: createHash('sha256').update(canonicalUrl).digest('hex'),
    title,
    company,
    location,
    remote,
    employmentType: extracted.employment_type?.trim() || null,
    description,
    tags: [...new Set(tags)],
    publishedAt,
    updatedAt: forumListingContext?.latestFirstPartyUpdateAt ?? null,
    forumListingContext,
    sourceUrl: canonicalUrl,
    applicationUrl,
  });
  return parsed.success ? parsed.data : null;
}

export class TavilyAdapter implements DiscoverySourceAdapter {
  readonly name = 'Tavily';

  constructor(private readonly dependencies: TavilyAdapterDependencies) {}

  async fetchJobs(optionsInput: {
    limit: number;
    pages: number;
  }): Promise<DiscoveryFetchResult> {
    const options = DiscoveryOptionsSchema.pick({ limit: true, pages: true }).parse(
      optionsInput,
    );
    const now = this.dependencies.now ?? (() => new Date());
    const report: TavilyFetchReport = {
      searchesAttempted: 0,
      searchesCompleted: 0,
      cacheHits: 0,
      creditsConsumed: 0,
      dailyCreditsRemaining: await this.dependencies.searchStore.getDailyRemaining(
        this.dependencies.philippineDate,
      ),
      urlsDiscovered: 0,
      uniqueUrls: 0,
      originalPagesFetched: 0,
      pagesParsedSuccessfully: 0,
      pagesRejected: 0,
      directEmployerOrAtsPages: 0,
      sourceFailures: [],
      dailyLimitReached: false,
    };
    if (!this.dependencies.apiKey.trim()) {
      report.sourceFailures.push({ code: 'MISSING_API_KEY' });
      return {
        sourceRecordsFetched: 0,
        acceptedRecords: 0,
        invalidRecords: 0,
        pagesFetched: 0,
        jobs: [],
        tavilyFetchReport: report,
      };
    }
    const discoveredUrls: TavilyCachedUrl[] = [];

    for (const [index, rawQuery] of TAVILY_JOB_SEARCH_QUERIES.entries()) {
      if (report.searchesAttempted >= TAVILY_MAX_SEARCHES_PER_SCAN) break;
      const normalizedQuery = normalizeTavilyQuery(rawQuery);
      const reservation = await this.dependencies.searchStore.reserve({
        normalizedQuery,
        philippineDate: this.dependencies.philippineDate,
        now: now(),
      });
      report.dailyCreditsRemaining = reservation.dailyRemaining;
      if (reservation.status === 'CACHE_HIT') {
        report.cacheHits += 1;
        report.searchesCompleted += 1;
        discoveredUrls.push(...reservation.urls);
        continue;
      }
      if (reservation.status === 'DAILY_LIMIT_REACHED') {
        report.dailyLimitReached = true;
        report.sourceFailures.push({
          queryId: queryId(index),
          code: 'DAILY_CREDIT_LIMIT_REACHED',
        });
        continue;
      }
      if (reservation.status === 'IN_FLIGHT') {
        report.sourceFailures.push({
          queryId: queryId(index),
          code: 'QUERY_IN_FLIGHT',
        });
        continue;
      }

      report.searchesAttempted += 1;
      report.creditsConsumed += 1;
      try {
        const searchResult = await performTavilyBasicSearch(
          normalizedQuery,
          this.dependencies,
        );
        report.pagesRejected += searchResult.rejectedUrls;
        await this.dependencies.searchStore.complete({
          normalizedQuery,
          reservationToken: reservation.reservationToken,
          urls: searchResult.urls,
          now: now(),
        });
        report.searchesCompleted += 1;
        discoveredUrls.push(...searchResult.urls);
      } catch (error) {
        await this.dependencies.searchStore.fail({
          normalizedQuery,
          reservationToken: reservation.reservationToken,
          now: now(),
        });
        report.sourceFailures.push({
          queryId: queryId(index),
          code: error instanceof TavilyDiscoveryError
            ? error.code
            : 'UNKNOWN_SAFE_ERROR',
        });
      }
    }

    report.urlsDiscovered = discoveredUrls.length;
    const uniqueByUrl = new Map<string, TavilyCachedUrl>();
    for (const url of discoveredUrls) {
      if (!uniqueByUrl.has(url.url)) uniqueByUrl.set(url.url, url);
    }
    const uniqueUrls = [...uniqueByUrl.values()]
      .sort((left, right) => Number(right.directEmployerOrAts) - Number(left.directEmployerOrAts))
      .slice(0, options.limit);
    report.uniqueUrls = uniqueUrls.length;

    const jobs: DiscoveredJob[] = [];
    for (const candidate of uniqueUrls) {
      const fetched = await safeFetch(candidate.url, {
        fetchImpl: this.dependencies.fetchImpl,
        timeoutMs: this.dependencies.timeoutMs,
        resolveHost: this.dependencies.resolveHost,
      });
      if (!fetched.response || fetched.error || !fetched.response.ok) {
        report.pagesRejected += 1;
        report.sourceFailures.push({ code: 'PAGE_FETCH_FAILED' });
        continue;
      }
      report.originalPagesFetched += 1;
      const contentType = fetched.response.headers.get('content-type') ?? '';
      if (!contentType.toLocaleLowerCase().includes('text/html')) {
        report.pagesRejected += 1;
        continue;
      }
      const html = await readCappedText(fetched.response);
      if (html === null) {
        report.pagesRejected += 1;
        continue;
      }
      const job = parseOriginalJobPage(html, candidate.url);
      if (!job) {
        report.pagesRejected += 1;
        continue;
      }
      jobs.push(job);
      report.pagesParsedSuccessfully += 1;
      if (candidate.directEmployerOrAts) report.directEmployerOrAtsPages += 1;
    }

    report.sourceFailures = report.sourceFailures.filter(
      (failure, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.code === failure.code &&
            candidate.queryId === failure.queryId,
        ) === index,
    );

    return {
      sourceRecordsFetched: report.urlsDiscovered,
      acceptedRecords: jobs.length,
      invalidRecords: report.pagesRejected,
      pagesFetched: report.originalPagesFetched,
      jobs,
      tavilyFetchReport: report,
    };
  }
}
