import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  check,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  source_id: text('source_id').notNull(),
  source_name: text('source_name').notNull(),
  source_job_id: text('source_job_id').notNull(),
  original_url: text('original_url'),
  title: text('title').notNull(),
  company: text('company').notNull(),
  description: text('description').notNull(),
  date_posted: text('date_posted').notNull(),
  date_expires: text('date_expires').notNull(),
  date_ingested: text('date_ingested').notNull(),
  country: text('country'),
  city: text('city'),
  region: text('region'),
  work_setup: text('work_setup').notNull(), // REMOTE, HYBRID, ONSITE, TEMPORARY_REMOTE, UNCLEAR
  work_setup_confidence: real('work_setup_confidence').notNull(),
  employment_type: text('employment_type').notNull(),
  seniority: text('seniority').notNull(),
  salary_min: real('salary_min'),
  salary_max: real('salary_max'),
  salary_currency: text('salary_currency'),
  salary_period: text('salary_period'),
  salary_grade: integer('salary_grade'),
  salary_step: integer('salary_step'),
  salary_reference_min: real('salary_reference_min'),
  salary_reference_max: real('salary_reference_max'),
  salary_reference_currency: text('salary_reference_currency'),
  salary_reference_period: text('salary_reference_period'),
  salary_reference_schedule_year: integer('salary_reference_schedule_year'),
  salary_reference_source: text('salary_reference_source'),
  salary_is_reference_only: integer('salary_is_reference_only', {
    mode: 'boolean',
  }),
  compensation_note: text('compensation_note'),
  vacancies: integer('vacancies'),
  application_email: text('application_email'),
  application_addressee: text('application_addressee'),
  civil_service_eligibility: text('civil_service_eligibility'),
  schedule_notes: text('schedule_notes'), // JSON stringified array
  government_scope: text('government_scope'),
  years_experience_min: integer('years_experience_min'),
  required_skills: text('required_skills').notNull(), // JSON stringified array
  preferred_skills: text('preferred_skills').notNull(), // JSON stringified array
  category: text('category'), // PH or INTERNATIONAL
  eligibility_status: text('eligibility_status'),
  status: text('status').notNull(), // job pipeline status
  rejection_reasons: text('rejection_reasons'), // JSON array of HardRejectReason; null unless hard-rejected
  raw_snapshot: text('raw_snapshot'),
  created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => {
  return {
    statusIdx: index('jobs_status_idx').on(table.status),
    categoryIdx: index('jobs_category_idx').on(table.category),
    companyIdx: index('jobs_company_idx').on(table.company),
    salaryGradeIdx: index('jobs_salary_grade_idx').on(table.salary_grade),
    governmentScopeIdx: index('jobs_government_scope_idx').on(table.government_scope),
  };
});

export const job_scores = sqliteTable('job_scores', {
  id: text('id').primaryKey(),
  job_id: text('job_id').notNull().references(() => jobs.id),
  score: integer('score').notNull(),
  factors: text('factors').notNull(), // JSON stringified ScoreFactors
  recommendation: text('recommendation').notNull(),
  matched_skills: text('matched_skills').notNull(), // JSON array
  missing_skills: text('missing_skills').notNull(), // JSON array
  risk_flags: text('risk_flags').notNull(), // JSON array
  reason: text('reason').notNull(),
  scored_at: text('scored_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => {
  return {
    jobIdIdx: index('job_scores_job_id_idx').on(table.job_id),
  };
});

export const job_extractions = sqliteTable('job_extractions', {
  job_id: text('job_id')
    .primaryKey()
    .references(() => jobs.id),
  schema_version: integer('schema_version').notNull(),
  content_hash: text('content_hash').notNull(),
  model_identifier: text('model_identifier').notNull(),
  verification_status: text('verification_status').notNull(),
  structured_json: text('structured_json').notNull(),
  extracted_at: text('extracted_at').notNull(),
  created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  contentHashIdx: index('job_extractions_content_hash_idx').on(
    table.content_hash,
  ),
  statusIdx: index('job_extractions_status_idx').on(
    table.verification_status,
  ),
}));

