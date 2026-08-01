# Next Actions

**Last updated:** 2026-08-02 PHT
**Current state:** Phase 7.1B.5B–7.1B.7A has passed final release verification: 632/632 tests, workspace and dashboard production builds, dashboard/ingestion strict TypeScript, diff validation, and browser-bundle credential scanning. Local worker features are configured through ignored environment files; production-mutating discovery remains deliberately disabled behind the existing environment and exact-switch gates.

---

## After this release

1. Deploy the dashboard and Trigger.dev worker as separate server processes;
   keep provider/model credentials only on the worker and the Trigger server
   credential only on the dashboard server. Never expose either through
   `NEXT_PUBLIC_*` variables.
2. Treat production persistence enablement as a separate rollout. The current
   release is production-build ready, but scheduled persistence, dashboard
   scans, Deep Scan, and freelance scanning remain DEVELOPMENT-only where
   specified. Do not weaken those gates without a copied-database validation,
   rollback plan, quota reconciliation, and explicit approval.
3. Run at most one separately authorized smoke scan after deployment. Start
   with cached Preview, verify safe source diagnostics and zero automatic
   persistence, then authorize fresh provider use only when quotas and network
   reachability have been reviewed.
4. Keep Gemini Search optional until its previously observed fail-closed
   `NETWORK_FAILURE` is resolved in the deployment network. Tavily and other
   explicitly enabled sources must continue independently.
5. Review Preview opportunities manually before saving. Saving for review is
   local only and must never become an automatic proposal, bid, message,
   application, or submission.

---

## Validate freelance discovery before enabling it locally

Preserve the first-party forum boundary: only replies whose stable forum
author identity matches the original post may clarify geography, timezone,
closure/filled state, experience, pay, or scope. Applicant comments remain
excluded from listing evidence. The cached n8n Community case is `NOT READY /
GEOGRAPHIC_RESTRICTION` because the original poster explicitly excludes the
Philippines. Treat `POTENTIALLY_STALE_LISTING` as a manual freshness warning,
not an accusation or an automatic positive signal.

1. Validate the new temporary Preview review workspace during the next
   separately authorized cached scan. Confirm one/zero/many result states,
   readiness filtering, original links, source diagnostics, and the explicit
   confirmation copy. Preview itself must still write zero opportunities.
2. Treat **Save for Review** as a distinct manual action. It revalidates the
   trusted original public URL before one local atomic write, shares the
   separate 20-per-PHT-day freelance cap, and never contacts a client. `NOT
   READY` requires explicit blocker acknowledgement; hard-rejected, expired,
   invalid, and unsafe URLs remain unsaveable.
3. Keep the installed Impeccable and `emil-design-eng` files uncommitted unless
   a later explicit commit request includes a reviewed agent-skill policy.
   Their current project-local paths are `.agents/skills/impeccable` and
   `.agents/skills/emil-design-eng`.
4. Preserve the atomic `ensureSchema` upgrade for early Phase 7.1B.7A
   databases. Do not replace it with a destructive reset; any future freelance
   schema additions require an additive migration and existing-database test.
5. Keep `JOB_DISCOVERY_FREELANCE_ENABLED` and every freelance source switch
   disabled until an explicitly authorized development validation. Do not add
   provider variables to the Next.js dashboard environment.
6. Preserve the new page-quality gate: search/category/article/service/profile
   pages are `NON_OPPORTUNITY_PAGE`, search snippets are never scope evidence,
   and an attributable individual page with incomplete evidence may be
   `REVIEW SCOPE MANUALLY` but never positive readiness. The latest five-item
   cached reclassification is 1 valid opportunity, 4 non-opportunity pages,
   0 manual-scope reviews, 1 not ready, and no positive readiness.
7. Preserve the independent exact Extract gate. A thin specific individual
   page may enter recovery only with
   `JOB_DISCOVERY_TAVILY_EXTRACT_ENABLED=true`; generic result/onboarding pages
   never consume Extract credits, and disabled Extract makes no request.
8. Treat `REVIEW SCOPE MANUALLY` as local review only. Unresolved geography may
   qualify when no deterministic disqualifier exists, but incompatible
   geography, mandatory experience, seniority, regulated work, or hard risk
   remains `NOT READY`; neither state may be automatically saved.
