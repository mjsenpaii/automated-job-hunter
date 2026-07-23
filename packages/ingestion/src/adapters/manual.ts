import type { RawJobInput } from '../types.js';

export function createManualJob(input: {
  title: string;
  company: string;
  description: string;
  url?: string;
  country?: string;
  city?: string;
  work_setup?: string;
  employment_type?: string;
  salary_text?: string;
  required_skills?: string[];
  preferred_skills?: string[];
}): RawJobInput {
  return {
    source_name: 'manual',
    original_url: input.url,
    title: input.title,
    company: input.company,
    description: input.description,
    country: input.country,
    city: input.city,
    work_setup_hint: input.work_setup,
    employment_type: input.employment_type,
    salary_text: input.salary_text,
    required_skills: input.required_skills,
    preferred_skills: input.preferred_skills,
  };
}
