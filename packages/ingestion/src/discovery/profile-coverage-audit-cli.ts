import { runProfileMatcherCoverageAudit } from './profile-coverage-audit.js';

async function main(): Promise<void> {
  const result = await runProfileMatcherCoverageAudit();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch(() => {
  process.stderr.write(
    'Profile coverage audit failed safely. No jobs were persisted.\n',
  );
  process.exitCode = 1;
});