9. For the next separately authorized single Tavily Preview, first prefer the
   still-valid cached query group to validate the corrected page-type and
   metric labels without new Search credits. Keep Gemini Search disabled while
   its network issue persists and enable Tavily Search/Extract only under the
   existing shared ledger. The deterministic query rotation uses quoted
   task-level phrases such as small WordPress fixes, manual QA, spreadsheet
   cleanup, n8n setup, and Philippines-eligible short contracts.
10. When live source validation is authorized, respect Himalayas and Remotive
   attribution/link requirements and public API guidance. Tavily must use the
   existing shared Search/Extract quota ledger. Gemini Search remains optional
   and non-fatal while its fail-closed `NETWORK_FAILURE` persists.
11. Validate rate handling: exactly USD 3.00 is below preference, greater values
   qualify, non-USD pay remains unconverted, fixed price requires scope review,
   and missing pay remains visible.
12. Review `LEARNABLE FAST WITH AI` decisions manually. Every gap must be
   adjacent to verified skills, bounded to 4–24 focused hours when defensible,
   backed by a practice/sample template, and blocked by mandatory experience,
   credentials, regulation, senior ownership, high-risk scope, or an explicit
   geography that does not accept the Philippines.
13. A learnable opportunity remains not application-ready until the user
   completes the local `Mark Preparation Complete` record. Never convert recent
   study into claimed prior experience.
14. Authorize Scan & Save only after Preview acceptance and a copied database
   baseline. Reconcile the separate 20-per-PHT-day ledger and confirm the
   regular five-job ledger is unchanged.
15. Keep Upwork/Freelancer integrations pending until official API credentials
   exist. Do not scrape authenticated pages or bypass platform protections.
16. Proposal generation, bidding, messaging, offer acceptance, contracts,
   payments, and submission remain out of scope.

---

## Validate combined web discovery deliberately before broader use

1. Do not rerun live discovery until the worker and dashboard have been
   restarted on the corrected code. Gemini Search failures now retain a closed
   provider category/status, request-reached state, reservation/release state,
   and grounded URL count. The last Fresh Preview's two Tavily Search calls
   succeeded; its eight `API_ERROR` entries came from Gemini Search.
2. The authorized copied-snapshot audit of the local web operational tables is
   complete. Eight test-owned web cache rows and one matching query-history
   row were removed atomically; the eight associated credit-ledger entries were
   deliberately retained because those Tavily requests consumed real credits.
   The user's earlier eight-credit Preview Scan remains intact. Keep all future
   repository-injected discovery tests on the enforced in-memory store path.
3. Keep provider keys and all search/extract/model switches in the Trigger.dev
   worker environment only. The dashboard server may trigger and poll the fixed
   task but must never receive provider credentials.
4. First live-validate a cached Preview Scan, then one explicitly confirmed
   fresh Preview Scan. Cached scans may intentionally return the same listings;
   a fully cached group must use zero fresh Tavily Search credits and zero fresh
   Gemini Search prompts.
5. Confirm a fresh scan selects the next deterministic group, invokes enabled
   Tavily Basic Search and Gemini Google Search independently, and merges at
   most 250 canonical URLs with `TAVILY`, `GEMINI_SEARCH`, or `BOTH`
   attribution. A source failure must not activate a legacy feed.
6. Confirm Tavily Basic Extract runs only for eligible direct-fetch failures.
   Search and Extract share the persistent 30-credit PHT-day and 900-credit
   PHT-month caps. Gemini Search separately shares a 60-prompt PHT-day cap.
7. Tavily snippets and Gemini-generated search text are never evidence. A URL
   must yield an attributable original public vacancy before matching,
   extraction, or persistence.
8. Validate Deep Web Scan separately only after normal scans are accepted. It
   is development-only, explicit-confirmation-only, limited to one start per
   rolling seven PHT days, and processes at most 1,000 canonical public URLs;
   1,000 is a ceiling, not an expected result.
9. Keep Deep verification/save unchecked initially. If separately authorized,
   it may verify at most ten new matches and persist only within the existing
   five-job daily capacity. It never creates or submits applications.
10. Do not add Advanced Search/Extract, Crawl, Map, Research, generated Tavily
   answers, raw-content search, or another search provider.

---

## Validate the dashboard scan deliberately before broader use

1. Keep the worker and dashboard environments separate: root `.env.local`
   supplies Gemini/Tavily plus their worker-only switches to `trigger:dev`,
   while `apps/dashboard/.env.local` supplies only `TRIGGER_SECRET_KEY` and the
   dashboard scan switch to Next.js. Never place any of them in client variables.
