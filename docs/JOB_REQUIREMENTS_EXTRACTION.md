# Verified Job-Requirements Extraction

## Trust boundary

Phase 7.1B.4B.1 uses a candidate-first hybrid pipeline:

1. deterministic HTML/provider normalization;
2. deterministic enumeration of ordered evidence candidates;
3. one strict Gemini classification for every candidate ID;
4. strict Zod validation and candidate-set equality checks;
5. independent deterministic evidence and scalar verification;
6. conflict-preserving provider reconciliation;
7. scoring/hard rejection using individually `VERIFIED` facts only.

The system guarantees fail-closed handling, not perfect extraction accuracy.
Gemini cannot supply replacement evidence. Missing, unknown, duplicate, or
reordered candidate IDs invalidate the response. Evidence is never assembled
across clauses, bullets, sections, or provider fields.

Individual facts use `VERIFIED`, `MISSING`, `REQUIRES_REVIEW`, `CONFLICT`, and
`EXTRACTION_FAILED`. Aggregate extraction and salary state additionally use
`PARTIAL`. Only individually `VERIFIED` facts may affect scoring, eligibility,
or hard rejection.

## Deterministic preprocessing and candidates

`packages/ingestion/src/job-requirements-preprocessor.ts`:

- uses Cheerio rather than regex-only HTML parsing;
- removes scripts, styles, hidden/executable content, and tracking-only markup;
- preserves heading, paragraph, list, bullet, and section order;
- retains the original raw description unchanged;
- records normalized clause ranges and original ranges where available;
- emits stable IDs for every heading, bullet, standalone clause, and available
  provider salary/location/work-setup/employment field;
- normalizes supported ISO/Unix provider dates while preserving originals;
- reuses the shared canonical job-URL implementation;
- parses explicit salary currency/range/period without conversion;
- keeps equity/bonus/commission separate from base salary.

Provider tags remain supporting metadata. They are never automatically treated
as candidate requirements.

## Candidate-first Gemini classification

The reusable server-only extractor is
`packages/ingestion/src/gemini-job-requirements.server.ts`. Manual import,
future controlled persistence, and saved-job reprocessing share this schema and
verifier.

Requirements extraction explicitly uses the configured primary Flash-Lite slot
(`gemini-3.5-flash-lite` under the current configuration), once per unique job,
with a bounded 45-second timeout. It does not silently switch to the fallback
model. The API key, prompt, provider response, SDK diagnostics, database paths,
stack traces, resumes, and application history are never returned or stored.

Gemini receives ordered candidates and returns one classification for each ID,
in input order. It may normalize concepts tied to that same candidate, but it
does not return evidence text, salary amounts, or experience numbers. One
candidate may carry mixed item types, such as Java `REQUIRED` and Scala
`PREFERRED`. Responsibility-only technologies remain responsibilities.

## Deterministic verification and provenance

`packages/ingestion/src/job-requirements-verifier.ts` independently verifies:

- exact evidence owned by one candidate;
- explicit experience ranges/minima and applicant requirement cues;
- required versus preferred wording and section context;
- normalized concept text or a configured safe alias;
- exclusion of responsibilities and another team/customer tool usage;
- geographic restriction wording;
- collaboration/overlap timezone wording;
- explicit salary currency, numbers, period, and additional compensation.

Salary and experience numbers are locally authoritative. Salary currency,
minimum, maximum, period, and additional compensation have separate statuses.
An unstated or model-only period therefore makes salary `PARTIAL` without
invalidating a verified currency and range. Unsupported model normalizations
become review items; actual numeric/provider contradictions remain `CONFLICT`.

Each stored fact retains its value, status, source, short exact evidence,
section, reason code, scoring impact, schema version, content hash, safe model
identifier, and timestamp. No full model response or chain of thought is kept.

## Storage and idempotency

The additive `job_extractions` table is one-to-one with `jobs` and stores the
versioned verified JSON, content hash, safe model identifier, aggregate status,
and timestamps. The current candidate-first extraction schema is version 2.

The content hash covers raw description, relevant provider metadata, schema
version, and configured requirements model. Unchanged records are skipped
without another model call. Apply is atomic, preserves job identity and raw
description, creates no jobs/applications/submissions, and logs a distinct
`JOB_REQUIREMENTS_REPROCESSING_COMPLETED` event. Existing hard rejections are
not automatically reversed by reprocessing.

```powershell
pnpm reprocess-job-extractions -- --dry-run
pnpm reprocess-job-extractions -- --job-id <job-id>
pnpm reprocess-job-extractions -- --limit <count>
pnpm reprocess-job-extractions -- --apply
```

