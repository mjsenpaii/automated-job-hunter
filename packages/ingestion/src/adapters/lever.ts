import { z } from 'zod';
import { cleanJobContent } from '../content-cleaner.js';
import {
  DiscoveredJobSchema,
  type DiscoveredJob,
  type DiscoveryFetchResult,
  type DiscoveryOptions,
  type DiscoverySourceAdapter,
} from '../discovery/contracts.js';
import {
  LeverCompanySchema,
  type LeverCompany,
} from '../discovery/lever-companies.v1.js';

export const LEVER_API_ORIGIN = 'https://api.lever.co';
export const LEVER_POSTINGS_PATH = '/v0/postings';
export const LEVER_USER_AGENT =
  'AutomatedJobHunter/0.1 (+https://github.com/mjsenpaii/automated-job-hunter)';
const DEFAULT_TIMEOUT_MS = 10_000;
const PAGE_SIZE = 50;

const OptionalTextSchema = z.string().nullable().optional();
const LeverCategoriesSchema = z
  .object({
    commitment: OptionalTextSchema,
    department: OptionalTextSchema,
    location: OptionalTextSchema,
    team: OptionalTextSchema,
    allLocations: z.array(z.string()).nullable().optional(),
  });

const LeverListSchema = z
  .object({
    text: z.string(),
    content: z.string(),
  });

function isCanonicalLeverJobUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'jobs.lever.co';
  } catch {
    return false;
  }
}

const LeverWorkplaceTypeSchema = z.enum([
  'unspecified',
  'on-site',
  'onsite',
  'remote',
  'hybrid',
]);

export const LeverRecordSchema = z
  .object({
    id: z.string().trim().min(1),
    text: z.string().trim().min(1),
    categories: LeverCategoriesSchema,
    createdAt: z.number().int().nonnegative().optional(),
    updatedAt: z.number().int().nonnegative().optional(),
    opening: OptionalTextSchema,
    openingPlain: OptionalTextSchema,
    description: OptionalTextSchema,
    descriptionPlain: OptionalTextSchema,
    descriptionBody: OptionalTextSchema,
    descriptionBodyPlain: OptionalTextSchema,
    lists: z.array(LeverListSchema).nullable().optional(),
    additional: OptionalTextSchema,
    additionalPlain: OptionalTextSchema,
    hostedUrl: z.string().url().refine(isCanonicalLeverJobUrl, {
      message: 'Canonical job URL must use the Lever jobs HTTPS host.',
    }),
    applyUrl: z.string().url().optional(),
    workplaceType: LeverWorkplaceTypeSchema.optional(),
  });
export type LeverRecord = z.infer<typeof LeverRecordSchema>;

const LeverEnvelopeSchema = z.array(z.unknown());
const LeverFetchOptionsSchema = z.object({
  limit: z.number().int().min(1).max(100),
  pages: z.number().int().min(1).max(3),
});

export type LeverErrorCode =
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'MALFORMED_JSON'
  | 'SOURCE_SCHEMA_CHANGED'
  | 'SERVICE_UNAVAILABLE'
  | 'BOARD_UNAVAILABLE'
  | 'INVALID_CONFIGURATION';

export class LeverDiscoveryError extends Error {
  constructor(
    readonly code: LeverErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LeverDiscoveryError';
  }
}

