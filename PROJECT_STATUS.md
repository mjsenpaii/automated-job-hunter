# Project Status

**Last updated:** 2026-07-28 PHT
**Current phase:** Phase 7.1A.3 — Lever public company-board discovery (implemented locally, uncommitted)
**Overall health:** 🟢 296/296 tests passing (32 files) · workspace build 6/6 · dashboard production build and strict TypeScript passing
**Active branch:** `master` at pushed baseline `4450073` (Phase 7.1A.3 local changes uncommitted)

---

## Session — Phase 7.1A.3 Lever Public Company-Board Discovery

Added Lever as the third structured source on the committed reusable discovery
core. No Trigger.dev scheduling, Gemini extraction, browser automation,
application form, application package, message, or submission behavior was
added.

- Verified the official Lever Postings API before implementation. Published
  company-board jobs remain publicly retrievable without authentication through
  `GET https://api.lever.co/v0/postings/{site}`. The documented read API uses
  `skip`/`limit` pagination; application submission is a separate authenticated
  `POST` operation and is not called.
- Added a versioned local seed with three live-verified global boards: Spotify
  (`spotify`), Highspot (`highspot`), and Aleph (`aleph`). StackAdapt was
  unavailable during verification and was not seeded; Wealthsimple responded
  with no published records and was omitted from the initial active seed.
- Added a fixed-host Lever adapter with a descriptive User-Agent, ten-second
  timeout, response/per-record Zod validation, canonical hosted-URL validation,
  at most ten configured companies, and at most 100 accepted jobs per run.
  Rich-text opening, body, list/requirements, and additional sections reuse the
  existing content cleaner.
- Reused the common `DiscoveredJob` mapper, local filters, `ingestJob`,
  eligibility, hard rejection, scoring, deduplication, atomic persistence,
  `DISCOVERED` review status, and shared safe CLI summary. Optional team,
  department, workplace type, and updated timestamp metadata are retained in
  the source snapshot.
- Corrected a shared integration boundary discovered by the Lever tests:
  explicit structured work-setup evidence now carries source confidence into
  normalization, so a Lever `remote`, `hybrid`, or `on-site` value is not
  downgraded merely because the description does not repeat it. Country
  eligibility remains a separate deterministic review and is never inferred
  from the remote flag.
- Added `pnpm discovery:lever` with repeatable `--company`,
  `--all-companies`, `--list-companies`, `--limit`, `--remote-only`, `--query`,
  `--apply`, and `--help`. Unknown/disabled identifiers, arbitrary URLs/hosts,
  mixed selection modes, and selections above ten companies are rejected.
  Dry-run remains the default.
- Added 23 mocked tests covering all 26 requested adapter, selection, mapping,
  filtering, limits, error, persistence, deduplication, pipeline reuse,
  no-application, no-Gemini, and safe-output behaviors. Total: 296/296 tests
  across 32 files.
- The initial live dry run reported ten invalid records. A single redacted
  diagnostic identified one mismatch only: eight Spotify records and two Aleph
  records supplied string `workplaceType` values outside the public Postings
  documentation's `on-site` spelling. Lever's official developer documentation
  also defines the source enum variant `onsite`. The adapter now accepts that
  one explicit provider variant and normalizes it to canonical `on-site`;
  validation was not otherwise relaxed.
- The corrected dry run fetched and validated 50/50 current records over three
  official API requests, with zero invalid records. Local remote/developer
  filters excluded 49. The existing pipeline scored one Spotify job as
  `DISCOVERED` (score 39, `ARCHIVE`), with zero duplicates, hard rejections, or
  pipeline errors. One job would have been persisted and zero were persisted.
- SQLite was exactly unchanged. Before and after, counts were one job, one
  score, zero applications, zero activity rows, and zero blacklist rows. SHA-256
  hashes and lengths matched for `app.db`, `app.db-wal`, and `app.db-shm`.
- Final verification passes: 296/296 tests, workspace build 6/6, standalone
  dashboard production build, dashboard strict TypeScript, and
  `git diff --check`.
- File-backed Lever `--apply` was not run. Trigger.dev scheduling remains
  deferred to Phase 7.1B.

---

## Session — Phase 7.1A.2 Remotive Public Job Discovery

Added Remotive as the second structured source on the committed reusable discovery core. The
Arbeitnow adapter remains unchanged. No Trigger.dev scheduling, Gemini extraction, browser
automation, application package, message, or submission behavior was added.

