import { createHash, randomUUID } from 'node:crypto';
import { createDatabase } from '@job-app/db';
import { z } from 'zod';
import {
  WEB_SEARCH_QUERY_CACHE_TTL_MS,
  WEB_SEARCH_QUERY_GROUP_IDS,
  type QueryGroupExecution,
  type WebSearchQueryGroupId,
} from './web-search-query-groups.v1.js';
import { DEEP_SCAN_COOLDOWN_MS } from './limits.js';
export { DEEP_SCAN_COOLDOWN_MS } from './limits.js';

export const DEFAULT_TAVILY_DAILY_CREDIT_CAP = 30 as const;
export const DEFAULT_TAVILY_MONTHLY_CREDIT_CAP = 900 as const;
export const DEFAULT_GEMINI_SEARCH_DAILY_PROMPT_CAP = 60 as const;
const RESERVATION_TTL_MS = 2 * 60 * 1_000;

export const WebDiscoveryCachedUrlSchema = z
  .object({
    url: z.string().url(),
    title: z.string().trim().min(1).max(500),
    directEmployerOrAts: z.boolean(),
  })
  .strict();
export type WebDiscoveryCachedUrl = z.infer<
  typeof WebDiscoveryCachedUrlSchema
>;

const WebDiscoveryCachedUrlListSchema = z
  .array(WebDiscoveryCachedUrlSchema)
  .max(50);

export type WebDiscoveryProvider = 'TAVILY' | 'GEMINI_SEARCH';
export type WebDiscoveryOperation = 'SEARCH' | 'EXTRACT' | 'PROMPT';

export interface WebDiscoveryQuotaCaps {
  tavilyDaily: number;
  tavilyMonthly: number;
  geminiSearchDaily: number;
}

export interface WebDiscoveryUsageSnapshot {
  tavilyDailyUsed: number;
  tavilyDailyReserved: number;
  tavilyDailyConfirmed: number;
  tavilyDailyRemaining: number;
  tavilyMonthlyUsed: number;
  tavilyMonthlyReserved: number;
  tavilyMonthlyConfirmed: number;
  tavilyMonthlyRemaining: number;
  geminiSearchDailyUsed: number;
  geminiSearchDailyReserved: number;
  geminiSearchDailyConfirmed: number;
  geminiSearchDailyRemaining: number;
  tavilySearchCredits: number;
  tavilyExtractCredits: number;
}

export type WebSearchReservation =
  | {
      status: 'CACHE_HIT';
      urls: WebDiscoveryCachedUrl[];
      usage: WebDiscoveryUsageSnapshot;
    }
  | { status: 'CACHE_MISS'; usage: WebDiscoveryUsageSnapshot }
  | {
      status: 'RESERVED';
      reservationToken: string;
      usage: WebDiscoveryUsageSnapshot;
    }
  | { status: 'IN_FLIGHT'; usage: WebDiscoveryUsageSnapshot }
  | {
      status: 'DAILY_LIMIT_REACHED' | 'MONTHLY_LIMIT_REACHED';
      usage: WebDiscoveryUsageSnapshot;
    };

export type WebUsageReservation =
  | {
      status: 'RESERVED';
      reservationToken: string;
      usage: WebDiscoveryUsageSnapshot;
    }
  | {
      status: 'DAILY_LIMIT_REACHED' | 'MONTHLY_LIMIT_REACHED';
      usage: WebDiscoveryUsageSnapshot;
    };

export interface DeepScanStartResult {
  status: 'STARTED' | 'ALREADY_COMPLETED' | 'ALREADY_ACTIVE' | 'COOLDOWN';
  eligibleAgainAt: string | null;
}

