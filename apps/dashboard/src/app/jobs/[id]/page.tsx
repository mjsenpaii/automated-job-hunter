import { eq } from 'drizzle-orm';
import {
  cleanJobContent,
  parseStoredJobSnapshot,
} from '@job-app/ingestion';
import { VerifiedJobRequirementsExtractionSchema } from '@job-app/ingestion/job-requirements-contracts';
import { checkHardReject } from '@job-app/scoring';
import { job_extractions, jobs, job_scores } from '@job-app/db/schema';
import { EmptyState } from '@/components/EmptyState';
import {
  JobDetailWorkspace,
} from '@/components/JobDetailWorkspace';
import type { JobDetailData } from '@/lib/jobs/job-export';
import { getDatabase } from '@/lib/db';
import {
  deriveMatchedProfileIds,
  deriveMatchedProfileLabels,
} from '@/lib/jobs/profile-targeting';
import {
  formatPersistedDate,
  resolveRecordedRejectionReasons,
  safeParseRecord,
  safeParseStringArray,
} from '@/lib/jobs/view-model';
import { toNormalizedForDedupe } from '@/lib/jobs/process-import';

export const dynamic = 'force-dynamic';

const FACTOR_META = [
  { key: 'role_fit', label: 'Role fit', max: 20 },
  { key: 'technical_match', label: 'Technical match', max: 25 },
  { key: 'experience_fit', label: 'Experience fit', max: 15 },
  { key: 'location_eligibility', label: 'Location & eligibility', max: 15 },
  { key: 'work_setup_fit', label: 'Work setup fit', max: 10 },
  { key: 'employment_fit', label: 'Employment fit', max: 5 },
  { key: 'project_relevance', label: 'Project relevance', max: 5 },
  { key: 'freshness', label: 'Freshness', max: 5 },
];

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function extractionString(
  extraction: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = stringOrNull(extraction[key]);
    if (value) return value;
  }
  return null;
}

function extractionList(
  extraction: Record<string, unknown>,
  ...keys: string[]
): string[] {
  for (const key of keys) {
    const value = stringList(extraction[key]);
    if (value.length > 0) return value;
  }
  return [];
}

function sanitizeSnapshot(value: unknown): unknown {
  if (typeof value === 'string') return cleanJobContent(value, 20_000);
  if (Array.isArray(value)) return value.map(sanitizeSnapshot);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeSnapshot(item)]),
    );
  }
  return value;
}

