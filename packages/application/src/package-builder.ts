import { nanoid } from 'nanoid';
import { ApplicationPackage } from './types';

export function createApplicationPackage(params: {
  jobId: string;
  jobTitle: string;
  company: string;
  resumeProfileId: string;
  jobDescription?: string;
}): ApplicationPackage {
  const now = new Date().toISOString();
  return {
    id: nanoid(),
    job_id: params.jobId,
    job_title: params.jobTitle,
    company: params.company,
    status: 'DRAFT',
    resume_profile_id: params.resumeProfileId,
    resume_path: null,
    cover_letter_path: null,
    application_answers: {},
    quality_gate_results: [],
    created_at: now,
    updated_at: now,
    notes: []
  };
}

export function selectBestProfile(jobTitle: string, jobDescription: string): string {
  const normalizedTitle = jobTitle.toLowerCase();
  const normalizedDesc = jobDescription.toLowerCase();

  const softwareKeywords = ['software', 'developer', 'engineer', 'frontend', 'backend', 'fullstack', 'react', 'node', 'typescript'];
  const supportKeywords = ['support', 'help desk', 'customer', 'technical support', 'service', 'troubleshooting'];

  let softwareScore = 0;
  let supportScore = 0;

  for (const kw of softwareKeywords) {
    if (normalizedTitle.includes(kw)) softwareScore += 2;
    if (normalizedDesc.includes(kw)) softwareScore += 1;
  }

  for (const kw of supportKeywords) {
    if (normalizedTitle.includes(kw)) supportScore += 2;
    if (normalizedDesc.includes(kw)) supportScore += 1;
  }

  if (supportScore > softwareScore) {
    return 'technical-support';
  }

  return 'software-developer';
}