export interface WebDiscoveryStore {
  reserveSearch(options: {
    provider: 'TAVILY' | 'GEMINI_SEARCH';
    operation: 'SEARCH' | 'PROMPT';
    normalizedRequest: string;
    cacheOnly: boolean;
    philippineDate: string;
    now: Date;
    caps: WebDiscoveryQuotaCaps;
  }): Promise<WebSearchReservation>;
  completeSearch(options: {
    provider: 'TAVILY' | 'GEMINI_SEARCH';
    normalizedRequest: string;
    reservationToken: string;
    urls: WebDiscoveryCachedUrl[];
    now: Date;
  }): Promise<void>;
  failSearch(options: {
    provider: 'TAVILY' | 'GEMINI_SEARCH';
    normalizedRequest: string;
    reservationToken: string;
    now: Date;
  }): Promise<void>;
  reserveUsage(options: {
    provider: WebDiscoveryProvider;
    operation: WebDiscoveryOperation;
    cacheKey: string | null;
    units: number;
    philippineDate: string;
    now: Date;
    caps: WebDiscoveryQuotaCaps;
  }): Promise<WebUsageReservation>;
  completeUsage(options: {
    reservationToken: string;
    consumedUnits: number;
    now: Date;
  }): Promise<void>;
  releaseUsage(options: {
    reservationToken: string;
    now: Date;
  }): Promise<void>;
  getUsage(options: {
    philippineDate: string;
    caps: WebDiscoveryQuotaCaps;
  }): Promise<WebDiscoveryUsageSnapshot>;
  listQueryGroupExecutions(): Promise<QueryGroupExecution[]>;
  recordQueryGroupSelection(options: {
    runKey: string;
    queryGroupId: WebSearchQueryGroupId;
    activeProfileIds: readonly string[];
    cacheStrategy: 'CACHED' | 'FRESH';
    philippineDate: string;
    now: Date;
  }): Promise<void>;
  completeQueryGroup(options: {
    runKey: string;
    status: 'COMPLETED' | 'FAILED' | 'CANCELLED';
    now: Date;
  }): Promise<void>;
  beginDeepScan(options: {
    idempotencyKey: string;
    triggerRunId: string;
    philippineDate: string;
    verifyAndSave: boolean;
    now: Date;
  }): Promise<DeepScanStartResult>;
  getDeepScanEligibility(now: Date): Promise<{
    eligible: boolean;
    eligibleAgainAt: string | null;
  }>;
  requestDeepScanCancellation(triggerRunId: string): Promise<boolean>;
  isDeepScanCancellationRequested(idempotencyKey: string): Promise<boolean>;
  recordDeepScanCheckpoint(options: {
    runKey: string;
    batchNumber: number;
    urlsAttempted: number;
    pagesParsed: number;
    pagesRecovered: number;
    pagesRejected: number;
  }): Promise<void>;
  completeDeepScan(options: {
    idempotencyKey: string;
    state: 'COMPLETED' | 'FAILED' | 'CANCELLED';
    stoppingReason: string;
    now: Date;
  }): Promise<void>;
  cleanup(now: Date): Promise<void>;
  close?(): void;
}