function formatSalary(job: typeof jobs.$inferSelect): string | null {
  if (job.salary_min == null && job.salary_max == null) return null;
  const values = [job.salary_min, job.salary_max]
    .filter((value): value is number => value != null)
    .map((value) => value.toLocaleString())
    .join(' – ');
  return [job.salary_currency, values, job.salary_period]
    .filter(Boolean)
    .join(' ');
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDatabase();
  const rows = await db
    .select({ job: jobs, score: job_scores })
    .from(jobs)
    .leftJoin(job_scores, eq(jobs.id, job_scores.job_id))
    .where(eq(jobs.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return (
      <EmptyState
        title="Job not found"
        description="This saved job does not exist or has been removed."
        actionLabel="Return to overview"
        actionHref="/"
      />
    );
  }

  const extractionRows = await db
    .select()
    .from(job_extractions)
    .where(eq(job_extractions.job_id, id))
    .limit(1);
  let verifiedRequirements = null;
  if (extractionRows[0]) {
    try {
      const parsed = VerifiedJobRequirementsExtractionSchema.safeParse(
        JSON.parse(extractionRows[0].structured_json),
      );
      if (parsed.success) verifiedRequirements = parsed.data;
    } catch {
      verifiedRequirements = null;
    }
  }

  const snapshot = safeParseRecord(row.job.raw_snapshot);
  const storedSnapshot = parseStoredJobSnapshot(row.job.raw_snapshot);
  const extraction = storedSnapshot?.extraction ?? {};
  const government = storedSnapshot?.government;
  let rejectionReasons = resolveRecordedRejectionReasons(
    row.job.rejection_reasons,
    snapshot,
  );
  if (row.job.status === 'HARD_REJECTED' && rejectionReasons.length === 0) {
    const normalized = toNormalizedForDedupe(row.job);
    const recomputed = checkHardReject(normalized, {
      isInternationalNonRemote:
        normalized.category === 'INTERNATIONAL' &&
        normalized.work_setup !== 'REMOTE',
      isCountryIneligible: normalized.eligibility_status === 'INELIGIBLE',
    });
    if (recomputed.rejected && recomputed.reasons.length > 0) {
      rejectionReasons = recomputed.reasons;
      // Repair legacy rows that predate rejection-reason persistence using the
      // same deterministic hard-rejection function and their stored source.
      await db
        .update(jobs)
        .set({ rejection_reasons: JSON.stringify(rejectionReasons) })
        .where(eq(jobs.id, row.job.id));
    }
  }

  const factors = safeParseRecord(row.score?.factors);
  const score =
    row.score && factors
      ? {
          value: row.score.score,
          recommendation: row.score.recommendation,
          reason: row.score.reason,
          factors: FACTOR_META.map((factor) => ({
            label: factor.label,
            value:
              typeof factors[factor.key] === 'number'
                ? (factors[factor.key] as number)
                : 0,
            max: factor.max,
          })),
          matchedSkills: safeParseStringArray(row.score.matched_skills),
          missingSkills: safeParseStringArray(row.score.missing_skills),
          riskFlags: safeParseStringArray(row.score.risk_flags),
          scoredAt: formatPersistedDate(row.score.scored_at),
        }
      : null;

  const rawSource = row.job.raw_snapshot
    ? JSON.stringify(sanitizeSnapshot(snapshot ?? row.job.raw_snapshot), null, 2)
    : 'No source snapshot was persisted.';
  const matchedProfileIds = deriveMatchedProfileIds(row.job);

  const detail: JobDetailData = {
    id: row.job.id,
    sourceName: row.job.source_name,
    sourceJobId: row.job.source_job_id,
    sourceUrl: row.job.original_url,
    title: row.job.title,
    company: row.job.company,
    description: cleanJobContent(row.job.description, 60_000),
    status: row.job.status,
    location:
      extractionString(extraction, 'location') ||
      [row.job.city, row.job.region, row.job.country].filter(Boolean).join(', ') ||
      'Not specified',
    workSetup: row.job.work_setup,
    workSetupConfidence: row.job.work_setup_confidence,
    eligibility: row.job.eligibility_status,
    employmentType:
      extractionString(extraction, 'employment_type', 'employmentType') ??
      row.job.employment_type,
    category: row.job.category,
    matchedProfileIds,
    matchedProfileLabels: deriveMatchedProfileLabels(matchedProfileIds),
    seniority: row.job.seniority,
    salary: formatSalary(row.job),
    salaryGrade:
      row.job.salary_grade ?? numberOrNull(extraction.salary_grade),
    salaryStep:
      row.job.salary_step ?? numberOrNull(extraction.salary_step),
    salaryReferenceMin:
      row.job.salary_reference_min ?? government?.salaryReferenceMin ?? null,
    salaryReferenceMax:
      row.job.salary_reference_max ?? government?.salaryReferenceMax ?? null,
    salaryReferenceCurrency:
      row.job.salary_reference_currency === 'PHP'
        ? 'PHP'
        : government?.salaryReferenceCurrency ?? null,
    salaryReferencePeriod:
      row.job.salary_reference_period === 'MONTHLY'
        ? 'MONTHLY'
        : government?.salaryReferencePeriod ?? null,
    salaryReferenceScheduleYear:
      row.job.salary_reference_schedule_year ??
      government?.salaryReferenceScheduleYear ??
      null,
    salaryReferenceSource:
      row.job.salary_reference_source ??
      government?.salaryReferenceSource ??
      null,
    salaryReferenceStepMin: government?.salaryReferenceStepMin ?? null,
    salaryReferenceStepMax: government?.salaryReferenceStepMax ?? null,
    salaryIsReferenceOnly:
      row.job.salary_is_reference_only ??
      government?.salaryIsReferenceOnly ??
      false,
    compensationNote:
      row.job.compensation_note ?? government?.compensationNote ?? null,
    governmentScope:
      row.job.government_scope ??
      extractionString(extraction, 'government_scope', 'governmentScope'),
    vacancies:
      row.job.vacancies ?? numberOrNull(extraction.vacancies),
    datePosted: formatPersistedDate(row.job.date_posted || null),
    dateUpdated: extractionString(extraction, 'date_updated', 'dateUpdated'),
    dateExpires: formatPersistedDate(row.job.date_expires || null),
    dateIngested: formatPersistedDate(row.job.date_ingested || null),
    recordCreatedAt: formatPersistedDate(row.job.created_at || null),
    recordUpdatedAt: formatPersistedDate(row.job.updated_at || null),
    yearsExperience: row.job.years_experience_min,
    requiredSkills: safeParseStringArray(row.job.required_skills),
    preferredSkills: safeParseStringArray(row.job.preferred_skills),
    responsibilities: extractionList(extraction, 'responsibilities'),
    requirements: extractionList(extraction, 'requirements'),
    applicationInstructions: extractionList(
      extraction,
      'application_instructions',
      'applicationInstructions',
    ),
    applicationKeyword: extractionString(
      extraction,
      'application_keyword',
      'applicationKeyword',
    ),
    applicationEmail:
      row.job.application_email ??
      extractionString(extraction, 'application_email', 'applicationEmail'),
    applicationAddressee:
      row.job.application_addressee ??
      extractionString(
        extraction,
        'application_addressee',
        'applicationAddressee',
      ),
    applicationUrl: extractionString(
      extraction,
      'application_url',
      'applicationUrl',
    ),
    civilServiceEligibility:
      row.job.civil_service_eligibility ??
      extractionString(
        extraction,
        'civil_service_eligibility',
        'civilServiceEligibility',
      ),
    scheduleNotes:
      safeParseStringArray(row.job.schedule_notes).length > 0
        ? safeParseStringArray(row.job.schedule_notes)
        : extractionList(extraction, 'schedule_notes', 'scheduleNotes'),
    rejectionReasons,
    rejectionReasonRecorded: rejectionReasons.length > 0,
    rawSource,
    score,
    verifiedRequirements,
  };

  return <JobDetailWorkspace job={detail} />;
}
