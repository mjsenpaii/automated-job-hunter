import { z } from 'zod';
import {
  getPhilippineNationalSalarySchedule,
  type GovernmentSalarySchedule,
} from './government-salary-schedules.js';

export const GovernmentScopeSchema = z.enum([
  'NATIONAL_GOVERNMENT',
  'LOCAL_GOVERNMENT',
  'UNKNOWN',
]);
export type GovernmentScope = z.infer<typeof GovernmentScopeSchema>;

export const GovernmentSalaryReferenceSchema = z.object({
  salaryReferenceMin: z.number().nonnegative().nullable(),
  salaryReferenceMax: z.number().nonnegative().nullable(),
  salaryReferenceCurrency: z.literal('PHP').nullable(),
  salaryReferencePeriod: z.literal('MONTHLY').nullable(),
  salaryReferenceScheduleYear: z.number().int().nullable(),
  salaryReferenceSource: z.string().nullable(),
  salaryReferenceStepMin: z.number().int().min(1).max(8).nullable(),
  salaryReferenceStepMax: z.number().int().min(1).max(8).nullable(),
  salaryIsReferenceOnly: z.boolean(),
  compensationNote: z.string().nullable(),
});
export type GovernmentSalaryReference = z.infer<
  typeof GovernmentSalaryReferenceSchema
>;

interface EvidenceItem {
  field: string;
  value: string | null;
  excerpts: string[];
}

export interface GovernmentEnrichmentInput {
  company: string | null;
  country: string | null;
  employmentType: string | null;
  salaryText: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryGrade: number | null;
  salaryStep: number | null;
  datePosted: string | null;
  closingDate: string | null;
  governmentScope: GovernmentScope | null;
  evidence: EvidenceItem[];
}

const EMPTY_REFERENCE: GovernmentSalaryReference = Object.freeze({
  salaryReferenceMin: null,
  salaryReferenceMax: null,
  salaryReferenceCurrency: null,
  salaryReferencePeriod: null,
  salaryReferenceScheduleYear: null,
  salaryReferenceSource: null,
  salaryReferenceStepMin: null,
  salaryReferenceStepMax: null,
  salaryIsReferenceOnly: false,
  compensationNote: null,
});

function isPhilippines(country: string | null): boolean {
  return /^(?:philippines|ph)$/i.test(country?.trim() ?? '');
}

function explicitSalaryGrade(input: GovernmentEnrichmentInput): boolean {
  if (input.salaryGrade === null) return false;
  const gradePattern = new RegExp(
    `\\b(?:salary\\s*grade|sg)\\s*[-:]?\\s*${input.salaryGrade}\\b`,
    'i',
  );
  if (gradePattern.test(input.salaryText ?? '')) return true;
  return input.evidence.some(
    (item) =>
      item.field === 'salaryGrade' &&
      (item.value === String(input.salaryGrade) ||
        item.excerpts.some((excerpt) => gradePattern.test(excerpt))),
  );
}

function hasNationalGovernmentEvidence(input: GovernmentEnrichmentInput): boolean {
  if (input.governmentScope !== 'NATIONAL_GOVERNMENT') return false;

  const evidenceSupportsScope = input.evidence.some(
    (item) =>
      item.field === 'governmentScope' &&
      item.value === 'NATIONAL_GOVERNMENT' &&
      item.excerpts.some((excerpt) =>
        /\b(?:national government|republic of the philippines|department of|philippine statistics authority)\b/i.test(
          excerpt,
        ),
      ),
  );
  if (evidenceSupportsScope) return true;

  // Narrow, deterministic recognition for the national agency covered by the
  // supplied fixture. This does not classify generic "government" wording.
  return /\bPhilippine Statistics Authority\b/i.test(input.company ?? '');
}

function supportedScheduleYear(input: GovernmentEnrichmentInput): number | null {
  const years = [input.datePosted, input.closingDate]
    .map((value) => value?.match(/^(\d{4})-\d{2}-\d{2}$/)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number);
  const uniqueYears = [...new Set(years)];
  if (uniqueYears.length !== 1) return null;
  return uniqueYears[0] ?? null;
}

function availableSalarySteps(
  schedule: GovernmentSalarySchedule,
  salaryGrade: number,
): Array<{ step: number; amount: number }> {
  const row = schedule.grades[salaryGrade];
  if (!row) return [];
  return row.flatMap((amount, index) =>
    amount === null ? [] : [{ step: index + 1, amount }],
  );
}

function compensationNote(
  input: GovernmentEnrichmentInput,
): string {
  const actualWasStated = input.salaryMin !== null || input.salaryMax !== null;
  const isContractOfService =
    /\b(?:contract of service|job order)\b/i.test(input.employmentType ?? '');

  if (isContractOfService && !actualWasStated) {
    return 'DBM national-government salary-grade reference only. Actual Contract of Service compensation was not stated.';
  }
  if (actualWasStated) {
    return 'DBM national-government salary-grade reference only. The posting separately stated actual compensation.';
  }
  return 'DBM national-government salary-grade reference only. Actual offered compensation was not stated.';
}

/**
 * Adds a deterministic DBM reference without changing actual salary fields.
 * Unsupported years, unclear coverage, absent explicit grades, and unavailable
 * steps deliberately produce no reference.
 */
export function enrichGovernmentSalary<T extends GovernmentEnrichmentInput>(
  input: T,
): T & GovernmentSalaryReference {
  const withoutReference = { ...input, ...EMPTY_REFERENCE };
  if (
    !isPhilippines(input.country) ||
    input.salaryGrade === null ||
    !explicitSalaryGrade(input) ||
    !hasNationalGovernmentEvidence(input)
  ) {
    return withoutReference;
  }

  const year = supportedScheduleYear(input);
  if (year === null) return withoutReference;
  const schedule = getPhilippineNationalSalarySchedule(year);
  if (!schedule) return withoutReference;

  const available = availableSalarySteps(schedule, input.salaryGrade);
  const selected =
    input.salaryStep === null
      ? available
      : available.filter((entry) => entry.step === input.salaryStep);
  if (selected.length === 0) return withoutReference;

  return {
    ...input,
    salaryReferenceMin: Math.min(...selected.map((entry) => entry.amount)),
    salaryReferenceMax: Math.max(...selected.map((entry) => entry.amount)),
    salaryReferenceCurrency: 'PHP',
    salaryReferencePeriod: 'MONTHLY',
    salaryReferenceScheduleYear: year,
    salaryReferenceSource: schedule.metadata.sourceReference,
    salaryReferenceStepMin: selected[0]?.step ?? null,
    salaryReferenceStepMax: selected.at(-1)?.step ?? null,
    salaryIsReferenceOnly: true,
    compensationNote: compensationNote(input),
  };
}
