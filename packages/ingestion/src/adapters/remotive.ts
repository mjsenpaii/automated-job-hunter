import { z } from 'zod';
import { cleanJobContent } from '../content-cleaner.js';
import {
  DiscoveredJobSchema,
  DiscoveryOptionsSchema,
  type DiscoveredJob,
  type DiscoveryFetchResult,
  type DiscoverySourceAdapter,
} from '../discovery/contracts.js';

export const REMOTIVE_API_URL = 'https://remotive.com/api/remote-jobs';
export const REMOTIVE_USER_AGENT =
  'AutomatedJobHunter/0.1 (+https://github.com/mjsenpaii/automated-job-hunter)';
const DEFAULT_TIMEOUT_MS = 10_000;

function isCanonicalRemotiveUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'remotive.com' ||
        url.hostname === 'www.remotive.com')
    );
  } catch {
    return false;
  }
}

const OptionalSourceStringSchema = z
  .string()
  .nullable()
  .optional();

const PublicationDateSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Publication date must be parseable.',
  })
  .nullable()
  .optional();

const RemotiveRecordSchema = z
  .object({
    id: z.number().int().positive(),
    url: z.string().url().refine(isCanonicalRemotiveUrl, {
      message: 'Canonical job URL must use the Remotive HTTPS host.',
    }),
    title: z.string().trim().min(1),
    company_name: z.string().trim().min(1),
    category: OptionalSourceStringSchema,
    job_type: OptionalSourceStringSchema,
    publication_date: PublicationDateSchema,
    candidate_required_location: OptionalSourceStringSchema,
    salary: OptionalSourceStringSchema,
    description: z.string().min(1),
    tags: z.array(z.string()).nullable().optional(),
  })
  .passthrough();
export type RemotiveRecord = z.infer<typeof RemotiveRecordSchema>;

const RemotiveEnvelopeSchema = z
  .object({
    '0-legal-notice': z.string().trim().min(1),
    'job-count': z.number().int().nonnegative(),
    jobs: z.array(z.unknown()),
  })
  .passthrough();

export type RemotiveErrorCode =
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'MALFORMED_JSON'
  | 'SOURCE_SCHEMA_CHANGED'
  | 'SERVICE_UNAVAILABLE';

export class RemotiveDiscoveryError extends Error {
  constructor(
    readonly code: RemotiveErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RemotiveDiscoveryError';
  }
}

export interface RemotiveAdapterDependencies {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  category?: string;
}

function sourceText(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/\s+/g, ' ').trim() || null;
}

function cleanedValues(values: string[] | null | undefined): string[] {
  return [
    ...new Set(
      (values ?? [])
        .map((value) => sourceText(value))
        .filter((value): value is string => value !== null)
        .filter(Boolean),
    ),
  ];
}

export function mapRemotiveRecord(record: RemotiveRecord): DiscoveredJob {
  const employmentType = sourceText(record.job_type)?.replace(
    /_/g,
    ' ',
  ) ?? null;
  const publishedAt = record.publication_date
    ? new Date(record.publication_date).toISOString()
    : null;

  return DiscoveredJobSchema.parse({
    sourceName: 'Remotive',
    sourceJobId: String(record.id),
    title: sourceText(record.title),
    company: sourceText(record.company_name),
    location: sourceText(record.candidate_required_location),
    remote: true,
    employmentType,
    category: sourceText(record.category),
    salaryText: sourceText(record.salary),
    description: cleanJobContent(record.description).trim(),
    tags: cleanedValues(record.tags),
    publishedAt,
    sourceUrl: record.url,
    applicationUrl: record.url,
  });
}

async function fetchRemotive(
  limit: number,
  dependencies: RemotiveAdapterDependencies,
): Promise<z.infer<typeof RemotiveEnvelopeSchema>> {
  const url = new URL(REMOTIVE_API_URL);
  url.searchParams.set('limit', String(limit));
  const category = dependencies.category?.trim();
  if (category) url.searchParams.set('category', category);

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
        'User-Agent': REMOTIVE_USER_AGENT,
      },
      redirect: 'error',
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    if (controller.signal.aborted) {
      throw new RemotiveDiscoveryError(
        'TIMEOUT',
        'Remotive did not respond before the request timeout.',
      );
    }
    throw new RemotiveDiscoveryError(
      'SERVICE_UNAVAILABLE',
      'Remotive is currently unavailable. Try the dry run again later.',
    );
  }

  try {
    if (!response.ok) {
      throw new RemotiveDiscoveryError(
        'HTTP_ERROR',
        `Remotive returned HTTP ${response.status}. Try again later.`,
      );
    }

    let body: string;
    try {
      body = await response.text();
    } catch {
      if (controller.signal.aborted) {
        throw new RemotiveDiscoveryError(
          'TIMEOUT',
          'Remotive did not respond before the request timeout.',
        );
      }
      throw new RemotiveDiscoveryError(
        'SERVICE_UNAVAILABLE',
        'Remotive is currently unavailable. Try the dry run again later.',
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new RemotiveDiscoveryError(
        'MALFORMED_JSON',
        'Remotive returned malformed JSON.',
      );
    }

    const parsed = RemotiveEnvelopeSchema.safeParse(json);
    if (
      !parsed.success ||
      parsed.data['job-count'] !== parsed.data.jobs.length
    ) {
      throw new RemotiveDiscoveryError(
        'SOURCE_SCHEMA_CHANGED',
        'Remotive returned an unexpected response shape.',
      );
    }
    return parsed.data;
  } finally {
    clearTimeout(timer);
  }
}

export class RemotiveAdapter implements DiscoverySourceAdapter {
  readonly name = 'Remotive';

  constructor(
    private readonly dependencies: RemotiveAdapterDependencies = {},
  ) {}

  async fetchJobs(
    rawOptions: Pick<
      z.infer<typeof DiscoveryOptionsSchema>,
      'limit' | 'pages'
    >,
  ): Promise<DiscoveryFetchResult> {
    if (rawOptions.limit > 50) {
      throw new z.ZodError([
        {
          code: 'too_big',
          maximum: 50,
          type: 'number',
          inclusive: true,
          exact: false,
          message: 'Remotive accepts at most 50 jobs per run.',
          path: ['limit'],
        },
      ]);
    }
    const options = DiscoveryOptionsSchema.pick({
      limit: true,
      pages: true,
    }).parse(rawOptions);
    const envelope = await fetchRemotive(options.limit, this.dependencies);
    const jobs: DiscoveredJob[] = [];
    let sourceRecordsFetched = 0;
    let invalidRecords = 0;

    for (const candidate of envelope.jobs) {
      if (jobs.length >= options.limit) break;
      sourceRecordsFetched += 1;
      const parsed = RemotiveRecordSchema.safeParse(candidate);
      if (!parsed.success) {
        invalidRecords += 1;
        continue;
      }
      try {
        jobs.push(mapRemotiveRecord(parsed.data));
      } catch {
        invalidRecords += 1;
      }
    }

    return {
      sourceRecordsFetched,
      acceptedRecords: jobs.length,
      invalidRecords,
      pagesFetched: 1,
      jobs,
    };
  }
}