2. First live-validate `Preview Scan` and confirm zero Gemini calls, zero writes,
   and zero budget consumption. Respect Remotive's documented daily request
   guidance when choosing the validation day.
3. Validate `Scan & Save` only with a fresh copied-database baseline and explicit
   authorization. Confirm it shares the scheduled/manual daily ledger and
   cannot exceed the remaining PHT-day capacity.
4. Confirm progress/result polling reports only closed stages and safe failure
   codes. Actual token metadata may be unavailable; it must never be estimated.
5. Keep one dashboard scan active at a time. Preserve task-level idempotency,
   the concurrency-one discovery queue, and SQLite transaction/daily-cap gates.
6. Do not enable production or evening persistence. Do not create applications,
   submissions, resumes, cover letters, email, messages, or browser automation.

---

## Review the bounded coverage findings before changing matching

1. Preserve the precision-first rule: only exact technical titles or bounded,
   applicant-attributed responsibilities may provide primary evidence.
2. Add no broad `engineer`, technology-only, tag-only, or category-only match.
   The audit found 30 software candidates and 13 automation candidates with
   supporting signals, but supporting signals are intentionally insufficient.
3. If matcher coverage is changed next, start with a single reviewed
   `Android Engineer` title fixture. Verify seniority/hard rejection still runs
   after matching, and add adversarial tests before changing the allowlist.
4. Review the Remotive one-request retrieval/local-category behavior
   separately: 24 records were excluded because their returned category did
   not equal `software-dev`. Do not remove category filtering without a source
   compliance and recall/precision review.
5. Do not change AI Automation matching merely to force a persisted result.
   The audited pool had zero applicant-role primary evidence; Lemon.io AI/LLM
   terms and other provider metadata were only supporting context.
6. Keep the profile coverage audit dry-run-only. It must continue to make zero
   Gemini calls and expose no descriptions, provider payloads, or secrets.

---

## Monitor Phase 7.1B.5A before considering further scheduled persistence

1. Preserve the existing morning task ID, `0 8 * * *` Asia/Manila schedule,
   DEVELOPMENT-only environment, concurrency-one queue, and fixed
   `software_development` + `ai_automation` profiles.
2. Keep `JOB_DISCOVERY_SCHEDULED_PERSISTENCE_ENABLED` absent by default. Only
   the exact lowercase value `true` enables the scheduled morning controlled
   path; do not store it in committed environment files.
3. Keep the manual controlled switch
   `JOB_DISCOVERY_CONTROLLED_PERSISTENCE_ENABLED` independent. Both paths share
   the persistent `job_discovery_persistence_runs` five-job PHT-day budget.
4. Preserve atomic budget reservation with job/score/extraction/activity
   writes. A failed source or extraction consumes no capacity, and duplicate
   or concurrent invocations must never raise the daily total above five.
5. Keep the evening schedule DRY_RUN-only and production persistence disabled.
6. Preserve the completed validation run
   `run_06frj6g5id1v7jt47pv73m7e01`: 134 fetched, zero profile matches, zero
   selected/persisted, zero Gemini calls, and zero applications/submissions.
   The zero-count ledger entry is intentional and blocks the later same-day
   8:00 AM trigger using the fixed idempotency key.
7. Monitor additional daily morning outcomes and daily-budget accounting before
   proposing evening persistence. Any such expansion requires a separate
   review; do not infer authorization from this morning-only phase.

---

## Preserve the completed Phase 7.1B.4B boundary

1. Review `docs/JOB_REQUIREMENTS_EXTRACTION.md` before changing extraction or
   verification behavior.
2. Preserve candidate-set equality, deterministic scalar authority, exact
   evidence, and field-level status checks. Do not add company-name rules or
   accept an unsupported annual period.
3. Preserve strict Zod/candidate-ID validation and fail closed on malformed,
   incomplete, conflicting, or unsupported model output.
4. Do not repeat the completed 14-job apply. Unchanged content is already
   protected by versioned content hashes.
5. Any future reprocessing apply requires new explicit authorization, an
   external backup, shadow review, and atomic reconciliation.

## Preserve Phase 7.1B.4B safety boundaries

1. Keep Gemini server-only and requirements extraction on the explicit
   configured primary Flash-Lite slot. Do not silently switch this path to the
   fallback model.