export interface LeverAdapterDependencies {
  companies: LeverCompany[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function sourceText(value: string | null | undefined): string | null {
  if (!value) return null;
  return cleanJobContent(value).replace(/\s+/g, ' ').trim() || null;
}

function cleanSection(
  plain: string | null | undefined,
  rich: string | null | undefined,
): string | null {
  return sourceText(plain) ?? sourceText(rich);
}

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function timestamp(value: number | undefined): string | null {
  if (value === undefined) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function normalizedWorkplaceType(
  value: LeverRecord['workplaceType'],
): 'unspecified' | 'on-site' | 'remote' | 'hybrid' | null {
  if (value === undefined) return null;
  return value === 'onsite' ? 'on-site' : value;
}

function explicitRemote(
  record: LeverRecord,
  location: string | null,
): boolean | null {
  const workplaceType = normalizedWorkplaceType(record.workplaceType);
  if (workplaceType === 'remote') return true;
  if (
    workplaceType === 'on-site' ||
    workplaceType === 'hybrid'
  ) {
    return false;
  }
  return location && /\bremote\b/i.test(location) ? true : null;
}

function isCompanyHostedUrl(urlValue: string, company: LeverCompany): boolean {
  const url = new URL(urlValue);
  const [site] = url.pathname.split('/').filter(Boolean);
  return site?.toLocaleLowerCase() === company.site.toLocaleLowerCase();
}

function descriptionFor(record: LeverRecord): string {
  const body = cleanSection(record.descriptionBodyPlain, record.descriptionBody);
  const opening = cleanSection(record.openingPlain, record.opening);
  const base =
    opening || body
      ? unique([opening, body])
      : unique([
          cleanSection(record.descriptionPlain, record.description),
        ]);
  const lists = (record.lists ?? []).flatMap((section) =>
    unique([sourceText(section.text), sourceText(section.content)]),
  );
  const additional = cleanSection(
    record.additionalPlain,
    record.additional,
  );
  return unique([...base, ...lists, additional]).join('\n\n');
}

export function buildLeverPostingsUrl(
  company: LeverCompany,
  skip: number,
  limit: number,
): URL {
  const parsedCompany = LeverCompanySchema.parse(company);
  const url = new URL(
    `${LEVER_POSTINGS_PATH}/${encodeURIComponent(parsedCompany.site)}`,
    LEVER_API_ORIGIN,
  );
  url.searchParams.set('mode', 'json');
  url.searchParams.set('skip', String(skip));
  url.searchParams.set('limit', String(limit));
  return url;
}

export function mapLeverRecord(
  record: LeverRecord,
  company: LeverCompany,
): DiscoveredJob {
  if (!isCompanyHostedUrl(record.hostedUrl, company)) {
    throw new LeverDiscoveryError(
      'SOURCE_SCHEMA_CHANGED',
      `Lever returned a canonical URL outside the configured ${company.displayName} board.`,
    );
  }

  const locations = unique([
    ...(record.categories.allLocations ?? []).map(sourceText),
    sourceText(record.categories.location),
  ]);
  const location = locations.length > 0 ? locations.join(' / ') : null;
  const description = descriptionFor(record);

  return DiscoveredJobSchema.parse({
    sourceName: 'Lever',
    sourceJobId: record.id,
    title: sourceText(record.text),
    company: company.displayName,
    location,
    remote: explicitRemote(record, location),
    employmentType: sourceText(record.categories.commitment),
    category: null,
    team: sourceText(record.categories.team),
    department: sourceText(record.categories.department),
    workplaceType: normalizedWorkplaceType(record.workplaceType),
    salaryText: null,
    description,
    tags: [],
    publishedAt: timestamp(record.createdAt),
    updatedAt: timestamp(record.updatedAt),
    sourceUrl: record.hostedUrl,
    // Deliberately retain the hosted posting, not Lever's application form.
    applicationUrl: record.hostedUrl,
  });
}

async function fetchLeverPage(
  company: LeverCompany,
  skip: number,
  limit: number,
  dependencies: LeverAdapterDependencies,
): Promise<unknown[]> {
  const url = buildLeverPostingsUrl(company, skip, limit);
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
        'User-Agent': LEVER_USER_AGENT,
      },
      redirect: 'error',
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    if (controller.signal.aborted) {
      throw new LeverDiscoveryError(
        'TIMEOUT',
        `Lever board ${company.displayName} did not respond before the request timeout.`,
      );
    }
    throw new LeverDiscoveryError(
      'SERVICE_UNAVAILABLE',
      `Lever board ${company.displayName} is currently unavailable. Try again later.`,
    );
  }

  try {
    if (!response.ok) {
      if (response.status === 404) {
        throw new LeverDiscoveryError(
          'BOARD_UNAVAILABLE',
          `Configured Lever board ${company.displayName} (${company.site}) is unavailable.`,
        );
      }
      throw new LeverDiscoveryError(
        'HTTP_ERROR',
        `Lever returned HTTP ${response.status} for ${company.displayName}. Try again later.`,
      );
    }

    let body: string;
    try {
      body = await response.text();
    } catch {
      if (controller.signal.aborted) {
        throw new LeverDiscoveryError(
          'TIMEOUT',
          `Lever board ${company.displayName} did not respond before the request timeout.`,
        );
      }
      throw new LeverDiscoveryError(
        'SERVICE_UNAVAILABLE',
        `Lever board ${company.displayName} is currently unavailable. Try again later.`,
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new LeverDiscoveryError(
        'MALFORMED_JSON',
        `Lever returned malformed JSON for ${company.displayName}.`,
      );
    }
    const parsed = LeverEnvelopeSchema.safeParse(json);
    if (!parsed.success) {
      throw new LeverDiscoveryError(
        'SOURCE_SCHEMA_CHANGED',
        `Lever returned an unexpected response shape for ${company.displayName}.`,
      );
    }
    return parsed.data;
  } finally {
    clearTimeout(timer);
  }
}

export class LeverAdapter implements DiscoverySourceAdapter {
  readonly name = 'Lever';
  private readonly companies: LeverCompany[];

  constructor(private readonly dependencies: LeverAdapterDependencies) {
    const parsed = LeverCompanySchema.array().max(10).safeParse(
      dependencies.companies,
    );
    if (!parsed.success || parsed.data.length === 0) {
      throw new LeverDiscoveryError(
        'INVALID_CONFIGURATION',
        'Select between one and ten configured Lever companies.',
      );
    }
    const uniqueSites = new Set(
      parsed.data.map((company) => company.site.toLocaleLowerCase()),
    );
    if (uniqueSites.size !== parsed.data.length) {
      throw new LeverDiscoveryError(
        'INVALID_CONFIGURATION',
        'Configured Lever companies must have unique site identifiers.',
      );
    }
    this.companies = parsed.data;
  }

  async fetchJobs(
    rawOptions: Pick<DiscoveryOptions, 'limit' | 'pages'>,
  ): Promise<DiscoveryFetchResult> {
    const options = LeverFetchOptionsSchema.parse(rawOptions);
    const jobs: DiscoveredJob[] = [];
    let sourceRecordsFetched = 0;
    let invalidRecords = 0;
    let pagesFetched = 0;

    for (
      let companyIndex = 0;
      companyIndex < this.companies.length;
      companyIndex += 1
    ) {
      const company = this.companies[companyIndex];
      if (!company) continue;
      const companiesRemaining = this.companies.length - companyIndex;
      const companyLimit = Math.ceil(
        (options.limit - jobs.length) / companiesRemaining,
      );
      let companyAccepted = 0;
      let skip = 0;

      while (companyAccepted < companyLimit) {
        const requestLimit = Math.min(
          PAGE_SIZE,
          companyLimit - companyAccepted,
        );
        const candidates = await fetchLeverPage(
          company,
          skip,
          requestLimit,
          this.dependencies,
        );
        pagesFetched += 1;
        const acceptedBeforePage = companyAccepted;

        for (const candidate of candidates) {
          if (
            companyAccepted >= companyLimit ||
            jobs.length >= options.limit
          ) {
            break;
          }
          sourceRecordsFetched += 1;
          const parsed = LeverRecordSchema.safeParse(candidate);
          if (!parsed.success) {
            invalidRecords += 1;
            continue;
          }
          try {
            jobs.push(mapLeverRecord(parsed.data, company));
            companyAccepted += 1;
          } catch {
            invalidRecords += 1;
          }
        }

        skip += candidates.length;
        if (
          candidates.length < requestLimit ||
          candidates.length === 0 ||
          companyAccepted === acceptedBeforePage
        ) {
          break;
        }
      }
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
