import { z } from 'zod';

export const JOB_REQUIREMENTS_EXTRACTION_SCHEMA_VERSION = 2 as const;

export const VerificationStatusSchema = z.enum([
  'VERIFIED',
  'MISSING',
  'REQUIRES_REVIEW',
  'CONFLICT',
  'EXTRACTION_FAILED',
]);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const ExtractionAggregateStatusSchema = z.enum([
  'VERIFIED',
  'PARTIAL',
  'MISSING',
  'REQUIRES_REVIEW',
  'CONFLICT',
  'EXTRACTION_FAILED',
]);
export type ExtractionAggregateStatus = z.infer<
  typeof ExtractionAggregateStatusSchema
>;

export const VerificationSourceSchema = z.enum([
  'PROVIDER_METADATA',
  'DESCRIPTION_GEMINI_VERIFIED',
  'DETERMINISTIC_DESCRIPTION',
]);
export type VerificationSource = z.infer<typeof VerificationSourceSchema>;

export const VerificationReasonCodeSchema = z.enum([
  'VERIFIED_EXACT_EVIDENCE',
  'VERIFIED_PROVIDER_METADATA',
  'NO_EVIDENCE',
  'EVIDENCE_NOT_FOUND',
  'EVIDENCE_SPANS_CLAUSES',
  'VALUE_MISMATCH',
  'REQUIREMENT_TYPE_AMBIGUOUS',
  'REQUIREMENT_TYPE_CONFLICT',
  'AMBIGUOUS_CURRENCY',
  'AMBIGUOUS_PERIOD',
  'PROVIDER_DESCRIPTION_CONFLICT',
  'THIRD_PARTY_CONTEXT',
  'RESPONSIBILITY_NOT_QUALIFICATION',
  'UNSUPPORTED_SKILL_ALIAS',
  'MODEL_OUTPUT_INVALID',
  'MODEL_UNAVAILABLE',
  'MODEL_TIMEOUT',
  'MODEL_RATE_LIMITED',
  'CONTENT_UNCHANGED',
]);
export type VerificationReasonCode = z.infer<
  typeof VerificationReasonCodeSchema
>;

export const JobRequirementReviewCategorySchema = z.enum([
  'EXPERIENCE',
  'QUALIFICATION',
  'LOCATION',
  'TIMEZONE',
  'SALARY',
  'EMPLOYMENT',
  'DEGREE_CERTIFICATION_LANGUAGE',
  'MISSING_CRITICAL_INFORMATION',
  'OTHER',
]);
export type JobRequirementReviewCategory = z.infer<
  typeof JobRequirementReviewCategorySchema
>;

export const JobRequirementReviewAudienceSchema = z.enum(['USER', 'AUDIT']);
export type JobRequirementReviewAudience = z.infer<
  typeof JobRequirementReviewAudienceSchema
>;

export const JobRequirementReviewEntrySchema = z
  .object({
    candidateId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
    category: JobRequirementReviewCategorySchema,
    reasonCode: VerificationReasonCodeSchema,
    audience: JobRequirementReviewAudienceSchema,
    normalizedLabel: z.string().trim().min(1).max(200).nullable(),
  })
  .strict();
export type JobRequirementReviewEntry = z.infer<
  typeof JobRequirementReviewEntrySchema
>;

export const RequirementTypeSchema = z.enum(['REQUIRED', 'PREFERRED']);
export type RequirementType = z.infer<typeof RequirementTypeSchema>;

export const ExtractionSectionHintSchema = z.enum([
  'RESPONSIBILITIES',
  'REQUIRED_QUALIFICATIONS',
  'PREFERRED_QUALIFICATIONS',
  'COMPENSATION',
  'LOCATION',
  'COMPANY',
  'UNKNOWN',
]);
export type ExtractionSectionHint = z.infer<
  typeof ExtractionSectionHintSchema
>;

export const ExtractionEvidenceSchema = z
  .object({
    quote: z.string().trim().min(1).max(1_200),
    section: z.string().trim().min(1).max(200).nullable(),
  })
  .strict();
export type ExtractionEvidence = z.infer<typeof ExtractionEvidenceSchema>;

