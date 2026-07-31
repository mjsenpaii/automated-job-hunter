import type {
  EnrichedGeminiJobExtraction,
  GeminiExtractionMetadata,
  GeminiJobExtraction,
} from '@job-app/ingestion/gemini-contracts';
import { enrichGovernmentSalary } from '@job-app/ingestion/government-enrichment';
import type { VerifiedJobRequirementsExtraction } from '@job-app/ingestion/job-requirements-contracts';

export function linesToList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean);
}

export function listToLines(value: string[]): string {
  return value.join('\n');
}

export function updateExtractionField<K extends keyof GeminiJobExtraction>(
  current: EnrichedGeminiJobExtraction,
  field: K,
  value: GeminiJobExtraction[K],
): EnrichedGeminiJobExtraction {
  return enrichGovernmentSalary({ ...current, [field]: value });
}

export function extractionToConfirmPayload(
  extraction: EnrichedGeminiJobExtraction,
  metadata?: GeminiExtractionMetadata,
  verifiedRequirements?: VerifiedJobRequirementsExtraction,
) {
  return {
    title: extraction.title ?? '',
    company: extraction.company ?? '',
    description: extraction.description ?? '',
    url: extraction.sourceUrl,
    source_site: extraction.sourceSite,
    country: extraction.country,
    city: extraction.city,
    location: extraction.location,
    work_setup: extraction.workSetup,
    employment_type: extraction.employmentType,
    skills: extraction.skills.join(', '),
    salary_text: extraction.salaryText,
    salary_min: extraction.salaryMin,
    salary_max: extraction.salaryMax,
    salary_currency: extraction.salaryCurrency,
    salary_grade: extraction.salaryGrade,
    salary_step: extraction.salaryStep,
    hours_per_week: extraction.hoursPerWeek,
    date_posted: extraction.datePosted,
    date_updated: extraction.dateUpdated,
    closing_date: extraction.closingDate,
    timezone_or_schedule: extraction.timezoneOrSchedule,
    seniority: null,
    vacancies: extraction.vacancies,
    civil_service_eligibility: extraction.civilServiceEligibility,
    schedule_notes: extraction.scheduleNotes,
    government_scope: extraction.governmentScope,
    responsibilities: extraction.responsibilities,
    requirements: extraction.requirements,
    required_years_experience: extraction.requiredYearsExperience,
    preferred_years_experience: extraction.preferredYearsExperience,
    application_instructions: extraction.applicationInstructions,
    application_keyword: extraction.applicationKeyword,
    application_email: extraction.applicationEmail,
    application_addressee: extraction.applicationAddressee,
    application_url: extraction.applicationUrl,
    evidence: extraction.evidence,
    extraction_metadata: metadata,
    verified_requirements: verifiedRequirements,
  };
}
