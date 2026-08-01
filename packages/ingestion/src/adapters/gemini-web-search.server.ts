import {
  GoogleGenAI,
  type GenerateContentConfig,
  type GenerateContentResponse,
  type Tool,
} from '@google/genai';
import { z } from 'zod';
import { canonicalizeTavilyJobUrl, isDirectEmployerOrAtsJobUrl } from './tavily.js';
import type { WebSearchIntent } from '../discovery/web-search-query-groups.v1.js';
import {
  normalizeWebSearchRequest,
  type WebDiscoveryCachedUrl,
  type WebDiscoveryQuotaCaps,
  type WebDiscoveryStore,
} from '../discovery/web-discovery-store.js';
import type {
  GeminiSearchProviderFailureCategory,
} from '../discovery/gemini-search-contracts.js';

export const GEMINI_SEARCH_MAX_PROMPTS_NORMAL = 8 as const;
export const GEMINI_SEARCH_MAX_PROMPTS_DEEP = 40 as const;

export type GeminiSearchSafeFailureCode =
  | 'MISSING_API_KEY'
  | 'MISSING_MODEL_CONFIGURATION'
  | 'DAILY_PROMPT_LIMIT_REACHED'
  | 'PROMPT_IN_FLIGHT'
  | 'API_ERROR'
  | 'INVALID_RESPONSE'
  | 'UNKNOWN_SAFE_ERROR';

export interface GeminiSearchFailure {
  source: 'GEMINI_SEARCH';
  promptId: string;
  code: GeminiSearchSafeFailureCode;
  providerCategory: GeminiSearchProviderFailureCategory;
  providerStatus: number | null;
  requestReachedProvider: boolean;
  quotaReserved: boolean;
  quotaReleased: boolean;
  groundedUrlsReturned: number;
}

export interface GeminiSearchUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface GeminiSearchReport {
  enabled: boolean;
  status:
    | 'DISABLED'
    | 'COMPLETED'
    | 'PARTIAL_FAILURE'
    | 'FAILED'
    | 'CACHED'
    | 'DAILY_LIMIT_REACHED';
  promptsAttempted: number;
  promptsCompleted: number;
  cacheHits: number;
  groundedResponses: number;
  groundedUrlsFound: number;
  uniqueUrlsContributed: number;
  dailyPromptsUsed: number;
  dailyPromptsRemaining: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  sourceFailures: GeminiSearchFailure[];
}

type GeminiSearchResponseLike = Pick<
  GenerateContentResponse,
  'candidates' | 'usageMetadata'
>;

type GeminiSearchGenerateConfig = Pick<
  GenerateContentConfig,
  'tools' | 'temperature' | 'maxOutputTokens'
>;

export interface GeminiSearchClient {
  models: {
    generateContent(options: {
      model: string;
      contents: string;
      config: GeminiSearchGenerateConfig;
    }): Promise<GeminiSearchResponseLike>;
  };
}

export type GeminiSearchClientFactory = (apiKey: string) => GeminiSearchClient;

const UsageCountSchema = z.number().int().nonnegative();
const GOOGLE_SEARCH_TOOL = { googleSearch: {} } satisfies Tool;

function failure(options: {
  promptId: string;
  code: GeminiSearchSafeFailureCode;
  providerCategory: GeminiSearchProviderFailureCategory;
  providerStatus?: number | null;
  requestReachedProvider?: boolean;
  quotaReserved?: boolean;
  quotaReleased?: boolean;
  groundedUrlsReturned?: number;
}): GeminiSearchFailure {
  return {
    source: 'GEMINI_SEARCH',
    promptId: options.promptId,
    code: options.code,
    providerCategory: options.providerCategory,
    providerStatus: options.providerStatus ?? null,
    requestReachedProvider: options.requestReachedProvider ?? false,
    quotaReserved: options.quotaReserved ?? false,
    quotaReleased: options.quotaReleased ?? false,
    groundedUrlsReturned: options.groundedUrlsReturned ?? 0,
  };
}

function safeProviderStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('status' in error)) return null;
  const parsed = z.number().int().min(400).max(599).safeParse(error.status);
  return parsed.success ? parsed.data : null;
}

function safeErrorClassificationText(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const values: string[] = [];
  if ('name' in error && typeof error.name === 'string') values.push(error.name);
  if ('message' in error && typeof error.message === 'string') values.push(error.message);
  if ('code' in error && typeof error.code === 'string') values.push(error.code);
  if ('cause' in error && error.cause && typeof error.cause === 'object') {
    if ('code' in error.cause && typeof error.cause.code === 'string') {
      values.push(error.cause.code);
    }
    if ('name' in error.cause && typeof error.cause.name === 'string') {
      values.push(error.cause.name);
    }
  }
  // Used only for closed classification; never returned, stored, or logged.
  return values.join(' ').toLocaleLowerCase().slice(0, 2_000);
}

export function classifyGeminiSearchProviderFailure(error: unknown): {
  category: GeminiSearchProviderFailureCategory;
  providerStatus: number | null;
  requestReachedProvider: boolean;
} {
  const providerStatus = safeProviderStatus(error);
  const text = safeErrorClassificationText(error);
  let category: GeminiSearchProviderFailureCategory = 'UNKNOWN_PROVIDER_FAILURE';
  if (providerStatus === 401 || /unauthenticated|authentication|api key.*invalid/.test(text)) {
    category = 'AUTHENTICATION_FAILED';
  } else if (/billing|free tier|pay.?as.?you.?go|plan restriction/.test(text)) {
    category = 'FREE_TIER_OR_BILLING_RESTRICTION';
  } else if (providerStatus === 404 || /model.*not found|not found.*model/.test(text)) {
    category = 'MODEL_NOT_FOUND';
  } else if (/model.*not available|model.*unsupported|not supported for.*model/.test(text)) {
    category = 'MODEL_NOT_AVAILABLE_FOR_ACCOUNT';
  } else if (/google search.*not supported|tool.*not supported|unsupported.*google search/.test(text)) {
    category = 'GOOGLE_SEARCH_TOOL_UNSUPPORTED';
  } else if (providerStatus === 429 && /daily|quota.*exhaust|quota.*exceed/.test(text)) {
    category = 'DAILY_QUOTA_EXHAUSTED';
  } else if (providerStatus === 429) {
    category = 'RATE_LIMITED';
  } else if (providerStatus === 400) {
    category = 'INVALID_REQUEST_SHAPE';
  } else if (/safety|blocked/.test(text)) {
    category = 'SAFETY_BLOCKED';
  } else if (/abort|timeout|etimedout/.test(text)) {
    category = 'TIMEOUT';
  } else if (
    /fetch failed|network|econn|enotfound|socket|tls|certificate|undici/.test(text) ||
    (error instanceof TypeError && providerStatus === null)
  ) {
    category = 'NETWORK_FAILURE';
  } else if (/serialize|transform|sdk|client validation/.test(text)) {
    category = 'SDK_VERSION_INCOMPATIBLE';
  }
  return {
    category,
    providerStatus,
    requestReachedProvider: providerStatus !== null,
  };
}

function usageFromResponse(
  response: GeminiSearchResponseLike,
): GeminiSearchUsage {
  const metadata = response.usageMetadata;
  const safe = (value: unknown): number | null => {
    const parsed = UsageCountSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  };
  return {
    inputTokens: safe(metadata?.promptTokenCount),
    outputTokens: safe(metadata?.candidatesTokenCount),
    totalTokens: safe(metadata?.totalTokenCount),
  };
}

function addUsage(
  aggregate: GeminiSearchUsage,
  next: GeminiSearchUsage,
): GeminiSearchUsage {
  const add = (left: number | null, right: number | null) =>
    left === null || right === null ? null : left + right;
  return {
    inputTokens: add(aggregate.inputTokens, next.inputTokens),
    outputTokens: add(aggregate.outputTokens, next.outputTokens),
    totalTokens: add(aggregate.totalTokens, next.totalTokens),
  };
}