export const ExtractionCandidatePossibleTypeSchema = z.enum([
  'QUALIFICATION',
  'EXPERIENCE',
  'COMPENSATION',
  'LOCATION',
  'TIMEZONE',
  'WORK_SETUP',
  'EMPLOYMENT_TYPE',
  'RESPONSIBILITY',
  'OTHER',
]);
export type ExtractionCandidatePossibleType = z.infer<
  typeof ExtractionCandidatePossibleTypeSchema
>;

export const JobRequirementCandidateSchema = z
  .object({
    candidateId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
    source: z.enum(['DESCRIPTION', 'PROVIDER_METADATA']),
    sectionType: ExtractionSectionHintSchema,
    section: z.string().trim().min(1).max(200).nullable(),
    evidence: z.string().trim().min(1).max(2_000),
    originalStart: z.number().int().nonnegative().nullable(),
    originalEnd: z.number().int().positive().nullable(),
    possibleTypes: z.array(ExtractionCandidatePossibleTypeSchema).min(1),
  })
  .strict();
export type JobRequirementCandidate = z.infer<
  typeof JobRequirementCandidateSchema
>;

export const CandidateClassificationSchema = z.enum([
  'REQUIRED',
  'PREFERRED',
  'RESPONSIBILITY',
  'COMPENSATION',
  'LOCATION_RESTRICTION',
  'TIMEZONE_REQUIREMENT',
  'EMPLOYMENT_METADATA',
  'IGNORE',
  'REQUIRES_REVIEW',
]);
export type CandidateClassification = z.infer<
  typeof CandidateClassificationSchema
>;

export const CandidateNormalizedItemSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    classification: z.enum([
      'REQUIRED',
      'PREFERRED',
      'RESPONSIBILITY',
      'PRESENT',
      'REQUIRES_REVIEW',
    ]),
    kind: z.enum([
      'QUALIFICATION',
      'DEGREE',
      'CERTIFICATION',
      'LANGUAGE',
      'SCHEDULE',
      'ADDITIONAL_COMPENSATION',
    ]),
  })
  .strict();
export type CandidateNormalizedItem = z.infer<
  typeof CandidateNormalizedItemSchema
>;

const OrdinaryCandidateDecisionSchema = z
  .object({
    candidateId: JobRequirementCandidateSchema.shape.candidateId,
    classification: z.enum([
      'REQUIRED',
      'PREFERRED',
      'RESPONSIBILITY',
      'IGNORE',
      'REQUIRES_REVIEW',
    ]),
  })
  .strict();