- Added a fixed-host Remotive adapter using the official public remote-jobs API with no key, a
  descriptive User-Agent, ten-second timeout, envelope/per-record Zod validation, canonical
  Remotive URL validation, and a 50-accepted-job ceiling.
- Reused the common `DiscoveredJob` mapper, local filters, `ingestJob`, deduplication, shared atomic
  persistence, `DISCOVERED` review status, and CLI summary. Source category and explicit salary
  text were added as optional common metadata and are retained in the source snapshot.
- Added `pnpm discovery:remotive` with `--limit`, `--query`, `--category`, `--apply`, and `--help`.
  Dry-run remains the default. Query matching covers title, company, category, tags, candidate
  location, and cleaned description; category accepts a case-insensitive name or slug.
- HTML cleaning is limited to the description. Structured tags and scalar values receive only
  whitespace normalization so legitimate values such as `Accessibility` are not mistaken for
  copied-webpage navigation noise.
- Added 20 mocked tests covering source mapping, optional fields, salary-text semantics, stable
  identity, the job ceiling, safe source errors, query/category filters, dry-run immutability,
  in-memory apply, deduplication, hard rejection/scoring reuse, no applications, no Gemini
  dependency, and safe CLI output.
- The required live command fetched and validated 36 current Remotive records. The local
  `developer` query excluded 31; the existing pipeline produced four `HARD_REJECTED` jobs and one
  scored `DISCOVERED` job, with zero duplicates and zero pipeline errors. Five jobs would have been
  persisted and zero were persisted.
- Database, WAL, and shared-memory content hashes and all table counts were identical before and
  after the live dry run. The existing one job/one score row remained unchanged, and applications
  remained empty.
- Final verification passes: 273/273 tests, workspace build 6/6, standalone dashboard production
  build, dashboard strict TypeScript, and `git diff --check`.
- Remotive attribution and access restrictions are documented. Trigger.dev remains deferred to
  Phase 7.1B.

---

## Session — Phase 7.1A Public Job Discovery

Implemented a reusable, dry-run-first discovery layer and an official Arbeitnow public API adapter.
No Trigger.dev task, schedule, Gemini extraction, browser automation, application package, message,
or submission behavior was added.

- Added a common `DiscoveredJob` contract, deterministic `RawJobInput` mapper, local filtering,
  batch-local/existing-record deduplication, structured run summaries, and an injectable repository.
- Added a fixed-host Arbeitnow adapter with a descriptive User-Agent, ten-second timeout,
  envelope/per-record Zod validation, safe pagination, HTML cleaning, three-page ceiling, and
  50-job ceiling. Linked employer pages are never fetched.
- Added `pnpm discovery:arbeitnow` with `--limit`, `--pages`, `--remote-only`, `--query`, `--apply`,
  and `--help`. Dry-run is the default and opens the existing SQLite database read-only.
- Extracted shared atomic job/score persistence from the dashboard import path. Both manual import
  and discovery now reuse it; a complete discovery batch is processed before one transaction.
- The repository has no `AWAITING_REVIEW` state. Successfully scored discoveries use the existing
  `DISCOVERED` state, which the dashboard already presents as requiring review. Hard rejections
  remain `HARD_REJECTED`; no `applications` rows are created.
- Source tags, location, remote flag, job types, published timestamp, stable slug, and canonical URL
  are mapped deterministically. Salary, country eligibility, closing dates, and missing facts remain
  unknown.
- Added 21 mocked tests covering mapping, cleaning, optional values, stable identity, pagination and
  job limits, timeout/error/schema handling, filters, dry-run immutability, in-memory apply,
  idempotency, existing hard-rejection/scoring reuse, no applications, no Gemini dependency, and
  safe CLI output. Total: 253/253 tests across 28 files.
- The required live dry run fetched ten records from one official Arbeitnow API page. Eight were
  excluded by `--remote-only`; the existing pipeline classified the remaining two as one
  `HARD_REJECTED` job and one scored `DISCOVERED` job. It reported two jobs that would be persisted
  and persisted zero.
- Before and after that dry run, SQLite contained one existing job and one score row (all other
  application/activity tables were empty). The database, WAL, and shared-memory file hashes,
  lengths, and timestamps were identical, confirming that dry-run mode made no database changes.
