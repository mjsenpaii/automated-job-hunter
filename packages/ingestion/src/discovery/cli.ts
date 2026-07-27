import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SkillEntry } from '@job-app/core';
import { getDb, getReadonlyDb } from '@job-app/db/connection';
import { z } from 'zod';
import {
  ArbeitnowAdapter,
  ArbeitnowDiscoveryError,
} from '../adapters/arbeitnow.js';
import {
  RemotiveAdapter,
  RemotiveDiscoveryError,
} from '../adapters/remotive.js';
import {
  LeverAdapter,
  LeverDiscoveryError,
} from '../adapters/lever.js';
import {
  DiscoveryOptionsSchema,
  type DiscoveryOptions,
  type DiscoveryRepository,
  type DiscoveryRunSummary,
  type DiscoverySourceAdapter,
} from './contracts.js';
import { createDiscoveryRepository } from './repository.js';
import { runDiscovery } from './runner.js';
import {
  LEVER_COMPANIES,
  type LeverCompany,
} from './lever-companies.v1.js';

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

const RawVerifiedSkillSchema = z.object({
  skill: z.string().trim().min(1),
  verification_status: z.string(),
  source: z.string(),
  source_reference: z.string().nullable(),
  allowed_in_resume: z.boolean(),
});

export class DiscoveryCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiscoveryCliError';
  }
}

export interface ParsedDiscoveryCli {
  help: boolean;
  options: DiscoveryOptions;
}

export interface ArbeitnowCliDependencies {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  repository?: DiscoveryRepository;
  verifiedSkills?: SkillEntry[];
  databasePath?: string;
  skillsPath?: string;
  log?: (message: string) => void;
  logError?: (message: string) => void;
}

export interface RemotiveCliDependencies {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  repository?: DiscoveryRepository;
  verifiedSkills?: SkillEntry[];
  databasePath?: string;
  skillsPath?: string;
  log?: (message: string) => void;
  logError?: (message: string) => void;
}

export interface LeverCliDependencies {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  companies?: LeverCompany[];
  repository?: DiscoveryRepository;
  verifiedSkills?: SkillEntry[];
  databasePath?: string;
  skillsPath?: string;
  log?: (message: string) => void;
  logError?: (message: string) => void;
}

export interface ParsedLeverCli extends ParsedDiscoveryCli {
  listCompanies: boolean;
  companies: LeverCompany[];
}

export const ARBEITNOW_CLI_HELP = `Usage:
  pnpm discovery:arbeitnow -- [options]

Options:
  --limit <1-50>   Maximum source jobs to process (default: 50)
  --pages <1-3>    Maximum API pages to fetch (default: 1)
  --remote-only    Keep only records explicitly marked remote
  --query <text>   Case-insensitive local search
  --apply          Persist results; omitted means dry-run
  --help           Show this help

The command never creates applications or submits job applications.`;

export const REMOTIVE_CLI_HELP = `Usage:
  pnpm discovery:remotive -- [options]

Options:
  --limit <1-50>   Maximum source jobs to process (default: 50)
  --query <text>   Case-insensitive local search
  --category <text> Filter by Remotive category name or slug
  --apply          Persist results; omitted means dry-run
  --help           Show this help

The command never creates applications or submits job applications.`;

export const LEVER_CLI_HELP = `Usage:
  pnpm discovery:lever -- --company <configured-id-or-name> [options]
  pnpm discovery:lever -- --all-companies [options]
  pnpm discovery:lever -- --list-companies

Options:
  --company <value>   Select a configured company; may be repeated
  --all-companies     Select every enabled configured company
  --list-companies    List configured companies without fetching jobs
  --limit <1-100>     Maximum accepted jobs across companies (default: 100)
  --remote-only       Keep only explicitly remote Lever records
  --query <text>      Case-insensitive local search
  --apply             Persist results; omitted means dry-run
  --help              Show this help

Arbitrary hosts and URLs are not accepted. The command never creates
applications or submits job applications.`;

function requiredValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new DiscoveryCliError(`${flag} requires a value.`);
  }
  return value;
}

function integerOption(value: string, flag: string): number {
  if (!/^\d+$/.test(value)) {
    throw new DiscoveryCliError(`${flag} must be an integer.`);
  }
  return Number(value);
}