2. Only `VERIFIED` facts may affect scoring, eligibility, or hard rejection.
   `MISSING`, `REQUIRES_REVIEW`, `PARTIAL`, `CONFLICT`, and
   `EXTRACTION_FAILED` remain fail-closed.
3. Controlled discovery may call requirements extraction only for the final
   unique selected candidates, at most five per run. Filtered, untargeted,
   duplicate, and replacement candidates must not add calls.
4. Do not trigger discovery or Trigger.dev to validate this reprocessing work.
5. Do not create applications, submissions, resumes, cover letters, messages,
   emails, or browser automation.

---

## Preserve the completed Phase 7.1B.4A validation

1. Review the completed registered validation run
   `run_06fqk1omnhaft7a9ipea2iqc01` and its copied-snapshot reconciliation:
   jobs 9→14, scores 6→7, applications 0→0, and activity log 0→1.
2. Preserve the verified one-run boundary. Do not rerun the controlled task to
   force different source, scoring, or persistence outcomes.
3. Keep the manual controlled-persistence kill switch disabled outside an
   explicitly authorized DEVELOPMENT process. Do not persist it in an env file.
4. Manual controlled writes and DEVELOPMENT morning scheduled writes must both
   use the shared persistent five-job PHT-day budget.
5. Keep production and evening persistence disabled.

## Existing implementation review references

1. Review the Phase 7.1A/7.1A.2/7.1A.3 architecture and source-compliance notes in
   `docs/PUBLIC_JOB_DISCOVERY.md` and `docs/SOURCE_COMPLIANCE.md`.
2. Review the Phase 7.1B.1 manual Trigger.dev orchestration task in
   `src/trigger/public-job-discovery-dry-run.ts` and
   `packages/ingestion/src/discovery/orchestration.ts`.
3. Review Phase 7.1B.2 development schedules in
   `src/trigger/public-job-discovery-scheduled-dry-runs.ts` and shared helpers
   in `src/trigger/public-job-discovery-shared.ts`.
4. Review Phase 7.1B.3 profile configuration and deterministic matching in
   `packages/ingestion/src/discovery/job-search-profiles.v1.ts` and retrieval
   hints in `packages/ingestion/src/discovery/profile-retrieval-hints.v1.ts`.
   Confirm generic AI/media/product/customer-support roles remain untargeted,
   third-party actions do not count as applicant responsibilities, evidence is
   not assembled across description/metadata fields, and every profile match
   contains primary configured evidence.
5. Review profile-aware orchestration/runner summaries in
   `packages/ingestion/src/discovery/orchestration.ts` and
   `packages/ingestion/src/discovery/runner.ts`. Confirm pre-filter identity
   registration, filtered/untargeted promotion, safe source provenance, and
   registry-finalized combined totals.
6. Review dashboard profile badges/filters and server-side read-time matching in
   `apps/dashboard/src/lib/jobs/view-model.ts`,
   `apps/dashboard/src/components/JobList.tsx`, and
   `apps/dashboard/src/components/JobDetailWorkspace.tsx`.
7. Keep the Trigger.dev dev CLI running and PC powered on for development
   schedule execution:

   ```powershell
   pnpm build
   pnpm trigger:dev
   ```

8. Run either safe manual dry run:

   ```powershell
   pnpm discovery:arbeitnow -- --limit 10 --pages 1 --remote-only
   pnpm discovery:remotive -- --limit 50 --query "developer"
   pnpm discovery:lever -- --list-companies
   pnpm discovery:lever -- --company spotify --company highspot --company aleph --remote-only --query "developer" --limit 50
   ```

9. Do not use any source's `--apply`. Approved discovery writes are limited to
   the dedicated manual controlled task and the independently gated
   DEVELOPMENT morning schedule; both share the persistent PHT-day cap.
10. Do not enable evening or production persistence.
11. Historical verification run `run_06fqigvi9p0np4a1o5csdrov01` exposed a
    Lever isolation defect: Spotify timed out and the old adapter did not
    attempt Highspot or Aleph. The adapter now isolates each configured company,
    retains successful boards, reports safe per-company outcomes, and caps
    scheduled orchestration at one attempt per board. Replacement evening run
    `run_06fqiq5oifn5pbkmmlbqcgrg01` then attempted and completed Spotify,
    Highspot, and Aleph once each and reported `SUCCESS`. Treat this as one
    time-specific verification, not a guarantee that all boards will always be
    available. This run predates the final matcher/registry-only acceptance
    changes; those later deterministic changes were verified by tests and
    builds rather than a replacement live provider run.
