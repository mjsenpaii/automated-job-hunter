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
 * Opens an existing SQLite database without schema initialization or writes.
 *
 * Discovery dry runs use this boundary so merely evaluating source jobs cannot
 * create a database, change WAL state, or run additive schema migrations.
 */
export function getReadonlyDb(
  dbPath: string,
): BetterSQLite3Database<typeof schema> {
  const sqlite = new Database(dbPath, {
    readonly: true,
    fileMustExist: true,
  });
  sqlite.pragma('query_only = ON');
  return drizzle(sqlite, { schema });
}

export function openReadonlyDatabaseSession(
  dbPath: string,
): {
  database: BetterSQLite3Database<typeof schema>;
  close(): void;
} {
  const sqlite = new Database(dbPath, {
    readonly: true,
    fileMustExist: true,
  });
  sqlite.pragma('query_only = ON');
  return {
    database: drizzle(sqlite, { schema }),
    close() {
      sqlite.close();
    },
  };
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
      salary_grade INTEGER,
      salary_step INTEGER,
      salary_reference_min REAL,
      salary_reference_max REAL,
      salary_reference_currency TEXT,
      salary_reference_period TEXT,
      salary_reference_schedule_year INTEGER,
      salary_reference_source TEXT,
      salary_is_reference_only INTEGER,
      compensation_note TEXT,
      vacancies INTEGER,
      application_email TEXT,
      application_addressee TEXT,
      civil_service_eligibility TEXT,
      schedule_notes TEXT,
      government_scope TEXT,
      years_experience_min INTEGER,
      required_skills TEXT NOT NULL,
      preferred_skills TEXT NOT NULL,
      category TEXT,
      eligibility_status TEXT,
      status TEXT NOT NULL,
      rejection_reasons TEXT,
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

    CREATE TABLE IF NOT EXISTS job_extractions (
      job_id TEXT PRIMARY KEY REFERENCES jobs(id),
      schema_version INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      model_identifier TEXT NOT NULL,
      verification_status TEXT NOT NULL,
      structured_json TEXT NOT NULL,
      extracted_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS job_extractions_content_hash_idx
      ON job_extractions (content_hash);
    CREATE INDEX IF NOT EXISTS job_extractions_status_idx
      ON job_extractions (verification_status);

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

    CREATE TABLE IF NOT EXISTS job_discovery_persistence_runs (
      idempotency_key TEXT PRIMARY KEY,
      philippine_date TEXT NOT NULL,
      task_id TEXT NOT NULL,
      run_kind TEXT NOT NULL,
      persisted_job_count INTEGER NOT NULL CHECK (
        persisted_job_count >= 0 AND persisted_job_count <= 5
      ),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS job_discovery_persistence_runs_ph_date_idx
      ON job_discovery_persistence_runs (philippine_date);
    CREATE TRIGGER IF NOT EXISTS job_discovery_persistence_runs_daily_limit
      BEFORE INSERT ON job_discovery_persistence_runs
      WHEN (
        SELECT COALESCE(SUM(persisted_job_count), 0)
        FROM job_discovery_persistence_runs
        WHERE philippine_date = NEW.philippine_date
      ) + NEW.persisted_job_count > 5
      BEGIN
        SELECT RAISE(ABORT, 'job discovery daily persistence limit exceeded');
      END;

    WITH legacy_controlled_runs AS (
      SELECT
        id,
        entity_id AS idempotency_key,
        date(created_at, '+8 hours') AS philippine_date,
        CAST(json_extract(details, '$.jobsPersisted') AS INTEGER)
          AS persisted_job_count,
        created_at,
        SUM(
          CAST(json_extract(details, '$.jobsPersisted') AS INTEGER)
        ) OVER (
          PARTITION BY date(created_at, '+8 hours')
          ORDER BY created_at, id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cumulative_persisted_count
      FROM activity_log
      WHERE action = 'CONTROLLED_PUBLIC_JOB_DISCOVERY_COMPLETED'
        AND entity_type = 'system'
        AND entity_id IS NOT NULL
        AND details IS NOT NULL
        AND json_valid(details)
        AND CAST(json_extract(details, '$.jobsPersisted') AS INTEGER)
          BETWEEN 0 AND 5
    )
    INSERT INTO job_discovery_persistence_runs (
      idempotency_key,
      philippine_date,
      task_id,
      run_kind,
      persisted_job_count,
      created_at,
      updated_at
    )
    SELECT
      idempotency_key,
      philippine_date,
      'public-job-discovery-controlled-persistence',
      'MANUAL_CONTROLLED',
      persisted_job_count,
      created_at,
      created_at
    FROM legacy_controlled_runs
    WHERE cumulative_persisted_count <= 5
      AND NOT EXISTS (
        SELECT 1
        FROM job_discovery_persistence_runs existing
        WHERE existing.idempotency_key = legacy_controlled_runs.idempotency_key
      );

    CREATE TABLE IF NOT EXISTS blacklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Defensive, idempotent additive migration for older local databases.
  // This changes schema only; it never rewrites existing job rows.
  const jobsColumns = sqlite.prepare(`PRAGMA table_info(jobs)`).all() as { name: string }[];
  const additiveColumns: ReadonlyArray<{ name: string; sql: string }> = [
    { name: 'rejection_reasons', sql: 'rejection_reasons TEXT' },
    { name: 'salary_grade', sql: 'salary_grade INTEGER' },
    { name: 'salary_step', sql: 'salary_step INTEGER' },
    { name: 'salary_reference_min', sql: 'salary_reference_min REAL' },
    { name: 'salary_reference_max', sql: 'salary_reference_max REAL' },
    {
      name: 'salary_reference_currency',
      sql: 'salary_reference_currency TEXT',
    },
    { name: 'salary_reference_period', sql: 'salary_reference_period TEXT' },
    {
      name: 'salary_reference_schedule_year',
      sql: 'salary_reference_schedule_year INTEGER',
    },
    { name: 'salary_reference_source', sql: 'salary_reference_source TEXT' },
    {
      name: 'salary_is_reference_only',
      sql: 'salary_is_reference_only INTEGER',
    },
    { name: 'compensation_note', sql: 'compensation_note TEXT' },
    { name: 'vacancies', sql: 'vacancies INTEGER' },
    { name: 'application_email', sql: 'application_email TEXT' },
    { name: 'application_addressee', sql: 'application_addressee TEXT' },
    {
      name: 'civil_service_eligibility',
      sql: 'civil_service_eligibility TEXT',
    },
    { name: 'schedule_notes', sql: 'schedule_notes TEXT' },
    { name: 'government_scope', sql: 'government_scope TEXT' },
  ];
  const existingNames = new Set(jobsColumns.map((column) => column.name));
  for (const column of additiveColumns) {
    if (!existingNames.has(column.name)) {
      sqlite.exec(`ALTER TABLE jobs ADD COLUMN ${column.sql}`);
    }
  }
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS jobs_salary_grade_idx ON jobs (salary_grade);
    CREATE INDEX IF NOT EXISTS jobs_government_scope_idx ON jobs (government_scope);
  `);
}
