import { getDb } from '@job-app/db/connection';
import fs from 'fs';
import path from 'path';

type Database = ReturnType<typeof getDb>;

let instance: Database | null = null;

/**
 * Lazily opens (and memoises) the SQLite database connection.
 *
 * Opening happens on first use inside a request handler — NOT at module import —
 * so the Next.js production build's "collect page data" step doesn't try to load
 * the native `better-sqlite3` binding, and any failure surfaces inside the route's
 * try/catch as a structured JSON error rather than an HTML 500.
 */
export function getDatabase(): Database {
  if (instance) return instance;

  const dataDir = path.join(process.cwd(), '../../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  instance = getDb(path.join(dataDir, 'app.db'));
  return instance;
}