- Final verification passes: 253/253 tests, workspace build 6/6, standalone dashboard production
  build, dashboard strict TypeScript, and `git diff --check`.
- Trigger.dev scheduling remains deferred to Phase 7.1B.

---

## Session — Local Job Data Reset

At the user's explicit request, removed all 15 saved jobs and 8 dependent score rows from the local
SQLite database in one transaction. Applications and job-related activity were also cleared; both
were already empty. The schema, blacklist, source files, and local configuration were preserved.
Live `/api/jobs` and `/api/stats` verification returned zero jobs after deletion.

---

## Session — Philippine Government Metadata & DBM Salary Reference

Extended the current uncommitted implementation without redesigning the dashboard, rewriting the
existing export actions, or changing deterministic scoring behavior.

- Added a versioned, local 2026 DBM National Government salary schedule sourced from National
  Budget Circular No. 601, Annex A. It contains Salary Grades 1–33 and preserves unavailable SG 33
  steps as unavailable.
- Added deterministic post-extraction enrichment. A DBM reference is attached only for an explicit
  salary grade, Philippine country, adequately evidenced national-government scope, and a supported
  year derived from posting/opening/closing dates. No DBM runtime fetch or Gemini salary lookup is
  used.
- Kept actual and reference compensation separate. Contract-of-Service SG 6 remains actual salary
  `null`, while its 2026 DBM reference is PHP 19,716–20,761 monthly and explicitly marked
  non-guaranteed/reference-only.
- Added typed government-job fields for salary grade/step/reference metadata, closing date,
  vacancies, city, application email/addressee, Civil Service eligibility, schedule notes, and
  government scope across contracts, snapshots, persistence, importer review, job details, and text
  export.
- Added additive SQLite schema upgrades with safe version-1 snapshot parsing. Existing rows are not
  automatically enriched. The explicit backfill CLI defaults to dry-run and makes no Gemini calls;
  apply mode was not run.
- PSA live smoke extraction succeeded on the primary `gemini-3.5-flash-lite` call with no fallback:
  Boac, onsite, one vacancy, 2026-07-24/2026-07-28 dates, SG 6, application email/addressee, Civil
  Service eligibility, schedule obligation, national-government scope, and a null application
  keyword.
- Manual deterministic smoke checks confirmed private SG text is ignored, unsupported years receive
  no schedule, explicitly stated actual pay is retained, and reference salary never enters actual
  salary/scoring fields.
- Automated validation: 232/232 tests pass across 26 files; workspace build passes 6/6; standalone
  dashboard production build and strict TypeScript pass; client bundles contain none of the Gemini
  SDK, model identifiers, environment names, or tested API-key patterns.

---

## Session — Gemini Hybrid Importer & Dashboard Redesign

Implemented on top of baseline commit `2602113`; no commit or push was made.

- Added a compact job-detail export section with **Copy all details** and **Download .txt**. Both
  actions use the same pure formatter and include source metadata, pipeline status, actual rejection
  reasons, nullable score state, factor analysis, description, requirements, skills, application
  details, timestamps, and the sanitized source snapshot. Export is browser-local and does not
  mutate or refetch the saved job.
- Reworked job details after hands-on review: removed the width-wasting 286px sticky decision
  sidebar and the forced 540px tab height; moved status, key facts, and actions into a compact
  full-width decision bar above the content; made all five desktop tabs equal-width with no
  horizontal scrolling; added a 3+2 wrapped mobile tab layout; and reduced title, section, and
  body typography while retaining keyboard tab navigation and prominent rejection reasons.
- Restored **Generate resume** after the two header export actions as an intentionally disabled
  **Soon** action. It stays separate from the compact Shortlist/Reject decision buttons, and no
  resume-generation behavior is implied or triggered.
- Added an accessible desktop/laptop sidebar collapse control. The expanded 228/204px sidebar
  becomes a 72px labelled icon rail, content width adjusts with it, the preference is stored only
  in local storage, and the mobile bottom navigation remains unchanged. The control now sits
  halfway across the blue-sidebar/white-content boundary for a clearer collapse affordance.
- Simplified the job-detail heading with explicit **Position** and **Company** labels, removed the
  redundant **Back to overview** link, and removed the idle export-helper sentence.
- Added a server-only Gemini extraction boundary using the official `@google/genai` SDK. Every
  analysis starts with `gemini-3.5-flash-lite`; `gemini-3.6-flash` is called at most once only when
  the primary result fails explicit reliability checks or a retryable provider request. The legacy
  `GEMINI_MODEL` variable remains supported only as the fallback-model override.
