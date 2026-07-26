import type { NormalizedJob, StructuredScore } from '@job-app/core';

export interface RawJobInput {
  source_name: string;
  source_job_id?: string;
  original_url?: string;
  title: string;
  company: string;
  description: string;
  date_posted?: string;
  country?: string;
  city?: string;
  region?: string;
  work_setup_hint?: string;
  employment_type?: string;
  salary_text?: string;
  required_skills?: string[];
  preferred_skills?: string[];
  seniority_hint?: string;
  allowed_countries?: string[];
  allowed_regions?: string[];
  eligibility_text?: string;
  application_url?: string;
  raw_html?: string;
}

export interface IngestionResult {
  job_id: string;
  status: 'INGESTED' | 'DUPLICATE' | 'HARD_REJECTED' | 'ERROR';
  score?: number;
  recommendation?: string;
  rejection_reasons?: string[];
  duplicate_of_id?: string;
  error?: string;
  normalized_job?: NormalizedJob;
  /** Full structured score (factors, matched/missing skills, risk flags, reason). */
  score_detail?: StructuredScore;
}

export interface SourceAdapter {
  name: string;
  fetchJobs(): Promise<RawJobInput[]>;
}

/** Client-safe extraction payload (no Node-only imports). */
export interface ExtractedJobData {
  title: string | null;
  company: string | null;
  description: string | null;
  country: string | null;
  city: string | null;
  work_setup: string | null;
  employment_type: string | null;
  salary_text: string | null;
  required_skills: string[];
  preferred_skills: string[];
  seniority: string | null;
  allowed_countries: string[];
  allowed_regions: string[];
  eligibility_text: string | null;
  application_url: string | null;
  source_url: string;
  extraction_method: 'json-ld' | 'meta-tags' | 'html-heuristic' | 'manual';
  confidence: Record<string, 'high' | 'medium' | 'low' | 'inferred'>;
  raw_html?: string;
}

export interface ExtractionResult {
  success: boolean;
  data: ExtractedJobData | null;
  error?: string;
  warnings: string[];
  requires_manual_input: boolean;
  /** Required fields still null/empty after extraction (partial success). */
  missingFields?: Array<'title' | 'company' | 'description' | 'location' | 'work_setup'>;
}
