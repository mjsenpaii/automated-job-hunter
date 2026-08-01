import { describe, expect, it, vi } from 'vitest';
import {
  classifyGeminiSearchProviderFailure,
  resolveGeminiSearchModel,
  runGeminiWebSearch,
  type GeminiSearchClientFactory,
} from '../src/adapters/gemini-web-search.server.js';
import { WEB_SEARCH_QUERY_GROUPS } from '../src/discovery/web-search-query-groups.v1.js';
import { createSqliteWebDiscoveryStore } from '../src/discovery/web-discovery-store.js';

const NOW = new Date('2026-08-01T02:00:00.000Z');
const CAPS = { tavilyDaily: 30, tavilyMonthly: 900, geminiSearchDaily: 60 };
const INTENT = WEB_SEARCH_QUERY_GROUPS[0]!.intents[0]!;

async function run(clientFactory: GeminiSearchClientFactory) {
  const store = createSqliteWebDiscoveryStore(':memory:');
  const result = await runGeminiWebSearch({
    intents: [INTENT],
    enabled: true,
    cacheOnly: false,
    apiKey: 'test-only-key',
    model: 'gemini-2.5-flash-lite',
    store,
    caps: CAPS,
    philippineDate: '2026-08-01',
    now: () => NOW,
    maxPrompts: 1,
    clientFactory,
  });
  return { ...result, store };
}

describe('Gemini Google Search adapter', () => {
  it('keeps the search model independent and uses the installed SDK Google Search shape', async () => {
    expect(resolveGeminiSearchModel('gemini-2.5-flash-lite')).toBe(
      'gemini-2.5-flash-lite',
    );
    expect(resolveGeminiSearchModel(undefined)).toBeNull();
    const generateContent = vi.fn(async (request) => {
      expect(request.model).toBe('gemini-2.5-flash-lite');
      expect(request.config.tools).toEqual([{ googleSearch: {} }]);
      expect(request).not.toHaveProperty('GEMINI_MODEL');
      return {
        candidates: [{
          finishReason: 'STOP' as const,
          content: { role: 'model', parts: [{ text: 'Generated answer must be ignored.' }] },
          groundingMetadata: {
            groundingChunks: [{
              web: {
                uri: 'https://jobs.example.com/jobs/123',
                title: 'Grounded job page',
              },
            }],
          },
        }],
        usageMetadata: {
          promptTokenCount: 12,
          candidatesTokenCount: 4,
          totalTokenCount: 16,
        },
      };
    });
    const factory: GeminiSearchClientFactory = () => ({ models: { generateContent } });
    const result = await run(factory);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(result.urls).toEqual([{
      url: 'https://jobs.example.com/jobs/123',
      title: 'Grounded job page',
      directEmployerOrAts: true,
    }]);
    expect(JSON.stringify(result.urls)).not.toContain('Generated answer');
    expect(result.report).toMatchObject({
      promptsAttempted: 1,
      promptsCompleted: 1,
      groundedUrlsFound: 1,
      dailyPromptsUsed: 1,
      inputTokens: 12,
      outputTokens: 4,
      totalTokens: 16,
    });
    result.store.close?.();
  });

  it('returns zero grounded URLs and null token usage when metadata is absent', async () => {
    const factory: GeminiSearchClientFactory = () => ({
      models: { async generateContent() { return { candidates: [{}] }; } },
    });
    const result = await run(factory);
    expect(result.urls).toEqual([]);
    expect(result.report).toMatchObject({
      promptsCompleted: 1,
      groundedUrlsFound: 0,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
    });
    result.store.close?.();
  });

  it('releases failed prompt quota and returns only closed network diagnostics', async () => {
    const providerError = new Error('request transport failed');
    Object.defineProperty(providerError, 'cause', {
      value: { code: 'ENOTFOUND' },
      enumerable: false,
    });
    const factory: GeminiSearchClientFactory = () => ({
      models: { async generateContent() { throw providerError; } },
    });
    const result = await run(factory);
    expect(result.report.sourceFailures).toEqual([{
      source: 'GEMINI_SEARCH',
      promptId: INTENT.id,
      code: 'API_ERROR',
      providerCategory: 'NETWORK_FAILURE',
      providerStatus: null,
      requestReachedProvider: false,
      quotaReserved: true,
      quotaReleased: true,
      groundedUrlsReturned: 0,
    }]);
    expect(result.report).toMatchObject({
      promptsAttempted: 1,
      promptsCompleted: 0,
      dailyPromptsUsed: 0,
      dailyPromptsRemaining: 60,
    });
    expect(JSON.stringify(result.report.sourceFailures)).not.toMatch(
      /transport failed|ENOTFOUND|stack|api.?key/i,
    );
    result.store.close?.();
  });

  it('maps safe provider status without exposing the provider message', () => {
    expect(classifyGeminiSearchProviderFailure({
      status: 404,
      message: 'private model details',
    })).toEqual({
      category: 'MODEL_NOT_FOUND',
      providerStatus: 404,
      requestReachedProvider: true,
    });
    expect(classifyGeminiSearchProviderFailure({
      status: 429,
      message: 'daily quota exhausted',
    })).toEqual({
      category: 'DAILY_QUOTA_EXHAUSTED',
      providerStatus: 429,
      requestReachedProvider: true,
    });
  });
});