- Inputs are bounded, cleaned, treated as untrusted data, constrained to structured JSON, and
  revalidated with Zod. Provider retries are disabled; the application enforces the two-call limit,
  bounded Retry-After-aware backoff, and a two-minute bounded in-memory identical-input cache.
- Consolidated `/add-job` and `/import-job`; `/add-job` now redirects to `/import-job`.
- The review flow never persists automatically. `Confirm & Score` delegates to the existing
  ingestion pipeline for validation, normalization, eligibility, hard rejection, deduplication,
  scoring, and persistence.
- Redesigned the application around a reusable light productivity design system: compact sidebar,
  real overview metrics, responsive job lists, conversational importer, tabbed review/details
  workspaces, sticky desktop action panels, mobile bottom navigation, visible focus states, and
  reduced-motion support.
- Fixed hard-rejection reason handling. New imports persist exact pipeline reasons, and a legacy
  hard-rejected row was repaired locally from the existing deterministic hard-reject result
  (`SENIORITY_MISMATCH`) rather than an invented fallback.
- Live Gemini smoke tests succeeded for copied OnlineJobs.ph content, raw Supabase-style HTML,
  genuinely missing optional fields, contradictory location/work-setup evidence, and a current
  public ATS URL. Flash Lite handled reliable inputs; the contradictory and URL cases used exactly
  one accuracy fallback.
- Responsive UI smoke tests passed at 1440, 1024, 768, and 390 px without horizontal overflow.
- Automated validation: 218/218 tests pass across 25 files, the workspace build passes 6/6 tasks,
  and a separate dashboard production build passes. A temporary `.next` conflict was resolved by
  stopping the smoke-test dev server and its orphaned build workers before the definitive runs.
- Client static bundles contain none of the Gemini environment names, provider SDK, model IDs, or
  tested API-key patterns.

---

## Phase Summary

| Phase | Status | Notes |
|---|---|---|
| Phase 0 — Audit & Profile | ✅ DONE | Docs, candidate profiles, questionnaire |
| Phase 1 — Foundation & Tests | ✅ DONE | Monorepo, schemas, classification, scoring, DB |
| Phase 2 — Job Discovery | ✅ DONE | Ingestion pipeline, API routes, add-job form |
| Phase 3 — Dashboard | ✅ DONE | Next.js professional productivity UI, wired to real DB |
| Phase 4 — Resume Engine | ✅ DONE | DOCX generation, cover letters, CLI, quality gates |
| Phase 5 — Application Package | ✅ DONE | Package builder, state machine, daily limits, kill switch |
| Phase 6 — Browser Assistance | ⬜ NOT STARTED | Playwright (deferred) |
| Phase 7 — Limited Automation | 🟨 IN PROGRESS | 7.1A Arbeitnow + 7.1A.2 Remotive + 7.1A.3 Lever manual discovery implemented; Trigger.dev scheduling deferred to 7.1B |

---

## What's Built — 8 Packages + 1 App

| Package | Purpose | Tests |
|---|---|---|
| `@job-app/core` | Zod schemas (candidate, job, scoring) | Used by all |
| `@job-app/classification` | PH/intl category, work-setup, eligibility, dedup | 32 ✅ |
| `@job-app/scoring` | Hard rejection, 100-point factor scoring | 25 ✅ |
| `@job-app/resume` | Resume profiles, DOCX generation, cover letters, quality gates | 16 ✅ |
| `@job-app/db` | Drizzle ORM + SQLite (`dist` entry points, `exports`, `ensureSchema()` auto-provision) | Schema ready |
| `@job-app/ingestion` | Normalizer, pipeline, content cleaning, Gemini contracts, government enrichment, reusable public discovery, Arbeitnow, Remotive, Lever, manual + **URL-import adapter (SSRF-hardened)** | 160 ✅ |
| `@job-app/application` | Package builder, state machine, daily limits | 12 ✅ |
| `@job-app/dashboard` | Next.js productivity UI + hybrid Gemini importer + `ingestJob`-backed confirmation | 51 ✅ + build/runtime green |

### Generated Artifacts
- `resumes/generated/resume-software-developer.docx` (8.9 KB)
- `resumes/generated/resume-technical-support.docx` (9.0 KB)