function groundedUrls(
  response: GeminiSearchResponseLike,
): WebDiscoveryCachedUrl[] {
  const urls = new Map<string, WebDiscoveryCachedUrl>();
  for (const candidate of response.candidates ?? []) {
    for (const chunk of candidate.groundingMetadata?.groundingChunks ?? []) {
      const rawUrl = chunk.web?.uri;
      if (!rawUrl) continue;
      const url = canonicalizeTavilyJobUrl(rawUrl);
      if (!url || urls.has(url)) continue;
      urls.set(url, {
        url,
        title: chunk.web?.title?.trim().slice(0, 500) || 'Grounded web result',
        directEmployerOrAts: isDirectEmployerOrAtsJobUrl(url),
      });
    }
  }
  return [...urls.values()];
}

export function buildGeminiSearchPrompt(intent: WebSearchIntent): string {
  return [
    'Use Google Search to find currently published public job vacancy pages.',
    `Search intent: ${intent.geminiPromptIntent}`,
    'Prefer a specific employer or public ATS job posting URL.',
    'Do not use login, account, search-result, generic careers, or application-submission pages.',
    'The response text will be ignored; only grounded source URLs are collected.',
  ].join('\n');
}

export function resolveGeminiSearchModel(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 && trimmed.length <= 100 ? trimmed : null;
}

