/**
 * @job-app/core — Public API
 *
 * Re-exports all schemas and types for use by other packages.
 */

// Candidate schemas
export {
  VerificationStatus,
  EvidenceSource,
  VerifiedFactSchema,
  CandidateIdentitySchema,
  EducationEntrySchema,
  SkillEntrySchema,
  ExperienceEntrySchema,
  ProjectEntrySchema,
  CertificationEntrySchema,
  CandidateLinksSchema,
  CandidateProfileSchema,
} from './candidate/schema.js';
export type {
  VerifiedFact,
  CandidateIdentity,
  EducationEntry,
  SkillEntry,
  ExperienceEntry,
  ProjectEntry,
  CertificationEntry,
  CandidateLinks,
  CandidateProfile,
} from './candidate/schema.js';

// Job schemas
export {
  JobCategory,
  WorkSetup,
  EligibilityStatus,
  JobStatus,
  EmploymentType,
  SeniorityLevel,
  NormalizedJobSchema,
  ClassificationResultSchema,
  DeduplicationResultSchema,
} from './jobs/schema.js';
export type {
  NormalizedJob,
  ClassificationResult,
  DeduplicationResult,
} from './jobs/schema.js';

// Scoring schemas
export {
  HardRejectReason,
  HardRejectResultSchema,
  ScoreFactorsSchema,
  ScoreRecommendation,
  StructuredScoreSchema,
  scoreToRecommendation,
} from './scoring/schema.js';
export type {
  HardRejectResult,
  ScoreFactors,
  StructuredScore,
} from './scoring/schema.js';
