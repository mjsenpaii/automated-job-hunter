import { createHash } from 'node:crypto';
import { z } from 'zod';
import { cleanJobContent } from '../content-cleaner.js';
import {
  DiscoveredJobSchema,
  type DiscoveredJob,
  type DiscoveryFetchResult,
  type DiscoverySourceAdapter,
  type TavilyWebSearchReport,
  type WebDiscoveryReport,
  type WebDiscoveryStoppingReason,
} from '../discovery/contracts.js';
import type { JobSearchProfileId } from '../discovery/job-search-profiles.v1.js';
import {
  WEB_SEARCH_QUERY_GROUPS,
  selectDeterministicQueryGroup,
  type WebSearchIntent,
  type WebSearchQueryGroup,
  type WebSearchQueryGroupId,
} from '../discovery/web-search-query-groups.v1.js';
import {
  normalizeWebSearchRequest,
  type WebDiscoveryCachedUrl,
  type WebDiscoveryQuotaCaps,
  type WebDiscoveryStore,
} from '../discovery/web-discovery-store.js';
import {
  GEMINI_SEARCH_MAX_PROMPTS_DEEP,
  GEMINI_SEARCH_MAX_PROMPTS_NORMAL,
  runGeminiWebSearch,
  type GeminiSearchClientFactory,
  type GeminiSearchReport,
} from './gemini-web-search.server.js';
import {
  runTavilyBasicExtract,
  type TavilyExtractReport,
} from './tavily-extract.js';
import {
  TAVILY_MAX_RESULTS_PER_QUERY,
  canonicalizeTavilyJobUrl,
  isDirectEmployerOrAtsJobUrl,
  parseOriginalJobPage,
  performTavilyBasicSearch,
} from './tavily.js';
import {
  readCappedText,
  resolveHostToPublicIps,
  safeFetch,
  validateUrl,
} from './url-extractor.js';

export const NORMAL_WEB_DISCOVERY_UNIQUE_URL_CAP = 250 as const;
export const DEEP_WEB_DISCOVERY_UNIQUE_URL_CAP = 1000 as const;
export const NORMAL_TAVILY_SEARCH_REQUEST_CAP = 8 as const;
export const DEEP_TAVILY_SEARCH_REQUEST_CAP = 40 as const;
export const NORMAL_TAVILY_EXTRACT_URL_CAP = 25 as const;
export const DEEP_TAVILY_EXTRACT_URL_CAP = 200 as const;
export const ORIGINAL_PAGE_GLOBAL_CONCURRENCY = 5 as const;
export const ORIGINAL_PAGE_PER_HOST_CONCURRENCY = 1 as const;
export const DEEP_WEB_DISCOVERY_BATCH_SIZE = 100 as const;

const CombinedWebDiscoveryFetchOptionsSchema = z.object({
  limit: z.number().int().min(1).max(DEEP_WEB_DISCOVERY_UNIQUE_URL_CAP),
  pages: z.number().int().min(1).max(3),
});

export type WebUrlAttribution = 'TAVILY' | 'GEMINI_SEARCH' | 'BOTH';
export type CombinedWebDiscoveryStage =
  | 'SELECTING_QUERY_GROUP'
  | 'READING_CACHED_RESULTS'
  | 'SEARCHING_TAVILY'
  | 'SEARCHING_GEMINI'
  | 'COMBINING_URLS'
  | 'REMOVING_DUPLICATE_URLS'
  | 'FETCHING_ORIGINAL_PAGES'
  | 'RECOVERING_FAILED_PAGES'
  | 'PARSING_JOB_PAGES'
  | 'COMPLETING_BATCH';

export interface CombinedWebDiscoveryOptions {
  scanMode: 'NORMAL' | 'DEEP';
  cacheStrategy: 'CACHED' | 'FRESH';
  confirmRecentlyExhausted: boolean;
  runKey: string;
  activeProfileIds: readonly JobSearchProfileId[];
  deepScanIdempotencyKey?: string;
}

export interface CombinedWebDiscoveryDependencies {
  tavilyEnabled: boolean;
  geminiSearchEnabled: boolean;
  tavilyExtractEnabled: boolean;
  tavilyApiKey: string;
  geminiApiKey: string;
  geminiSearchModel: string | null;
  store: WebDiscoveryStore;
  caps: WebDiscoveryQuotaCaps;
  philippineDate: string;
  scan: CombinedWebDiscoveryOptions;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
  resolveHost?: typeof resolveHostToPublicIps;
  geminiClientFactory?: GeminiSearchClientFactory;
  onStage?: (stage: CombinedWebDiscoveryStage) => void;
}

type FetchFailureReason = keyof WebDiscoveryReport['fetchFailuresByReason'];

interface AttributedUrl extends WebDiscoveryCachedUrl {
  attribution: WebUrlAttribution;
}

interface PageAttempt {
  candidate: AttributedUrl;
  job: DiscoveredJob | null;
  directFetched: boolean;
  failureReason: FetchFailureReason | null;
  eligibleForExtract: boolean;
}

function emptyGeminiReport(enabled: boolean): GeminiSearchReport {
  return {
    enabled,
    status: enabled ? 'FAILED' : 'DISABLED',
    promptsAttempted: 0,
    promptsCompleted: 0,
    cacheHits: 0,
    groundedResponses: 0,
    groundedUrlsFound: 0,
    uniqueUrlsContributed: 0,
    dailyPromptsUsed: 0,
    dailyPromptsRemaining: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    sourceFailures: [],
  };
}