export function parseArbeitnowCliArgs(args: string[]): ParsedDiscoveryCli {
  const candidate: DiscoveryOptions = {
    limit: 50,
    pages: 1,
    remoteOnly: false,
    query: '',
    category: '',
    apply: false,
  };
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--') continue;
    if (argument === '--help') {
      help = true;
      continue;
    }
    if (argument === '--remote-only') {
      candidate.remoteOnly = true;
      continue;
    }
    if (argument === '--apply') {
      candidate.apply = true;
      continue;
    }
    if (argument === '--limit') {
      const value = requiredValue(args, index, '--limit');
      candidate.limit = integerOption(value, '--limit');
      index += 1;
      continue;
    }
    if (argument === '--pages') {
      const value = requiredValue(args, index, '--pages');
      candidate.pages = integerOption(value, '--pages');
      index += 1;
      continue;
    }
    if (argument === '--query') {
      candidate.query = requiredValue(args, index, '--query');
      index += 1;
      continue;
    }
    throw new DiscoveryCliError(`Unknown option: ${argument}`);
  }

  const parsed = DiscoveryOptionsSchema.safeParse(candidate);
  if (!parsed.success || candidate.limit > 50) {
    throw new DiscoveryCliError(
      !parsed.success
        ? parsed.error.issues[0]?.message ?? 'Invalid discovery options.'
        : '--limit must be between 1 and 50.',
    );
  }
  return { help, options: parsed.data };
}

export function parseRemotiveCliArgs(args: string[]): ParsedDiscoveryCli {
  const candidate: DiscoveryOptions = {
    limit: 50,
    pages: 1,
    remoteOnly: false,
    query: '',
    category: '',
    apply: false,
  };
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--') continue;
    if (argument === '--help') {
      help = true;
      continue;
    }
    if (argument === '--apply') {
      candidate.apply = true;
      continue;
    }
    if (argument === '--limit') {
      const value = requiredValue(args, index, '--limit');
      candidate.limit = integerOption(value, '--limit');
      index += 1;
      continue;
    }
    if (argument === '--query') {
      candidate.query = requiredValue(args, index, '--query');
      index += 1;
      continue;
    }
    if (argument === '--category') {
      candidate.category = requiredValue(args, index, '--category');
      index += 1;
      continue;
    }
    throw new DiscoveryCliError(`Unknown option: ${argument}`);
  }

  const parsed = DiscoveryOptionsSchema.safeParse(candidate);
  if (!parsed.success || candidate.limit > 50) {
    throw new DiscoveryCliError(
      !parsed.success
        ? parsed.error.issues[0]?.message ?? 'Invalid discovery options.'
        : '--limit must be between 1 and 50.',
    );
  }
  return { help, options: parsed.data };
}

export function parseLeverCliArgs(
  args: string[],
  configuredCompanies: LeverCompany[] = LEVER_COMPANIES,
): ParsedLeverCli {
  const candidate: DiscoveryOptions = {
    limit: 100,
    pages: 1,
    remoteOnly: false,
    query: '',
    category: '',
    apply: false,
  };
  const requestedCompanies: string[] = [];
  let allCompanies = false;
  let listCompanies = false;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--') continue;
    if (argument === '--help') {
      help = true;
      continue;
    }
    if (argument === '--list-companies') {
      listCompanies = true;
      continue;
    }
    if (argument === '--all-companies') {
      allCompanies = true;
      continue;
    }
    if (argument === '--remote-only') {
      candidate.remoteOnly = true;
      continue;
    }
    if (argument === '--apply') {
      candidate.apply = true;
      continue;
    }
    if (argument === '--company') {
      requestedCompanies.push(requiredValue(args, index, '--company'));
      index += 1;
      continue;
    }
    if (argument === '--limit') {
      candidate.limit = integerOption(
        requiredValue(args, index, '--limit'),
        '--limit',
      );
      index += 1;
      continue;
    }
    if (argument === '--query') {
      candidate.query = requiredValue(args, index, '--query');
      index += 1;
      continue;
    }
    throw new DiscoveryCliError(`Unknown option: ${argument}`);
  }

  if (allCompanies && requestedCompanies.length > 0) {
    throw new DiscoveryCliError(
      'Use either --company or --all-companies, not both.',
    );
  }

  const companies = allCompanies
    ? configuredCompanies.filter((company) => company.enabled)
    : requestedCompanies.map((requested) => {
        if (/^https?:\/\//i.test(requested)) {
          throw new DiscoveryCliError(
            'Lever company selection does not accept URLs or arbitrary hosts.',
          );
        }
        const normalized = requested.trim().toLocaleLowerCase();
        const company = configuredCompanies.find(
          (configured) =>
            configured.site.toLocaleLowerCase() === normalized ||
            configured.displayName.toLocaleLowerCase() === normalized,
        );
        if (!company || !company.enabled) {
          throw new DiscoveryCliError(
            `Unknown or disabled Lever company: ${requested}`,
          );
        }
        return company;
      });
  const uniqueCompanies = [
    ...new Map(
      companies.map((company) => [
        company.site.toLocaleLowerCase(),
        company,
      ]),
    ).values(),
  ];

  if (!help && !listCompanies && uniqueCompanies.length === 0) {
    throw new DiscoveryCliError(
      'Select at least one company with --company or use --all-companies.',
    );
  }
  if (uniqueCompanies.length > 10) {
    throw new DiscoveryCliError(
      'A Lever discovery run supports at most ten companies.',
    );
  }

  const parsed = DiscoveryOptionsSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new DiscoveryCliError(
      parsed.error.issues[0]?.message ?? 'Invalid discovery options.',
    );
  }
  return {
    help,
    listCompanies,
    companies: uniqueCompanies,
    options: parsed.data,
  };
}