Dry-run is the default and makes no provider requests. Phase 7.1B.4B performed
exactly one reviewed all-or-nothing apply after a copied-snapshot shadow gate.
The transaction did not begin until all 14 eligible jobs had valid completed
write plans.

## Dashboard

The Requirements view shows verified experience, required/preferred
qualifications, degrees, certifications, languages, restrictions,
timezone/schedule, salary, work setup, evidence, provenance, conflicts, and
scoring impact. Salary values remain visible when the range is verified but the
period is review-only. Raw source remains separate. Client components receive
only serializable verified data; Gemini runtime/configuration stays server-only.

## Phase 7.1B.4B validation and apply

The original Spotify conflict was reproduced safely before the redesign:
Gemini returned currency `"$"`, while deterministic parsing returned `USD`
from explicit United States context. Minimum 132949, maximum 189927, null
period, and equity all agreed. The former aggregate comparison turned only the
currency-label difference into a whole-salary conflict.

Candidate-first Stage A on a copied database wrote nothing and produced:

- model `gemini-3.5-flash-lite`;
- minimum experience 3 years, `VERIFIED`;
- USD 132949-189927 and equity, individually `VERIFIED`;
- period `REQUIRES_REVIEW` because no pay period is stated;
- North America and Eastern Standard Time, `VERIFIED`;
- all required baseline concepts, including Java, distributed systems,
  high-volume services, production deployment, big-data processing, system
  design, APIs, algorithms, data structures, software-engineering principles,
  code quality, testing, and automation;
- preferred data-engineering experience and Scala;
- aggregate `PARTIAL`, with zero accepted conflicts.

Stage B used the copied Spotify, LawnStarter, and A.Team records. LawnStarter
and A.Team were `PARTIAL` with zero conflicts. A.Team's ambiguous dollar
currency remained unverified; responsibility-only technologies did not become
requirements.

The final Stage C all-14 shadow made 14 Flash-Lite calls with no retry or
fallback. All 14 responses passed strict schema/candidate validation after the
candidate-first stabilization. Twelve aggregate results were `PARTIAL` and two
were `CONFLICT`; no unsupported fact was accepted, and no conflict or
review-only fact affected scoring or hard rejection.

Exactly one atomic apply then wrote 14 `job_extractions` rows, updated six
score rows, removed PSA's obsolete score, and added one
`JOB_REQUIREMENTS_REPROCESSING_COMPLETED` activity row. Counts changed from
jobs 14 / scores 7 / applications 0 / activity 1 / extractions 0 to jobs 14 /
scores 6 / applications 0 / activity 2 / extractions 14. No job identity or
raw description changed, no application/submission was created, and existing
hard rejections were not promoted.

The applied score/status changes were:

- Spotify Android: `DISCOVERED` 39 → `SCORING_COMPLETED` 38;
- SEPPmail Full-Stack Developer: `DISCOVERED` 42 → `SCORING_COMPLETED` 41;
- Spotify Backend Engineer: `DISCOVERED` 30 → `SCORING_COMPLETED` 28;
- A.Team Senior Independent Software Developer: `DISCOVERED` 41 →
  `SCORING_COMPLETED` 40;
- Lemon.io Senior DevOps Engineer: `DISCOVERED` 30 →
  `SCORING_COMPLETED` 44;
- Kettner Laravel Senior Backend Developer: `DISCOVERED` 35 →
  `SCORING_COMPLETED` 34;
- PSA Administrative Aide VI: `SCORING_COMPLETED` 43 → `HARD_REJECTED`
  with no score, based only on verified provider expiry `2026-07-28`
  (`EXPIRED`).

The garden3d salary conflict and PSA employment-type conflict remain visible
but inert. Spotify stores verified 3 years `REQUIRED`, USD 132949–189927 plus
equity, North America, and `Eastern Standard Time`; its original timezone
evidence remains unchanged. A post-apply dry-run made 0 Gemini calls, skipped
all 14 records by content hash, and wrote nothing.

## Remaining limitations

- Flash-Lite classification may still be incomplete or schema-invalid.
- Exhaustive candidate-ID validation prevents silent candidate omission but
  cannot guarantee perfect concept normalization.
- Strict evidence/alias checks intentionally produce false negatives.
- Unusual wording and unsupported aliases may remain review-only.
- Salary period stays unverified when the source does not state it.
- Provider-description conflicts require human review.
- Gemini classification is not perfectly accurate; strict validation and
  deterministic verification guarantee fail-closed handling, not perfect
  recall or interpretation.
- Further existing-job apply operations require separate authorization;
  recurring and production persistence remain disabled.
