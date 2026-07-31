import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  check,
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

export const blacklist = sqliteTable('blacklist', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  company_name: text('company_name').notNull(),
  reason: text('reason').notNull(),
  created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});