export function normalizeWebSearchRequest(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

export function webSearchCacheKey(value: string): string {
  return createHash('sha256')
    .update(normalizeWebSearchRequest(value))
    .digest('hex');
}

export function parsePositiveQuota(
  value: string | undefined,
  fallback: number,
  maximum: number,
): number {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum
    ? parsed
    : fallback;
}

export function resolveWebDiscoveryQuotaCaps(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): WebDiscoveryQuotaCaps {
  return {
    tavilyDaily: parsePositiveQuota(
      environment.JOB_DISCOVERY_TAVILY_DAILY_CREDIT_CAP,
      DEFAULT_TAVILY_DAILY_CREDIT_CAP,
      100,
    ),
    tavilyMonthly: parsePositiveQuota(
      environment.JOB_DISCOVERY_TAVILY_MONTHLY_CREDIT_CAP,
      DEFAULT_TAVILY_MONTHLY_CREDIT_CAP,
      10_000,
    ),
    geminiSearchDaily: parsePositiveQuota(
      environment.JOB_DISCOVERY_GEMINI_SEARCH_DAILY_PROMPT_CAP,
      DEFAULT_GEMINI_SEARCH_DAILY_PROMPT_CAP,
      500,
    ),
  };
}

interface CacheRow {
  state: 'IN_FLIGHT' | 'READY' | 'FAILED';
  result_json: string | null;
  expires_at: string | null;
  reserved_until: string | null;
}

interface UsageCounts {
  tavilyDailyUsed: number;
  tavilyDailyReserved: number;
  tavilyDailyConfirmed: number;
  tavilyMonthlyUsed: number;
  tavilyMonthlyReserved: number;
  tavilyMonthlyConfirmed: number;
  geminiSearchDailyUsed: number;
  geminiSearchDailyReserved: number;
  geminiSearchDailyConfirmed: number;
  tavilySearchCredits: number;
  tavilyExtractCredits: number;
}

function monthOf(philippineDate: string): string {
  return philippineDate.slice(0, 7);
}

function usageCounts(
  sqlite: ReturnType<typeof createDatabase>,
  philippineDate: string,
): UsageCounts {
  const philippineMonth = monthOf(philippineDate);
  const rows = sqlite
    .prepare(
      `SELECT provider, operation, philippine_date, philippine_month,
              COALESCE(SUM(CASE WHEN state = 'RESERVED'
                                THEN counted_units ELSE 0 END), 0)
                AS reserved_units,
              COALESCE(SUM(CASE WHEN state = 'COMPLETED'
                                THEN consumed_units ELSE 0 END), 0)
                AS consumed_units
       FROM web_discovery_usage_ledger
       WHERE reservation_token NOT LIKE 'legacy-tavily-search:%'
         AND ((provider = 'TAVILY' AND (
                 philippine_date = ? OR philippine_month = ?
              )) OR (provider = 'GEMINI_SEARCH' AND philippine_date = ?))
       GROUP BY provider, operation, philippine_date, philippine_month`,
    )
    .all(philippineDate, philippineMonth, philippineDate) as Array<{
      provider: WebDiscoveryProvider;
      operation: WebDiscoveryOperation;
      philippine_date: string;
      philippine_month: string;
      reserved_units: number;
      consumed_units: number;
    }>;
  let tavilyDailyUsed = 0;
  let tavilyDailyReserved = 0;
  let tavilyDailyConfirmed = 0;
  let tavilyMonthlyUsed = 0;
  let tavilyMonthlyReserved = 0;
  let tavilyMonthlyConfirmed = 0;
  let geminiSearchDailyUsed = 0;
  let geminiSearchDailyReserved = 0;
  let geminiSearchDailyConfirmed = 0;
  let tavilySearchCredits = 0;
  let tavilyExtractCredits = 0;
  for (const row of rows) {
    const used = row.reserved_units + row.consumed_units;
    if (row.provider === 'TAVILY') {
      if (row.philippine_date === philippineDate) {
        tavilyDailyUsed += used;
        tavilyDailyReserved += row.reserved_units;
        tavilyDailyConfirmed += row.consumed_units;
        if (row.operation === 'SEARCH') {
          tavilySearchCredits += row.consumed_units;
        }
        if (row.operation === 'EXTRACT') {
          tavilyExtractCredits += row.consumed_units;
        }
      }
      if (row.philippine_month === philippineMonth) {
        tavilyMonthlyUsed += used;
        tavilyMonthlyReserved += row.reserved_units;
        tavilyMonthlyConfirmed += row.consumed_units;
      }
    } else if (row.philippine_date === philippineDate) {
      geminiSearchDailyUsed += used;
      geminiSearchDailyReserved += row.reserved_units;
      geminiSearchDailyConfirmed += row.consumed_units;
    }
  }
  return {
    tavilyDailyUsed,
    tavilyDailyReserved,
    tavilyDailyConfirmed,
    tavilyMonthlyUsed,
    tavilyMonthlyReserved,
    tavilyMonthlyConfirmed,
    geminiSearchDailyUsed,
    geminiSearchDailyReserved,
    geminiSearchDailyConfirmed,
    tavilySearchCredits,
    tavilyExtractCredits,
  };
}

function usageSnapshot(
  counts: UsageCounts,
  caps: WebDiscoveryQuotaCaps,
): WebDiscoveryUsageSnapshot {
  return {
    ...counts,
    tavilyDailyRemaining: Math.max(0, caps.tavilyDaily - counts.tavilyDailyUsed),
    tavilyMonthlyRemaining: Math.max(
      0,
      caps.tavilyMonthly - counts.tavilyMonthlyUsed,
    ),
    geminiSearchDailyRemaining: Math.max(
      0,
      caps.geminiSearchDaily - counts.geminiSearchDailyUsed,
    ),
  };
}

function reserveUsageSync(
  sqlite: ReturnType<typeof createDatabase>,
  options: {
    provider: WebDiscoveryProvider;
    operation: WebDiscoveryOperation;
    cacheKey: string | null;
    units: number;
    philippineDate: string;
    now: Date;
    caps: WebDiscoveryQuotaCaps;
  },
): WebUsageReservation {
  const before = usageCounts(sqlite, options.philippineDate);
  const beforeSnapshot = usageSnapshot(before, options.caps);
  if (
    options.provider === 'TAVILY' &&
    before.tavilyDailyUsed + options.units > options.caps.tavilyDaily
  ) {
    return { status: 'DAILY_LIMIT_REACHED', usage: beforeSnapshot };
  }
  if (
    options.provider === 'TAVILY' &&
    before.tavilyMonthlyUsed + options.units > options.caps.tavilyMonthly
  ) {
    return { status: 'MONTHLY_LIMIT_REACHED', usage: beforeSnapshot };
  }
  if (
    options.provider === 'GEMINI_SEARCH' &&
    before.geminiSearchDailyUsed + options.units >
      options.caps.geminiSearchDaily
  ) {
    return { status: 'DAILY_LIMIT_REACHED', usage: beforeSnapshot };
  }
  const reservationToken = randomUUID();
  sqlite
    .prepare(
      `INSERT INTO web_discovery_usage_ledger (
         reservation_token, provider, operation, philippine_date,
         philippine_month, cache_key, counted_units, consumed_units,
         daily_cap, monthly_cap, state, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'RESERVED', ?, ?)`,
    )
    .run(
      reservationToken,
      options.provider,
      options.operation,
      options.philippineDate,
      monthOf(options.philippineDate),
      options.cacheKey,
      options.units,
      options.provider === 'TAVILY'
        ? options.caps.tavilyDaily
        : options.caps.geminiSearchDaily,
      options.provider === 'TAVILY' ? options.caps.tavilyMonthly : null,
      options.now.toISOString(),
      options.now.toISOString(),
    );
  const after = usageSnapshot(
    usageCounts(sqlite, options.philippineDate),
    options.caps,
  );
  return { status: 'RESERVED', reservationToken, usage: after };
}

function parseCachedUrls(value: string | null): WebDiscoveryCachedUrl[] | null {
  if (!value) return null;
  try {
    const parsed = WebDiscoveryCachedUrlListSchema.safeParse(
      JSON.parse(value) as unknown,
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function createSqliteWebDiscoveryStore(
  databasePath: string,
): WebDiscoveryStore {
  const sqlite = createDatabase(databasePath);

  return {
    async reserveSearch(options) {
      const normalizedRequest = normalizeWebSearchRequest(
        options.normalizedRequest,
      );
      const cacheKey = webSearchCacheKey(normalizedRequest);
      const nowIso = options.now.toISOString();
      return sqlite.transaction((): WebSearchReservation => {
        const current = sqlite
          .prepare(
            `SELECT state, result_json, expires_at, reserved_until
             FROM web_discovery_search_cache
             WHERE provider = ? AND cache_key = ?`,
          )
          .get(options.provider, cacheKey) as CacheRow | undefined;
        const currentUsage = usageSnapshot(
          usageCounts(sqlite, options.philippineDate),
          options.caps,
        );
        if (
          current?.state === 'READY' &&
          current.expires_at !== null &&
          current.expires_at > nowIso
        ) {
          const urls = parseCachedUrls(current.result_json);
          if (urls) return { status: 'CACHE_HIT', urls, usage: currentUsage };
        }

        // Phase 7.1B.6A cache rows remain readable during their original TTL.
        if (options.provider === 'TAVILY') {
          const legacy = sqlite
            .prepare(
              `SELECT state, result_json, expires_at, reserved_until
               FROM tavily_search_cache WHERE query_hash = ?`,
            )
            .get(cacheKey) as CacheRow | undefined;
          if (
            legacy?.state === 'READY' &&
            legacy.expires_at !== null &&
            legacy.expires_at > nowIso
          ) {
            const urls = parseCachedUrls(legacy.result_json);
            if (urls) {
              return { status: 'CACHE_HIT', urls, usage: currentUsage };
            }
          }
        }

        if (options.cacheOnly) {
          return { status: 'CACHE_MISS', usage: currentUsage };
        }
        if (
          current?.state === 'IN_FLIGHT' &&
          current.reserved_until !== null &&
          current.reserved_until > nowIso
        ) {
          return { status: 'IN_FLIGHT', usage: currentUsage };
        }

        const reserved = reserveUsageSync(sqlite, {
          provider: options.provider,
          operation: options.operation,
          cacheKey,
          units: 1,
          philippineDate: options.philippineDate,
          now: options.now,
          caps: options.caps,
        });
        if (reserved.status !== 'RESERVED') return reserved;
        const reservedUntil = new Date(
          options.now.getTime() + RESERVATION_TTL_MS,
        ).toISOString();
        sqlite
          .prepare(
            `INSERT INTO web_discovery_search_cache (
               provider, cache_key, normalized_request, state,
               reservation_token, result_json, fetched_at, expires_at,
               reserved_until, updated_at
             ) VALUES (?, ?, ?, 'IN_FLIGHT', ?, NULL, NULL, NULL, ?, ?)
             ON CONFLICT(provider, cache_key) DO UPDATE SET
               normalized_request = excluded.normalized_request,
               state = 'IN_FLIGHT',
               reservation_token = excluded.reservation_token,
               result_json = NULL,
               fetched_at = NULL,
               expires_at = NULL,
               reserved_until = excluded.reserved_until,
               updated_at = excluded.updated_at`,
          )
          .run(
            options.provider,
            cacheKey,
            normalizedRequest,
            reserved.reservationToken,
            reservedUntil,
            nowIso,
          );
        return reserved;
      })();
    },

    async completeSearch(options) {
      const cacheKey = webSearchCacheKey(options.normalizedRequest);
      const urls = WebDiscoveryCachedUrlListSchema.parse(options.urls.slice(0, 50));
      sqlite.transaction(() => {
        const updated = sqlite
          .prepare(
            `UPDATE web_discovery_usage_ledger
             SET consumed_units = counted_units, state = 'COMPLETED',
                 updated_at = ?
             WHERE reservation_token = ? AND state = 'RESERVED'`,
          )
          .run(options.now.toISOString(), options.reservationToken);
        if (updated.changes !== 1) {
          throw new Error('Search reservation is no longer active.');
        }
        const cacheUpdated = sqlite
          .prepare(
            `UPDATE web_discovery_search_cache
             SET state = 'READY', result_json = ?, fetched_at = ?,
                 expires_at = ?, reserved_until = NULL, updated_at = ?
             WHERE provider = ? AND cache_key = ?
               AND reservation_token = ? AND state = 'IN_FLIGHT'`,
          )
          .run(
            JSON.stringify(urls),
            options.now.toISOString(),
            new Date(
              options.now.getTime() + WEB_SEARCH_QUERY_CACHE_TTL_MS,
            ).toISOString(),
            options.now.toISOString(),
            options.provider,
            cacheKey,
            options.reservationToken,
          );
        if (cacheUpdated.changes !== 1) {
          throw new Error('Search cache reservation is no longer active.');
        }
      })();
    },

    async failSearch(options) {
      const cacheKey = webSearchCacheKey(options.normalizedRequest);
      sqlite.transaction(() => {
        sqlite
          .prepare(
            `UPDATE web_discovery_usage_ledger
             SET counted_units = 0, consumed_units = 0, state = 'RELEASED',
                  updated_at = ?
             WHERE reservation_token = ? AND state = 'RESERVED'`,
          )
          .run(options.now.toISOString(), options.reservationToken);
        sqlite
          .prepare(
            `UPDATE web_discovery_search_cache
             SET state = 'FAILED', result_json = NULL, fetched_at = NULL,
                 expires_at = NULL, reserved_until = NULL, updated_at = ?
             WHERE provider = ? AND cache_key = ?
               AND reservation_token = ?`,
          )
          .run(
            options.now.toISOString(),
            options.provider,
            cacheKey,
            options.reservationToken,
          );
      })();
    },

    async reserveUsage(options) {
      if (!Number.isInteger(options.units) || options.units < 1 || options.units > 40) {
        throw new Error('Invalid web discovery quota reservation.');
      }
      return sqlite.transaction(() => reserveUsageSync(sqlite, options))();
    },

    async completeUsage({ reservationToken, consumedUnits, now }) {
      if (!Number.isInteger(consumedUnits) || consumedUnits < 0) {
        throw new Error('Invalid provider-reported usage.');
      }
      sqlite.transaction(() => {
        const row = sqlite
          .prepare(
            `SELECT counted_units FROM web_discovery_usage_ledger
             WHERE reservation_token = ? AND state = 'RESERVED'`,
          )
          .get(reservationToken) as { counted_units: number } | undefined;
        if (!row || consumedUnits > row.counted_units) {
          throw new Error('Provider usage exceeded the reserved quota.');
        }
        sqlite
          .prepare(
            `UPDATE web_discovery_usage_ledger
             SET counted_units = ?, consumed_units = ?, state = 'COMPLETED',
                 updated_at = ?
             WHERE reservation_token = ? AND state = 'RESERVED'`,
          )
          .run(consumedUnits, consumedUnits, now.toISOString(), reservationToken);
      })();
    },

    async releaseUsage({ reservationToken, now }) {
      sqlite
        .prepare(
          `UPDATE web_discovery_usage_ledger
           SET counted_units = 0, consumed_units = 0, state = 'RELEASED',
               updated_at = ?
           WHERE reservation_token = ? AND state = 'RESERVED'`,
        )
        .run(now.toISOString(), reservationToken);
    },

    async getUsage({ philippineDate, caps }) {
      return usageSnapshot(usageCounts(sqlite, philippineDate), caps);
    },

    async listQueryGroupExecutions() {
      const rows = sqlite
        .prepare(
          `SELECT query_group_id, COALESCE(completed_at, selected_at) AS executed_at
           FROM web_discovery_query_group_runs
           WHERE status = 'COMPLETED'
           ORDER BY executed_at ASC`,
        )
        .all() as Array<{ query_group_id: string; executed_at: string }>;
      return rows.flatMap((row) =>
        WEB_SEARCH_QUERY_GROUP_IDS.includes(
          row.query_group_id as WebSearchQueryGroupId,
        )
          ? [{
              queryGroupId: row.query_group_id as WebSearchQueryGroupId,
              executedAt: row.executed_at,
            }]
          : [],
      );
    },

    async recordQueryGroupSelection(options) {
      sqlite
        .prepare(
          `INSERT INTO web_discovery_query_group_runs (
             run_key, query_group_id, active_profile_key, cache_strategy,
             philippine_date, status, selected_at, completed_at
           ) VALUES (?, ?, ?, ?, ?, 'SELECTED', ?, NULL)
           ON CONFLICT(run_key) DO NOTHING`,
        )
        .run(
          options.runKey,
          options.queryGroupId,
          [...options.activeProfileIds].sort().join(','),
          options.cacheStrategy,
          options.philippineDate,
          options.now.toISOString(),
        );
    },

    async completeQueryGroup(options) {
      sqlite
        .prepare(
          `UPDATE web_discovery_query_group_runs
           SET status = ?, completed_at = ?
           WHERE run_key = ? AND status = 'SELECTED'`,
        )
        .run(options.status, options.now.toISOString(), options.runKey);
    },

    async beginDeepScan(options) {
      return sqlite.transaction((): DeepScanStartResult => {
        const existing = sqlite
          .prepare(
            `SELECT state, started_at FROM web_discovery_deep_scan_runs
             WHERE idempotency_key = ?`,
          )
          .get(options.idempotencyKey) as
          | { state: string; started_at: string }
          | undefined;
        if (existing) {
          return {
            status: existing.state === 'ACTIVE'
              ? 'ALREADY_ACTIVE'
              : 'ALREADY_COMPLETED',
            eligibleAgainAt: new Date(
              Date.parse(existing.started_at) + DEEP_SCAN_COOLDOWN_MS,
            ).toISOString(),
          };
        }
        const cutoff = new Date(
          options.now.getTime() - DEEP_SCAN_COOLDOWN_MS,
        ).toISOString();
        const recent = sqlite
          .prepare(
            `SELECT started_at FROM web_discovery_deep_scan_runs
             WHERE started_at > ?
             ORDER BY started_at DESC LIMIT 1`,
          )
          .get(cutoff) as { started_at: string } | undefined;
        if (recent) {
          return {
            status: 'COOLDOWN',
            eligibleAgainAt: new Date(
              Date.parse(recent.started_at) + DEEP_SCAN_COOLDOWN_MS,
            ).toISOString(),
          };
        }
        sqlite
          .prepare(
            `INSERT INTO web_discovery_deep_scan_runs (
               idempotency_key, trigger_run_id, philippine_date, state,
               verify_and_save, cancel_requested, stopping_reason,
               started_at, completed_at
             ) VALUES (?, ?, ?, 'ACTIVE', ?, 0, NULL, ?, NULL)`,
          )
          .run(
            options.idempotencyKey,
            options.triggerRunId,
            options.philippineDate,
            options.verifyAndSave ? 1 : 0,
            options.now.toISOString(),
          );
        return { status: 'STARTED', eligibleAgainAt: null };
      })();
    },

    async getDeepScanEligibility(now) {
      const cutoff = new Date(now.getTime() - DEEP_SCAN_COOLDOWN_MS).toISOString();
      const recent = sqlite
        .prepare(
          `SELECT started_at FROM web_discovery_deep_scan_runs
           WHERE started_at > ?
           ORDER BY started_at DESC LIMIT 1`,
        )
        .get(cutoff) as { started_at: string } | undefined;
      return recent
        ? {
            eligible: false,
            eligibleAgainAt: new Date(
              Date.parse(recent.started_at) + DEEP_SCAN_COOLDOWN_MS,
            ).toISOString(),
          }
        : { eligible: true, eligibleAgainAt: null };
    },

    async requestDeepScanCancellation(triggerRunId) {
      const result = sqlite
        .prepare(
          `UPDATE web_discovery_deep_scan_runs
           SET cancel_requested = 1
           WHERE trigger_run_id = ? AND state = 'ACTIVE'`,
        )
        .run(triggerRunId);
      return result.changes === 1;
    },

    async isDeepScanCancellationRequested(idempotencyKey) {
      const row = sqlite
        .prepare(
          `SELECT cancel_requested FROM web_discovery_deep_scan_runs
           WHERE idempotency_key = ? AND state = 'ACTIVE'`,
        )
        .get(idempotencyKey) as { cancel_requested: number } | undefined;
      return row?.cancel_requested === 1;
    },

    async recordDeepScanCheckpoint(options) {
      sqlite
        .prepare(
          `INSERT INTO web_discovery_scan_checkpoints (
             run_key, batch_number, urls_attempted, pages_parsed,
             pages_recovered, pages_rejected
           ) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(run_key, batch_number) DO NOTHING`,
        )
        .run(
          options.runKey,
          options.batchNumber,
          options.urlsAttempted,
          options.pagesParsed,
          options.pagesRecovered,
          options.pagesRejected,
        );
    },

    async completeDeepScan(options) {
      sqlite
        .prepare(
          `UPDATE web_discovery_deep_scan_runs
           SET state = ?, stopping_reason = ?, completed_at = ?
           WHERE idempotency_key = ? AND state = 'ACTIVE'`,
        )
        .run(
          options.state,
          options.stoppingReason,
          options.now.toISOString(),
          options.idempotencyKey,
        );
    },

    async cleanup(now) {
      const expiredBefore = new Date(
        now.getTime() - 30 * 24 * 60 * 60 * 1_000,
      ).toISOString();
      sqlite.transaction(() => {
        sqlite
          .prepare(
            `DELETE FROM web_discovery_search_cache
             WHERE (expires_at IS NOT NULL AND expires_at < ?)
                OR (state = 'FAILED' AND updated_at < ?)`,
          )
          .run(now.toISOString(), expiredBefore);
        sqlite
          .prepare(
            `DELETE FROM web_discovery_scan_checkpoints
             WHERE created_at < ?`,
          )
          .run(expiredBefore);
      })();
    },

    close() {
      sqlite.close();
    },
  };
}
