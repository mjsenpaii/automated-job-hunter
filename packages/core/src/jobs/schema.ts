/**
 * @job-app/core — Job schemas
 *
 * Zod schemas for job listings, classification, normalization, and eligibility.
 * These types flow through the entire pipeline: ingestion → classification →
 * scoring → resume engine → application package.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Top-level geographic category for the job */
export const JobCategory = z.enum(['PH', 'INTERNATIONAL']);
export type JobCategory = z.infer<typeof JobCategory>;

/** Physical work arrangement */
export const WorkSetup = z.enum([
  'REMOTE',
  'HYBRID',
  'ONSITE',
  'TEMPORARY_REMOTE',
  'UNCLEAR',
]);
export type WorkSetup = z.infer<typeof WorkSetup>;

/** Whether the candidate can legally/practically apply */
export const EligibilityStatus = z.enum([
  'ELIGIBLE',
  'INELIGIBLE',
  'REQUIRES_REVIEW',
  'LOCATION_REVIEW',
]);
export type EligibilityStatus = z.infer<typeof EligibilityStatus>;

/** Current status of a job in the pipeline */
export const JobStatus = z.enum([
  'DISCOVERED',
  'NORMALIZED',
  'ELIGIBILITY_REVIEW',
  'SCORED',
  'SHORTLISTED',
  'DOCUMENTS_READY',
  'USER_APPROVED',
  'PREFILLED',
  'APPLIED',
  'EMPLOYER_REPLIED',
  'INTERVIEW',
  'OFFER',
  // Terminal / hold statuses
  'FILTERED_OUT',
  'DUPLICATE',
  'EXPIRED',
  'LOCATION_REVIEW',
  'INELIGIBLE',
  'SCAM_SUSPECTED',
  'USER_REJECTED',
  'WITHDRAWN',
  'REJECTED',
  'ERROR',
]);
export type JobStatus = z.infer<typeof JobStatus>;

export const EmploymentType = z.enum([
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'FREELANCE',
  'INTERNSHIP',
  'PROJECT_BASED',
  'UNKNOWN',
]);
export type EmploymentType = z.infer<typeof EmploymentType>;

export const SeniorityLevel = z.enum([
  'INTERN',
  'JUNIOR',
  'MID',
  'SENIOR',
  'LEAD',
  'PRINCIPAL',
  'EXECUTIVE',
  'UNKNOWN',
]);
export type SeniorityLevel = z.infer<typeof SeniorityLevel>;

// ---------------------------------------------------------------------------
// Normalized Job
// ---------------------------------------------------------------------------

export const NormalizedJobSchema = z.object({
  id: z.string(),

  // Source tracking
  source_id: z.string(),
  source_name: z.string(),
  source_job_id: z.string().nullable(),
  original_url: z.string().url().nullable(),

  // Core info
  title: z.string(),
  company: z.string(),
  description: z.string(),

  // Dates
  date_posted: z.string().nullable(),
  date_expires: z.string().nullable(),
  date_ingested: z.string(),

  // Location & work setup
  country: z.string().nullable(),
  city: z.string().nullable(),
  region: z.string().nullable(),
  work_setup: WorkSetup,
  work_setup_confidence: z.number().min(0).max(1),
  work_setup_evidence: z.string().nullable(),
  onsite_days_per_week: z.number().nullable(),
  relocation_required: z.boolean().nullable(),

  // Eligibility
  allowed_countries: z.array(z.string()),
  allowed_regions: z.array(z.string()),
  eligibility_text: z.string().nullable(),

  // Employment details
  employment_type: EmploymentType,
  contract_type: z.string().nullable(),
  schedule: z.string().nullable(),
  timezone_overlap: z.string().nullable(),
  salary_min: z.number().nullable(),
  salary_max: z.number().nullable(),
  salary_currency: z.string().nullable(),
  salary_period: z.enum(['hourly', 'monthly', 'yearly', 'project']).nullable(),

  // Requirements
  seniority: SeniorityLevel,
  years_experience_min: z.number().nullable(),
  years_experience_max: z.number().nullable(),
  required_skills: z.array(z.string()),
  preferred_skills: z.array(z.string()),
  required_education: z.string().nullable(),
  required_licenses: z.array(z.string()),

  // Application
  application_url: z.string().url().nullable(),
  application_method: z.enum(['online_form', 'email', 'api', 'manual', 'unknown']).nullable(),
  has_sensitive_questions: z.boolean().nullable(),

  // Classification (filled during pipeline)
  category: JobCategory.nullable(),
  eligibility_status: EligibilityStatus.nullable(),
  status: JobStatus,

  // Raw data
  raw_snapshot: z.string().nullable(),
});
export type NormalizedJob = z.infer<typeof NormalizedJobSchema>;

// ---------------------------------------------------------------------------
// Classification Result
// ---------------------------------------------------------------------------

export const ClassificationResultSchema = z.object({
  category: JobCategory,
  work_setup: WorkSetup,
  work_setup_confidence: z.number().min(0).max(1),
  work_setup_evidence: z.string(),
  eligibility_status: EligibilityStatus,
  eligibility_evidence: z.string(),
  rejection_reason: z.string().nullable(),
});
export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;

// ---------------------------------------------------------------------------
// Deduplication Result
// ---------------------------------------------------------------------------

export const DeduplicationResultSchema = z.object({
  is_duplicate: z.boolean(),
  duplicate_of_id: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  match_reasons: z.array(z.string()),
});
export type DeduplicationResult = z.infer<typeof DeduplicationResultSchema>;