export const applications = sqliteTable('applications', {
  id: text('id').primaryKey(),
  job_id: text('job_id').notNull().references(() => jobs.id),
  status: text('status').notNull(), // DRAFT, DOCUMENTS_READY, USER_APPROVED, SUBMITTED, etc.
  resume_path: text('resume_path'),
  cover_letter_path: text('cover_letter_path'),
  submitted_at: text('submitted_at'),
  response_status: text('response_status'),
  notes: text('notes'),
  created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => {
  return {
    jobIdIdx: index('applications_job_id_idx').on(table.job_id),
  };
});

export const activity_log = sqliteTable('activity_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  action: text('action').notNull(),
  entity_type: text('entity_type').notNull(), // 'job', 'application', 'score', 'system'
  entity_id: text('entity_id'),
  details: text('details'), // JSON
  created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => {
  return {
    entityIdx: index('activity_log_entity_idx').on(table.entity_type, table.entity_id),
  };
});

export const job_discovery_persistence_runs = sqliteTable(
  'job_discovery_persistence_runs',
  {
    idempotency_key: text('idempotency_key').primaryKey(),
    philippine_date: text('philippine_date').notNull(),
    task_id: text('task_id').notNull(),
    run_kind: text('run_kind').notNull(),
    persisted_job_count: integer('persisted_job_count').notNull(),
    created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updated_at: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    philippineDateIdx: index(
      'job_discovery_persistence_runs_ph_date_idx',
    ).on(table.philippine_date),
    persistedCountCheck: check(
      'job_discovery_persistence_runs_count_check',
      sql`${table.persisted_job_count} >= 0 AND ${table.persisted_job_count} <= 5`,
    ),
  }),
);

export const tavily_search_cache = sqliteTable(
  'tavily_search_cache',
  {
    query_hash: text('query_hash').primaryKey(),
    normalized_query: text('normalized_query').notNull(),
    state: text('state').notNull(),
    reservation_token: text('reservation_token'),
    result_json: text('result_json'),
    fetched_at: text('fetched_at'),
    expires_at: text('expires_at'),
    reserved_until: text('reserved_until'),
    updated_at: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    expiresAtIdx: index('tavily_search_cache_expires_at_idx').on(
      table.expires_at,
    ),
  }),
);

export const tavily_search_credit_ledger = sqliteTable(
  'tavily_search_credit_ledger',
  {
    reservation_token: text('reservation_token').primaryKey(),
    philippine_date: text('philippine_date').notNull(),
    query_hash: text('query_hash').notNull(),
    credits: integer('credits').notNull(),
    created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    philippineDateIdx: index(
      'tavily_search_credit_ledger_ph_date_idx',
    ).on(table.philippine_date),
    creditsCheck: check(
      'tavily_search_credit_ledger_credits_check',
      sql`${table.credits} = 1`,
    ),
  }),
);

export const web_discovery_search_cache = sqliteTable(
  'web_discovery_search_cache',
  {
    provider: text('provider').notNull(),
    cache_key: text('cache_key').notNull(),
    normalized_request: text('normalized_request').notNull(),
    state: text('state').notNull(),
    reservation_token: text('reservation_token'),
    result_json: text('result_json'),
    fetched_at: text('fetched_at'),
    expires_at: text('expires_at'),
    reserved_until: text('reserved_until'),
    updated_at: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    providerCachePk: primaryKey({
      columns: [table.provider, table.cache_key],
    }),
    providerCacheIdx: index('web_discovery_search_cache_provider_key_idx').on(
      table.provider,
      table.cache_key,
    ),
    expiresAtIdx: index('web_discovery_search_cache_expires_at_idx').on(
      table.expires_at,
    ),
  }),
);

export const web_discovery_usage_ledger = sqliteTable(
  'web_discovery_usage_ledger',
  {
    reservation_token: text('reservation_token').primaryKey(),
    provider: text('provider').notNull(),
    operation: text('operation').notNull(),
    philippine_date: text('philippine_date').notNull(),
    philippine_month: text('philippine_month').notNull(),
    cache_key: text('cache_key'),
    counted_units: integer('counted_units').notNull(),
    consumed_units: integer('consumed_units').notNull(),
    daily_cap: integer('daily_cap').notNull(),
    monthly_cap: integer('monthly_cap'),
    state: text('state').notNull(),
    created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updated_at: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    providerDateIdx: index('web_discovery_usage_provider_date_idx').on(
      table.provider,
      table.philippine_date,
    ),
    providerMonthIdx: index('web_discovery_usage_provider_month_idx').on(
      table.provider,
      table.philippine_month,
    ),
  }),
);

