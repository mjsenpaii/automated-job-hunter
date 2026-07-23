/**
 * Test fixtures — realistic job listings for testing classification and scoring.
 *
 * Each fixture represents a specific scenario from the classification test matrix
 * in docs/IMPLEMENTATION_ROADMAP.md.
 */

import type { NormalizedJob } from '@job-app/core';

const BASE_JOB: Omit<NormalizedJob, 'id' | 'title' | 'company' | 'description' | 'country' | 'city' | 'region' | 'work_setup' | 'work_setup_confidence' | 'work_setup_evidence' | 'allowed_countries' | 'allowed_regions' | 'eligibility_text' | 'required_skills' | 'preferred_skills' | 'seniority' | 'employment_type' | 'status' | 'category' | 'eligibility_status'> = {
  source_id: 'test-source-1',
  source_name: 'test',
  source_job_id: null,
  original_url: null,
  date_posted: '2026-07-20',
  date_expires: null,
  date_ingested: '2026-07-23',
  onsite_days_per_week: null,
  relocation_required: null,
  contract_type: null,
  schedule: null,
  timezone_overlap: null,
  salary_min: null,
  salary_max: null,
  salary_currency: null,
  salary_period: null,
  years_experience_min: null,
  years_experience_max: null,
  required_education: null,
  required_licenses: [],
  application_url: null,
  application_method: null,
  has_sensitive_questions: null,
  raw_snapshot: null,
};

function makeJob(overrides: Partial<NormalizedJob> & Pick<NormalizedJob, 'id' | 'title' | 'company' | 'description'>): NormalizedJob {
  return {
    ...BASE_JOB,
    country: null,
    city: null,
    region: null,
    work_setup: 'UNCLEAR',
    work_setup_confidence: 0,
    work_setup_evidence: null,
    allowed_countries: [],
    allowed_regions: [],
    eligibility_text: null,
    required_skills: [],
    preferred_skills: [],
    seniority: 'UNKNOWN',
    employment_type: 'UNKNOWN',
    status: 'DISCOVERED',
    category: null,
    eligibility_status: null,
    ...overrides,
  };
}

// ============================================================================
// PH Jobs
// ============================================================================

export const PH_REMOTE_MANILA = makeJob({
  id: 'ph-remote-manila',
  title: 'Junior Full-Stack Developer (Remote)',
  company: 'TechStartup PH Inc.',
  description: 'We are looking for a junior full-stack developer to join our remote team. Work from anywhere in the Philippines. Tech stack: TypeScript, React, Node.js.',
  country: 'Philippines',
  city: 'Manila',
  work_setup: 'REMOTE',
  work_setup_confidence: 0.9,
  work_setup_evidence: 'Title says remote, description confirms',
  required_skills: ['typescript', 'react', 'node.js'],
  preferred_skills: ['postgresql', 'docker'],
  seniority: 'JUNIOR',
  employment_type: 'FULL_TIME',
});

export const PH_HYBRID_MAKATI = makeJob({
  id: 'ph-hybrid-makati',
  title: 'Web Developer',
  company: 'Digital Agency Corp',
  description: 'Hybrid role in Makati. 3 days in office, 2 days WFH. Build web applications using JavaScript and modern frameworks.',
  country: 'Philippines',
  city: 'Makati',
  work_setup: 'HYBRID',
  work_setup_confidence: 0.85,
  work_setup_evidence: 'Description specifies 3 days office, 2 days WFH',
  onsite_days_per_week: 3,
  required_skills: ['javascript', 'html', 'css'],
  preferred_skills: ['react', 'vue'],
  seniority: 'JUNIOR',
  employment_type: 'FULL_TIME',
});

export const PH_ONSITE_BOAC = makeJob({
  id: 'ph-onsite-boac',
  title: 'IT Support Technician',
  company: 'Marinduque Provincial Government',
  description: 'On-site IT support role at the provincial government office in Boac, Marinduque. Hardware repair, networking, and user support.',
  country: 'Philippines',
  city: 'Boac',
  region: 'Marinduque',
  work_setup: 'ONSITE',
  work_setup_confidence: 0.95,
  work_setup_evidence: 'Government office role, explicitly on-site',
  required_skills: ['networking', 'hardware repairs'],
  preferred_skills: ['cybersecurity'],
  seniority: 'JUNIOR',
  employment_type: 'FULL_TIME',
});

export const PH_ONSITE_CEBU = makeJob({
  id: 'ph-onsite-cebu',
  title: 'Flutter Developer',
  company: 'Cebu Tech Solutions',
  description: 'Looking for a Flutter developer to join our Cebu office. Must be willing to relocate or already based in Cebu.',
  country: 'Philippines',
  city: 'Cebu',
  work_setup: 'ONSITE',
  work_setup_confidence: 0.9,
  work_setup_evidence: 'Cebu office, must be based in Cebu',
  required_skills: ['flutter', 'dart'],
  preferred_skills: ['firebase', 'supabase'],
  seniority: 'JUNIOR',
  employment_type: 'FULL_TIME',
});

