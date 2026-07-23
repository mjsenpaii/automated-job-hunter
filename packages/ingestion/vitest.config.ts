import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@job-app/core': path.resolve(__dirname, '../core/src'),
      '@job-app/classification': path.resolve(__dirname, '../classification/src'),
      '@job-app/scoring': path.resolve(__dirname, '../scoring/src'),
      '@job-app/db': path.resolve(__dirname, '../db/src')
    }
  },
  test: {
    globals: true,
    environment: 'node'
  }
});
