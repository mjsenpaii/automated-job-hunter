import { createDatabase } from '@job-app/db/connection';
import { z } from 'zod';
import {
  enrichGovernmentSalary,
  GovernmentScopeSchema,
  GovernmentSalaryReferenceSchema,
} from './government-enrichment.js';
import { GeminiEvidenceSchema } from './gemini-contracts.js';
import { parseStoredJobSnapshot } from './job-snapshot.js';

const ExistingJobRowSchema = z.object({
  id: z.string(),
  company: z.string(),
  country: z.string().nullable(),
  employment_type: z.string(),
  date_posted: z.string(),
  date_expires: z.string(),
  salary_min: z.number().nullable(),
  salary_max: z.number().nullable(),
  salary_grade: z.number().nullable(),
  salary_step: z.number().nullable(),
  salary_reference_min: z.number().nullable(),
  salary_reference_max: z.number().nullable(),
  salary_reference_currency: z.string().nullable(),
  salary_reference_period: z.string().nullable(),
  salary_reference_schedule_year: z.number().nullable(),
  salary_reference_source: z.string().nullable(),
  salary_is_reference_only: z.number().nullable(),
  compensation_note: z.string().nullable(),
  vacancies: z.number().nullable(),
  application_email: z.string().nullable(),
  application_addressee: z.string().nullable(),
  civil_service_eligibility: z.string().nullable(),
  schedule_notes: z.string().nullable(),
  government_scope: z.string().nullable(),
  raw_snapshot: z.string().nullable(),
});