// ============================================================================
// International Remote — Eligible
// ============================================================================

export const INTL_REMOTE_WORLDWIDE = makeJob({
  id: 'intl-remote-worldwide',
  title: 'Junior Software Developer (Remote)',
  company: 'Global Tech Corp',
  description: 'Fully remote role open to applicants worldwide. Build APIs and web applications. We embrace diverse, global teams.',
  country: null,
  work_setup: 'REMOTE',
  work_setup_confidence: 0.95,
  work_setup_evidence: 'Title says remote, worldwide applicants',
  allowed_regions: ['Worldwide'],
  eligibility_text: 'Open to applicants worldwide',
  required_skills: ['typescript', 'api development'],
  preferred_skills: ['react', 'postgresql'],
  seniority: 'JUNIOR',
  employment_type: 'FULL_TIME',
  salary_min: 1500,
  salary_max: 2500,
  salary_currency: 'USD',
  salary_period: 'monthly',
});

export const INTL_REMOTE_APAC = makeJob({
  id: 'intl-remote-apac',
  title: 'Mobile App Developer',
  company: 'APAC Software Ltd',
  description: 'Remote mobile developer position. Must be located in the APAC region. Flutter experience preferred.',
  country: null,
  work_setup: 'REMOTE',
  work_setup_confidence: 0.9,
  work_setup_evidence: 'Remote role, APAC region',
  allowed_regions: ['APAC'],
  eligibility_text: 'Must be located in the APAC region',
  required_skills: ['flutter', 'dart'],
  preferred_skills: ['firebase', 'supabase', 'figma'],
  seniority: 'JUNIOR',
  employment_type: 'CONTRACT',
});

// ============================================================================
// International Remote — Ineligible
// ============================================================================

export const INTL_REMOTE_US_ONLY = makeJob({
  id: 'intl-remote-us-only',
  title: 'Software Engineer (Remote)',
  company: 'American Tech Inc.',
  description: 'Remote software engineering position. Must be authorized to work in the United States. US-based candidates only.',
  country: 'United States',
  work_setup: 'REMOTE',
  work_setup_confidence: 0.9,
  work_setup_evidence: 'Remote but US only',
  allowed_countries: ['United States'],
  eligibility_text: 'US-based candidates only. Must be authorized to work in the United States.',
  required_skills: ['javascript', 'react', 'node.js'],
  seniority: 'JUNIOR',
  employment_type: 'FULL_TIME',
});

export const INTL_REMOTE_EU_ONLY = makeJob({
  id: 'intl-remote-eu-only',
  title: 'Frontend Developer (Remote)',
  company: 'Euro Digital GmbH',
  description: 'Remote frontend developer. EU residents only. Must be eligible to work within the European Union.',
  country: null,
  work_setup: 'REMOTE',
  work_setup_confidence: 0.9,
  work_setup_evidence: 'Remote but EU only',
  allowed_regions: ['European Union'],
  eligibility_text: 'EU residents only',
  required_skills: ['react', 'typescript'],
  seniority: 'JUNIOR',
  employment_type: 'FULL_TIME',
});

// ============================================================================
// International — Non-Remote (Ineligible)
// ============================================================================

export const INTL_HYBRID_SINGAPORE = makeJob({
  id: 'intl-hybrid-singapore',
  title: 'Software Developer',
  company: 'Singapore Fintech Pte Ltd',
  description: 'Hybrid role in Singapore. 3 days in our CBD office, 2 days remote. Relocation package available.',
  country: 'Singapore',
  city: 'Singapore',
  work_setup: 'HYBRID',
  work_setup_confidence: 0.9,
  work_setup_evidence: '3 days in office, Singapore',
  required_skills: ['java', 'spring'],
  seniority: 'JUNIOR',
  employment_type: 'FULL_TIME',
  relocation_required: true,
});

// ============================================================================
// International Remote — Ambiguous Eligibility
// ============================================================================

export const INTL_REMOTE_NO_REGION = makeJob({
  id: 'intl-remote-no-region',
  title: 'Backend Developer (Remote)',
  company: 'Mystery Startup Inc.',
  description: 'Fully remote backend developer position. Build scalable APIs with TypeScript and PostgreSQL. Competitive salary.',
  country: null,
  work_setup: 'REMOTE',
  work_setup_confidence: 0.85,
  work_setup_evidence: 'Title and description say remote',
  allowed_countries: [],
  allowed_regions: [],
  eligibility_text: '',
  required_skills: ['typescript', 'postgresql'],
  preferred_skills: ['docker', 'aws'],
  seniority: 'JUNIOR',
  employment_type: 'FULL_TIME',
});