export async function runGeminiWebSearch(options: {
  intents: readonly WebSearchIntent[];
  enabled: boolean;
  cacheOnly: boolean;
  apiKey: string;
  model: string | null;
  store: WebDiscoveryStore;
  caps: WebDiscoveryQuotaCaps;
  philippineDate: string;
  now: () => Date;
  maxPrompts: number;
  clientFactory?: GeminiSearchClientFactory;
}): Promise<{ urls: WebDiscoveryCachedUrl[]; report: GeminiSearchReport }> {
  const initialUsage = await options.store.getUsage({
    philippineDate: options.philippineDate,
    caps: options.caps,
  });
  const report: GeminiSearchReport = {
    enabled: options.enabled,
    status: options.enabled ? 'FAILED' : 'DISABLED',
    promptsAttempted: 0,
    promptsCompleted: 0,
    cacheHits: 0,
    groundedResponses: 0,
    groundedUrlsFound: 0,
    uniqueUrlsContributed: 0,
    dailyPromptsUsed: initialUsage.geminiSearchDailyUsed,
    dailyPromptsRemaining: initialUsage.geminiSearchDailyRemaining,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    sourceFailures: [],
  };
  if (!options.enabled) return { urls: [], report };
  if (!options.apiKey.trim()) {
    report.sourceFailures.push(failure({
      promptId: 'configuration',
      code: 'MISSING_API_KEY',
      providerCategory: 'API_KEY_MISSING',
    }));
    return { urls: [], report };
  }
  if (!options.model) {
    report.sourceFailures.push(failure({
      promptId: 'configuration',
      code: 'MISSING_MODEL_CONFIGURATION',
      providerCategory: 'MODEL_NOT_FOUND',
    }));
    return { urls: [], report };
  }

  const client = options.clientFactory
    ? options.clientFactory(options.apiKey)
    : new GoogleGenAI({ apiKey: options.apiKey });
  const discovered: WebDiscoveryCachedUrl[] = [];
  let usage: GeminiSearchUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
  for (const intent of options.intents.slice(0, options.maxPrompts)) {
    const prompt = buildGeminiSearchPrompt(intent);
    const normalizedRequest = normalizeWebSearchRequest(
      `${options.model}\n${prompt}`,
    );
    const reservation = await options.store.reserveSearch({
      provider: 'GEMINI_SEARCH',
      operation: 'PROMPT',
      normalizedRequest,
      cacheOnly: options.cacheOnly,
      philippineDate: options.philippineDate,
      now: options.now(),
      caps: options.caps,
    });
    report.dailyPromptsUsed = reservation.usage.geminiSearchDailyUsed;
    report.dailyPromptsRemaining =
      reservation.usage.geminiSearchDailyRemaining;
    if (reservation.status === 'CACHE_HIT') {
      report.cacheHits += 1;
      report.promptsCompleted += 1;
      discovered.push(...reservation.urls);
      continue;
    }
    if (reservation.status === 'CACHE_MISS') continue;
    if (reservation.status === 'IN_FLIGHT') {
      report.sourceFailures.push(failure({
        promptId: intent.id,
        code: 'PROMPT_IN_FLIGHT',
        providerCategory: 'UNKNOWN_PROVIDER_FAILURE',
      }));
      continue;
    }
    if (reservation.status === 'DAILY_LIMIT_REACHED') {
      report.sourceFailures.push(failure({
        promptId: intent.id,
        code: 'DAILY_PROMPT_LIMIT_REACHED',
        providerCategory: 'DAILY_QUOTA_EXHAUSTED',
      }));
      break;
    }
    if (reservation.status === 'MONTHLY_LIMIT_REACHED') {
      report.sourceFailures.push(failure({
        promptId: intent.id,
        code: 'UNKNOWN_SAFE_ERROR',
        providerCategory: 'UNKNOWN_PROVIDER_FAILURE',
      }));
      break;
    }
    if (reservation.status !== 'RESERVED') continue;

    report.promptsAttempted += 1;
    try {
      const response = await client.models.generateContent({
        model: options.model,
        contents: prompt,
        config: {
          tools: [GOOGLE_SEARCH_TOOL],
          temperature: 0,
          maxOutputTokens: 256,
        },
      });
      const urls = groundedUrls(response);
      const responseUsage = usageFromResponse(response);
      usage = addUsage(usage, responseUsage);
      if (urls.length > 0) report.groundedResponses += 1;
      report.groundedUrlsFound += urls.length;
      await options.store.completeSearch({
        provider: 'GEMINI_SEARCH',
        normalizedRequest,
        reservationToken: reservation.reservationToken,
        urls,
        now: options.now(),
      });
      report.promptsCompleted += 1;
      discovered.push(...urls);
    } catch (error) {
      usage = addUsage(usage, {
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
      });
      let quotaReleased = false;
      try {
        await options.store.failSearch({
          provider: 'GEMINI_SEARCH',
          normalizedRequest,
          reservationToken: reservation.reservationToken,
          now: options.now(),
        });
        quotaReleased = true;
      } catch {
        quotaReleased = false;
      }
      const classified = classifyGeminiSearchProviderFailure(error);
      report.sourceFailures.push(failure({
        promptId: intent.id,
        code: 'API_ERROR',
        providerCategory: classified.category,
        providerStatus: classified.providerStatus,
        requestReachedProvider: classified.requestReachedProvider,
        quotaReserved: true,
        quotaReleased,
      }));
    }
  }

  const finalUsage = await options.store.getUsage({
    philippineDate: options.philippineDate,
    caps: options.caps,
  });
  report.dailyPromptsUsed = finalUsage.geminiSearchDailyUsed;
  report.dailyPromptsRemaining = finalUsage.geminiSearchDailyRemaining;
  report.inputTokens = report.promptsAttempted === 0 ? 0 : usage.inputTokens;
  report.outputTokens = report.promptsAttempted === 0 ? 0 : usage.outputTokens;
  report.totalTokens = report.promptsAttempted === 0 ? 0 : usage.totalTokens;
  const unique = new Map(discovered.map((item) => [item.url, item]));
  report.uniqueUrlsContributed = unique.size;
  report.status = report.sourceFailures.some(
    (failure) => failure.code === 'DAILY_PROMPT_LIMIT_REACHED',
  ) && report.promptsCompleted === 0
    ? 'DAILY_LIMIT_REACHED'
    : report.promptsCompleted === 0 && report.cacheHits === 0
      ? report.sourceFailures.length > 0 ? 'FAILED' : 'CACHED'
      : report.sourceFailures.length > 0
        ? 'PARTIAL_FAILURE'
        : report.promptsAttempted === 0 && report.cacheHits > 0
          ? 'CACHED'
          : 'COMPLETED';
  return { urls: [...unique.values()], report };
}
