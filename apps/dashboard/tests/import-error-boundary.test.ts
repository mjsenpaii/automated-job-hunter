import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Guards the route-level error boundary file: recovery actions must remain
 * present so unexpected component errors never leave users without a path back.
 */
describe('import-job error boundary', () => {
  it('unexpected component error renders recovery actions (Retry / Return / Dashboard)', () => {
    const src = readFileSync(
      path.resolve(__dirname, '../src/app/import-job/error.tsx'),
      'utf8',
    );
    expect(src).toMatch(/Try again/);
    expect(src).toMatch(/Return to importer/);
    expect(src).toMatch(/Back to dashboard/);
    expect(src).not.toMatch(/error\.stack/);
    expect(src).not.toMatch(/error\.message\}/);
  });
});
