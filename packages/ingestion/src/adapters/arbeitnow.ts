import { z } from 'zod';
import { cleanJobContent } from '../content-cleaner.js';
import {
  DiscoveredJobSchema,
  DiscoveryOptionsSchema,
  type DiscoveredJob,
  type DiscoveryFetchResult,
  type DiscoverySourceAdapter,
} from '../discovery/contracts.js';

export const ARBEITNOW_API_URL =
  'https://www.arbeitnow.com/api/job-board-api';
export const ARBEITNOW_USER_AGENT =
  'AutomatedJobHunter/0.1 (+https://github.com/mjsenpaii/automated-job-hunter)';
const DEFAULT_TIMEOUT_MS = 10_000;

const ArbeitnowRecordSchema = z.object({
  slug: z.string().trim().min(1),
  company_name: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().min(1),
  remote: z.boolean(),
  url: z.string().url().refine((url) => url.startsWith('https://'), {
    message: 'Canonical job URL must use HTTPS.',
  }),
  tags: z.array(z.string()).optional().default([]),
  job_types: z.array(z.string()).optional().default([]),
  location: z.string().nullable().optional().default(null),
  created_at: z.number().int().nonnegative().max(253_402_300_799),
});
export type ArbeitnowRecord = z.infer<typeof ArbeitnowRecordSchema>;

const ArbeitnowEnvelopeSchema = z.object({
  data: z.array(z.unknown()),
  links: z
    .object({
      first: z.string().url().nullable().optional(),
      last: z.string().url().nullable().optional(),
      prev: z.string().url().nullable().optional(),
      next: z.string().url().nullable().optional(),
    })
    .passthrough(),
  meta: z
    .object({
      current_page: z.number().int().positive(),
      per_page: z.number().int().positive().optional(),
      terms: z.string().optional(),
      info: z.string().optional(),
    })
    .passthrough(),
});

export type ArbeitnowErrorCode =
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'MALFORMED_JSON'
  | 'SOURCE_SCHEMA_CHANGED'
  | 'SERVICE_UNAVAILABLE';

export class ArbeitnowDiscoveryError extends Error {
  constructor(
    readonly code: ArbeitnowErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ArbeitnowDiscoveryError';
  }
}

export interface ArbeitnowAdapterDependencies {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function cleanedValues(values: string[]): string[] {
  return [
    ...new Set(
      values
        .map((value) => cleanJobContent(value).trim())
        .filter(Boolean),
    ),
  ];
}

export function mapArbeitnowRecord(
  record: ArbeitnowRecord,
): DiscoveredJob {
  const description = cleanJobContent(record.description).trim();
  const location = record.location
    ? cleanJobContent(record.location).trim() || null
    : null;
  const jobTypes = cleanedValues(record.job_types);

  return DiscoveredJobSchema.parse({
    sourceName: 'Arbeitnow',
    sourceJobId: record.slug,
    title: cleanJobContent(record.title),
    company: cleanJobContent(record.company_name),
    location,
    remote: record.remote,
    employmentType: jobTypes.length > 0 ? jobTypes.join(', ') : null,
    description,
    tags: cleanedValues(record.tags),
    publishedAt: new Date(record.created_at * 1_000).toISOString(),
    sourceUrl: record.url,
    applicationUrl: record.url,
  });
}

async function fetchPage(
  page: number,
  dependencies: ArbeitnowAdapterDependencies,
): Promise<z.infer<typeof ArbeitnowEnvelopeSchema>> {
  const url = new URL(ARBEITNOW_API_URL);
  url.searchParams.set('page', String(page));
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  let response: Response;
  try {
    response = await (dependencies.fetchImpl ?? fetch)(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': ARBEITNOW_USER_AGENT,
      },
      redirect: 'error',
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    if (controller.signal.aborted) {
      throw new ArbeitnowDiscoveryError(
        'TIMEOUT',
        'Arbeitnow did not respond before the request timeout.',
      );
    }
    throw new ArbeitnowDiscoveryError(
      'SERVICE_UNAVAILABLE',
      'Arbeitnow is currently unavailable. Try the dry run again later.',
    );
  }

  try {
    if (!response.ok) {
      throw new ArbeitnowDiscoveryError(
        'HTTP_ERROR',
        `Arbeitnow returned HTTP ${response.status}. Try again later.`,
      );
    }

    let body: string;
    try {
      body = await response.text();
    } catch {
      if (controller.signal.aborted) {
        throw new ArbeitnowDiscoveryError(
          'TIMEOUT',
          'Arbeitnow did not respond before the request timeout.',
        );
      }
      throw new ArbeitnowDiscoveryError(
        'SERVICE_UNAVAILABLE',
        'Arbeitnow is currently unavailable. Try the dry run again later.',
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new ArbeitnowDiscoveryError(
        'MALFORMED_JSON',
        'Arbeitnow returned malformed JSON.',
      );
    }

    const parsed = ArbeitnowEnvelopeSchema.safeParse(json);
    if (!parsed.success || parsed.data.meta.current_page !== page) {
      throw new ArbeitnowDiscoveryError(
        'SOURCE_SCHEMA_CHANGED',
        'Arbeitnow returned an unexpected response shape.',
      );
    }
    return parsed.data;
  } finally {
    clearTimeout(timer);
  }
}

export class ArbeitnowAdapter implements DiscoverySourceAdapter {
  readonly name = 'Arbeitnow';

  constructor(
    private readonly dependencies: ArbeitnowAdapterDependencies = {},
  ) {}

  async fetchJobs(
    rawOptions: Pick<
      z.infer<typeof DiscoveryOptionsSchema>,
      'limit' | 'pages'
    >,
  ): Promise<DiscoveryFetchResult> {
    const options = DiscoveryOptionsSchema.pick({
      limit: true,
      pages: true,
    }).parse(rawOptions);
    const jobs: DiscoveredJob[] = [];
    let sourceRecordsFetched = 0;
    let invalidRecords = 0;
    let pagesFetched = 0;

    for (let page = 1; page <= options.pages; page += 1) {
      const envelope = await fetchPage(page, this.dependencies);
      pagesFetched += 1;

      for (const candidate of envelope.data) {
        if (jobs.length >= options.limit) break;
        sourceRecordsFetched += 1;
        const parsed = ArbeitnowRecordSchema.safeParse(candidate);
        if (!parsed.success) {
          invalidRecords += 1;
          continue;
        }
        try {
          jobs.push(mapArbeitnowRecord(parsed.data));
        } catch {
          invalidRecords += 1;
        }
      }

      if (jobs.length >= options.limit || !envelope.links.next) break;
    }

    return {
      sourceRecordsFetched,
      acceptedRecords: jobs.length,
      invalidRecords,
      pagesFetched,
      jobs,
    };
  }
}
