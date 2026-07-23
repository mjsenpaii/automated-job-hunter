import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SCENARIOS, buildReport, writeReport } from '../src/generate-validation-report.js';

// Repo-root docs path (tests dir → ../../../docs).
const REPORT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../docs/AUTOMATED_JOB_VALIDATION_REPORT.md',
);

describe('Automated validation report (real production pipeline)', () => {
  it('covers all eight realistic scenarios', () => {
    // 8 scenarios + 0 helpers; scenario 1's duplicate is checked separately in validation-realistic.test.ts.
    expect(SCENARIOS.length).toBe(8);
  });

  it('every scenario passes through the real ingestJob pipeline and regenerates the report', async () => {
    const report = await writeReport(REPORT_PATH);
    // Surface any discrepancy in the failure message for fast diagnosis.
    const failures = report.results.filter((r) => !r.pass).map((r) => `${r.name}: ${r.discrepancy}`);
    expect(failures, failures.join(' | ')).toEqual([]);
    expect(report.allPass).toBe(true);
  });
});