const CompensationCandidateDecisionSchema = z
  .object({
    candidateId: JobRequirementCandidateSchema.shape.candidateId,
    classification: z.literal('COMPENSATION'),
    salarySemantics: z
      .object({
        compensationType: z.enum([
          'BASE_SALARY',
          'ADDITIONAL_COMPENSATION',
          'BENEFIT',
          'REQUIRES_REVIEW',
        ]),
        period: z.enum(['HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR']).nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();

const LocationCandidateDecisionSchema = z
  .object({
    candidateId: JobRequirementCandidateSchema.shape.candidateId,
    classification: z.literal('LOCATION_RESTRICTION'),
    workSetup: z
      .enum(['REMOTE', 'HYBRID', 'ONSITE', 'TEMPORARY_REMOTE', 'UNCLEAR'])
      .nullable(),
    geographicRestrictions: z.array(z.string().trim().min(1).max(200)).max(10),
  })
  .strict();

const TimezoneCandidateDecisionSchema = z
  .object({
    candidateId: JobRequirementCandidateSchema.shape.candidateId,
    classification: z.literal('TIMEZONE_REQUIREMENT'),
    collaborationTimezone: z.string().trim().min(1).max(200).nullable(),
  })
  .strict();

const EmploymentCandidateDecisionSchema = z
  .object({
    candidateId: JobRequirementCandidateSchema.shape.candidateId,
    classification: z.literal('EMPLOYMENT_METADATA'),
    employmentType: z.string().trim().min(1).max(100).nullable(),
  })
  .strict();

export const GeminiCandidateDecisionSchema = z.discriminatedUnion(
  'classification',
  [
    OrdinaryCandidateDecisionSchema,
    CompensationCandidateDecisionSchema,
    LocationCandidateDecisionSchema,
    TimezoneCandidateDecisionSchema,
    EmploymentCandidateDecisionSchema,
  ],
);
export type GeminiCandidateDecision = z.infer<
  typeof GeminiCandidateDecisionSchema
>;

export const GeminiCandidateClassificationResponseSchema = z
  .object({
    decisions: z.array(GeminiCandidateDecisionSchema).max(500),
  })
  .strict();
export type GeminiCandidateClassificationResponse = z.infer<
  typeof GeminiCandidateClassificationResponseSchema
>;

export const ModelOutputInvalidDiagnosticSubtypeSchema = z.enum([
  'MALFORMED_JSON',
  'SCHEMA_VALIDATION_FAILED',
  'MISSING_CANDIDATE_DECISION',
  'UNKNOWN_CANDIDATE_ID',
  'DUPLICATE_CANDIDATE_ID',
  'REORDERED_CANDIDATE_IDS',
  'INVALID_CLASSIFICATION_ENUM',
  'INVALID_NORMALIZED_ITEM',
  'MISSING_REQUIRED_FIELD',
  'DECISION_COUNT_MISMATCH',
  'OTHER_SAFE_VALIDATION_FAILURE',
]);
export type ModelOutputInvalidDiagnosticSubtype = z.infer<
  typeof ModelOutputInvalidDiagnosticSubtypeSchema
>;

export const SafeSchemaIssueCodeSchema = z.enum([
  'INVALID_TYPE',
  'INVALID_ENUM',
  'INVALID_UNION',
  'UNRECOGNIZED_KEYS',
  'TOO_SMALL',
  'TOO_BIG',
  'INVALID_STRING',
  'OTHER_SAFE_ZOD_ISSUE',
]);

export const SafeSchemaStructuralReasonSchema = z.enum([
  'MISSING_FIELD',
  'UNEXPECTED_FIELD',
  'INVALID_ENUM',
  'INVALID_TYPE',
  'INVALID_UNION_VARIANT',
  'ARRAY_OR_STRING_LIMIT',
  'OTHER_SAFE_STRUCTURAL_REASON',
]);

export const SafeSchemaExpectedCategorySchema = z.enum([
  'RESPONSE_ENVELOPE',
  'DECISION',
  'DECISION_CLASSIFICATION',
  'ORDINARY_DECISION',
  'COMPENSATION_DECISION',
  'LOCATION_DECISION',
  'TIMEZONE_DECISION',
  'EMPLOYMENT_DECISION',
]);

export const SafeSchemaValidationDiagnosticSchema = z
  .object({
    issueCode: SafeSchemaIssueCodeSchema,
    path: z.string().min(1).max(300),
    expectedCategory: SafeSchemaExpectedCategorySchema,
    structuralReason: SafeSchemaStructuralReasonSchema,
  })
  .strict();
export type SafeSchemaValidationDiagnostic = z.infer<
  typeof SafeSchemaValidationDiagnosticSchema
>;

export const CandidateAuditEntrySchema = z
  .object({
    candidateId: JobRequirementCandidateSchema.shape.candidateId,
    classification: CandidateClassificationSchema,
    status: VerificationStatusSchema,
    reasonCode: VerificationReasonCodeSchema,
    normalizedItems: z
      .array(
        CandidateNormalizedItemSchema.extend({
          status: VerificationStatusSchema,
          reasonCode: VerificationReasonCodeSchema,
        }).strict(),
      )
      .max(30),
  })
  .strict();

const ProposedRequirementSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    requirementType: RequirementTypeSchema,
    evidence: ExtractionEvidenceSchema,
  })
  .strict();

export const GeminiJobRequirementsProposalSchema = z
  .object({
    experienceRequirements: z
      .array(
        z
          .object({
            minimumYears: z.number().nonnegative().max(50),
            maximumYears: z.number().nonnegative().max(50).nullable(),
            requirementType: RequirementTypeSchema,
            evidence: ExtractionEvidenceSchema,
          })
          .strict(),
      )
      .max(20),
    qualifications: z.array(ProposedRequirementSchema).max(100),
    degreeRequirements: z.array(ProposedRequirementSchema).max(20),
    certifications: z.array(ProposedRequirementSchema).max(20),
    languages: z.array(ProposedRequirementSchema).max(30),
    salary: z
      .object({
        currency: z.string().trim().min(1).max(10),
        minimum: z.number().nonnegative(),
        maximum: z.number().nonnegative().nullable(),
        period: z.enum(['HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR']).nullable(),
        additionalCompensation: z
          .array(z.string().trim().min(1).max(100))
          .max(20),
        evidence: ExtractionEvidenceSchema,
      })
      .strict()
      .nullable(),
    workArrangement: z
      .object({
        setup: z
          .enum(['REMOTE', 'HYBRID', 'ONSITE', 'TEMPORARY_REMOTE', 'UNCLEAR'])
          .nullable(),
        geographicRestrictions: z
          .array(
            z
              .object({
                value: z.string().trim().min(1).max(200),
                evidence: ExtractionEvidenceSchema,
              })
              .strict(),
          )
          .max(20),
        collaborationTimezone: z
          .object({
            value: z.string().trim().min(1).max(200),
            evidence: ExtractionEvidenceSchema,
          })
          .strict()
          .nullable(),
        scheduleRequirements: z.array(ProposedRequirementSchema).max(30),
        evidence: z.array(ExtractionEvidenceSchema).max(20),
      })
      .strict(),
    employmentType: z
      .object({
        value: z.string().trim().min(1).max(100),
        evidence: ExtractionEvidenceSchema,
      })
      .strict()
      .nullable(),
    missingOrAmbiguousCriticalInformation: z
      .array(z.string().trim().min(1).max(200))
      .max(30),
  })
  .strict();
export type GeminiJobRequirementsProposal = z.infer<
  typeof GeminiJobRequirementsProposalSchema
>;

const VerifiedBaseSchema = z
  .object({
    status: VerificationStatusSchema,
    source: VerificationSourceSchema,
    reasonCode: VerificationReasonCodeSchema,
    evidence: ExtractionEvidenceSchema.nullable(),
    affectedScoring: z.boolean(),
  })
  .strict();

export const VerifiedExperienceRequirementSchema = VerifiedBaseSchema.extend({
  minimumYears: z.number().nonnegative().max(50).nullable(),
  maximumYears: z.number().nonnegative().max(50).nullable(),
  requirementType: RequirementTypeSchema.nullable(),
}).strict();
export type VerifiedExperienceRequirement = z.infer<
  typeof VerifiedExperienceRequirementSchema
>;

export const VerifiedQualificationSchema = VerifiedBaseSchema.extend({
  name: z.string().trim().min(1).max(200),
  requirementType: RequirementTypeSchema.nullable(),
}).strict();
export type VerifiedQualification = z.infer<
  typeof VerifiedQualificationSchema
>;

export const VerifiedSalarySchema = VerifiedBaseSchema.extend({
  currency: z.string().trim().min(1).max(10).nullable(),
  minimum: z.number().nonnegative().nullable(),
  maximum: z.number().nonnegative().nullable(),
  period: z.enum(['HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR']).nullable(),
  additionalCompensation: z.array(z.string().trim().min(1).max(100)).max(20),
  currencyStatus: VerificationStatusSchema,
  minimumStatus: VerificationStatusSchema,
  maximumStatus: VerificationStatusSchema,
  periodStatus: VerificationStatusSchema,
  additionalCompensationStatus: VerificationStatusSchema,
  status: ExtractionAggregateStatusSchema,
}).strict();
export type VerifiedSalary = z.infer<typeof VerifiedSalarySchema>;

export const VerifiedTextFactSchema = VerifiedBaseSchema.extend({
  value: z.string().trim().min(1).max(500).nullable(),
}).strict();
export type VerifiedTextFact = z.infer<typeof VerifiedTextFactSchema>;

export const VerifiedWorkArrangementSchema = z
  .object({
    setup: VerifiedTextFactSchema,
    geographicRestrictions: z.array(VerifiedTextFactSchema).max(20),
    collaborationTimezone: VerifiedTextFactSchema,
    scheduleRequirements: z.array(VerifiedQualificationSchema).max(30),
  })
  .strict();
export type VerifiedWorkArrangement = z.infer<
  typeof VerifiedWorkArrangementSchema
>;

export const VerifiedJobRequirementsExtractionSchema = z
  .object({
    schemaVersion: z.literal(JOB_REQUIREMENTS_EXTRACTION_SCHEMA_VERSION),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    modelIdentifier: z.string().trim().min(1).max(100),
    extractedAt: z.string().datetime(),
    extractionStatus: ExtractionAggregateStatusSchema,
    extractionFailureReason: VerificationReasonCodeSchema.nullable(),
    candidateAudit: z.array(CandidateAuditEntrySchema).max(500),
    experienceRequirements: z
      .array(VerifiedExperienceRequirementSchema)
      .max(20),
    requiredQualifications: z.array(VerifiedQualificationSchema).max(100),
    preferredQualifications: z.array(VerifiedQualificationSchema).max(100),
    degreeRequirements: z.array(VerifiedQualificationSchema).max(20),
    certifications: z.array(VerifiedQualificationSchema).max(20),
    languages: z.array(VerifiedQualificationSchema).max(30),
    salary: VerifiedSalarySchema,
    workArrangement: VerifiedWorkArrangementSchema,
    employmentType: VerifiedTextFactSchema,
    reviewItems: z.array(JobRequirementReviewEntrySchema).max(500),
  })
  .strict();
export type VerifiedJobRequirementsExtraction = z.infer<
  typeof VerifiedJobRequirementsExtractionSchema
>;

export const StoredJobExtractionSchema = z
  .object({
    jobId: z.string().trim().min(1),
    extraction: VerifiedJobRequirementsExtractionSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type StoredJobExtraction = z.infer<typeof StoredJobExtractionSchema>;

export const JobExtractionSafePreviewSchema = z
  .object({
    jobId: z.string(),
    title: z.string(),
    company: z.string(),
    status: ExtractionAggregateStatusSchema,
    verifiedMinimumExperienceYears: z.number().nullable(),
    verifiedSalary: z
      .object({
        currency: z.string(),
        minimum: z.number(),
        maximum: z.number().nullable(),
        period: z.string().nullable(),
        additionalCompensation: z.array(z.string()),
      })
      .strict()
      .nullable(),
    verifiedGeographicRestrictions: z.array(z.string()),
    verifiedTimezone: z.string().nullable(),
    verifiedRequiredQualifications: z.array(z.string().max(200)).max(100),
    verifiedPreferredQualifications: z.array(z.string().max(200)).max(100),
    salaryFieldStatuses: z
      .object({
        currency: VerificationStatusSchema,
        minimum: VerificationStatusSchema,
        maximum: VerificationStatusSchema,
        period: VerificationStatusSchema,
        additionalCompensation: VerificationStatusSchema,
      })
      .strict(),
    candidateClassifications: z.array(CandidateAuditEntrySchema).max(500),
    requiredCount: z.number().int().nonnegative(),
    preferredCount: z.number().int().nonnegative(),
    conflicts: z.number().int().nonnegative(),
    scoreBefore: z.number().nullable(),
    scoreAfter: z.number().nullable(),
    statusBefore: z.string(),
    statusAfter: z.string(),
    outcome: z.enum([
      'WOULD_UPDATE',
      'UPDATED',
      'UNCHANGED',
      'SKIPPED_CONTENT_HASH',
      'EXTRACTION_FAILED',
    ]),
    failureReason: z
      .enum([
        'MODEL_NOT_CONFIGURED',
        'MODEL_UNAVAILABLE',
        'MODEL_TIMEOUT',
        'MODEL_RATE_LIMITED',
        'MODEL_OUTPUT_INVALID',
      ])
      .nullable(),
    failureDiagnosticSubtype:
      ModelOutputInvalidDiagnosticSubtypeSchema.nullable(),
    candidateCount: z.number().int().nonnegative().nullable(),
    returnedDecisionCount: z.number().int().nonnegative().nullable(),
    schemaValidationDiagnostic: SafeSchemaValidationDiagnosticSchema.nullable(),
  })
  .strict();
export type JobExtractionSafePreview = z.infer<
  typeof JobExtractionSafePreviewSchema
>;
