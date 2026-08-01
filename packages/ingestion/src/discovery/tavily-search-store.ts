import { createHash, randomUUID } from 'node:crypto';
import { createDatabase } from '@job-app/db';
import { z } from 'zod';

export const TAVILY_DAILY_CREDIT_LIMIT = 16 as const;
export const TAVILY_CACHE_TTL_MS = 6 * 60 * 60 * 1_000;
const TAVILY_RESERVATION_TTL_MS = 2 * 60 * 1_000;

export const TavilyCachedUrlSchema = z
  .object({
    url: z.string().url(),
    title: z.string().trim().min(1).max(500),
    directEmployerOrAts: z.boolean(),
  })
  .strict();
export type TavilyCachedUrl = z.infer<typeof TavilyCachedUrlSchema>;

const TavilyCachedUrlListSchema = z.array(TavilyCachedUrlSchema).max(10);

export type TavilySearchReservation =
  | { status: 'CACHE_HIT'; urls: TavilyCachedUrl[]; dailyRemaining: number }
  | { status: 'RESERVED'; reservationToken: string; dailyRemaining: number }
  | { status: 'IN_FLIGHT'; dailyRemaining: number }
  | { status: 'DAILY_LIMIT_REACHED'; dailyRemaining: 0 };

export interface TavilySearchStore {
  reserve(options: {
    normalizedQuery: string;
    philippineDate: string;
    now: Date;
  }): Promise<TavilySearchReservation>;
  complete(options: {
    normalizedQuery: string;
    reservationToken: string;
    urls: TavilyCachedUrl[];
    now: Date;
  }): Promise<void>;
  fail(options: {
    normalizedQuery: string;
    reservationToken: string;
    now: Date;
  }): Promise<void>;
  getDailyRemaining(philippineDate: string): Promise<number>;
  close?(): void;
}

export function normalizeTavilyQuery(query: string): string {
  return query.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

export function tavilyQueryHash(normalizedQuery: string): string {
  return createHash('sha256').update(normalizedQuery).digest('hex');
}

interface CacheRow {
  state: 'IN_FLIGHT' | 'READY' | 'FAILED';
  result_json: string | null;
  expires_at: string | null;
  reserved_until: string | null;
}

function countCredits(
  sqlite: ReturnType<typeof createDatabase>,
  philippineDate: string,
): number {
  const row = sqlite
    .prepare(
      `SELECT COALESCE(SUM(credits), 0) AS credits
       FROM tavily_search_credit_ledger
       WHERE philippine_date = ?`,
    )
    .get(philippineDate) as { credits: number };
  return row.credits;
}

export function createSqliteTavilySearchStore(
  databasePath: string,
): TavilySearchStore {
  const sqlite = createDatabase(databasePath);

  return {
    async reserve({ normalizedQuery, philippineDate, now }) {
      const query = normalizeTavilyQuery(normalizedQuery);
      const queryHash = tavilyQueryHash(query);
      const nowIso = now.toISOString();
      const reservationToken = randomUUID();
      const reservedUntil = new Date(
        now.getTime() + TAVILY_RESERVATION_TTL_MS,
      ).toISOString();

      try {
        return sqlite.transaction((): TavilySearchReservation => {
        const current = sqlite
          .prepare(
            `SELECT state, result_json, expires_at, reserved_until
             FROM tavily_search_cache WHERE query_hash = ?`,
          )
          .get(queryHash) as CacheRow | undefined;
        const creditsBefore = countCredits(sqlite, philippineDate);
        const dailyRemaining = Math.max(
          0,
          TAVILY_DAILY_CREDIT_LIMIT - creditsBefore,
        );

        if (
          current?.state === 'READY' &&
          current.expires_at !== null &&
          current.expires_at > nowIso &&
          current.result_json !== null
        ) {
          try {
            const parsed = TavilyCachedUrlListSchema.safeParse(
              JSON.parse(current.result_json) as unknown,
            );
            if (parsed.success) {
              return { status: 'CACHE_HIT', urls: parsed.data, dailyRemaining };
            }
          } catch {
            // A malformed cache entry is never trusted; reserve a fresh query.
          }
        }

        if (
          current?.state === 'IN_FLIGHT' &&
          current.reserved_until !== null &&
          current.reserved_until > nowIso
        ) {
          return { status: 'IN_FLIGHT', dailyRemaining };
        }
        if (dailyRemaining === 0) {
          return { status: 'DAILY_LIMIT_REACHED', dailyRemaining: 0 };
        }

        sqlite
          .prepare(
            `INSERT INTO tavily_search_credit_ledger (
               reservation_token, philippine_date, query_hash, credits
             ) VALUES (?, ?, ?, 1)`,
          )
          .run(reservationToken, philippineDate, queryHash);
        sqlite
          .prepare(
            `INSERT INTO tavily_search_cache (
               query_hash, normalized_query, state, reservation_token,
               result_json, fetched_at, expires_at, reserved_until, updated_at
             ) VALUES (?, ?, 'IN_FLIGHT', ?, NULL, NULL, NULL, ?, ?)
             ON CONFLICT(query_hash) DO UPDATE SET
               normalized_query = excluded.normalized_query,
               state = 'IN_FLIGHT',
               reservation_token = excluded.reservation_token,
               result_json = NULL,
               fetched_at = NULL,
               expires_at = NULL,
               reserved_until = excluded.reserved_until,
               updated_at = excluded.updated_at`,
          )
          .run(queryHash, query, reservationToken, reservedUntil, nowIso);

        return {
          status: 'RESERVED',
          reservationToken,
          dailyRemaining: dailyRemaining - 1,
        };
        })();
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('tavily daily credit limit exceeded')
        ) {
          return { status: 'DAILY_LIMIT_REACHED', dailyRemaining: 0 };
        }
        throw error;
      }
    },

    async complete({ normalizedQuery, reservationToken, urls, now }) {
      const parsedUrls = TavilyCachedUrlListSchema.parse(urls);
      const queryHash = tavilyQueryHash(normalizeTavilyQuery(normalizedQuery));
      sqlite
        .prepare(
          `UPDATE tavily_search_cache SET
             state = 'READY', result_json = ?, fetched_at = ?, expires_at = ?,
             reserved_until = NULL, updated_at = ?
           WHERE query_hash = ? AND reservation_token = ?`,
        )
        .run(
          JSON.stringify(parsedUrls),
          now.toISOString(),
          new Date(now.getTime() + TAVILY_CACHE_TTL_MS).toISOString(),
          now.toISOString(),
          queryHash,
          reservationToken,
        );
    },

    async fail({ normalizedQuery, reservationToken, now }) {
      const queryHash = tavilyQueryHash(normalizeTavilyQuery(normalizedQuery));
      sqlite
        .prepare(
          `UPDATE tavily_search_cache SET
             state = 'FAILED', result_json = NULL, fetched_at = NULL,
             expires_at = NULL, reserved_until = NULL, updated_at = ?
           WHERE query_hash = ? AND reservation_token = ?`,
        )
        .run(now.toISOString(), queryHash, reservationToken);
    },

    async getDailyRemaining(philippineDate) {
      return Math.max(
        0,
        TAVILY_DAILY_CREDIT_LIMIT - countCredits(sqlite, philippineDate),
      );
    },

    close() {
      sqlite.close();
    },
  };
}
