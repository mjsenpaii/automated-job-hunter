/**
 * @job-app/core — Candidate schemas
 *
 * Zod schemas for the verified candidate profile, skills, experience, and projects.
 * Every factual field carries a verification status and source reference.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export const VerificationStatus = z.enum([
  'VERIFIED',
  'CV_STATED',
  'CERT',
  'USER_CONFIRMED',
  'NEEDS_USER_INPUT',
  'NEEDS_CLARIFICATION',
  'PARTIAL',
]);
export type VerificationStatus = z.infer<typeof VerificationStatus>;

export const EvidenceSource = z.enum([
  'CV_MJ.docx',
  'USER_CONFIRMED',
  'PROJECT_REPOSITORY',
  'CERTIFICATE',
  'GITHUB_PROFILE',
  'LINKEDIN_PROFILE',
  'LIVE_DEMO',
  'SCREENSHOT',
]);
export type EvidenceSource = z.infer<typeof EvidenceSource>;

export const VerifiedFactSchema = z.object({
  value: z.string(),
  verification_status: VerificationStatus,
  source: EvidenceSource,
  source_reference: z.string().nullable(),
  allowed_in_resume: z.boolean(),
  notes: z.string().nullable(),
});
export type VerifiedFact = z.infer<typeof VerifiedFactSchema>;

// ---------------------------------------------------------------------------
// Identity & Profile
// ---------------------------------------------------------------------------

export const CandidateIdentitySchema = z.object({
  full_name: z.string(),
  preferred_name: z.string(),
  location: z.string(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
});
export type CandidateIdentity = z.infer<typeof CandidateIdentitySchema>;

export const EducationEntrySchema = z.object({
  institution: z.string(),
  degree: z.string(),
  major: z.string().nullable(),
  graduation_date: z.string().nullable(),
  graduated: z.boolean(),
  level: z.enum(['elementary', 'secondary', 'senior_high', 'college', 'graduate']),
  verification_status: VerificationStatus,
  source: EvidenceSource,
});
export type EducationEntry = z.infer<typeof EducationEntrySchema>;

export const SkillEntrySchema = z.object({
  name: z.string(),
  category: z.enum([
    'language',
    'framework',
    'platform',
    'tool',
    'database',
    'methodology',
    'soft_skill',
    'other',
  ]),
  proficiency: z.enum(['beginner', 'intermediate', 'professional', 'expert']).nullable(),
  verification_status: VerificationStatus,
  source: EvidenceSource,
  source_reference: z.string().nullable(),
  evidence_level: z.enum(['personal_project', 'academic_project', 'professional', 'certification', 'training']),
  allowed_in_resume: z.boolean(),
});
export type SkillEntry = z.infer<typeof SkillEntrySchema>;

export const ExperienceEntrySchema = z.object({
  id: z.string(),
  type: z.enum(['employment', 'freelance', 'internship', 'ojt', 'volunteer']),
  title: z.string(),
  organization: z.string(),
  organization_description: z.string().nullable(),
  start_date: z.string(),
  end_date: z.string().nullable(),
  is_current: z.boolean(),
  location: z.string().nullable(),
  work_setup: z.enum(['remote', 'onsite', 'hybrid']).nullable(),
  description: z.string().nullable(),
  responsibilities: z.array(z.string()),
  technologies: z.array(z.string()),
  achievements: z.array(z.string()),
  verification_status: VerificationStatus,
  source: EvidenceSource,
  notes: z.string().nullable(),
});
export type ExperienceEntry = z.infer<typeof ExperienceEntrySchema>;

export const ProjectEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['academic', 'freelance', 'personal', 'professional', 'open_source']),
  role: z.string(),
  description: z.string().nullable(),
  technologies: z.array(z.string()),
  url: z.string().url().nullable(),
  repository_url: z.string().url().nullable(),
  status: z.enum(['completed', 'in_progress', 'alpha', 'beta', 'live', 'archived']),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  verification_status: VerificationStatus,
  source: EvidenceSource,
  allowed_in_resume: z.boolean(),
  notes: z.string().nullable(),
});
export type ProjectEntry = z.infer<typeof ProjectEntrySchema>;

export const CertificationEntrySchema = z.object({
  name: z.string(),
  issuer: z.string(),
  year: z.number(),
  type: z.enum(['certification', 'training', 'competition', 'award']),
  description: z.string().nullable(),
  verification_status: VerificationStatus,
  source: EvidenceSource,
});
export type CertificationEntry = z.infer<typeof CertificationEntrySchema>;

export const CandidateLinksSchema = z.object({
  linkedin: z.string().url().nullable(),
  github: z.string().url().nullable(),
  portfolio: z.string().url().nullable(),
  other: z.array(z.object({ label: z.string(), url: z.string().url() })),
});
export type CandidateLinks = z.infer<typeof CandidateLinksSchema>;

export const CandidateProfileSchema = z.object({
  identity: CandidateIdentitySchema,
  professional: z.object({
    headline: z.string().nullable(),
    summary_facts: z.array(z.string()),
    availability_date: z.string().nullable(),
    employment_types: z.array(z.string()),
    schedule_preferences: z.array(z.string()),
    salary_preferences: z.object({
      ph_monthly_min: z.number().nullable(),
      ph_monthly_max: z.number().nullable(),
      intl_hourly_min: z.number().nullable(),
      intl_hourly_max: z.number().nullable(),
      currency_ph: z.literal('PHP'),
      currency_intl: z.literal('USD'),
    }).nullable(),
  }),
  education: z.array(EducationEntrySchema),
  experience: z.array(ExperienceEntrySchema),
  projects: z.array(ProjectEntrySchema),
  skills: z.array(SkillEntrySchema),
  certifications: z.array(CertificationEntrySchema),
  links: CandidateLinksSchema,
  verification: z.object({
    last_user_reviewed_at: z.string().nullable(),
    unresolved_items: z.array(z.string()),
  }),
});
export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;
