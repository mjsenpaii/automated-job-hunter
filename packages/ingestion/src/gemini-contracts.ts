import { z } from 'zod';
import {
  enrichGovernmentSalary,
  GovernmentSalaryReferenceSchema,
  GovernmentScopeSchema,
} from './government-enrichment.js';
import { VerifiedJobRequirementsExtractionSchema } from './job-requirements-contracts.js';

export const MAX_JOB_INPUT_CHARS = 100_000;

const nullableText = (max = 10_000) => z.string().trim().max(max).nullable();
const textList = z.array(z.string().trim().min(1).max(1_000)).max(100);

export const GeminiEvidenceSchema = z.object({
  field: z.string().trim().min(1).max(80),
  value: nullableText(500),
  excerpts: z.array(z.string().trim().min(1).max(800)).max(4),
});

export const GeminiJobExtractionSchema = z.object({
  title: nullableText(300),
  company: nullableText(300),
  sourceSite: nullableText(200),
  sourceUrl: z.string().trim().url().max(2_000).nullable(),
  employmentType: nullableText(100),
  salaryText: nullableText(300),
  salaryMin: z.number().nonnegative().nullable(),
  salaryMax: z.number().nonnegative().nullable(),
  salaryCurrency: nullableText(20),
  salaryGrade: z.number().int().min(1).max(33).nullable(),
  salaryStep: z.number().int().min(1).max(8).nullable(),
  hoursPerWeek: z.number().nonnegative().max(168).nullable(),
  datePosted: nullableText(80),
  dateUpdated: nullableText(80),
  closingDate: z.string().date().nullable(),
  location: nullableText(300),
  country: nullableText(120),
  city: nullableText(120),
  workSetup: z
    .enum(['REMOTE', 'HYBRID', 'ONSITE', 'TEMPORARY_REMOTE', 'UNCLEAR'])
    .nullable(),
  timezoneOrSchedule: nullableText(500),
  description: nullableText(60_000),
  responsibilities: textList,
  requirements: textList,
  requiredYearsExperience: z.number().nonnegative().max(50).nullable(),
  preferredYearsExperience: z.number().nonnegative().max(50).nullable(),
  skills: textList,
  vacancies: z.number().int().positive().nullable(),
  civilServiceEligibility: nullableText(1_000),
  scheduleNotes: textList,
  governmentScope: GovernmentScopeSchema.nullable(),
  applicationInstructions: textList,
  applicationKeyword: nullableText(200),
  applicationEmail: z.string().trim().email().max(320).nullable(),
  applicationAddressee: nullableText(500),
  applicationUrl: z.string().trim().url().max(2_000).nullable(),
  confidence: z.number().min(0).max(1),
  missingFields: z.array(z.string().trim().min(1).max(80)).max(40),
  evidence: z.array(GeminiEvidenceSchema).max(40),
});

export type GeminiJobExtraction = z.infer<typeof GeminiJobExtractionSchema>;

export const EnrichedGeminiJobExtractionSchema =
  GeminiJobExtractionSchema.merge(GovernmentSalaryReferenceSchema);
export type EnrichedGeminiJobExtraction = z.infer<
  typeof EnrichedGeminiJobExtractionSchema
>;

export function enrichGeminiJobExtraction(
  value: GeminiJobExtraction,
): EnrichedGeminiJobExtraction {
  return enrichGovernmentSalary(value);
}

export const AnalyzeJobRequestSchema = z.object({
  input: z
    .string({ required_error: 'Paste a URL or job posting to analyse.' })
    .trim()
    .min(1, 'Paste a URL or job posting to analyse.')
    .max(
      MAX_JOB_INPUT_CHARS,
      `Job content is limited to ${MAX_JOB_INPUT_CHARS.toLocaleString()} characters.`,
    )
    .superRefine((value, ctx) => {
      if (value.length >= 20) return;
      try {
        const url = new URL(value);
        if (url.protocol === 'http:' || url.protocol === 'https:') return;
      } catch {
        // Add the shared validation issue below.
      }
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Paste at least 20 characters of job content, or a complete URL.',
      });
    }),
});