export const web_discovery_query_group_runs = sqliteTable(
  'web_discovery_query_group_runs',
  {
    run_key: text('run_key').primaryKey(),
    query_group_id: text('query_group_id').notNull(),
    active_profile_key: text('active_profile_key').notNull(),
    cache_strategy: text('cache_strategy').notNull(),
    philippine_date: text('philippine_date').notNull(),
    status: text('status').notNull(),
    selected_at: text('selected_at').notNull(),
    completed_at: text('completed_at'),
  },
  (table) => ({
    selectedAtIdx: index('web_discovery_query_group_selected_idx').on(
      table.selected_at,
    ),
  }),
);

export const web_discovery_deep_scan_runs = sqliteTable(
  'web_discovery_deep_scan_runs',
  {
    idempotency_key: text('idempotency_key').primaryKey(),
    trigger_run_id: text('trigger_run_id').notNull().unique(),
    philippine_date: text('philippine_date').notNull(),
    state: text('state').notNull(),
    verify_and_save: integer('verify_and_save', { mode: 'boolean' }).notNull(),
    cancel_requested: integer('cancel_requested', { mode: 'boolean' }).notNull(),
    stopping_reason: text('stopping_reason'),
    started_at: text('started_at').notNull(),
    completed_at: text('completed_at'),
  },
  (table) => ({
    startedAtIdx: index('web_discovery_deep_scan_started_idx').on(
      table.started_at,
    ),
    triggerRunIdx: index('web_discovery_deep_scan_trigger_run_idx').on(
      table.trigger_run_id,
    ),
  }),
);

export const web_discovery_scan_checkpoints = sqliteTable(
  'web_discovery_scan_checkpoints',
  {
    run_key: text('run_key').notNull(),
    batch_number: integer('batch_number').notNull(),
    urls_attempted: integer('urls_attempted').notNull(),
    pages_parsed: integer('pages_parsed').notNull(),
    pages_recovered: integer('pages_recovered').notNull(),
    pages_rejected: integer('pages_rejected').notNull(),
    created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    runBatchPk: primaryKey({
      columns: [table.run_key, table.batch_number],
    }),
    runBatchIdx: index('web_discovery_scan_checkpoint_run_batch_idx').on(
      table.run_key,
      table.batch_number,
    ),
  }),
);

export const freelance_opportunities = sqliteTable(
  'freelance_opportunities',
  {
    id: text('id').primaryKey(),
    identity_key: text('identity_key').notNull().unique(),
    semantic_identity_key: text('semantic_identity_key').notNull().unique(),
    source: text('source').notNull(),
    source_identifier: text('source_identifier').notNull(),
    canonical_url: text('canonical_url').notNull(),
    title: text('title').notNull(),
    client_or_company: text('client_or_company').notNull(),
    description_hash: text('description_hash').notNull(),
    public_description: text('public_description').notNull(),
    published_at: text('published_at'),
    expires_at: text('expires_at'),
    client_country: text('client_country'),
    geographic_restrictions: text('geographic_restrictions').notNull(),
    timezone_restrictions: text('timezone_restrictions').notNull(),
    remote: integer('remote', { mode: 'boolean' }),
    contract_type: text('contract_type').notNull(),
    pay_kind: text('pay_kind').notNull(),
    original_currency: text('original_currency'),
    budget_min: real('budget_min'),
    budget_max: real('budget_max'),
    pay_period: text('pay_period'),
    stated_hourly_min: real('stated_hourly_min'),
    stated_hourly_max: real('stated_hourly_max'),
    estimated_effective_hourly_rate: real('estimated_effective_hourly_rate'),
    pay_classification: text('pay_classification').notNull(),
    pay_evidence_label: text('pay_evidence_label'),
    required_skills: text('required_skills').notNull(),
    preferred_skills: text('preferred_skills').notNull(),
    minimum_experience_years: integer('minimum_experience_years'),
    seniority: text('seniority').notNull(),
    category_hints: text('category_hints').notNull(),
    views: text('views').notNull(),
    opportunity_categories: text('opportunity_categories').notNull(),
    readiness: text('readiness').notNull(),
    readiness_json: text('readiness_json').notNull(),
    scam_risk: text('scam_risk').notNull(),
    scam_risk_reasons: text('scam_risk_reasons').notNull(),
    ethics_compliance_status: text('ethics_compliance_status').notNull(),
    ranking_score: integer('ranking_score').notNull(),
    status: text('status').notNull(),
    preparation_state: text('preparation_state').notNull(),
    preparation_json: text('preparation_json').notNull(),
    manual_note: text('manual_note'),
    created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updated_at: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    statusIdx: index('freelance_opportunities_status_idx').on(table.status),
    readinessIdx: index('freelance_opportunities_readiness_idx').on(table.readiness),
    riskIdx: index('freelance_opportunities_risk_idx').on(table.scam_risk),
    rankingIdx: index('freelance_opportunities_ranking_idx').on(table.ranking_score),
    payIdx: index('freelance_opportunities_pay_idx').on(table.pay_classification),
  }),
);