function text(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function number(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function list(record: Record<string, unknown>, ...keys: string[]): string[] {
  for (const key of keys) {
    const parsed = record[key];
    if (Array.isArray(parsed)) {
      return parsed.filter((value): value is string => typeof value === 'string');
    }
  }
  return [];
}

function parseSalaryGrade(value: string | null): number | null {
  const match = value?.match(/\b(?:salary\s*grade|sg)\s*[-:]?\s*(\d{1,2})\b/i);
  if (!match?.[1]) return null;
  const grade = Number(match[1]);
  return Number.isInteger(grade) && grade >= 1 && grade <= 33 ? grade : null;
}

function argumentsFromProcess(): {
  apply: boolean;
  databasePath: string;
} {
  const args = process.argv.slice(2);
  const databaseIndex = args.indexOf('--database');
  const suppliedDatabasePath =
    databaseIndex >= 0 ? args[databaseIndex + 1] : undefined;
  const databasePath = suppliedDatabasePath || '../../data/app.db';
  return {
    apply: args.includes('--apply'),
    databasePath,
  };
}

function main(): void {
  const options = argumentsFromProcess();
  const sqlite = createDatabase(options.databasePath);
  const rows = ExistingJobRowSchema.array().parse(
    sqlite.prepare('SELECT * FROM jobs').all(),
  );
  const changedFieldCounts = new Map<string, number>();
  let changedRows = 0;

  const update = sqlite.prepare(`
    UPDATE jobs SET
      salary_grade = @salary_grade,
      salary_step = @salary_step,
      salary_reference_min = @salary_reference_min,
      salary_reference_max = @salary_reference_max,
      salary_reference_currency = @salary_reference_currency,
      salary_reference_period = @salary_reference_period,
      salary_reference_schedule_year = @salary_reference_schedule_year,
      salary_reference_source = @salary_reference_source,
      salary_is_reference_only = @salary_is_reference_only,
      compensation_note = @compensation_note,
      vacancies = @vacancies,
      application_email = @application_email,
      application_addressee = @application_addressee,
      civil_service_eligibility = @civil_service_eligibility,
      schedule_notes = @schedule_notes,
      government_scope = @government_scope,
      raw_snapshot = @raw_snapshot,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `);

  const applyTransaction = sqlite.transaction((changes: Record<string, unknown>[]) => {
    for (const change of changes) update.run(change);
  });
  const pending: Record<string, unknown>[] = [];

  for (const row of rows) {
    const snapshot = parseStoredJobSnapshot(row.raw_snapshot);
    if (!snapshot) continue;
    const extraction = snapshot.extraction;
    const salaryText = text(extraction, 'salary_text', 'salaryText');
    const salaryGrade =
      row.salary_grade ??
      number(extraction, 'salary_grade', 'salaryGrade') ??
      parseSalaryGrade(salaryText);
    const scopeFromSnapshot = GovernmentScopeSchema.safeParse(
      text(extraction, 'government_scope', 'governmentScope'),
    );
    const governmentScope =
      (row.government_scope &&
      GovernmentScopeSchema.safeParse(row.government_scope).success
        ? GovernmentScopeSchema.parse(row.government_scope)
        : null) ??
      (scopeFromSnapshot.success ? scopeFromSnapshot.data : null) ??
      (/\bPhilippine Statistics Authority\b/i.test(row.company)
        ? 'NATIONAL_GOVERNMENT'
        : null);
    const evidence = GeminiEvidenceSchema.array().safeParse(extraction.evidence);
    const enriched = enrichGovernmentSalary({
      company: row.company,
      country: row.country,
      employmentType: row.employment_type,
      salaryText,
      salaryMin: row.salary_min,
      salaryMax: row.salary_max,
      salaryGrade,
      salaryStep:
        row.salary_step ?? number(extraction, 'salary_step', 'salaryStep'),
      datePosted: row.date_posted || text(extraction, 'date_posted', 'datePosted'),
      closingDate:
        row.date_expires || text(extraction, 'closing_date', 'closingDate'),
      governmentScope,
      evidence: evidence.success ? evidence.data : [],
    });
    const reference = GovernmentSalaryReferenceSchema.parse(enriched);
    const extractedVacancies = number(extraction, 'vacancies');
    const extractedApplicationEmail = text(
      extraction,
      'application_email',
      'applicationEmail',
    );
    const extractedApplicationAddressee = text(
      extraction,
      'application_addressee',
      'applicationAddressee',
    );
    const extractedCivilServiceEligibility = text(
      extraction,
      'civil_service_eligibility',
      'civilServiceEligibility',
    );
    const extractedScheduleNotes = list(
      extraction,
      'schedule_notes',
      'scheduleNotes',
    );
    const hasGovernmentMetadata =
      salaryGrade !== null ||
      governmentScope !== null ||
      reference.salaryReferenceMin !== null ||
      extractedVacancies !== null ||
      extractedApplicationEmail !== null ||
      extractedApplicationAddressee !== null ||
      extractedCivilServiceEligibility !== null ||
      extractedScheduleNotes.length > 0;
    if (!hasGovernmentMetadata) continue;

    const next = {
      id: row.id,
      salary_grade: salaryGrade,
      salary_step: enriched.salaryStep,
      salary_reference_min: reference.salaryReferenceMin,
      salary_reference_max: reference.salaryReferenceMax,
      salary_reference_currency: reference.salaryReferenceCurrency,
      salary_reference_period: reference.salaryReferencePeriod,
      salary_reference_schedule_year: reference.salaryReferenceScheduleYear,
      salary_reference_source: reference.salaryReferenceSource,
      salary_is_reference_only: reference.salaryIsReferenceOnly ? 1 : 0,
      compensation_note: reference.compensationNote,
      vacancies: row.vacancies ?? extractedVacancies,
      application_email:
        row.application_email ?? extractedApplicationEmail,
      application_addressee:
        row.application_addressee ?? extractedApplicationAddressee,
      civil_service_eligibility:
        row.civil_service_eligibility ?? extractedCivilServiceEligibility,
      schedule_notes:
        row.schedule_notes ??
        JSON.stringify(extractedScheduleNotes),
      government_scope: governmentScope,
      raw_snapshot: JSON.stringify({
        ...snapshot,
        version: 2,
        government: reference,
      }),
    };

    const comparable: Record<string, unknown> = {
      salary_grade: row.salary_grade,
      salary_step: row.salary_step,
      salary_reference_min: row.salary_reference_min,
      salary_reference_max: row.salary_reference_max,
      salary_reference_currency: row.salary_reference_currency,
      salary_reference_period: row.salary_reference_period,
      salary_reference_schedule_year: row.salary_reference_schedule_year,
      salary_reference_source: row.salary_reference_source,
      salary_is_reference_only: row.salary_is_reference_only ?? 0,
      compensation_note: row.compensation_note,
      vacancies: row.vacancies,
      application_email: row.application_email,
      application_addressee: row.application_addressee,
      civil_service_eligibility: row.civil_service_eligibility,
      schedule_notes: row.schedule_notes,
      government_scope: row.government_scope,
      raw_snapshot: row.raw_snapshot,
    };
    const changedFields = Object.entries(next)
      .filter(([key, value]) => key !== 'id' && comparable[key] !== value)
      .map(([key]) => key);
    if (changedFields.length === 0) continue;
    changedRows += 1;
    pending.push(next);
    for (const field of changedFields) {
      changedFieldCounts.set(field, (changedFieldCounts.get(field) ?? 0) + 1);
    }
  }

  if (options.apply && pending.length > 0) applyTransaction(pending);
  console.log(
    JSON.stringify(
      {
        mode: options.apply ? 'apply' : 'dry-run',
        scannedRows: rows.length,
        changedRows,
        changedFields: Object.fromEntries(
          [...changedFieldCounts.entries()].sort(([a], [b]) =>
            a.localeCompare(b),
          ),
        ),
      },
      null,
      2,
    ),
  );
  sqlite.close();
}

main();
