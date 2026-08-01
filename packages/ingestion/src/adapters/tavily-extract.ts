import { z } from 'zod';
import {
  TAVILY_USER_AGENT,
  canonicalizeTavilyJobUrl,
} from './tavily.js';
import type {
  WebDiscoveryQuotaCaps,
  WebDiscoveryStore,
} from '../discovery/web-discovery-store.js';

export const TAVILY_EXTRACT_API_URL = 'https://api.tavily.com/extract';
export const TAVILY_EXTRACT_BATCH_SIZE = 5 as const;

const TavilyExtractResultSchema = z
  .object({
    url: z.string().url(),
    raw_content: z.string().min(1),
  })
  .passthrough();

const TavilyExtractEnvelopeSchema = z
  .object({
    results: z.array(TavilyExtractResultSchema).max(TAVILY_EXTRACT_BATCH_SIZE),
    failed_results: z
      .array(z.object({ url: z.string().url() }).passthrough())
      .max(TAVILY_EXTRACT_BATCH_SIZE),
    usage: z.object({ credits: z.number().int().min(0).max(1) }).strict(),
  })
  .passthrough();

export type TavilyExtractFailureCode =
  | 'TAVILY_DAILY_CREDIT_LIMIT_REACHED'
  | 'TAVILY_MONTHLY_CREDIT_LIMIT_REACHED'
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'MALFORMED_JSON'
  | 'SOURCE_SCHEMA_CHANGED'
  | 'NETWORK_ERROR';

export interface TavilyExtractReport {
  enabled: boolean;
  status:
    | 'DISABLED'
    | 'COMPLETED'
    | 'PARTIAL_FAILURE'
    | 'FAILED'
    | 'DAILY_LIMIT_REACHED'
    | 'MONTHLY_LIMIT_REACHED';
  urlsAttempted: number;
  successfulExtractions: number;
  failedExtractions: number;
  pagesRecovered: number;
  pagesStillRejected: number;
  creditsConsumed: number;
  sourceFailures: Array<{ code: TavilyExtractFailureCode }>;
}

export interface TavilyExtractRecoveredPage {
  url: string;
  content: string;
}

export async function runTavilyBasicExtract(options: {
  urls: readonly string[];
  apiKey: string;
  store: WebDiscoveryStore;
  caps: WebDiscoveryQuotaCaps;
  philippineDate: string;
  now: () => Date;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<{
  recovered: TavilyExtractRecoveredPage[];
  report: TavilyExtractReport;
}> {
  const report: TavilyExtractReport = {
    enabled: true,
    status: 'FAILED',
    urlsAttempted: 0,
    successfulExtractions: 0,
    failedExtractions: 0,
    pagesRecovered: 0,
    pagesStillRejected: 0,
    creditsConsumed: 0,
    sourceFailures: [],
  };
  if (!options.apiKey.trim()) {
    report.sourceFailures.push({ code: 'NETWORK_ERROR' });
    return { recovered: [], report };
  }
  const safeUrls = [...new Set(options.urls.flatMap((rawUrl) => {
    const url = canonicalizeTavilyJobUrl(rawUrl);
    return url ? [url] : [];
  }))].slice(0, TAVILY_EXTRACT_BATCH_SIZE);
  if (safeUrls.length === 0) {
    report.status = 'COMPLETED';
    return { recovered: [], report };
  }

  const reservation = await options.store.reserveUsage({
    provider: 'TAVILY',
    operation: 'EXTRACT',
    cacheKey: null,
    units: 1,
    philippineDate: options.philippineDate,
    now: options.now(),
    caps: options.caps,
  });
  if (reservation.status !== 'RESERVED') {
    const code = reservation.status === 'DAILY_LIMIT_REACHED'
      ? 'TAVILY_DAILY_CREDIT_LIMIT_REACHED'
      : 'TAVILY_MONTHLY_CREDIT_LIMIT_REACHED';
    report.status = reservation.status === 'DAILY_LIMIT_REACHED'
      ? 'DAILY_LIMIT_REACHED'
      : 'MONTHLY_LIMIT_REACHED';
    report.sourceFailures.push({ code });
    return { recovered: [], report };
  }

  report.urlsAttempted = safeUrls.length;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 10_000,
  );
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(TAVILY_EXTRACT_API_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
        'User-Agent': TAVILY_USER_AGENT,
      },
      body: JSON.stringify({
        urls: safeUrls,
        extract_depth: 'basic',
        include_images: false,
        include_favicon: false,
        format: 'markdown',
        timeout: 10,
        include_usage: true,
      }),
      redirect: 'error',
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    await options.store.releaseUsage({
      reservationToken: reservation.reservationToken,
      now: options.now(),
    });
    report.failedExtractions = safeUrls.length;
    report.pagesStillRejected = safeUrls.length;
    report.sourceFailures.push({
      code: controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
    });
    return { recovered: [], report };
  }
  clearTimeout(timer);
  if (!response.ok) {
    await options.store.releaseUsage({
      reservationToken: reservation.reservationToken,
      now: options.now(),
    });
    report.failedExtractions = safeUrls.length;
    report.pagesStillRejected = safeUrls.length;
    report.sourceFailures.push({ code: 'HTTP_ERROR' });
    return { recovered: [], report };
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    await options.store.releaseUsage({
      reservationToken: reservation.reservationToken,
      now: options.now(),
    });
    report.failedExtractions = safeUrls.length;
    report.pagesStillRejected = safeUrls.length;
    report.sourceFailures.push({ code: 'MALFORMED_JSON' });
    return { recovered: [], report };
  }
  const parsed = TavilyExtractEnvelopeSchema.safeParse(payload);
  if (!parsed.success) {
    await options.store.releaseUsage({
      reservationToken: reservation.reservationToken,
      now: options.now(),
    });
    report.failedExtractions = safeUrls.length;
    report.pagesStillRejected = safeUrls.length;
    report.sourceFailures.push({ code: 'SOURCE_SCHEMA_CHANGED' });
    return { recovered: [], report };
  }

  await options.store.completeUsage({
    reservationToken: reservation.reservationToken,
    consumedUnits: parsed.data.usage.credits,
    now: options.now(),
  });
  report.creditsConsumed = parsed.data.usage.credits;
  const recovered = parsed.data.results.flatMap((result) => {
    const url = canonicalizeTavilyJobUrl(result.url);
    return url ? [{ url, content: result.raw_content }] : [];
  });
  report.successfulExtractions = recovered.length;
  report.failedExtractions = Math.max(0, safeUrls.length - recovered.length);
  // Recovery is counted only after the caller validates attributable job data.
  report.pagesRecovered = 0;
  report.pagesStillRejected = report.failedExtractions;
  report.status = report.failedExtractions > 0
    ? recovered.length > 0 ? 'PARTIAL_FAILURE' : 'FAILED'
    : 'COMPLETED';
  return { recovered, report };
}