12. Review the redesigned overview, `/import-job`, PH and international lists, and scored/rejected
   detail pages.
13. Confirm that the local `GEMINI_API_KEY` remains only in `apps/dashboard/.env.local`; never move it
   to a `NEXT_PUBLIC_*` variable. Optional model overrides are `GEMINI_PRIMARY_MODEL` and
   `GEMINI_FALLBACK_MODEL`. An existing `GEMINI_MODEL` is supported only as a legacy fallback
   override.
14. If a development server is already using `apps/dashboard/.next`, stop it before running
   `pnpm build`; concurrent Next dev/build processes can contend for the same output directory.
15. If the implementation is accepted, create a commit only after explicit user approval.
16. Review the PSA Salary Grade 6 import and its explicit “reference only” treatment. The committed
   2026 DBM schedule and enrichment rules are documented in
   `docs/GOVERNMENT_SALARY_ENRICHMENT.md`.

### Known limitations

- Local SQLite is a single-file store. WAL helps readers, but concurrent writers can still contend;
  keep manual imports serialized when running multiple local processes.
- Legacy schema columns require an empty-string sentinel for unknown posting dates. Extracted
  unknown dates remain semantically absent in the structured snapshot.
- Gemini cannot recover facts that are not present or visible in the supplied public content.
- The identical-input cache is intentionally process-local, memory-only, bounded to 32 entries, and
  expires after two minutes. It is not shared across processes or restarts.
- The two-call ceiling means a fallback 429/5xx error is returned immediately after the bounded
  Retry-After-aware wait; there is no third request or fallback loop.
- Authenticated pages should be pasted manually; login, CAPTCHA handling, browser automation, and
  automatic application submission remain intentionally out of scope.
- Trigger.dev cron scheduling is development-only in Phase 7.1B.2. Local
  schedules run only while `pnpm trigger:dev` is active and the PC remains
  running.
- Profile matching is deterministic rather than semantic AI classification.
  It deliberately prioritizes precision over recall: only configured technical
  title patterns or closed applicant-attributed clauses with a direct configured
  action and bounded technical object establish primary evidence. Responsibility
  imperatives qualify only as bullets inside an explicit responsibilities
  section. Fields and separate clauses are never combined. Unusual wording,
  longer modifiers, or unsupported grammar may therefore be missed.
- Cross-source promotion applies only when the existing canonical URL or
  semantic deduplication rules establish one identity. It does not weaken those
  rules or use title-only matching. Filtered variants retain identity/provenance
  but never become scoring or persistence candidates unless a later accepted
  targeted variant promotes the shared identity.
- The historical evening run found zero evidence-backed AI-augmented or
  low-code roles. Its Spotify timeout was isolated from Arbeitnow and Remotive,
  but was not isolated inside the Lever adapter and prevented Highspot/Aleph
  from being checked. The corrected adapter now continues across independently
  bounded board attempts; the replacement evening run completed all three
  configured boards successfully.
- Government salary enrichment currently supports only the verified 2026 DBM national-government
  schedule. Unsupported years, local-government roles, private employers, and unclear government
  coverage intentionally receive no reference range.
- Existing saved rows are not automatically rewritten. The explicit
  `pnpm --filter @job-app/ingestion backfill:government` utility defaults to dry-run; use
  `-- --apply` only after reviewing its counts. Apply mode was not run in this session.
- Arbeitnow, Remotive, and Lever provide three structured source paths. A
  remote flag, workplace type, or candidate region does not
  by itself establish Philippine eligibility, so the deterministic pipeline correctly leaves
  ambiguous eligibility as `REQUIRES_REVIEW`.
- Arbeitnow source tags are preserved as source-provided job skills/categories; the adapter does
  not infer additional skills, salary, country eligibility, dates, or experience requirements.
- Remotive's public feed is delayed by 24 hours. Its 50-job request ceiling is intentionally
  conservative, query filtering occurs locally after retrieval, and provider rate guidance limits
  how frequently manual runs should be performed.
- Remotive source salary text is retained only when explicitly supplied. Missing currency, exact
  range, experience, schedule, closing date, and Philippine eligibility are not invented.
