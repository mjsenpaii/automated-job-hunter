/**
 * Shared contracts for the dashboard URL-import → confirm-and-score flow.
 *
 * Kept in `@job-app/ingestion` so the API routes and the client UI share one
 * Zod source of truth (no duplicated frontend/backend shapes, no `any`).
 *
 * IMPORTANT: This module must stay free of Node-only imports (net/dns/fs) so
 * client components can import `@job-app/ingestion/import-contracts` safely.
 */

import { z } from 'zod';
import { ScoreRecommendation, StructuredScoreSchema } from '@job-app/core';
import {
  GeminiEvidenceSchema,
  GeminiExtractionMetadataSchema,
} from './gemini-contracts.js';
import { GovernmentScopeSchema } from './government-enrichment.js';

export type { ExtractedJobData, ExtractionResult } from './types.js';

// ---------------------------------------------------------------------------
// Confirm & Score request (client → POST /api/jobs)
// ---------------------------------------------------------------------------

const nonEmpty = (label: string, max: number) =>
  z
    .string({ required_error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} is too long.`);

/**
 * Fields required before Confirm & Score may run.
 * Location is satisfied by country OR city (either is enough).
 */
export const ConfirmScoreRequestSchema = z
  .object({
    title: nonEmpty('Job title', 200),
    company: nonEmpty('Company name', 200),
    description: nonEmpty('Job description', 50_000),
    url: z
      .string()
      .trim()
      .url('Enter a valid http(s) URL.')
      .max(2000, 'Source URL is too long.')
      .optional()
      .nullable(),
    source_site: z.string().trim().max(200).optional().nullable(),
    country: z.string().trim().max(120).optional().nullable(),
    city: z.string().trim().max(120).optional().nullable(),
    location: z.string().trim().max(300).optional().nullable(),
    work_setup: z.enum(['REMOTE', 'HYBRID', 'ONSITE', 'TEMPORARY_REMOTE', 'UNCLEAR'], {
      required_error: 'Work setup is required.',
      invalid_type_error: 'Work setup is required.',
    }),
    employment_type: z.string().trim().max(80).optional().nullable(),
    skills: z.string().trim().max(2000).optional().nullable(),
    salary_text: z.string().trim().max(200).optional().nullable(),
    salary_min: z.number().nonnegative().optional().nullable(),
    salary_max: z.number().nonnegative().optional().nullable(),
    salary_currency: z.string().trim().max(20).optional().nullable(),
    salary_grade: z.number().int().min(1).max(33).optional().nullable(),
    salary_step: z.number().int().min(1).max(8).optional().nullable(),
    hours_per_week: z.number().nonnegative().max(168).optional().nullable(),
    date_posted: z.string().trim().max(80).optional().nullable(),
    date_updated: z.string().trim().max(80).optional().nullable(),
    closing_date: z.string().date().optional().nullable(),
    timezone_or_schedule: z.string().trim().max(500).optional().nullable(),
    seniority: z.string().trim().max(80).optional().nullable(),
    vacancies: z.number().int().positive().optional().nullable(),
    civil_service_eligibility: z.string().trim().max(1000).optional().nullable(),
    schedule_notes: z.array(z.string().trim().min(1).max(1000)).max(100).default([]),
    government_scope: GovernmentScopeSchema.optional().nullable(),
    responsibilities: z.array(z.string().trim().min(1).max(1000)).max(100).default([]),
    requirements: z.array(z.string().trim().min(1).max(1000)).max(100).default([]),
    required_years_experience: z.number().nonnegative().max(50).optional().nullable(),
    preferred_years_experience: z.number().nonnegative().max(50).optional().nullable(),
    application_instructions: z.array(z.string().trim().min(1).max(1000)).max(100).default([]),
    application_keyword: z.string().trim().max(200).optional().nullable(),
    application_email: z.string().trim().email().max(320).optional().nullable(),
    application_addressee: z.string().trim().max(500).optional().nullable(),
    application_url: z.string().trim().url().max(2000).optional().nullable(),
    evidence: z.array(GeminiEvidenceSchema).max(40).default([]),
    extraction_metadata: GeminiExtractionMetadataSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const country = (data.country ?? '').trim();
    const city = (data.city ?? '').trim();
    const location = (data.location ?? '').trim();
    if (!country && !city && !location) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Location or country is required.',
        path: ['country'],
      });
    }
  });

export type ConfirmScoreRequest = z.infer<typeof ConfirmScoreRequestSchema>;

/** Required confirm-form field keys used for missing-field highlighting. */
export const CONFIRM_REQUIRED_FIELDS = [
  'title',
  'company',
  'description',
  'location',
  'work_setup',
] as const;

export type ConfirmRequiredField = (typeof CONFIRM_REQUIRED_FIELDS)[number];

/**
 * Validates a confirm-form draft (pre-submit). Returns field-level errors.
 * Does not invent values — empty / whitespace-only strings fail.
 */
export function validateConfirmScoreRequest(
  input: unknown,
):
  | { ok: true; data: ConfirmScoreRequest }
  | { ok: false; fieldErrors: Record<string, string>; message: string } {
  const parsed = ConfirmScoreRequestSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }

  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : '_form';
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }

  return {
    ok: false,
    fieldErrors,
    message: 'Complete the required fields before scoring.',
  };
}

/**
 * Which required fields are still missing from an extracted / edited draft.
 * Location is missing when both country and city are blank.
 */
export function getMissingConfirmFields(draft: {
  title?: string | null;
  company?: string | null;
  description?: string | null;
  url?: string | null;
  country?: string | null;
  city?: string | null;
  location?: string | null;
  work_setup?: string | null;
}): ConfirmRequiredField[] {
  const missing: ConfirmRequiredField[] = [];
  const blank = (v: string | null | undefined) => !v || !String(v).trim();

  if (blank(draft.title)) missing.push('title');
  if (blank(draft.company)) missing.push('company');
  if (blank(draft.description)) missing.push('description');
  if (blank(draft.country) && blank(draft.city) && blank(draft.location)) {
    missing.push('location');
  }
  // UNCLEAR is a valid explicit choice — only treat as missing when unset.
  if (blank(draft.work_setup)) missing.push('work_setup');

  return missing;
}

// ---------------------------------------------------------------------------
// API error envelope
// ---------------------------------------------------------------------------

export const ApiErrorCode = z.enum([
  'VALIDATION_ERROR',
  'EXTRACTION_FAILED',
  'SSRF_BLOCKED',
  'DUPLICATE',
  'UNPROCESSABLE',
  'INTERNAL_ERROR',
  'NOT_FOUND',
  'INVALID_JSON',
  'INPUT_TOO_LARGE',
  'MODEL_NOT_CONFIGURED',
  'MODEL_CONFIGURATION_INVALID',
  'MODEL_UNAVAILABLE',
  'MODEL_RATE_LIMITED',
  'MODEL_TIMEOUT',
  'MODEL_OUTPUT_INVALID',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

export const ApiErrorSchema = z.object({
  success: z.literal(false),
  code: ApiErrorCode,
  message: z.string(),
  fieldErrors: z.record(z.string()).optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export function apiError(
  code: ApiErrorCode,
  message: string,
  fieldErrors?: Record<string, string>,
): ApiError {
  return fieldErrors && Object.keys(fieldErrors).length > 0
    ? { success: false, code, message, fieldErrors }
    : { success: false, code, message };
}

// ---------------------------------------------------------------------------
// Extraction response (extends existing ExtractionResult with missingFields)
// ---------------------------------------------------------------------------

export const EXTRACTION_REQUIRED_FIELDS = [
  'title',
  'company',
  'description',
  'location',
  'work_setup',
] as const;

export type ExtractionRequiredField = (typeof EXTRACTION_REQUIRED_FIELDS)[number];

export function computeMissingExtractionFields(data: {
  title: string | null;
  company: string | null;
  description: string | null;
  country: string | null;
  city: string | null;
  work_setup: string | null;
}): ExtractionRequiredField[] {
  const missing: ExtractionRequiredField[] = [];
  if (!data.title?.trim()) missing.push('title');
  if (!data.company?.trim()) missing.push('company');
  if (!data.description?.trim()) missing.push('description');
  if (!data.country?.trim() && !data.city?.trim()) missing.push('location');
  if (!data.work_setup?.trim()) missing.push('work_setup');
  return missing;
}

// ---------------------------------------------------------------------------
// Confirm & Score response (discriminated union)
// ---------------------------------------------------------------------------

const ScoreSummarySchema = z.object({
  score: z.number().min(0).max(100),
  recommendation: ScoreRecommendation,
  factors: StructuredScoreSchema.shape.factors.optional(),
  matched_skills: z.array(z.string()).optional(),
  missing_skills: z.array(z.string()).optional(),
  risk_flags: z.array(z.string()).optional(),
  reason: z.string().optional(),
});

export const JobImportResultSchema = z.discriminatedUnion('status', [
  z.object({
    success: z.literal(true),
    status: z.literal('SCORED'),
    jobId: z.string(),
    score: ScoreSummarySchema,
    rejectionReasons: z.array(z.string()).default([]),
    eligibilityStatus: z.string().nullable().optional(),
    title: z.string().optional(),
    company: z.string().optional(),
    workSetup: z.string().optional(),
    category: z.string().nullable().optional(),
  }),
  z.object({
    success: z.literal(true),
    status: z.literal('HARD_REJECTED'),
    jobId: z.string(),
    score: z.null(),
    rejectionReasons: z.array(z.string()).min(1),
    eligibilityStatus: z.string().nullable().optional(),
    title: z.string().optional(),
    company: z.string().optional(),
    workSetup: z.string().optional(),
    category: z.string().nullable().optional(),
  }),
  z.object({
    success: z.literal(true),
    status: z.literal('INELIGIBLE'),
    jobId: z.string(),
    score: z.null(),
    rejectionReasons: z.array(z.string()).min(1),
    eligibilityStatus: z.string().nullable().optional(),
    title: z.string().optional(),
    company: z.string().optional(),
    workSetup: z.string().optional(),
    category: z.string().nullable().optional(),
  }),
  z.object({
    success: z.literal(true),
    status: z.literal('DUPLICATE'),
    jobId: z.string().optional(),
    duplicateOfId: z.string().optional(),
    score: z.null(),
    rejectionReasons: z.array(z.string()).default([]),
    message: z.string().optional(),
  }),
]);

export type JobImportResult = z.infer<typeof JobImportResultSchema>;

/** Eligibility-oriented hard-reject reasons — surfaced as INELIGIBLE in the UI. */
const ELIGIBILITY_REJECT_REASONS = new Set([
  'COUNTRY_INELIGIBLE',
  'INTERNATIONAL_NON_REMOTE',
  'RELOCATION_REQUIRED',
]);

/**
 * Maps a pipeline `IngestionResult` (+ optional score detail) into the
 * client-facing discriminated union. Never invents a score when none exists.
 */
export function toJobImportResult(input: {
  status: 'INGESTED' | 'DUPLICATE' | 'HARD_REJECTED' | 'ERROR';
  job_id: string;
  duplicate_of_id?: string;
  rejection_reasons?: string[];
  score?: number;
  recommendation?: string;
  score_detail?: {
    score: number;
    recommendation: z.infer<typeof ScoreRecommendation>;
    factors?: z.infer<typeof StructuredScoreSchema>['factors'];
    matched_verified_skills?: string[];
    missing_required_skills?: string[];
    risk_flags?: string[];
    reason?: string;
  } | null;
  title?: string;
  company?: string;
  work_setup?: string;
  category?: string | null;
  eligibility_status?: string | null;
}): JobImportResult | ApiError {
  if (input.status === 'ERROR') {
    return apiError('UNPROCESSABLE', 'Failed to ingest job.');
  }

  if (input.status === 'DUPLICATE') {
    return {
      success: true,
      status: 'DUPLICATE',
      jobId: input.duplicate_of_id ?? input.job_id,
      duplicateOfId: input.duplicate_of_id,
      score: null,
      rejectionReasons: [],
      message: 'This posting already exists in your saved jobs.',
    };
  }

  const reasons = input.rejection_reasons ?? [];

  if (input.status === 'HARD_REJECTED') {
    if (reasons.length === 0) {
      return apiError(
        'UNPROCESSABLE',
        'The pipeline rejected this job without returning a reason, so it was not saved.',
      );
    }
    const isEligibility = reasons.some((r) => ELIGIBILITY_REJECT_REASONS.has(r));
    const base = {
      success: true as const,
      jobId: input.job_id,
      score: null,
      rejectionReasons: reasons,
      eligibilityStatus: input.eligibility_status ?? null,
      title: input.title,
      company: input.company,
      workSetup: input.work_setup,
      category: input.category ?? null,
    };
    return isEligibility
      ? { ...base, status: 'INELIGIBLE' as const }
      : { ...base, status: 'HARD_REJECTED' as const };
  }

  // INGESTED — require a real score; never fabricate.
  if (input.score_detail == null || typeof input.score !== 'number') {
    return apiError('UNPROCESSABLE', 'Job was ingested but no score was produced.');
  }

  return {
    success: true,
    status: 'SCORED',
    jobId: input.job_id,
    score: {
      score: input.score_detail.score,
      recommendation: input.score_detail.recommendation,
      factors: input.score_detail.factors,
      matched_skills: input.score_detail.matched_verified_skills,
      missing_skills: input.score_detail.missing_required_skills,
      risk_flags: input.score_detail.risk_flags,
      reason: input.score_detail.reason,
    },
    rejectionReasons: [],
    eligibilityStatus: input.eligibility_status ?? null,
    title: input.title,
    company: input.company,
    workSetup: input.work_setup,
    category: input.category ?? null,
  };
}

/**
 * Narrows an unknown JSON payload into JobImportResult | ApiError.
 * Used by the client after checking content-type / response.ok.
 */
export function parseJobImportResponse(payload: unknown): JobImportResult | ApiError {
  const asResult = JobImportResultSchema.safeParse(payload);
  if (asResult.success) return asResult.data;

  const asError = ApiErrorSchema.safeParse(payload);
  if (asError.success) return asError.data;

  // Legacy / partial shapes: treat missing score on hard-reject carefully.
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    if (p.success === false && typeof p.message === 'string') {
      return apiError(
        typeof p.code === 'string' && ApiErrorCode.safeParse(p.code).success
          ? (p.code as ApiErrorCode)
          : 'INTERNAL_ERROR',
        p.message,
        typeof p.fieldErrors === 'object' && p.fieldErrors
          ? (p.fieldErrors as Record<string, string>)
          : undefined,
      );
    }
  }

  return apiError('INVALID_JSON', 'Unexpected response from the server.');
}