// ============================================================================
// Hard Reject Scenarios
// ============================================================================

export const SCAM_MLM = makeJob({
  id: 'scam-mlm',
  title: 'Earn $5000/week from home! No experience needed!',
  company: 'Amazing Opportunities LLC',
  description: 'Join our multi-level marketing team! Commission only. Purchase your starter equipment for just $500. Guaranteed income with our crypto trading program.',
  country: null,
  work_setup: 'REMOTE',
  work_setup_confidence: 0.5,
  work_setup_evidence: 'Claims remote but suspicious',
  seniority: 'UNKNOWN',
  employment_type: 'UNKNOWN',
});

export const SENIOR_ROLE = makeJob({
  id: 'senior-role',
  title: 'Principal Engineer — Cloud Architecture',
  company: 'Enterprise Corp',
  description: 'We need a principal engineer with 10+ years of experience in cloud architecture, distributed systems, and team leadership.',
  country: 'Philippines',
  city: 'Manila',
  work_setup: 'HYBRID',
  work_setup_confidence: 0.8,
  work_setup_evidence: 'Office-based',
  required_skills: ['aws', 'kubernetes', 'terraform', 'distributed systems'],
  seniority: 'PRINCIPAL',
  employment_type: 'FULL_TIME',
  years_experience_min: 10,
});

export const EXPIRED_JOB = makeJob({
  id: 'expired-job',
  title: 'Junior Web Developer',
  company: 'Old Posting Corp',
  description: 'Looking for a junior web developer.',
  country: 'Philippines',
  work_setup: 'REMOTE',
  work_setup_confidence: 0.8,
  work_setup_evidence: 'Remote role',
  date_expires: '2026-06-01', // Already expired
  seniority: 'JUNIOR',
  employment_type: 'FULL_TIME',
});

export const REQUIRES_CLEARANCE = makeJob({
  id: 'requires-clearance',
  title: 'Software Developer',
  company: 'Defense Contractor Inc',
  description: 'Software developer for defense projects. Must have active security clearance. TS/SCI required.',
  country: 'United States',
  work_setup: 'ONSITE',
  work_setup_confidence: 0.9,
  work_setup_evidence: 'Defense contractor, onsite',
  required_skills: ['java', 'python'],
  seniority: 'MID',
  employment_type: 'FULL_TIME',
});

// ============================================================================
// Deduplication Fixtures
// ============================================================================

export const DUP_ORIGINAL = makeJob({
  id: 'dup-original',
  title: 'Junior Full-Stack Developer',
  company: 'TechCo Inc.',
  description: 'Junior full-stack developer role in Manila.',
  country: 'Philippines',
  city: 'Manila',
  source_name: 'jobstreet',
  source_job_id: 'JS-12345',
  original_url: 'https://www.jobstreet.com.ph/job/12345',
  date_posted: '2026-07-15',
  seniority: 'JUNIOR',
  employment_type: 'FULL_TIME',
});

export const DUP_SAME_SOURCE = makeJob({
  id: 'dup-same-source',
  title: 'Junior Full-Stack Developer',
  company: 'TechCo Inc.',
  description: 'Junior full-stack developer role in Manila.',
  country: 'Philippines',
  city: 'Manila',
  source_name: 'jobstreet',
  source_job_id: 'JS-12345',
  original_url: 'https://www.jobstreet.com.ph/job/12345',
  date_posted: '2026-07-15',
  seniority: 'JUNIOR',
  employment_type: 'FULL_TIME',
});

export const DUP_CROSS_SOURCE = makeJob({
  id: 'dup-cross-source',
  title: 'Jr. Full Stack Developer',
  company: 'TechCo, Inc.',
  description: 'We are hiring a junior full-stack dev in Manila.',
  country: 'Philippines',
  city: 'Manila',
  source_name: 'indeed',
  source_job_id: 'IND-99999',
  original_url: 'https://indeed.com/job/99999',
  date_posted: '2026-07-17',
  seniority: 'JUNIOR',
  employment_type: 'FULL_TIME',
});

export const DUP_DIFFERENT_JOB = makeJob({
  id: 'dup-different-job',
  title: 'Senior Backend Engineer',
  company: 'TechCo Inc.',
  description: 'Looking for a senior backend engineer.',
  country: 'Philippines',
  city: 'Manila',
  source_name: 'linkedin',
  date_posted: '2026-07-18',
  seniority: 'SENIOR',
  employment_type: 'FULL_TIME',
});

// ============================================================================
// Verified Skills Fixture (matches candidate profile)
// ============================================================================