export type AnalyzeJobRequest = z.infer<typeof AnalyzeJobRequestSchema>;

export const GeminiFallbackReasonSchema = z.enum([
  'PRIMARY_OUTPUT_INVALID',
  'LOW_CONFIDENCE',
  'CORE_FIELDS_MISSING',
  'CONTRADICTORY_LOCATION_OR_WORK_SETUP',
  'REQUIRED_EXPERIENCE_CONFLICT',
  'COMPLEX_HTML_LOSS',
  'INTERNAL_INCONSISTENCY',
  'PRIMARY_RATE_LIMITED',
  'PRIMARY_SERVICE_UNAVAILABLE',
  'PRIMARY_TIMEOUT',
]);

export type GeminiFallbackReason = z.infer<typeof GeminiFallbackReasonSchema>;

export const GeminiExtractionMetadataSchema = z.object({
  modelUsed: z.string().trim().min(1).max(100),
  fallbackUsed: z.boolean(),
  fallbackReason: GeminiFallbackReasonSchema.nullable(),
  confidence: z.number().min(0).max(1),
});

export type GeminiExtractionMetadata = z.infer<
  typeof GeminiExtractionMetadataSchema
>;

export const AnalyzeJobSuccessSchema = z.object({
  success: z.literal(true),
  extraction: EnrichedGeminiJobExtractionSchema,
  modelUsed: z.string().trim().min(1).max(100),
  fallbackUsed: z.boolean(),
  fallbackReason: GeminiFallbackReasonSchema.nullable(),
  confidence: z.number().min(0).max(1),
  inputKind: z.enum(['url', 'html', 'text']),
  warnings: z.array(z.string()),
  verifiedRequirements: VerifiedJobRequirementsExtractionSchema,
}).superRefine((data, ctx) => {
  if (data.fallbackUsed && data.fallbackReason === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A fallback reason is required when fallback was used.',
      path: ['fallbackReason'],
    });
  }
  if (!data.fallbackUsed && data.fallbackReason !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A fallback reason is only valid when fallback was used.',
      path: ['fallbackReason'],
    });
  }
  if (data.confidence !== data.extraction.confidence) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Metadata confidence must match extraction confidence.',
      path: ['confidence'],
    });
  }
});

export type AnalyzeJobSuccess = z.infer<typeof AnalyzeJobSuccessSchema>;

export const ANALYSE_MISSING_FIELDS = [
  'title',
  'company',
  'sourceSite',
  'sourceUrl',
  'employmentType',
  'salaryText',
  'salaryMin',
  'salaryMax',
  'salaryCurrency',
  'salaryGrade',
  'salaryStep',
  'hoursPerWeek',
  'datePosted',
  'dateUpdated',
  'closingDate',
  'location',
  'country',
  'city',
  'workSetup',
  'timezoneOrSchedule',
  'description',
  'responsibilities',
  'requirements',
  'requiredYearsExperience',
  'preferredYearsExperience',
  'skills',
  'vacancies',
  'civilServiceEligibility',
  'scheduleNotes',
  'governmentScope',
  'applicationInstructions',
  'applicationKeyword',
  'applicationEmail',
  'applicationAddressee',
  'applicationUrl',
] as const;

export function normalizeGeminiExtraction(value: GeminiJobExtraction): GeminiJobExtraction {
  const missingFields = ANALYSE_MISSING_FIELDS.filter((field) => {
    const fieldValue = value[field];
    return fieldValue === null || (Array.isArray(fieldValue) && fieldValue.length === 0);
  });

  return {
    ...value,
    missingFields,
    evidence: value.evidence.filter((item) => item.excerpts.length > 0),
  };
}
