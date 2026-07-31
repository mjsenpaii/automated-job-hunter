import { existsSync } from 'node:fs';
import { getDb, getReadonlyDb } from '@job-app/db/connection';
import { z } from 'zod';
import {
  defaultDatabasePath,
  defaultSkillsPath,
  loadVerifiedSkills,
} from './discovery/runtime.js';
import {
  reprocessJobExtractions,
  reprocessingResultExitCode,
} from './job-extraction-reprocessing.js';

const CliOptionsSchema = z
  .object({
    apply: z.boolean(),
    jobId: z.string().trim().min(1).max(200).optional(),
    limit: z.number().int().min(1).max(10_000).optional(),
    help: z.boolean(),
  })
  .strict();

function help(): string {
  return [
    'Reprocess verified job requirements for existing saved jobs.',
    '',
    'Usage:',
    '  pnpm reprocess-job-extractions -- --dry-run',
    '  pnpm reprocess-job-extractions -- --apply',
    '  pnpm reprocess-job-extractions -- --job-id <id>',
    '  pnpm reprocess-job-extractions -- --limit <count>',
    '',
    'Dry-run is the default. No provider job pages are fetched.',
  ].join('\n');
}

function parseArgs(argv: string[]) {
  let apply = false;
  let explicitDryRun = false;
  let jobId: string | undefined;
  let limit: number | undefined;
  let showHelp = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--apply') apply = true;
    else if (token === '--dry-run') explicitDryRun = true;
    else if (token === '--help' || token === '-h') showHelp = true;
    else if (token === '--job-id') {
      jobId = argv[index + 1];
      index += 1;
    } else if (token === '--limit') {
      limit = Number(argv[index + 1]);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }
  if (apply && explicitDryRun) {
    throw new Error('Choose either --dry-run or --apply, not both.');
  }
  return CliOptionsSchema.parse({
    apply,
    ...(jobId ? { jobId } : {}),
    ...(limit !== undefined ? { limit } : {}),
    help: showHelp,
  });
}

async function main(): Promise<void> {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Invalid arguments.'}\n`,
    );
    process.exitCode = 1;
    return;
  }
  if (options.help) {
    process.stdout.write(`${help()}\n`);
    return;
  }
  const databasePath = defaultDatabasePath();
  if (!existsSync(databasePath)) {
    process.stderr.write('The existing SQLite database was not found.\n');
    process.exitCode = 1;
    return;
  }
  const database = options.apply
    ? getDb(databasePath)
    : getReadonlyDb(databasePath);
  const result = await reprocessJobExtractions(database, {
    apply: options.apply,
    ...(options.jobId ? { jobId: options.jobId } : {}),
    ...(options.limit !== undefined ? { limit: options.limit } : {}),
    verifiedSkills: loadVerifiedSkills(defaultSkillsPath()),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  const exitCode = reprocessingResultExitCode(result);
  if (exitCode !== 0) process.exitCode = exitCode;
}

void main().catch(() => {
  process.stderr.write(
    'Job extraction reprocessing failed safely. No provider payload or stack trace was logged.\n',
  );
  process.exitCode = 1;
});
