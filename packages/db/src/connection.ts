import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema.js';

type SqliteTableColumn = {
  name: string;
  notnull: number;
};

type SqliteIndex = {
  name: string;
  unique: number;
};

type SqliteIndexColumn = {
  name: string;
};

function hasUniqueSingleColumnIndex(
  sqlite: Database.Database,
  tableName: string,
  columnName: string,
): boolean {
  const indexes = sqlite.prepare(`PRAGMA index_list('${tableName}')`).all() as SqliteIndex[];
  return indexes.some((index) => {
    if (index.unique !== 1) return false;
    const safeIndexName = index.name.replaceAll("'", "''");
    const columns = sqlite
      .prepare(`PRAGMA index_info('${safeIndexName}')`)
      .all() as SqliteIndexColumn[];
    return columns.length === 1 && columns[0]?.name === columnName;
  });
}

/**
 * Upgrades the first Phase 7.1B.7A draft table without dropping opportunity
 * data. SQLite's CREATE TABLE IF NOT EXISTS does not add later columns, so the
 * local-first initializer needs an explicit, transactional additive migration.
 */
function ensureFreelanceOpportunitySchema(sqlite: Database.Database): void {
  const columns = sqlite
    .prepare(`PRAGMA table_info('freelance_opportunities')`)
    .all() as SqliteTableColumn[];
  const names = new Set(columns.map((column) => column.name));
  const semanticIdentityIsUnique = names.has('semantic_identity_key') &&
    hasUniqueSingleColumnIndex(
      sqlite,
      'freelance_opportunities',
      'semantic_identity_key',
    );

  if (
    names.has('semantic_identity_key') &&
    names.has('opportunity_categories') &&
    names.has('ethics_compliance_status') &&
    semanticIdentityIsUnique
  ) {
    return;
  }

  sqlite.transaction(() => {
    if (!names.has('semantic_identity_key')) {
      sqlite.exec(`
        ALTER TABLE freelance_opportunities
          ADD COLUMN semantic_identity_key TEXT NOT NULL DEFAULT '';
        UPDATE freelance_opportunities
          SET semantic_identity_key = identity_key
          WHERE semantic_identity_key = '';
      `);
    }
    if (!names.has('opportunity_categories')) {
      sqlite.exec(`
        ALTER TABLE freelance_opportunities
          ADD COLUMN opportunity_categories TEXT NOT NULL DEFAULT '[]';
      `);
    }
    if (!names.has('ethics_compliance_status')) {
      sqlite.exec(`
        ALTER TABLE freelance_opportunities
          ADD COLUMN ethics_compliance_status TEXT NOT NULL
          DEFAULT 'REQUIRES_REVIEW';
      `);
    }
    if (!hasUniqueSingleColumnIndex(
      sqlite,
      'freelance_opportunities',
      'semantic_identity_key',
    )) {
      sqlite.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS
          freelance_opportunities_semantic_identity_unique
          ON freelance_opportunities (semantic_identity_key);
      `);
    }
  })();
}

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

    CREATE TABLE IF NOT EXISTS tavily_search_cache (
      query_hash TEXT PRIMARY KEY,
      normalized_query TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('IN_FLIGHT', 'READY', 'FAILED')),
      reservation_token TEXT,
      result_json TEXT,
      fetched_at TEXT,
      expires_at TEXT,
      reserved_until TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS tavily_search_cache_expires_at_idx
      ON tavily_search_cache (expires_at);

    CREATE TABLE IF NOT EXISTS tavily_search_credit_ledger (
      reservation_token TEXT PRIMARY KEY,
      philippine_date TEXT NOT NULL,
      query_hash TEXT NOT NULL,
      credits INTEGER NOT NULL CHECK (credits = 1),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS tavily_search_credit_ledger_ph_date_idx
      ON tavily_search_credit_ledger (philippine_date);
    CREATE TRIGGER IF NOT EXISTS tavily_search_credit_daily_limit
      BEFORE INSERT ON tavily_search_credit_ledger
      WHEN (
        SELECT COALESCE(SUM(credits), 0)
        FROM tavily_search_credit_ledger
        WHERE philippine_date = NEW.philippine_date
      ) + NEW.credits > 16
      BEGIN
        SELECT RAISE(ABORT, 'tavily daily credit limit exceeded');
      END;

    CREATE TABLE IF NOT EXISTS web_discovery_search_cache (
      provider TEXT NOT NULL CHECK (provider IN ('TAVILY', 'GEMINI_SEARCH')),
      cache_key TEXT NOT NULL,
      normalized_request TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('IN_FLIGHT', 'READY', 'FAILED')),
      reservation_token TEXT,
      result_json TEXT,
      fetched_at TEXT,
      expires_at TEXT,
      reserved_until TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (provider, cache_key)
    );
    CREATE INDEX IF NOT EXISTS web_discovery_search_cache_provider_key_idx
      ON web_discovery_search_cache (provider, cache_key);
    CREATE INDEX IF NOT EXISTS web_discovery_search_cache_expires_at_idx
      ON web_discovery_search_cache (expires_at);

    CREATE TABLE IF NOT EXISTS web_discovery_usage_ledger (
      reservation_token TEXT PRIMARY KEY,
      provider TEXT NOT NULL CHECK (provider IN ('TAVILY', 'GEMINI_SEARCH')),
      operation TEXT NOT NULL CHECK (operation IN ('SEARCH', 'EXTRACT', 'PROMPT')),
      philippine_date TEXT NOT NULL,
      philippine_month TEXT NOT NULL,
      cache_key TEXT,
      counted_units INTEGER NOT NULL CHECK (counted_units >= 0),
      consumed_units INTEGER NOT NULL CHECK (consumed_units >= 0),
      daily_cap INTEGER NOT NULL CHECK (daily_cap > 0),
      monthly_cap INTEGER CHECK (monthly_cap IS NULL OR monthly_cap > 0),
      state TEXT NOT NULL CHECK (state IN ('RESERVED', 'COMPLETED', 'RELEASED')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS web_discovery_usage_provider_date_idx
      ON web_discovery_usage_ledger (provider, philippine_date);
    CREATE INDEX IF NOT EXISTS web_discovery_usage_provider_month_idx
      ON web_discovery_usage_ledger (provider, philippine_month);
    CREATE TRIGGER IF NOT EXISTS web_discovery_usage_daily_limit
      BEFORE INSERT ON web_discovery_usage_ledger
      WHEN (
        SELECT COALESCE(SUM(counted_units), 0)
        FROM web_discovery_usage_ledger
        WHERE provider = NEW.provider
          AND philippine_date = NEW.philippine_date
      ) + NEW.counted_units > NEW.daily_cap
      BEGIN
        SELECT RAISE(ABORT, 'web discovery daily quota exceeded');
      END;
    CREATE TRIGGER IF NOT EXISTS web_discovery_usage_monthly_limit
      BEFORE INSERT ON web_discovery_usage_ledger
      WHEN NEW.monthly_cap IS NOT NULL AND (
        SELECT COALESCE(SUM(counted_units), 0)
        FROM web_discovery_usage_ledger
        WHERE provider = NEW.provider
          AND philippine_month = NEW.philippine_month
      ) + NEW.counted_units > NEW.monthly_cap
      BEGIN
        SELECT RAISE(ABORT, 'web discovery monthly quota exceeded');
      END;

    CREATE TABLE IF NOT EXISTS web_discovery_query_group_runs (
      run_key TEXT PRIMARY KEY,
      query_group_id TEXT NOT NULL,
      active_profile_key TEXT NOT NULL,
      cache_strategy TEXT NOT NULL CHECK (cache_strategy IN ('CACHED', 'FRESH')),
      philippine_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('SELECTED', 'COMPLETED', 'FAILED', 'CANCELLED')),
      selected_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS web_discovery_query_group_selected_idx
      ON web_discovery_query_group_runs (selected_at);

    CREATE TABLE IF NOT EXISTS web_discovery_deep_scan_runs (
      idempotency_key TEXT PRIMARY KEY,
      trigger_run_id TEXT NOT NULL UNIQUE,
      philippine_date TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('ACTIVE', 'COMPLETED', 'FAILED', 'CANCELLED')),
      verify_and_save INTEGER NOT NULL CHECK (verify_and_save IN (0, 1)),
      cancel_requested INTEGER NOT NULL CHECK (cancel_requested IN (0, 1)),
      stopping_reason TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS web_discovery_deep_scan_started_idx
      ON web_discovery_deep_scan_runs (started_at);
    CREATE INDEX IF NOT EXISTS web_discovery_deep_scan_trigger_run_idx
      ON web_discovery_deep_scan_runs (trigger_run_id);

    CREATE TABLE IF NOT EXISTS web_discovery_scan_checkpoints (
      run_key TEXT NOT NULL,
      batch_number INTEGER NOT NULL CHECK (batch_number > 0),
      urls_attempted INTEGER NOT NULL CHECK (urls_attempted >= 0),
      pages_parsed INTEGER NOT NULL CHECK (pages_parsed >= 0),
      pages_recovered INTEGER NOT NULL CHECK (pages_recovered >= 0),
      pages_rejected INTEGER NOT NULL CHECK (pages_rejected >= 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (run_key, batch_number)
    );
    CREATE INDEX IF NOT EXISTS web_discovery_scan_checkpoint_run_batch_idx
      ON web_discovery_scan_checkpoints (run_key, batch_number);

    CREATE TABLE IF NOT EXISTS freelance_opportunities (
      id TEXT PRIMARY KEY,
      identity_key TEXT NOT NULL UNIQUE,
      semantic_identity_key TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL,
      source_identifier TEXT NOT NULL,
      canonical_url TEXT NOT NULL,
      title TEXT NOT NULL,
      client_or_company TEXT NOT NULL,
      description_hash TEXT NOT NULL,
      public_description TEXT NOT NULL,
      published_at TEXT,
      expires_at TEXT,
      client_country TEXT,
      geographic_restrictions TEXT NOT NULL,
      timezone_restrictions TEXT NOT NULL,
      remote INTEGER,
      contract_type TEXT NOT NULL,
      pay_kind TEXT NOT NULL,
      original_currency TEXT,
      budget_min REAL,
      budget_max REAL,
      pay_period TEXT,
      stated_hourly_min REAL,
      stated_hourly_max REAL,
      estimated_effective_hourly_rate REAL,
      pay_classification TEXT NOT NULL,
      pay_evidence_label TEXT,
      required_skills TEXT NOT NULL,
      preferred_skills TEXT NOT NULL,
      minimum_experience_years INTEGER,
      seniority TEXT NOT NULL,
      category_hints TEXT NOT NULL,
      views TEXT NOT NULL,
      opportunity_categories TEXT NOT NULL,
      readiness TEXT NOT NULL,
      readiness_json TEXT NOT NULL,
      scam_risk TEXT NOT NULL,
      scam_risk_reasons TEXT NOT NULL,
      ethics_compliance_status TEXT NOT NULL,
      ranking_score INTEGER NOT NULL,
      status TEXT NOT NULL,
      preparation_state TEXT NOT NULL,
      preparation_json TEXT NOT NULL,
      manual_note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS freelance_opportunities_status_idx
      ON freelance_opportunities (status);
    CREATE INDEX IF NOT EXISTS freelance_opportunities_readiness_idx
      ON freelance_opportunities (readiness);
    CREATE INDEX IF NOT EXISTS freelance_opportunities_risk_idx
      ON freelance_opportunities (scam_risk);
    CREATE INDEX IF NOT EXISTS freelance_opportunities_ranking_idx
      ON freelance_opportunities (ranking_score);
    CREATE INDEX IF NOT EXISTS freelance_opportunities_pay_idx
      ON freelance_opportunities (pay_classification);

    CREATE TABLE IF NOT EXISTS freelance_opportunity_sources (
      opportunity_id TEXT NOT NULL REFERENCES freelance_opportunities(id),
      source TEXT NOT NULL,
      source_identifier TEXT NOT NULL,
      source_url TEXT NOT NULL,
      cost_classification TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (opportunity_id, source, source_identifier)
    );
    CREATE INDEX IF NOT EXISTS freelance_opportunity_sources_opportunity_idx
      ON freelance_opportunity_sources (opportunity_id);

    CREATE TABLE IF NOT EXISTS freelance_persistence_runs (
      idempotency_key TEXT PRIMARY KEY,
      philippine_date TEXT NOT NULL,
      task_id TEXT NOT NULL,
      persisted_count INTEGER NOT NULL CHECK (
        persisted_count >= 0 AND persisted_count <= 20
      ),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS freelance_persistence_runs_date_idx
      ON freelance_persistence_runs (philippine_date);
    CREATE TRIGGER IF NOT EXISTS freelance_persistence_runs_daily_limit
      BEFORE INSERT ON freelance_persistence_runs
      WHEN (
        SELECT COALESCE(SUM(persisted_count), 0)
        FROM freelance_persistence_runs
        WHERE philippine_date = NEW.philippine_date
      ) + NEW.persisted_count > 20
      BEGIN
        SELECT RAISE(ABORT, 'freelance daily persistence limit exceeded');
      END;

    CREATE TABLE IF NOT EXISTS freelance_scan_runs (
      idempotency_key TEXT PRIMARY KEY,
      trigger_run_id TEXT NOT NULL UNIQUE,
      philippine_date TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('PREVIEW', 'SAVE')),
      cache_strategy TEXT NOT NULL CHECK (cache_strategy IN ('CACHED', 'FRESH')),
      query_group_id TEXT,
      state TEXT NOT NULL CHECK (state IN ('ACTIVE', 'COMPLETED', 'FAILED')),
      saved_count INTEGER NOT NULL CHECK (saved_count >= 0 AND saved_count <= 20),
      started_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS freelance_scan_runs_started_idx
      ON freelance_scan_runs (started_at);

    CREATE TABLE IF NOT EXISTS freelance_source_cache (
      source TEXT NOT NULL CHECK (source IN ('HIMALAYAS', 'REMOTIVE')),
      cache_key TEXT NOT NULL,
      normalized_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      PRIMARY KEY (source, cache_key)
    );
    CREATE INDEX IF NOT EXISTS freelance_source_cache_expires_idx
      ON freelance_source_cache (expires_at);

    CREATE TABLE IF NOT EXISTS freelance_opportunity_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      opportunity_id TEXT NOT NULL REFERENCES freelance_opportunities(id),
      action TEXT NOT NULL,
      safe_details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS freelance_opportunity_events_opportunity_idx
      ON freelance_opportunity_events (opportunity_id);

    INSERT OR IGNORE INTO web_discovery_usage_ledger (
      reservation_token,
      provider,
      operation,
      philippine_date,
      philippine_month,
      cache_key,
      counted_units,
      consumed_units,
      daily_cap,
      monthly_cap,
      state,
      created_at,
      updated_at
    )
    SELECT
      'legacy-tavily-search:' || reservation_token,
      'TAVILY',
      'SEARCH',
      philippine_date,
      substr(philippine_date, 1, 7),
      query_hash,
      0,
      0,
      30,
      900,
      'RELEASED',
      created_at,
      created_at
    FROM tavily_search_credit_ledger;

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

  ensureFreelanceOpportunitySchema(sqlite);

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