---

## Git Log

| Commit | Description | Tests |
|---|---|---|
| `415c527` | Phase 0-3 foundation | 71 |
| `84eb678` | Phase 2 — ingestion + dashboard wiring | 77 |
| `5540f9f` | Phase 4-5 — DOCX resumes + application packages | 90 |
| `b003fb8` | wip: preserve AGY URL importer and validation work | 114 |
| `ea3b565` | feat: complete job URL importer and automated scoring validation | 141 |
| `ee3bf0d` | feat: add Gemini job importer and government salary enrichment | 232 |
| `dcf7df0` | feat: add public job discovery with Arbeitnow | 253 |
| `4450073` | feat: add Remotive job discovery | 273 |
| _(pending)_ | fix: dashboard build & runtime (workspace packages, DB, API routes) | 141 |

---

## Session — Dashboard Build & Runtime Fix (`fix/dashboard-build-runtime`)

The dashboard previously failed at production build and runtime (workspace packages, deps and
API-route imports were not integrated). All fixed without changing the URL-importer/validation
behavior or the 141 tests. Verified: `pnpm test` (141), `pnpm build` (6/6), all package builds,
`pnpm --filter @job-app/dashboard build`, `next dev` boots, and `/`, `/import-job`, `/api/stats`,
`/api/jobs`, `/api/jobs/[id]`, `/api/extract` all respond (JSON where expected). SSRF block and
Confirm & Score (real ingestion pipeline, score persisted) confirmed working.

**Workspace-package strategy (now single & consistent):** packages are compiled to `dist` (Node ESM)
and consumed as compiled output (`main`/`types`/`exports` → `dist`). Turbopack cannot map `.js`→`.ts`
for workspace source on Next 16.2, so `transpilePackages` is intentionally **not** used. Vitest still
resolves `@job-app/*` → `src` via its aliases, so tests are unaffected. See
`apps/dashboard/README.md` → "Workspace packages & build strategy".

Key changes: root `packageManager` (unblocks Turbo); `pnpm-workspace.yaml` `allowBuilds` set
(pnpm 11); `@job-app/db` `exports`/`dist` entry points + `ensureSchema()` auto-provisioning + lazy
DB open; `better-sqlite3 9→^12` (Node-24 prebuilt binary — approved by user); `drizzle-orm` +
`@job-app/ingestion` declared in the dashboard; `api/jobs` POST now calls the real `ingestJob`
pipeline (removed nonexistent `classifyJob`); Next 16 async `params`; structured JSON errors;
hidden unimplemented sidebar links; `@types/node` + build-config fixes so all `tsc` package builds
pass. `IngestionResult` additively exposes `score_detail` (full `StructuredScore`).

---

## Session — Job URL Importer & Automated Scoring Validation

Integrated two parallel work streams on branch `handoff/cursor-integration`:

**1. Job URL importer** (`packages/ingestion/src/adapters/url-extractor.ts`, dashboard `import-job` page + `/api/extract`):
- Public job-URL fetch → JSON-LD / meta-tag / HTML-heuristic extraction → editable preview → save & score.
- **SSRF hardened** during integration: http/https only; localhost/`*.local` blocking; full private/loopback/link-local/CGNAT/multicast IPv4 blocking (incl. `169.254.169.254`); IPv6 loopback/ULA/link-local + IPv4-mapped blocking; **DNS-resolution validation**; **per-redirect-hop re-validation**; request timeout; **response-size cap (2 MB)**. No authenticated scraping, no CAPTCHA bypass, no application submission.

**2. Automated scoring validation** (`packages/ingestion/tests/validation-realistic.test.ts`, `generate-validation-report.ts`, `docs/AUTOMATED_JOB_VALIDATION_REPORT.md`):
- All 8 realistic scenarios execute through the **real** `ingestJob` production pipeline.
- Production bug fixed: `pipeline.ts` now calls `checkEligibility(normalized, category, workSetup)` (was 1-arg → eligibility never evaluated).
- `work-setup.ts`: removed generic `'flexible'` HYBRID signal (fixed Scenario 1 REMOTE mis-classification).

**Test delta:** 114 (preserved) → **141** (+25 SSRF regression tests, +2 report-verification tests).

> ⚠️ Pre-existing build-infra failures (turbo/tsc/`next build`) are **out of scope** for this commit — see `NEXT_ACTIONS.md`.
