import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema.js';

export function createDatabase(dbPath: string = './data/app.db'): Database.Database {
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  ensureSchema(sqlite);
  return sqlite;
}

export function getDb(dbPath: string = './data/app.db'): BetterSQLite3Database<typeof schema> {
  const sqlite = createDatabase(dbPath);
  return drizzle(sqlite, { schema });
}

/**
 * Idempotently creates the tables/indexes the app needs (local-first SQLite).
 *
 * Mirrors `schema.ts` using `CREATE TABLE IF NOT EXISTS`, so a fresh database file
 * is usable immediately without a separate migration step. Kept next to `schema.ts`
 * so both stay in sync.
 */
export function ensureSchema(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      source_job_id TEXT NOT NULL,
      original_url TEXT,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      description TEXT NOT NULL,
      date_posted TEXT NOT NULL,
      date_expires TEXT NOT NULL,
      date_ingested TEXT NOT NULL,
      country TEXT,
      city TEXT,
      region TEXT,
      work_setup TEXT NOT NULL,
      work_setup_confidence REAL NOT NULL,
      employment_type TEXT NOT NULL,
      seniority TEXT NOT NULL,
      salary_min REAL,
      salary_max REAL,
      salary_currency TEXT,
      salary_period TEXT,
      years_experience_min INTEGER,
      required_skills TEXT NOT NULL,
      preferred_skills TEXT NOT NULL,
      category TEXT,
      eligibility_status TEXT,
      status TEXT NOT NULL,
      raw_snapshot TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs (status);
    CREATE INDEX IF NOT EXISTS jobs_category_idx ON jobs (category);
    CREATE INDEX IF NOT EXISTS jobs_company_idx ON jobs (company);

    CREATE TABLE IF NOT EXISTS job_scores (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      score INTEGER NOT NULL,
      factors TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      matched_skills TEXT NOT NULL,
      missing_skills TEXT NOT NULL,
      risk_flags TEXT NOT NULL,
      reason TEXT NOT NULL,
      scored_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS job_scores_job_id_idx ON job_scores (job_id);

    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      status TEXT NOT NULL,
      resume_path TEXT,
      cover_letter_path TEXT,
      submitted_at TEXT,
      response_status TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS applications_job_id_idx ON applications (job_id);

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS activity_log_entity_idx ON activity_log (entity_type, entity_id);

    CREATE TABLE IF NOT EXISTS blacklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