export const freelance_opportunity_sources = sqliteTable(
  'freelance_opportunity_sources',
  {
    opportunity_id: text('opportunity_id')
      .notNull()
      .references(() => freelance_opportunities.id),
    source: text('source').notNull(),
    source_identifier: text('source_identifier').notNull(),
    source_url: text('source_url').notNull(),
    cost_classification: text('cost_classification').notNull(),
    created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    attributionPk: primaryKey({
      columns: [table.opportunity_id, table.source, table.source_identifier],
    }),
    opportunityIdx: index('freelance_opportunity_sources_opportunity_idx').on(
      table.opportunity_id,
    ),
  }),
);

export const freelance_persistence_runs = sqliteTable(
  'freelance_persistence_runs',
  {
    idempotency_key: text('idempotency_key').primaryKey(),
    philippine_date: text('philippine_date').notNull(),
    task_id: text('task_id').notNull(),
    persisted_count: integer('persisted_count').notNull(),
    created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    dateIdx: index('freelance_persistence_runs_date_idx').on(
      table.philippine_date,
    ),
    countCheck: check(
      'freelance_persistence_runs_count_check',
      sql`${table.persisted_count} >= 0 AND ${table.persisted_count} <= 20`,
    ),
  }),
);

export const freelance_scan_runs = sqliteTable(
  'freelance_scan_runs',
  {
    idempotency_key: text('idempotency_key').primaryKey(),
    trigger_run_id: text('trigger_run_id').notNull().unique(),
    philippine_date: text('philippine_date').notNull(),
    mode: text('mode').notNull(),
    cache_strategy: text('cache_strategy').notNull(),
    query_group_id: text('query_group_id'),
    state: text('state').notNull(),
    saved_count: integer('saved_count').notNull(),
    started_at: text('started_at').notNull(),
    completed_at: text('completed_at'),
  },
  (table) => ({
    startedIdx: index('freelance_scan_runs_started_idx').on(table.started_at),
  }),
);

export const freelance_source_cache = sqliteTable(
  'freelance_source_cache',
  {
    source: text('source').notNull(),
    cache_key: text('cache_key').notNull(),
    normalized_json: text('normalized_json').notNull(),
    fetched_at: text('fetched_at').notNull(),
    expires_at: text('expires_at').notNull(),
  },
  (table) => ({
    sourceCachePk: primaryKey({ columns: [table.source, table.cache_key] }),
    expiresIdx: index('freelance_source_cache_expires_idx').on(table.expires_at),
  }),
);

export const freelance_opportunity_events = sqliteTable(
  'freelance_opportunity_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    opportunity_id: text('opportunity_id')
      .notNull()
      .references(() => freelance_opportunities.id),
    action: text('action').notNull(),
    safe_details: text('safe_details'),
    created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    opportunityIdx: index('freelance_opportunity_events_opportunity_idx').on(
      table.opportunity_id,
    ),
  }),
);

export const blacklist = sqliteTable('blacklist', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  company_name: text('company_name').notNull(),
  reason: text('reason').notNull(),
  created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});