function emptyTavilySearchReport(enabled: boolean): TavilyWebSearchReport {
  return {
    enabled,
    status: enabled ? 'FAILED' : 'DISABLED',
    searchRequestsAttempted: 0,
    searchesCompleted: 0,
    cacheHits: 0,
    searchCreditsConsumed: 0,
    urlsDiscovered: 0,
    uniqueUrlsContributed: 0,
    dailyCreditsUsed: 0,
    dailyCreditsReserved: 0,
    dailyCreditsConfirmed: 0,
    dailyCreditsRemaining: 0,
    monthlyCreditsUsed: 0,
    monthlyCreditsReserved: 0,
    monthlyCreditsConfirmed: 0,
    monthlyCreditsRemaining: 0,
    sourceFailures: [],
  };
}

function emptyExtractReport(enabled: boolean): TavilyExtractReport {
  return {
    enabled,
    status: enabled ? 'COMPLETED' : 'DISABLED',
    urlsAttempted: 0,
    successfulExtractions: 0,
    failedExtractions: 0,
    pagesRecovered: 0,
    pagesStillRejected: 0,
    creditsConsumed: 0,
    sourceFailures: [],
  };
}

function safeQueryId(intent: WebSearchIntent): string {
  return intent.id.replace(/[^A-Za-z0-9-]/g, '').slice(0, 40);
}

