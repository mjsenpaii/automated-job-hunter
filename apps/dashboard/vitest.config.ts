import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Test-only aliases. Production Next.js builds consume workspace packages via
 * their compiled `dist` entry points (`package.json` exports) — see
 * `apps/dashboard/next.config.ts`. These aliases must not be copied into Next config.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@job-app/core': path.resolve(__dirname, '../../packages/core/src'),
      '@job-app/ingestion/import-contracts': path.resolve(
        __dirname,
        '../../packages/ingestion/src/import-contracts.ts',
      ),
      '@job-app/ingestion/gemini-contracts': path.resolve(
        __dirname,
        '../../packages/ingestion/src/gemini-contracts.ts',
      ),
      '@job-app/ingestion/gemini-server': path.resolve(
        __dirname,
        '../../packages/ingestion/src/gemini-job-extractor.server.ts',
      ),
      '@job-app/ingestion/gemini-requirements-server': path.resolve(
        __dirname,
        '../../packages/ingestion/src/gemini-job-requirements.server.ts',
      ),
      '@job-app/ingestion/job-requirements-contracts': path.resolve(
        __dirname,
        '../../packages/ingestion/src/job-requirements-contracts.ts',
      ),
      '@job-app/ingestion/discovery/dashboard-scan-contracts': path.resolve(
        __dirname,
        '../../packages/ingestion/src/discovery/dashboard-scan-contracts.ts',
      ),
      '@job-app/ingestion/discovery/dashboard-scan': path.resolve(
        __dirname,
        '../../packages/ingestion/src/discovery/dashboard-scan.ts',
      ),
      '@job-app/ingestion/government-enrichment': path.resolve(
        __dirname,
        '../../packages/ingestion/src/government-enrichment.ts',
      ),
      '@job-app/ingestion': path.resolve(__dirname, '../../packages/ingestion/src'),
      'server-only': path.resolve(__dirname, './tests/server-only.ts'),
      '@job-app/classification': path.resolve(__dirname, '../../packages/classification/src'),
      '@job-app/scoring': path.resolve(__dirname, '../../packages/scoring/src'),
      '@job-app/db': path.resolve(__dirname, '../../packages/db/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