- Lever is company-specific rather than a global feed. Only versioned,
  live-verified site identifiers are accepted; the initial list is Spotify,
  Highspot, and Aleph. A run accepts at most ten configured companies and 100
  jobs. Unknown companies and arbitrary URLs/hosts are rejected.
- Lever preserves visible commitment, team/department, workplace/location
  evidence, dates, sections, stable posting ID, and canonical hosted URL.
  Salary, skills, experience, closing date, and country eligibility remain
  unknown.
- The DEVELOPMENT morning schedule can persist only when its separate exact
  process switch is enabled. It requires a running authenticated local worker
  and shares a persistent five-job Asia/Manila daily budget with manual
  controlled runs. The initial live validation safely persisted zero jobs
  because it found zero profile matches; additional daily observations remain
  necessary before considering any expansion. Evening and production
  persistence, unattended source CLI apply behavior, and application
  automation remain disabled.

---

## Run the dashboard

```powershell
# Build workspace packages first (dashboard consumes their compiled `dist`):
pnpm build
# Then start the dev server:
pnpm --filter @job-app/dashboard dev
```

Then open http://localhost:3000. **Import Job** page: http://localhost:3000/import-job

> The dashboard consumes the workspace packages as compiled `dist`, so build the packages
> (`pnpm build`, or at least once) before `dev`/`build`. See
> `apps/dashboard/README.md` → "Workspace packages & build strategy".

### Quick test of the unified importer
1. Start the dashboard (command above).
2. Go to **Import Job** in the sidebar (`/import-job`).
3. Paste a public URL, copied webpage, raw HTML, or plain job description and press Enter.
4. Review Gemini's structured extraction, edit any fields, then select **Confirm & Score**.
5. Hard-rejected / ineligible jobs show **Not evaluated** plus rejection reasons (never a fake score).
6. Private, loopback, and link-local URLs remain blocked before any fetch.
7. A saved job detail page provides **Copy all details** and **Download .txt** actions in its
   header. Both include the complete sanitized job, decision, score, application, and raw source
   snapshot without changing the database. The decision controls now sit in a compact full-width
   bar above a full-width, non-scrolling tab workspace. **Generate resume** remains visible as a
   clearly disabled **Soon** action after the two export buttons, keeping Shortlist/Reject compact.
8. Desktop/laptop navigation can collapse to a 72px labelled icon rail and expand again. The
   control is centred across the sidebar/content boundary, the preference is stored locally, and
   mobile continues to use the existing bottom navigation.
9. Job detail headers use explicit **Position** and **Company** labels. The redundant overview back
   link and idle export-helper sentence were removed.
10. Philippine national-government jobs with an explicit salary grade and a supported posting year
    can show a separate DBM reference range. Contract-of-Service postings keep actual salary empty
    unless the source explicitly states compensation. Government metadata remains editable before
    confirmation and is included in both text exports.

Fast unit check of the extractor + SSRF guards (no network):
```powershell
pnpm --filter @job-app/ingestion exec vitest run tests/url-extractor.test.ts
```

Fast check of import contracts / UI state helpers:
```powershell
pnpm --filter @job-app/ingestion exec vitest run tests/import-contracts.test.ts
pnpm --filter @job-app/dashboard exec vitest run
```

---

## ✅ Build Failures — RESOLVED on `fix/dashboard-build-runtime`

The build/runtime failures below (originally documented as out-of-scope for the integration commit)
are now **fixed**. `pnpm build`, all package builds, and `pnpm --filter @job-app/dashboard build`
pass, and the dashboard runs. The three items are kept as a record of what changed. See the
"Workspace packages & build strategy" section of `apps/dashboard/README.md` and the PROJECT_STATUS
session note for the full strategy — **do not reintroduce `transpilePackages` for the workspace
packages; they are consumed as compiled `dist`.**

Resolution summary:
- **#1 Turbo:** added `"packageManager": "pnpm@11.16.0"` to root `package.json`; also set pnpm 11
  `allowBuilds` in `pnpm-workspace.yaml` (and removed the ignored legacy `pnpm.onlyBuiltDependencies`).
- **#2 `tsc` package builds:** added `@types/node` to `classification` + `ingestion`; fixed
  `packages/ingestion/tsconfig.json` (`include: ["src"]`, dropped the sibling-source `paths`, excluded
  the report script); added nameable return types in `packages/db/src/connection.ts`.