export function formatLeverCompanyList(
  companies: LeverCompany[] = LEVER_COMPANIES,
): string {
  const lines = ['Configured Lever companies:'];
  for (const company of companies) {
    lines.push(
      `- ${company.displayName} (${company.site}) — ${company.enabled ? 'enabled' : 'disabled'}`,
    );
  }
  return lines.join('\n');
}

function loadVerifiedSkills(filePath: string): SkillEntry[] {
  let json: unknown;
  try {
    json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    throw new DiscoveryCliError(
      'Unable to read the verified-skills source required for scoring.',
    );
  }
  const parsed = RawVerifiedSkillSchema.array().safeParse(json);
  if (!parsed.success) {
    throw new DiscoveryCliError(
      'The verified-skills source has an unexpected shape.',
    );
  }
  return parsed.data.map(
    (entry): SkillEntry => ({
      name: entry.skill,
      category: 'other',
      proficiency: null,
      verification_status: 'VERIFIED',
      source: 'CV_MJ.docx',
      source_reference: entry.source_reference,
      evidence_level: 'training',
      allowed_in_resume: entry.allowed_in_resume,
    }),
  );
}

function repositoryForRun(
  options: DiscoveryOptions,
  databasePath: string,
): DiscoveryRepository {
  if (options.apply) {
    return createDiscoveryRepository(getDb(databasePath));
  }
  if (!fs.existsSync(databasePath)) {
    return {
      async loadExistingJobs() {
        return [];
      },
      async persistBatch() {
        throw new Error('Dry-run repository cannot persist jobs.');
      },
    };
  }
  return createDiscoveryRepository(getReadonlyDb(databasePath));
}

export function formatDiscoverySummary(
  summary: DiscoveryRunSummary,
): string {
  const lines = [
    `${summary.source} discovery ${summary.dryRun ? 'dry run' : 'apply run'}`,
    `Pages fetched: ${summary.pagesFetched}`,
    `Source records fetched: ${summary.sourceRecordsFetched}`,
    `Accepted by source validation: ${summary.acceptedRecords}`,
    `Rejected as invalid: ${summary.invalidRecords}`,
    `Excluded by local filters: ${summary.excludedByFilters}`,
    `Duplicates: ${summary.duplicates}`,
    `Hard-rejected jobs: ${summary.hardRejectedJobs}`,
    `Eligible/scored jobs: ${summary.eligibleScoredJobs}`,
    `Pipeline errors: ${summary.pipelineErrors}`,
    `Jobs that would be persisted: ${summary.jobsThatWouldBePersisted}`,
    `Jobs persisted: ${summary.jobsPersisted}`,
    `Review status for scored discoveries: ${summary.reviewStatus}`,
  ];

  if (summary.preview.length > 0) {
    lines.push('', 'Preview (descriptions omitted):');
    summary.preview.forEach((job, index) => {
      lines.push(
        `${index + 1}. [${job.status}] ${job.title} — ${job.company} | ${job.location ?? 'Location unknown'} | Score: ${job.score ?? 'Not scored'} | ${job.recommendation ?? 'No recommendation'} | ${job.sourceUrl}`,
      );
    });
  }
  return lines.join('\n');
}

type SharedCliDependencies = Omit<
  ArbeitnowCliDependencies,
  'fetchImpl' | 'timeoutMs' | 'logError'
