import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createDatabase } from '@job-app/db/connection';
import {
  enrichGovernmentSalary,
  type GovernmentEnrichmentInput,
} from '../src/government-enrichment.js';
import {
  PH_NATIONAL_SALARY_SCHEDULE_2026,
  getPhilippineNationalSalarySchedule,
} from '../src/government-salary-schedules.js';
import { parseStoredJobSnapshot } from '../src/job-snapshot.js';
import { normalizeJob, parseSalary } from '../src/normalizer.js';

const OFFICIAL_2026_TABLE_SHA256 =
  '89c1f98af3f8f26f2688275145d84f89200040dd6f3e88a928813079f92572dd';

function psaInput(
  overrides: Partial<GovernmentEnrichmentInput> = {},
): GovernmentEnrichmentInput {
  return {
    company:
      'Philippine Statistics Authority – Marinduque Provincial Statistical Office',
    country: 'Philippines',
    employmentType: 'Contract of Service Worker',
    salaryText: 'SG 6',
    salaryMin: null,
    salaryMax: null,
    salaryGrade: 6,
    salaryStep: null,
    datePosted: '2026-07-24',
    closingDate: '2026-07-28',
    governmentScope: 'NATIONAL_GOVERNMENT',
    evidence: [
      {
        field: 'salaryGrade',
        value: '6',
        excerpts: ['Salary Grade 6'],
      },
      {
        field: 'governmentScope',
        value: 'NATIONAL_GOVERNMENT',
        excerpts: ['Philippine Statistics Authority'],
      },
    ],
    ...overrides,
  };
}

describe('2026 Philippine national-government salary schedule', () => {
  it('resolves Salary Grade 6 Steps 1–8 exactly', () => {
    expect(PH_NATIONAL_SALARY_SCHEDULE_2026.grades[6]).toEqual([
      19_716, 19_862, 20_009, 20_158, 20_307, 20_456, 20_609, 20_761,
    ]);
  });

  it('matches the verified official table structure and committed checksum', () => {
    const schedule = PH_NATIONAL_SALARY_SCHEDULE_2026;
    expect(schedule.metadata).toMatchObject({
      circularNumber: 'National Budget Circular No. 601',
      scheduleYear: 2026,
      effectiveDate: '2026-01-01',
      sourceReference: 'DBM National Budget Circular No. 601, Annex A',
    });
    expect(Object.keys(schedule.grades)).toHaveLength(33);
    for (let grade = 1; grade <= 32; grade += 1) {
      const row = schedule.grades[grade];
      expect(row).toHaveLength(8);
      expect(row?.every((amount) => typeof amount === 'number')).toBe(true);
    }
    expect(schedule.grades[33]).toEqual([
      449_157,
      462_329,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(
      createHash('sha256')
        .update(JSON.stringify(schedule.grades))
        .digest('hex'),
    ).toBe(OFFICIAL_2026_TABLE_SHA256);
  });
});

describe('deterministic government salary enrichment', () => {
  it('keeps Contract of Service actual salary fields null', () => {
    expect(parseSalary('SG 6')).toEqual({
      salary_min: null,
      salary_max: null,
      salary_currency: null,
      salary_period: null,
    });
    const enriched = enrichGovernmentSalary(psaInput());
    expect(enriched.salaryMin).toBeNull();
    expect(enriched.salaryMax).toBeNull();
  });

  it('marks the PSA Contract of Service DBM range as reference only', () => {
    const enriched = enrichGovernmentSalary(psaInput());
    expect(enriched).toMatchObject({
      salaryReferenceMin: 19_716,
      salaryReferenceMax: 20_761,
      salaryReferenceCurrency: 'PHP',
      salaryReferencePeriod: 'MONTHLY',
      salaryReferenceScheduleYear: 2026,
      salaryReferenceSource: 'DBM National Budget Circular No. 601, Annex A',
      salaryReferenceStepMin: 1,
      salaryReferenceStepMax: 8,
      salaryIsReferenceOnly: true,
      compensationNote:
        'DBM national-government salary-grade reference only. Actual Contract of Service compensation was not stated.',
    });
  });

  it('preserves explicitly stated actual compensation separately', () => {
    const enriched = enrichGovernmentSalary(
      psaInput({
        salaryText: 'SG 6; actual compensation PHP 25,000 monthly',
        salaryMin: 25_000,
        salaryMax: 25_000,
      }),
    );
    expect(enriched.salaryMin).toBe(25_000);
    expect(enriched.salaryMax).toBe(25_000);
    expect(enriched.salaryReferenceMin).toBe(19_716);
    expect(enriched.compensationNote).toMatch(/separately stated actual/i);
  });

  it('does not use the 2026 table for unsupported years', () => {
    const enriched = enrichGovernmentSalary(
      psaInput({
        datePosted: '2027-07-24',
        closingDate: '2027-07-28',
      }),
    );
    expect(getPhilippineNationalSalarySchedule(2027)).toBeNull();
    expect(enriched.salaryReferenceMin).toBeNull();
    expect(enriched.salaryReferenceScheduleYear).toBeNull();
  });

  it('does not enrich unclear government scope', () => {
    const enriched = enrichGovernmentSalary(
      psaInput({
        company: 'Unspecified government office',
        governmentScope: 'UNKNOWN',
        evidence: [],
      }),
    );
    expect(enriched.salaryGrade).toBe(6);
    expect(enriched.salaryReferenceMin).toBeNull();
  });

  it('does not enrich a private company merely mentioning SG 6', () => {
    const enriched = enrichGovernmentSalary(
      psaInput({
        company: 'Private SG 6 Consulting Inc.',
        governmentScope: null,
        evidence: [
          {
            field: 'salaryGrade',
            value: '6',
            excerpts: ['Internal band SG 6'],
          },
        ],
      }),
    );
    expect(enriched.salaryReferenceMin).toBeNull();
    expect(enriched.salaryIsReferenceOnly).toBe(false);
  });

  it('never places reference compensation in normalized actual-salary fields', () => {
    const normalized = normalizeJob({
      source_name: 'fixture',
      title: 'Administrative Aide VI',
      company: 'Philippine Statistics Authority',
      description: 'Contract of Service Worker, Salary Grade 6.',
      country: 'Philippines',
      salary_text: 'SG 6',
    });
    expect(normalized.salary_min).toBeNull();
    expect(normalized.salary_max).toBeNull();
    expect(normalized).not.toHaveProperty('salaryReferenceMin');
  });
});

describe('stored snapshot compatibility', () => {
  it('continues parsing legacy version-1 snapshots safely', () => {
    const parsed = parseStoredJobSnapshot(
      JSON.stringify({
        version: 1,
        source: 'unified-import',
        extraction: {
          salary_text: 'SG 6',
          application_keyword: null,
        },
      }),
    );
    expect(parsed?.version).toBe(1);
    expect(parsed?.government).toBeUndefined();
    expect(parsed?.extraction.salary_text).toBe('SG 6');
  });

  it('creates the additive searchable government columns without row backfill', () => {
    const sqlite = createDatabase(':memory:');
    const columns = sqlite
      .prepare('PRAGMA table_info(jobs)')
      .all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));
    for (const name of [
      'salary_grade',
      'salary_step',
      'salary_reference_min',
      'salary_reference_max',
      'vacancies',
      'application_email',
      'government_scope',
    ]) {
      expect(names.has(name)).toBe(true);
    }
    const rowCount = sqlite
      .prepare('SELECT COUNT(*) AS count FROM jobs')
      .get() as { count: number };
    expect(rowCount.count).toBe(0);
    sqlite.close();
  });
});