- **#3 Next 16 `params`:** the three dynamic route handlers now use `params: Promise<{ id: string }>`
  + `await`.
- **Also fixed:** workspace packages now build to `dist` and the dashboard consumes that;
  `@job-app/db` exposes `exports` for `/schema` and `/connection`; `drizzle-orm` +
  `@job-app/ingestion` declared as dashboard deps; `api/jobs` POST rewritten to call the real
  `ingestJob` pipeline (nonexistent `classifyJob` removed); APIs return structured JSON; DB opens
  lazily and self-provisions via `ensureSchema()`; `better-sqlite3` bumped `9 → ^12` for a Node-24
  prebuilt binary; unimplemented sidebar links hidden.

<details><summary>Original failure records (now fixed)</summary>

### 1. Turbo cannot resolve the workspace
- **Command:** `pnpm build` (→ `turbo run build`) — also `pnpm lint` (`turbo run lint`).
- **Error:** `x Could not resolve workspace. -> Missing 'devEngines.packageManager' or legacy 'packageManager' field in package.json`
- **Why pre-existing:** root `package.json` has never declared a `packageManager` field; Turbo 2.x requires it. Root `package.json` is unmodified by this work.
- **Recommended minimal fix:** add `"packageManager": "pnpm@11.16.0"` (matching the installed pnpm) to root `package.json`.
- **Files likely affected:** `package.json` (root).

### 2. `tsc` package build fails — Web/Node globals unresolved
- **Command:** `pnpm -r --filter "./packages/*" build` (each package runs `tsc`).
- **Error:** `packages/classification/src/deduplication.ts(159,24): error TS2552: Cannot find name 'URL'. Did you mean 'url'?` (byte-identical at `HEAD`). The same class of error affects `fetch`/`URL`/`AbortController` usage elsewhere (incl. the new `url-extractor.ts`).
- **Why pre-existing:** `tsconfig.base.json` sets `"lib": ["ES2022"]` with no DOM lib, and packages don't include `@types/node`, so `URL`/`fetch` globals are undefined for `tsc`. Vitest/esbuild don't type-check, so tests stayed green.
- **Recommended minimal fix:** add `"types": ["node"]` (and `@types/node` as a devDependency) to the affected packages, or add `"DOM"` to `lib` in `tsconfig.base.json`. Also either drop `tests` from `include` in `packages/ingestion/tsconfig.json` or set `rootDir` appropriately (currently emits `TS6059` because `tests/**` is outside `rootDir: src`).
- **Files likely affected:** `tsconfig.base.json`, `packages/*/package.json` (add `@types/node`), `packages/ingestion/tsconfig.json`.

### 3. Dashboard `next build` fails — Next 16 route `params` migration
- **Command:** `pnpm --filter @job-app/dashboard exec next build` (and raw `tsc --noEmit`).
- **Error:** `Type '{ params: { id: string; } }' is not assignable to '{ params: Promise<{ id: string; }> }'` for `src/app/api/jobs/[id]/route.ts`, `.../approve/route.ts`, `.../reject/route.ts`.
- **Why pre-existing:** Next.js 16 changed dynamic route handler `params` to a `Promise`. These committed routes still use the old synchronous `{ params }` signature. The new importer route (`/api/extract`) and `import-job` page are **not** dynamic and don't add to this.
- **Recommended minimal fix:** update the three handlers to `({ params }: { params: Promise<{ id: string }> })` and `await params`. (See `apps/dashboard/AGENTS.md`: "This is NOT the Next.js you know.")
- **Files likely affected:** `apps/dashboard/src/app/api/jobs/[id]/route.ts`, `.../approve/route.ts`, `.../reject/route.ts`.

</details>

---

## Product backlog (unchanged, deferred)

- **Phase 6 — Browser Assistance** (Playwright) — NOT STARTED.
- **Phase 7 — Limited Automation** (Trigger.dev) — 🟨 IN PROGRESS.
- **Phase 7.1B.1 — Trigger.dev manual orchestration** — IMPLEMENTED locally.
- **Phase 7.1B.2 — Trigger.dev cron scheduling** — IMPLEMENTED locally for
  development-only dry runs.
- Additional source adapters (Gmail alerts, RSS/Atom).
- Answer remaining candidate questions (Q6–Q12: salary, location, schedule, equipment, English level).