export const VERIFIED_SKILLS = [
  { name: 'TypeScript', category: 'language' as const, proficiency: 'professional' as const, verification_status: 'VERIFIED' as const, source: 'USER_CONFIRMED' as const, source_reference: 'OJT — EIS microservices', evidence_level: 'professional' as const, allowed_in_resume: true },
  { name: 'Flutter', category: 'framework' as const, proficiency: 'professional' as const, verification_status: 'VERIFIED' as const, source: 'USER_CONFIRMED' as const, source_reference: 'WPDG apps', evidence_level: 'professional' as const, allowed_in_resume: true },
  { name: 'Dart', category: 'language' as const, proficiency: 'professional' as const, verification_status: 'VERIFIED' as const, source: 'USER_CONFIRMED' as const, source_reference: 'WPDG + HAPAG custom code', evidence_level: 'professional' as const, allowed_in_resume: true },
  { name: 'FlutterFlow', category: 'tool' as const, proficiency: 'intermediate' as const, verification_status: 'VERIFIED' as const, source: 'USER_CONFIRMED' as const, source_reference: 'HAPAG project', evidence_level: 'academic_project' as const, allowed_in_resume: true },
  { name: 'Supabase', category: 'platform' as const, proficiency: 'intermediate' as const, verification_status: 'VERIFIED' as const, source: 'USER_CONFIRMED' as const, source_reference: 'HAPAG project', evidence_level: 'academic_project' as const, allowed_in_resume: true },
  { name: 'JavaScript', category: 'language' as const, proficiency: 'intermediate' as const, verification_status: 'VERIFIED' as const, source: 'GITHUB_PROFILE' as const, source_reference: 'Multiple repos', evidence_level: 'personal_project' as const, allowed_in_resume: true },
  { name: 'HTML', category: 'language' as const, proficiency: 'intermediate' as const, verification_status: 'VERIFIED' as const, source: 'GITHUB_PROFILE' as const, source_reference: 'Portfolio, gasolina repos', evidence_level: 'personal_project' as const, allowed_in_resume: true },
  { name: 'CSS', category: 'language' as const, proficiency: 'intermediate' as const, verification_status: 'VERIFIED' as const, source: 'GITHUB_PROFILE' as const, source_reference: 'Portfolio, gasolina repos', evidence_level: 'personal_project' as const, allowed_in_resume: true },
  { name: 'Java', category: 'language' as const, proficiency: 'beginner' as const, verification_status: 'VERIFIED' as const, source: 'GITHUB_PROFILE' as const, source_reference: 'Fitness-Buddy repo', evidence_level: 'personal_project' as const, allowed_in_resume: true },
  { name: 'API Development', category: 'methodology' as const, proficiency: 'professional' as const, verification_status: 'VERIFIED' as const, source: 'USER_CONFIRMED' as const, source_reference: 'OJT — EIS microservices', evidence_level: 'professional' as const, allowed_in_resume: true },
  { name: 'Networking', category: 'other' as const, proficiency: null, verification_status: 'CV_STATED' as const, source: 'CV_MJ.docx' as const, source_reference: null, evidence_level: 'training' as const, allowed_in_resume: true },
  { name: 'Cybersecurity', category: 'other' as const, proficiency: null, verification_status: 'CV_STATED' as const, source: 'CERTIFICATE' as const, source_reference: 'DICT Ethical Hacking cert', evidence_level: 'certification' as const, allowed_in_resume: true },
  { name: 'Hardware Repairs', category: 'other' as const, proficiency: null, verification_status: 'CV_STATED' as const, source: 'CV_MJ.docx' as const, source_reference: null, evidence_level: 'training' as const, allowed_in_resume: true },
  { name: 'Figma', category: 'tool' as const, proficiency: null, verification_status: 'CV_STATED' as const, source: 'CV_MJ.docx' as const, source_reference: null, evidence_level: 'training' as const, allowed_in_resume: true },
];

// Export all fixtures
export const ALL_FIXTURES = {
  PH_REMOTE_MANILA,
  PH_HYBRID_MAKATI,
  PH_ONSITE_BOAC,
  PH_ONSITE_CEBU,
  INTL_REMOTE_WORLDWIDE,
  INTL_REMOTE_APAC,
  INTL_REMOTE_US_ONLY,
  INTL_REMOTE_EU_ONLY,
  INTL_HYBRID_SINGAPORE,
  INTL_REMOTE_NO_REGION,
  SCAM_MLM,
  SENIOR_ROLE,
  EXPIRED_JOB,
  REQUIRES_CLEARANCE,
  DUP_ORIGINAL,
  DUP_SAME_SOURCE,
  DUP_CROSS_SOURCE,
  DUP_DIFFERENT_JOB,
};
