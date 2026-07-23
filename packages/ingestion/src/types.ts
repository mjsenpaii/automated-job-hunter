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
}

export interface SourceAdapter {
  name: string;
  fetchJobs(): Promise<RawJobInput[]>;
}