>;

async function executeDiscoveryCli(
  parsed: ParsedDiscoveryCli,
  adapter: DiscoverySourceAdapter,
  dependencies: SharedCliDependencies,
): Promise<DiscoveryRunSummary> {
  const databasePath =
    dependencies.databasePath ??
    path.join(REPOSITORY_ROOT, 'data', 'app.db');
  const skillsPath =
    dependencies.skillsPath ??
    path.join(REPOSITORY_ROOT, 'candidate', 'skills.verified.json');
  const repository =
    dependencies.repository ??
    repositoryForRun(parsed.options, databasePath);
  const verifiedSkills =
    dependencies.verifiedSkills ?? loadVerifiedSkills(skillsPath);
  const summary = await runDiscovery(parsed.options, {
    adapter,
    repository,
    verifiedSkills,
  });
  (dependencies.log ?? console.log)(formatDiscoverySummary(summary));
  return summary;
}

export async function runArbeitnowCli(
  args: string[],
  dependencies: ArbeitnowCliDependencies = {},
): Promise<{ exitCode: number; summary: DiscoveryRunSummary | null }> {
  const log = dependencies.log ?? console.log;
  const logError = dependencies.logError ?? console.error;

  try {
    const parsed = parseArbeitnowCliArgs(args);
    if (parsed.help) {
      log(ARBEITNOW_CLI_HELP);
      return { exitCode: 0, summary: null };
    }

    const summary = await executeDiscoveryCli(
      parsed,
      new ArbeitnowAdapter({
        fetchImpl: dependencies.fetchImpl,
        timeoutMs: dependencies.timeoutMs,
      }),
      dependencies,
    );
    return { exitCode: 0, summary };
  } catch (error) {
    const message =
      error instanceof DiscoveryCliError ||
      error instanceof ArbeitnowDiscoveryError
        ? error.message
        : 'The Arbeitnow discovery run failed safely. No jobs were persisted.';
    logError(`Error: ${message}`);
    return { exitCode: 1, summary: null };
  }
}

export async function runRemotiveCli(
  args: string[],
  dependencies: RemotiveCliDependencies = {},
): Promise<{ exitCode: number; summary: DiscoveryRunSummary | null }> {
  const log = dependencies.log ?? console.log;
  const logError = dependencies.logError ?? console.error;

  try {
    const parsed = parseRemotiveCliArgs(args);
    if (parsed.help) {
      log(REMOTIVE_CLI_HELP);
      return { exitCode: 0, summary: null };
    }

    const summary = await executeDiscoveryCli(
      parsed,
      new RemotiveAdapter({
        fetchImpl: dependencies.fetchImpl,
        timeoutMs: dependencies.timeoutMs,
        category: parsed.options.category,
      }),
      dependencies,
    );
    return { exitCode: 0, summary };
  } catch (error) {
    const message =
      error instanceof DiscoveryCliError ||
      error instanceof RemotiveDiscoveryError
        ? error.message
        : 'The Remotive discovery run failed safely. No jobs were persisted.';
    logError(`Error: ${message}`);
    return { exitCode: 1, summary: null };
  }
}

export async function runLeverCli(
  args: string[],
  dependencies: LeverCliDependencies = {},
): Promise<{ exitCode: number; summary: DiscoveryRunSummary | null }> {
  const log = dependencies.log ?? console.log;
  const logError = dependencies.logError ?? console.error;
  const configuredCompanies = dependencies.companies ?? LEVER_COMPANIES;

  try {
    const parsed = parseLeverCliArgs(args, configuredCompanies);
    if (parsed.help) {
      log(LEVER_CLI_HELP);
      return { exitCode: 0, summary: null };
    }
    if (parsed.listCompanies) {
      log(formatLeverCompanyList(configuredCompanies));
      return { exitCode: 0, summary: null };
    }

    const summary = await executeDiscoveryCli(
      parsed,
      new LeverAdapter({
        companies: parsed.companies,
        fetchImpl: dependencies.fetchImpl,
        timeoutMs: dependencies.timeoutMs,
      }),
      dependencies,
    );
    return { exitCode: 0, summary };
  } catch (error) {
    const message =
      error instanceof DiscoveryCliError ||
      error instanceof LeverDiscoveryError
        ? error.message
        : 'The Lever discovery run failed safely. No jobs were persisted.';
    logError(`Error: ${message}`);
    return { exitCode: 1, summary: null };
  }
}
