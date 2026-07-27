# Philippine Government Salary-Grade Enrichment

## Source and version

The committed 2026 schedule is transcribed from the official Department of
Budget and Management **National Budget Circular No. 601, Annex A**:

> The Third Tranche Monthly Salary Schedule for the Civilian Personnel of the
> National Government, Effective January 1, 2026

Official source:
https://www.dbm.gov.ph/wp-content/uploads/Issuances/2026/National-Budget-Circular/NATIONAL-BUDGET-CIRCULAR-NO.-601_NEW.pdf

The versioned dataset is
`packages/ingestion/src/government-salary-schedules.ts`. It contains Salary
Grades 1–33 and eight step positions. Annex A lists only Steps 1–2 for Salary
Grade 33, so Steps 3–8 are stored as `null`.

## Legal and semantic boundary

NBC No. 601 excludes individuals engaged through job orders, contracts of
service, and similarly situated arrangements. A DBM salary-grade lookup is
therefore contextual **reference data only** for those postings. It never
populates or replaces actual `salary_min`, `salary_max`, `salary_currency`, or
`salary_period`.

Gemini extracts only visible salary-grade facts. It is explicitly prohibited
from supplying government salary amounts. The local
`enrichGovernmentSalary()` function performs the lookup after Zod validation.

Enrichment requires all of the following:

- Philippines country;
- an explicitly supported Salary Grade;
- adequate evidence of national-government scope; and
- one unambiguous, supported schedule year from the posted/opening or closing
  date.

Unsupported years, unclear coverage, unavailable steps, and private-company
uses of `SG` retain the extracted grade but receive no DBM reference.

## Persistence and compatibility

Government fields are additive nullable columns. Closing date reuses the
existing `jobs.date_expires` column. Flexible structured metadata is also
stored in a version-2 snapshot. The tolerant snapshot parser continues to
support version-1 records.

`ensureSchema()` adds missing columns and indexes without recreating the
SQLite database or rewriting existing rows.

## Explicit backfill

Build the ingestion package first:

```powershell
pnpm --filter @job-app/ingestion build
```

Dry run is the default and reports only counts:

```powershell
pnpm --filter @job-app/ingestion backfill:government
```

Apply mode must be requested explicitly:

```powershell
pnpm --filter @job-app/ingestion backfill:government -- --apply
```

The utility is deterministic, does not call Gemini, and does not log job
content. Apply mode was not run during implementation.