async function runTavilySearch(options: {
  intents: readonly WebSearchIntent[];
  enabled: boolean;
  cacheOnly: boolean;
  apiKey: string;
  store: WebDiscoveryStore;
  caps: WebDiscoveryQuotaCaps;
  philippineDate: string;
  now: () => Date;
  maxRequests: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<{ urls: WebDiscoveryCachedUrl[]; report: TavilyWebSearchReport }> {
  const report = emptyTavilySearchReport(options.enabled);
  const initial = await options.store.getUsage({
    philippineDate: options.philippineDate,
    caps: options.caps,
  });
  report.dailyCreditsUsed = initial.tavilyDailyUsed;
  report.dailyCreditsReserved = initial.tavilyDailyReserved;
  report.dailyCreditsConfirmed = initial.tavilyDailyConfirmed;
  report.dailyCreditsRemaining = initial.tavilyDailyRemaining;
  report.monthlyCreditsUsed = initial.tavilyMonthlyUsed;
  report.monthlyCreditsReserved = initial.tavilyMonthlyReserved;
  report.monthlyCreditsConfirmed = initial.tavilyMonthlyConfirmed;
  report.monthlyCreditsRemaining = initial.tavilyMonthlyRemaining;
  if (!options.enabled) return { urls: [], report };
  if (!options.apiKey.trim()) {
    report.sourceFailures.push({ queryId: 'configuration', code: 'MISSING_API_KEY' });
    return { urls: [], report };
  }

  const discovered: WebDiscoveryCachedUrl[] = [];
  for (const intent of options.intents) {
    if (report.searchRequestsAttempted >= options.maxRequests) break;
    const normalizedRequest = normalizeWebSearchRequest(intent.tavilyQuery);
    const reservation = await options.store.reserveSearch({
      provider: 'TAVILY',
      operation: 'SEARCH',
      normalizedRequest,
      cacheOnly: options.cacheOnly,
      philippineDate: options.philippineDate,
      now: options.now(),
      caps: options.caps,
    });
    report.dailyCreditsUsed = reservation.usage.tavilyDailyUsed;
    report.dailyCreditsReserved = reservation.usage.tavilyDailyReserved;
    report.dailyCreditsConfirmed = reservation.usage.tavilyDailyConfirmed;
    report.dailyCreditsRemaining = reservation.usage.tavilyDailyRemaining;
    report.monthlyCreditsUsed = reservation.usage.tavilyMonthlyUsed;
    report.monthlyCreditsReserved = reservation.usage.tavilyMonthlyReserved;
    report.monthlyCreditsConfirmed = reservation.usage.tavilyMonthlyConfirmed;
    report.monthlyCreditsRemaining = reservation.usage.tavilyMonthlyRemaining;
    if (reservation.status === 'CACHE_HIT') {
      report.cacheHits += 1;
      report.searchesCompleted += 1;
      discovered.push(...reservation.urls);
      continue;
    }
    if (reservation.status === 'CACHE_MISS') continue;
    if (reservation.status === 'IN_FLIGHT') {
      report.sourceFailures.push({
        queryId: safeQueryId(intent),
        code: 'QUERY_IN_FLIGHT',
      });
      continue;
    }
    if (reservation.status === 'DAILY_LIMIT_REACHED') {
      report.sourceFailures.push({
        queryId: safeQueryId(intent),
        code: 'DAILY_CREDIT_LIMIT_REACHED',
      });
      break;
    }
    if (reservation.status === 'MONTHLY_LIMIT_REACHED') {
      report.sourceFailures.push({
        queryId: safeQueryId(intent),
        code: 'MONTHLY_CREDIT_LIMIT_REACHED',
      });
      break;
    }
    if (reservation.status !== 'RESERVED') continue;

    report.searchRequestsAttempted += 1;
    try {
      const result = await performTavilyBasicSearch(normalizedRequest, {
        apiKey: options.apiKey,
        fetchImpl: options.fetchImpl,
        timeoutMs: options.timeoutMs,
      });
      await options.store.completeSearch({
        provider: 'TAVILY',
        normalizedRequest,
        reservationToken: reservation.reservationToken,
        urls: result.urls,
        now: options.now(),
      });
      report.searchesCompleted += 1;
      report.searchCreditsConsumed += 1;
      discovered.push(...result.urls);
    } catch (error) {
      await options.store.failSearch({
        provider: 'TAVILY',
        normalizedRequest,
        reservationToken: reservation.reservationToken,
        now: options.now(),
      });
      const code = error && typeof error === 'object' && 'code' in error &&
        typeof error.code === 'string'
        ? error.code
        : 'UNKNOWN_SAFE_ERROR';
      const parsedCode = z.enum([
        'TIMEOUT', 'HTTP_ERROR', 'MALFORMED_JSON',
        'SOURCE_SCHEMA_CHANGED', 'NETWORK_ERROR',
      ]).safeParse(code);
      report.sourceFailures.push({
        queryId: safeQueryId(intent),
        code: parsedCode.success ? parsedCode.data : 'UNKNOWN_SAFE_ERROR',
      });
    }
  }
  const finalUsage = await options.store.getUsage({
    philippineDate: options.philippineDate,
    caps: options.caps,
  });
  report.dailyCreditsUsed = finalUsage.tavilyDailyUsed;
  report.dailyCreditsReserved = finalUsage.tavilyDailyReserved;
  report.dailyCreditsConfirmed = finalUsage.tavilyDailyConfirmed;
  report.dailyCreditsRemaining = finalUsage.tavilyDailyRemaining;
  report.monthlyCreditsUsed = finalUsage.tavilyMonthlyUsed;
  report.monthlyCreditsReserved = finalUsage.tavilyMonthlyReserved;
  report.monthlyCreditsConfirmed = finalUsage.tavilyMonthlyConfirmed;
  report.monthlyCreditsRemaining = finalUsage.tavilyMonthlyRemaining;
  report.urlsDiscovered = discovered.length;
  report.uniqueUrlsContributed = new Set(discovered.map((item) => item.url)).size;
  report.status = report.sourceFailures.some(
    (failure) => failure.code === 'DAILY_CREDIT_LIMIT_REACHED',
  ) && report.searchesCompleted === 0
    ? 'DAILY_LIMIT_REACHED'
    : report.sourceFailures.some(
      (failure) => failure.code === 'MONTHLY_CREDIT_LIMIT_REACHED',
    ) && report.searchesCompleted === 0
      ? 'MONTHLY_LIMIT_REACHED'
      : report.searchesCompleted === 0 && report.cacheHits === 0
        ? report.sourceFailures.length > 0 ? 'FAILED' : 'CACHED'
        : report.sourceFailures.length > 0
          ? 'PARTIAL_FAILURE'
          : report.searchRequestsAttempted === 0 && report.cacheHits > 0
            ? 'CACHED'
            : 'COMPLETED';
  return { urls: discovered, report };
}

function mergeTavilyReports(
  aggregate: TavilyWebSearchReport,
  next: TavilyWebSearchReport,
): TavilyWebSearchReport {
  return {
    enabled: aggregate.enabled || next.enabled,
    status: next.status,
    searchRequestsAttempted:
      aggregate.searchRequestsAttempted + next.searchRequestsAttempted,
    searchesCompleted: aggregate.searchesCompleted + next.searchesCompleted,
    cacheHits: aggregate.cacheHits + next.cacheHits,
    searchCreditsConsumed:
      aggregate.searchCreditsConsumed + next.searchCreditsConsumed,
    urlsDiscovered: aggregate.urlsDiscovered + next.urlsDiscovered,
    uniqueUrlsContributed: 0,
    dailyCreditsUsed: next.dailyCreditsUsed,
    dailyCreditsReserved: next.dailyCreditsReserved,
    dailyCreditsConfirmed: next.dailyCreditsConfirmed,
    dailyCreditsRemaining: next.dailyCreditsRemaining,
    monthlyCreditsUsed: next.monthlyCreditsUsed,
    monthlyCreditsReserved: next.monthlyCreditsReserved,
    monthlyCreditsConfirmed: next.monthlyCreditsConfirmed,
    monthlyCreditsRemaining: next.monthlyCreditsRemaining,
    sourceFailures: [...aggregate.sourceFailures, ...next.sourceFailures],
  };
}

function addNullable(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : left + right;
}

function mergeGeminiReports(
  aggregate: GeminiSearchReport,
  next: GeminiSearchReport,
): GeminiSearchReport {
  return {
    enabled: aggregate.enabled || next.enabled,
    status: next.status,
    promptsAttempted: aggregate.promptsAttempted + next.promptsAttempted,
    promptsCompleted: aggregate.promptsCompleted + next.promptsCompleted,
    cacheHits: aggregate.cacheHits + next.cacheHits,
    groundedResponses: aggregate.groundedResponses + next.groundedResponses,
    groundedUrlsFound: aggregate.groundedUrlsFound + next.groundedUrlsFound,
    uniqueUrlsContributed: 0,
    dailyPromptsUsed: next.dailyPromptsUsed,
    dailyPromptsRemaining: next.dailyPromptsRemaining,
    inputTokens: addNullable(aggregate.inputTokens, next.inputTokens),
    outputTokens: addNullable(aggregate.outputTokens, next.outputTokens),
    totalTokens: addNullable(aggregate.totalTokens, next.totalTokens),
    sourceFailures: [...aggregate.sourceFailures, ...next.sourceFailures],
  };
}

function attributionSourceName(attribution: WebUrlAttribution): string {
  if (attribution === 'BOTH') return 'Tavily + Gemini Search';
  return attribution === 'TAVILY' ? 'Tavily' : 'Gemini Search';
}

function withAttribution(
  job: DiscoveredJob,
  candidate: AttributedUrl,
): DiscoveredJob {
  return DiscoveredJobSchema.parse({
    ...job,
    sourceName: attributionSourceName(candidate.attribution),
    sourceJobId: createHash('sha256').update(candidate.url).digest('hex'),
    sourceUrl: candidate.url,
  });
}

export function isSpecificPublicJobUrl(value: string): boolean {
  if (!validateUrl(value).valid) return false;
  const url = canonicalizeTavilyJobUrl(value);
  if (!url) return false;
  const parsed = new URL(url);
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length < 2) return false;
  if (!isDirectEmployerOrAtsJobUrl(url)) return false;
  return !/^\/(?:careers?|jobs?)\/?$/i.test(parsed.pathname);
}

function unsafePageText(text: string): boolean {
  return /\b(captcha|verify you are human|access denied|sign in to continue|log in to continue)\b/i
    .test(text.slice(0, 4_000));
}

function extractFailureReason(error: string): {
  reason: FetchFailureReason;
  eligible: boolean;
} {
  if (/private|loopback|link-local|local networks|unsupported|scheme/i.test(error)) {
    return { reason: 'UNSAFE_URL', eligible: false };
  }
  if (/redirect/i.test(error)) {
    return { reason: 'INELIGIBLE_PAGE', eligible: false };
  }
  return { reason: 'NETWORK', eligible: true };
}

async function fetchOriginalPage(
  candidate: AttributedUrl,
  dependencies: CombinedWebDiscoveryDependencies,
): Promise<PageAttempt> {
  const fetched = await safeFetch(candidate.url, {
    fetchImpl: dependencies.fetchImpl,
    timeoutMs: dependencies.timeoutMs,
    resolveHost: dependencies.resolveHost,
  });
  if (!fetched.response) {
    const failure = extractFailureReason(fetched.error ?? 'Failed to fetch URL');
    return {
      candidate,
      job: null,
      directFetched: false,
      failureReason: failure.reason,
      eligibleForExtract: failure.eligible && isSpecificPublicJobUrl(candidate.url),
    };
  }
  if (!fetched.response.ok) {
    const ineligible = [401, 403, 404, 410].includes(fetched.response.status);
    return {
      candidate,
      job: null,
      directFetched: true,
      failureReason: 'HTTP',
      eligibleForExtract: !ineligible && isSpecificPublicJobUrl(candidate.url),
    };
  }
  const contentType = fetched.response.headers.get('content-type') ?? '';
  if (!contentType.toLocaleLowerCase().includes('text/html')) {
    return {
      candidate,
      job: null,
      directFetched: true,
      failureReason: 'NON_HTML',
      eligibleForExtract: isSpecificPublicJobUrl(candidate.url),
    };
  }
  const html = await readCappedText(fetched.response);
  if (html === null) {
    return {
      candidate,
      job: null,
      directFetched: true,
      failureReason: 'BODY_TOO_LARGE',
      eligibleForExtract: isSpecificPublicJobUrl(candidate.url),
    };
  }
  if (unsafePageText(cleanJobContent(html))) {
    return {
      candidate,
      job: null,
      directFetched: true,
      failureReason: 'INELIGIBLE_PAGE',
      eligibleForExtract: false,
    };
  }
  const parsed = parseOriginalJobPage(html, candidate.url);
  return {
    candidate,
    job: parsed ? withAttribution(parsed, candidate) : null,
    directFetched: true,
    failureReason: parsed ? null : 'UNPARSEABLE',
    eligibleForExtract: !parsed && isSpecificPublicJobUrl(candidate.url),
  };
}

export function parseTavilyExtractedJobPage(
  content: string,
  candidate: AttributedUrl,
): DiscoveredJob | null {
  if (/<(?:html|body|script|h1|title)\b/i.test(content)) {
    const parsed = parseOriginalJobPage(content, candidate.url);
    return parsed ? withAttribution(parsed, candidate) : null;
  }
  const normalized = cleanJobContent(content).trim();
  if (normalized.length < 120 || unsafePageText(normalized)) return null;
  const lines = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const heading = lines.find((line) => /^#\s+\S/.test(line));
  const companyLine = lines.find((line) => /^company\s*:\s*\S/i.test(line));
  if (!heading || !companyLine) return null;
  const title = heading.replace(/^#\s+/, '').trim();
  const company = companyLine.replace(/^company\s*:\s*/i, '').trim();
  const parsed = DiscoveredJobSchema.safeParse({
    sourceName: attributionSourceName(candidate.attribution),
    sourceJobId: createHash('sha256').update(candidate.url).digest('hex'),
    title,
    company,
    location: null,
    remote: null,
    employmentType: null,
    description: normalized,
    tags: [],
    publishedAt: null,
    sourceUrl: candidate.url,
    applicationUrl: candidate.url,
  });
  return parsed.success ? parsed.data : null;
}

async function mapWithHostConcurrency<T>(
  items: readonly AttributedUrl[],
  worker: (item: AttributedUrl) => Promise<T>,
): Promise<T[]> {
  const results: T[] = new Array(items.length);
  const pending = new Set<Promise<void>>();
  const hostTail = new Map<string, Promise<void>>();
  for (const [index, item] of items.entries()) {
    while (pending.size >= ORIGINAL_PAGE_GLOBAL_CONCURRENCY) {
      await Promise.race(pending);
    }
    const host = new URL(item.url).hostname.toLocaleLowerCase();
    const previous = hostTail.get(host) ?? Promise.resolve();
    const task = previous
      .catch(() => undefined)
      .then(async () => {
        results[index] = await worker(item);
      });
    let tracked: Promise<void>;
    tracked = task.finally(() => pending.delete(tracked));
    hostTail.set(host, tracked);
    pending.add(tracked);
  }
  await Promise.all(pending);
  return results;
}

function mergeExtractReports(
  aggregate: TavilyExtractReport,
  next: TavilyExtractReport,
): TavilyExtractReport {
  return {
    enabled: aggregate.enabled || next.enabled,
    status: next.status,
    urlsAttempted: aggregate.urlsAttempted + next.urlsAttempted,
    successfulExtractions:
      aggregate.successfulExtractions + next.successfulExtractions,
    failedExtractions: aggregate.failedExtractions + next.failedExtractions,
    pagesRecovered: aggregate.pagesRecovered + next.pagesRecovered,
    pagesStillRejected: aggregate.pagesStillRejected + next.pagesStillRejected,
    creditsConsumed: aggregate.creditsConsumed + next.creditsConsumed,
    sourceFailures: [...aggregate.sourceFailures, ...next.sourceFailures],
  };
}

export function deduplicateWebDiscoveryUrls(options: {
  tavily: readonly WebDiscoveryCachedUrl[];
  gemini: readonly WebDiscoveryCachedUrl[];
  cap: number;
}): {
  urls: AttributedUrl[];
  beforeDeduplication: number;
  duplicates: number;
  both: number;
  capReached: boolean;
} {
  const byUrl = new Map<string, AttributedUrl>();
  const add = (item: WebDiscoveryCachedUrl, source: 'TAVILY' | 'GEMINI_SEARCH') => {
    const canonical = canonicalizeTavilyJobUrl(item.url);
    if (!canonical) return;
    const existing = byUrl.get(canonical);
    if (existing) {
      if (existing.attribution !== source) existing.attribution = 'BOTH';
      existing.directEmployerOrAts ||= item.directEmployerOrAts;
      return;
    }
    byUrl.set(canonical, { ...item, url: canonical, attribution: source });
  };
  options.tavily.forEach((item) => add(item, 'TAVILY'));
  options.gemini.forEach((item) => add(item, 'GEMINI_SEARCH'));
  const all = [...byUrl.values()].sort((left, right) => {
    const direct = Number(right.directEmployerOrAts) - Number(left.directEmployerOrAts);
    return direct || left.url.localeCompare(right.url);
  });
  return {
    urls: all.slice(0, options.cap),
    beforeDeduplication: options.tavily.length + options.gemini.length,
    duplicates: Math.max(0, options.tavily.length + options.gemini.length - all.length),
    both: all.filter((item) => item.attribution === 'BOTH').length,
    capReached: all.length > options.cap,
  };
}

function finalSourceStatus(
  completed: number,
  cached: number,
  failures: number,
  daily: boolean,
  monthly: boolean,
): TavilyWebSearchReport['status'] {
  if (daily && completed === 0) return 'DAILY_LIMIT_REACHED';
  if (monthly && completed === 0) return 'MONTHLY_LIMIT_REACHED';
  if (completed === 0 && cached > 0 && failures === 0) return 'CACHED';
  if (completed === 0 && failures > 0) return 'FAILED';
  if (failures > 0) return 'PARTIAL_FAILURE';
  return 'COMPLETED';
}

export class CombinedWebDiscoveryAdapter implements DiscoverySourceAdapter {
  readonly name = 'Combined public web search';

  constructor(private readonly dependencies: CombinedWebDiscoveryDependencies) {}

  async fetchJobs(optionsInput: {
    limit: number;
    pages: number;
  }): Promise<DiscoveryFetchResult> {
    const options = CombinedWebDiscoveryFetchOptionsSchema.parse(optionsInput);
    const now = this.dependencies.now ?? (() => new Date());
    await this.dependencies.store.cleanup(now());
    const deep = this.dependencies.scan.scanMode === 'DEEP';
    const uniqueUrlCap = deep
      ? DEEP_WEB_DISCOVERY_UNIQUE_URL_CAP
      : NORMAL_WEB_DISCOVERY_UNIQUE_URL_CAP;
    const extractUrlCap = deep
      ? DEEP_TAVILY_EXTRACT_URL_CAP
      : NORMAL_TAVILY_EXTRACT_URL_CAP;
    let tavilyReport = emptyTavilySearchReport(this.dependencies.tavilyEnabled);
    let geminiReport = emptyGeminiReport(this.dependencies.geminiSearchEnabled);
    let extractReport = emptyExtractReport(
      this.dependencies.tavilyExtractEnabled,
    );
    const tavilyUrls: WebDiscoveryCachedUrl[] = [];
    const geminiUrls: WebDiscoveryCachedUrl[] = [];
    const queryGroupsAttempted: WebSearchQueryGroupId[] = [];
    let selectedQueryGroup: WebSearchQueryGroupId | null = null;
    let recentlyExhausted = false;
    let stoppingReason: WebDiscoveryStoppingReason = 'COMPLETED';

    this.dependencies.onStage?.(
      this.dependencies.scan.cacheStrategy === 'CACHED'
        ? 'READING_CACHED_RESULTS'
        : 'SELECTING_QUERY_GROUP',
    );
    const executions = await this.dependencies.store.listQueryGroupExecutions();
    let groups: readonly WebSearchQueryGroup[];
    if (deep) {
      groups = WEB_SEARCH_QUERY_GROUPS;
    } else {
      const selection = selectDeterministicQueryGroup({
        philippineDate: this.dependencies.philippineDate,
        activeProfileIds: this.dependencies.scan.activeProfileIds,
        executions,
        now: now(),
        cacheStrategy: this.dependencies.scan.cacheStrategy,
        confirmRecentlyExhausted:
          this.dependencies.scan.confirmRecentlyExhausted,
      });
      selectedQueryGroup = selection.queryGroup.id;
      recentlyExhausted = selection.recentlyExhausted;
      if (selection.requiresFreshConfirmation) {
        stoppingReason = 'QUERY_GROUPS_RECENTLY_EXHAUSTED';
        groups = [];
      } else {
        groups = [selection.queryGroup];
      }
    }

    let noNewGroupCount = 0;
    for (const group of groups) {
      if (deep && this.dependencies.scan.deepScanIdempotencyKey &&
        await this.dependencies.store.isDeepScanCancellationRequested(
          this.dependencies.scan.deepScanIdempotencyKey,
        )) {
        stoppingReason = 'CANCELLED';
        break;
      }
      selectedQueryGroup ??= group.id;
      queryGroupsAttempted.push(group.id);
      const groupRunKey = `${this.dependencies.scan.runKey}:${group.id}`;
      if (this.dependencies.scan.cacheStrategy === 'FRESH') {
        await this.dependencies.store.recordQueryGroupSelection({
          runKey: groupRunKey,
          queryGroupId: group.id,
          activeProfileIds: this.dependencies.scan.activeProfileIds,
          cacheStrategy: this.dependencies.scan.cacheStrategy,
          philippineDate: this.dependencies.philippineDate,
          now: now(),
        });
      }
      const tavilyRemaining = (deep ? DEEP_TAVILY_SEARCH_REQUEST_CAP : NORMAL_TAVILY_SEARCH_REQUEST_CAP) -
        tavilyReport.searchRequestsAttempted;
      const geminiRemaining = (deep ? GEMINI_SEARCH_MAX_PROMPTS_DEEP : GEMINI_SEARCH_MAX_PROMPTS_NORMAL) -
        geminiReport.promptsAttempted;
      const beforeUnique = new Set([
        ...tavilyUrls.map((item) => item.url),
        ...geminiUrls.map((item) => item.url),
      ]).size;
      this.dependencies.onStage?.('SEARCHING_TAVILY');
      const tavilyPromise = runTavilySearch({
        intents: group.intents,
        enabled: this.dependencies.tavilyEnabled,
        cacheOnly: this.dependencies.scan.cacheStrategy === 'CACHED',
        apiKey: this.dependencies.tavilyApiKey,
        store: this.dependencies.store,
        caps: this.dependencies.caps,
        philippineDate: this.dependencies.philippineDate,
        now,
        maxRequests: Math.max(0, tavilyRemaining),
        fetchImpl: this.dependencies.fetchImpl,
        timeoutMs: this.dependencies.timeoutMs,
      });
      this.dependencies.onStage?.('SEARCHING_GEMINI');
      const geminiPromise = runGeminiWebSearch({
        intents: group.intents,
        enabled: this.dependencies.geminiSearchEnabled,
        cacheOnly: this.dependencies.scan.cacheStrategy === 'CACHED',
        apiKey: this.dependencies.geminiApiKey,
        model: this.dependencies.geminiSearchModel,
        store: this.dependencies.store,
        caps: this.dependencies.caps,
        philippineDate: this.dependencies.philippineDate,
        now,
        maxPrompts: Math.max(0, geminiRemaining),
        clientFactory: this.dependencies.geminiClientFactory,
      });
      const [tavily, gemini] = await Promise.all([tavilyPromise, geminiPromise]);
      tavilyReport = mergeTavilyReports(tavilyReport, tavily.report);
      geminiReport = mergeGeminiReports(geminiReport, gemini.report);
      tavilyUrls.push(...tavily.urls);
      geminiUrls.push(...gemini.urls);
      const afterUnique = new Set([
        ...tavilyUrls.map((item) => item.url),
        ...geminiUrls.map((item) => item.url),
      ]).size;
      noNewGroupCount = afterUnique === beforeUnique ? noNewGroupCount + 1 : 0;
      if (this.dependencies.scan.cacheStrategy === 'FRESH') {
        await this.dependencies.store.completeQueryGroup({
          runKey: groupRunKey,
          status: 'COMPLETED',
          now: now(),
        });
      }
      if (afterUnique >= uniqueUrlCap) {
        stoppingReason = 'UNIQUE_URL_CAP_REACHED';
        break;
      }
      if (deep && noNewGroupCount >= 2) {
        stoppingReason = 'NO_NEW_UNIQUE_URLS';
        break;
      }
    }
    if (deep && stoppingReason === 'COMPLETED') {
      stoppingReason = 'ALL_QUERY_GROUPS_ATTEMPTED';
    }

    this.dependencies.onStage?.('COMBINING_URLS');
    const combined = deduplicateWebDiscoveryUrls({
      tavily: tavilyUrls,
      gemini: geminiUrls,
      cap: uniqueUrlCap,
    });
    this.dependencies.onStage?.('REMOVING_DUPLICATE_URLS');
    tavilyReport.uniqueUrlsContributed = new Set(
      combined.urls
        .filter((item) => item.attribution !== 'GEMINI_SEARCH')
        .map((item) => item.url),
    ).size;
    geminiReport.uniqueUrlsContributed = new Set(
      combined.urls
        .filter((item) => item.attribution !== 'TAVILY')
        .map((item) => item.url),
    ).size;
    tavilyReport.status = !tavilyReport.enabled
      ? 'DISABLED'
      : finalSourceStatus(
          tavilyReport.searchesCompleted,
          tavilyReport.cacheHits,
          tavilyReport.sourceFailures.length,
          tavilyReport.sourceFailures.some(
            (failure) => failure.code === 'DAILY_CREDIT_LIMIT_REACHED',
          ),
          tavilyReport.sourceFailures.some(
            (failure) => failure.code === 'MONTHLY_CREDIT_LIMIT_REACHED',
          ),
        );
    geminiReport.status = !geminiReport.enabled
      ? 'DISABLED'
      : geminiReport.sourceFailures.some(
      (failure) => failure.code === 'DAILY_PROMPT_LIMIT_REACHED',
    ) && geminiReport.promptsCompleted === 0
      ? 'DAILY_LIMIT_REACHED'
      : geminiReport.promptsCompleted === 0 && geminiReport.cacheHits > 0 &&
          geminiReport.sourceFailures.length === 0
        ? 'CACHED'
        : geminiReport.promptsCompleted === 0 &&
            geminiReport.sourceFailures.length > 0
          ? 'FAILED'
          : geminiReport.sourceFailures.length > 0
            ? 'PARTIAL_FAILURE'
            : 'COMPLETED';

    const jobs: DiscoveredJob[] = [];
    const recoverable: PageAttempt[] = [];
    const failureCounts: WebDiscoveryReport['fetchFailuresByReason'] = {};
    let pagesFetchAttempted = 0;
    let pagesFetchedDirectly = 0;
    let pagesParsedDirectly = 0;
    let pagesRejected = 0;
    let batchesCompleted = 0;
    let directEmployerOrAtsPages = 0;
    const batchSize = deep ? DEEP_WEB_DISCOVERY_BATCH_SIZE : combined.urls.length || 1;
    for (let offset = 0; offset < combined.urls.length; offset += batchSize) {
      if (deep && this.dependencies.scan.deepScanIdempotencyKey &&
        await this.dependencies.store.isDeepScanCancellationRequested(
          this.dependencies.scan.deepScanIdempotencyKey,
        )) {
        stoppingReason = 'CANCELLED';
        break;
      }
      const batch = combined.urls.slice(offset, offset + batchSize);
      this.dependencies.onStage?.('FETCHING_ORIGINAL_PAGES');
      const attempts = await mapWithHostConcurrency(batch, (candidate) =>
        fetchOriginalPage(candidate, this.dependencies),
      );
      pagesFetchAttempted += attempts.length;
      for (const attempt of attempts) {
        if (attempt.directFetched) pagesFetchedDirectly += 1;
        if (attempt.job) {
          jobs.push(attempt.job);
          pagesParsedDirectly += 1;
          if (attempt.candidate.directEmployerOrAts) directEmployerOrAtsPages += 1;
        } else {
          pagesRejected += 1;
          if (attempt.failureReason) {
            failureCounts[attempt.failureReason] =
              (failureCounts[attempt.failureReason] ?? 0) + 1;
          }
          if (attempt.eligibleForExtract && recoverable.length < extractUrlCap) {
            recoverable.push(attempt);
          }
        }
      }
      batchesCompleted += 1;
      this.dependencies.onStage?.('COMPLETING_BATCH');
      if (deep && this.dependencies.scan.deepScanIdempotencyKey) {
        await this.dependencies.store.recordDeepScanCheckpoint({
          runKey: this.dependencies.scan.deepScanIdempotencyKey,
          batchNumber: batchesCompleted,
          urlsAttempted: attempts.length,
          pagesParsed: attempts.filter((attempt) => attempt.job).length,
          pagesRecovered: 0,
          pagesRejected: attempts.filter((attempt) => !attempt.job).length,
        });
      }
    }

    if (this.dependencies.tavilyExtractEnabled && recoverable.length > 0 &&
      stoppingReason !== 'CANCELLED') {
      this.dependencies.onStage?.('RECOVERING_FAILED_PAGES');
      for (let offset = 0; offset < recoverable.length; offset += 5) {
        const attempts = recoverable.slice(offset, offset + 5);
        const extraction = await runTavilyBasicExtract({
          urls: attempts.map((attempt) => attempt.candidate.url),
          apiKey: this.dependencies.tavilyApiKey,
          store: this.dependencies.store,
          caps: this.dependencies.caps,
          philippineDate: this.dependencies.philippineDate,
          now,
          fetchImpl: this.dependencies.fetchImpl,
          timeoutMs: this.dependencies.timeoutMs,
        });
        extractReport = mergeExtractReports(extractReport, extraction.report);
        const candidates = new Map(
          attempts.map((attempt) => [attempt.candidate.url, attempt.candidate]),
        );
        for (const recovered of extraction.recovered) {
          const candidate = candidates.get(recovered.url);
          if (!candidate) continue;
          const job = parseTavilyExtractedJobPage(recovered.content, candidate);
          if (job) {
            jobs.push(job);
            pagesRejected = Math.max(0, pagesRejected - 1);
            extractReport.pagesRecovered += 1;
          } else {
            extractReport.pagesStillRejected += 1;
          }
        }
        if (['DAILY_LIMIT_REACHED', 'MONTHLY_LIMIT_REACHED'].includes(extractReport.status)) {
          break;
        }
      }
    }

    this.dependencies.onStage?.('PARSING_JOB_PAGES');
    const uniqueJobs = new Map<string, DiscoveredJob>();
    for (const job of jobs) {
      if (!uniqueJobs.has(job.sourceUrl)) uniqueJobs.set(job.sourceUrl, job);
    }
    const finalJobs = [...uniqueJobs.values()].slice(0, options.limit);
    const usage = await this.dependencies.store.getUsage({
      philippineDate: this.dependencies.philippineDate,
      caps: this.dependencies.caps,
    });
    tavilyReport.dailyCreditsUsed = usage.tavilyDailyUsed;
    tavilyReport.dailyCreditsReserved = usage.tavilyDailyReserved;
    tavilyReport.dailyCreditsConfirmed = usage.tavilyDailyConfirmed;
    tavilyReport.dailyCreditsRemaining = usage.tavilyDailyRemaining;
    tavilyReport.monthlyCreditsUsed = usage.tavilyMonthlyUsed;
    tavilyReport.monthlyCreditsReserved = usage.tavilyMonthlyReserved;
    tavilyReport.monthlyCreditsConfirmed = usage.tavilyMonthlyConfirmed;
    tavilyReport.monthlyCreditsRemaining = usage.tavilyMonthlyRemaining;
    const webDiscoveryReport: WebDiscoveryReport = {
      scanMode: this.dependencies.scan.scanMode,
      cacheStrategy: this.dependencies.scan.cacheStrategy,
      selectedQueryGroup,
      queryGroupsAttempted,
      queryGroupsRecentlyExhausted: recentlyExhausted,
      uniqueUrlCap,
      stoppingReason,
      tavilySearch: tavilyReport,
      geminiSearch: geminiReport,
      tavilyExtract: extractReport,
      urlsBeforeDeduplication: combined.beforeDeduplication,
      crossSourceDuplicates: combined.duplicates,
      uniqueUrls: combined.urls.length,
      urlsFoundByBothSources: combined.both,
      urlsQueuedForFetch: combined.urls.length,
      uniqueUrlCapReached: combined.capReached,
      pagesFetchAttempted,
      pagesFetchedDirectly,
      pagesParsedDirectly,
      pagesSentToExtract: extractReport.urlsAttempted,
      pagesRecoveredByExtract: extractReport.pagesRecovered,
      pagesRejected,
      fetchFailuresByReason: failureCounts,
      batchesCompleted,
      directEmployerOrAtsPages,
    };

    return {
      sourceRecordsFetched: combined.beforeDeduplication,
      acceptedRecords: finalJobs.length,
      invalidRecords: pagesRejected,
      pagesFetched: pagesFetchedDirectly,
      jobs: finalJobs,
      webDiscoveryReport,
      tavilyFetchReport: {
        searchesAttempted: tavilyReport.searchRequestsAttempted,
        searchesCompleted: tavilyReport.searchesCompleted,
        cacheHits: tavilyReport.cacheHits,
        creditsConsumed: tavilyReport.searchCreditsConsumed,
        dailyCreditsRemaining: tavilyReport.dailyCreditsRemaining,
        urlsDiscovered: tavilyReport.urlsDiscovered,
        uniqueUrls: combined.urls.length,
        originalPagesFetched: pagesFetchedDirectly,
        pagesParsedSuccessfully: finalJobs.length,
        pagesRejected,
        directEmployerOrAtsPages,
        sourceFailures: tavilyReport.sourceFailures,
        dailyLimitReached: tavilyReport.status === 'DAILY_LIMIT_REACHED',
      },
    };
  }
}
