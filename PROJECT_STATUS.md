# Project Status

**Last updated:** 2026-08-02 PHT
**Current phase:** Phase 7.1B.5B–7.1B.7A release verification complete
**Overall health:** Green — the production build, strict TypeScript, 632-test suite, and browser-bundle secret scan pass; all network and persistence features remain fail-closed behind exact server-side switches and transactional limits
**Active branch:** `master`; Phase 7.1B.5B–7.1B.7A is ready for the requested release commit

---

## Session — final release hardening

- Verified the complete combined working tree: 56 test files and 632 tests
  passed, the 6/6 workspace build passed, the standalone dashboard production
  build generated all 16 routes/pages, and dashboard/ingestion strict
  TypeScript plus `git diff --check` passed.
- Added bounded server-only ingestion exports and lightweight Philippine-time
  and limit modules for dashboard APIs. The dashboard production build no
  longer traces the whole ingestion runtime or emits the prior repository-root
  warning.
- Replaced the deprecated Vitest workspace file with a project-based root
  configuration. Test discovery remains unchanged and the deprecation warning
  is gone.
- Audited the ignored worker and dashboard environment files by variable name
  only. Required local switches and credentials are present; no value was
  copied, logged, or committed. The tracked samples now include the manual and
  scheduled persistence switches as disabled defaults.
- Scanned 29 browser static assets: no server-only environment variable name
  and no actual local Gemini, Tavily, or Trigger credential value was found.
- The code is production-build ready, but production mutation is deliberately
  not enabled by this release: dashboard scans, scheduled persistence, Deep
  Scan, and freelance scanning retain their existing DEVELOPMENT/exact-switch
  gates. Enabling production persistence requires a separate audited rollout,
  not a configuration side effect.
- No provider request, Gemini call, Trigger.dev task, discovery scan, live
  SQLite write, proposal, application, or submission occurred during final
  release verification.

---

## Session — first-party forum listing updates

- Added deterministic forum-post attribution at the original-page parsing
  boundary. The original post author is matched by stable forum author
  metadata; only that author's later replies may clarify geography, timezone,
  closure/filled state, explicit experience, pay, or scope. Replies from
  applicants and other users are excluded from listing evidence.
- Original-poster text remains bounded first-party evidence. An explicit
  Philippines exclusion takes precedence over unresolved or broad geography
  and produces `NOT READY` with `GEOGRAPHIC_RESTRICTION`; a generic reference
  to time difference does not invent a timezone.
- Forum listings older than 90 days without a recent semantic update from the
  original poster receive the non-accusatory
  `POTENTIALLY_STALE_LISTING` risk flag. Confirmed closure/filled updates become
  expired locally, while other users cannot close or reopen a listing.
- The cached n8n Community scenario was reclassified in an isolated HTML
  fixture: its original poster's explicit Philippines exclusion makes it `NOT
  READY / GEOGRAPHIC_RESTRICTION`. No provider call, scan, SQLite mutation,
  proposal, application, or submission occurred.
- Focused verification passed 51 adjacent freelance extraction/classification
  tests, including six new forum-attribution cases, plus ingestion strict
  TypeScript.

---

## Session — Freelance Preview opportunity inspection

- Extended the strict scan result with at most 20 browser-safe final Preview
  summaries. They contain bounded normalized display facts and no description,
  page HTML, search snippet, provider response, prompt, credential, environment
  value, database path, stack trace, or private profile detail.
- The completed Preview dialog now leads with compact readiness and credit
  metrics, then immediate local readiness filters and one review row per final
  opportunity. Native keyboard disclosures expose skills, scope counts,
  learning preparation, sample guidance, and risk indicators; non-opportunity
  pages remain aggregate rejections and never become cards.
- The main freelance workspace now says **Saved opportunities** and explains
  that those persisted records are not the latest temporary Preview results.
- Added explicit **Save for Review**. The server retrieves the trusted Trigger
  result, revalidates the original public URL, preserves source attribution,
  and performs one deduplicated atomic local write under the separate
  20-per-PHT-day cap. `NOT READY` requires an additional blocker
  acknowledgement; hard-rejected, expired, invalid, or unsafe URLs cannot be
  saved. The action sends no proposal, bid, message, application, or submission.
- Installed Impeccable 4.0.4 and Emil Kowalski's `emil-design-eng` skill
  project-locally under `.agents/skills/` and read both directly because this
  active session did not reload native skill registration. Impeccable guided
  hierarchy/density/accessibility; Emil's review removed unnecessary filter
  motion, gated hover feedback to pointer devices, and stabilized confirmation
  feedback. The installed skill files remain uncommitted.
- Focused verification passed 13 ingestion and 12 dashboard tests, ingestion
  and dashboard strict TypeScript, and the client sensitive-value scan. No
  provider/model call, Trigger.dev task, dashboard scan, live database write,
  proposal, bid, message, application, or submission ran.

---

## Session — Phase 7.1B.7A isolated Tavily cached-result audit

- Audited completed Fresh Preview `run_06frsc632il7pavouajs5da401` and the
  retained Tavily cache without another search, Extract, model, provider, or
  Trigger.dev request. The run discovered 68 URLs, parsed nine source records,
  reduced them to five final identities, made zero verification calls, and
  saved nothing.
- Created the external copied snapshot
  `E:\DevStorage\Temp\ai-job-b7a-cached-audit-20260802-004413`. The safe run
  artifact retains titles, domains, and bounded diagnostics but not complete
  fetched page bodies, so stronger discarded page evidence is not claimed.
- The five-item audit found one actual individual vacancy: the Built In CMS
  contract has four task-scope clauses but an explicit three-year requirement
  and incompatible geography, so it remains `NOT READY`. Two PeoplePerHour
  category pages, one Robert Half search-results page, and Codeable's generic
  expert onboarding page are now `NON_OPPORTUNITY_PAGE`, not manual-review jobs.
- A specific parsed individual page with too-thin task evidence can now use
  Tavily Extract recovery only when the independent exact
  `JOB_DISCOVERY_TAVILY_EXTRACT_ENABLED=true` gate is active. Non-opportunity
  pages never enter Extract, disabled Extract makes no request, and unusable
  recovery retains the attributable thin page only as review evidence.
- `REVIEW SCOPE MANUALLY` now permits unresolved (but not incompatible)
  geography and remains excluded from automatic save at both scan-selection
  and repository boundaries. Mandatory experience remains `NOT READY`.
- Dashboard metrics now distinguish source candidates before global dedup,
  candidates merged by global dedup, source-page scope counts, final unique
  opportunity scope counts, and primary readiness blockers.
- Cached-only reclassification of the five final identities changed 5 valid / 2
  sufficient / 3 insufficient / 5 not ready to 1 valid / 1 sufficient / 0
  insufficient / 1 not ready, with four non-opportunity pages. Positive
  readiness, manual-scope review, and hard rejection all remain zero.
- Focused ingestion tests passed 56/56 and focused dashboard tests passed 8/8;
  ingestion and dashboard strict TypeScript passed. No API credit, live
  persistence, proposal, application, message, bid, or submission occurred.

---

## Session — Phase 7.1B.7A Tavily Preview quality audit

- Audited completed Fresh Preview `run_06frs51mutrdapglafvt8f3e01` and its
  cached URL metadata without another provider/model request. The run fetched
  103 source records/leads, produced 15 accepted results, made zero Gemini
  verification calls, saved nothing, and created no proposal, application, or
  submission.
- Created the external read-only snapshot
  `E:\DevStorage\Temp\ai-job-b7a-tavily-audit-20260802-001207\app.db`
  (SHA-256 `d82274ed53a9b038614edabfa545e89033f8420bd7d5d631e61494edb6dbed0e`).
- The decisive defect was the web fallback accepting a title, site name, and
  120-character generic description without proving an individual vacancy.
  Six category/article/service pages therefore entered readiness as jobs. The
  current safe artifact does not retain original page bodies, so it cannot
  prove that richer discarded bullet evidence existed; that limitation is
  reported rather than guessed.
- Added a pre-fetch and post-parse page-quality boundary. Obvious search,
  category, article, guide, service, profile, marketplace, and generic landing
  pages become `NON_OPPORTUNITY_PAGE`. JSON-LD `JobPosting`, exact visible task
  clauses, and original-page contract context remain acceptable evidence;
  snippets remain excluded. Attributable pages with incomplete scope become
  `REVIEW SCOPE MANUALLY`, not positive readiness.
- Replaced broad freelance queries with four deterministic eight-query groups
  using quoted bounded task phrases. Future reports expose query text, yield,
  original pages fetched, valid/non-opportunity pages, Extract recoveries, and
  sufficient/insufficient scope counts without raw responses or page bodies.
- An isolated non-persistent reclassification of the 15 safe run previews is:
  before 15 valid/0 non-opportunity/15 not ready; after 9 valid/6
  non-opportunity/1 manual-scope review/8 not ready. `READY NOW`, `LEARNABLE
  FAST WITH AI`, and `HARD REJECTED` remain 0. No unsuitable listing was
  promoted.
- Focused ingestion tests passed 46/46 and dashboard tests passed 8/8. Ingestion
  and dashboard strict TypeScript and `git diff --check` passed. No live API,
  Trigger.dev execution, scan, or database mutation occurred during the audit.

---

## Session — Phase 7.1B.7A first Preview readiness audit

- Audited the completed Preview run `run_06frru6cl3aukbqp7bdoukfm01` without
  starting another scan or calling a provider. It fetched 36 listings, produced
  eight unique Remotive freelance opportunities, made zero Gemini verification
  calls, and saved zero opportunities. All eight were already classified
  `NOT READY`; the result modal had omitted that existing count.
- The eight primary blockers were one explicit mandatory-experience requirement,
  two senior/lead ownership roles, three explicit non-Philippines geographic
  restrictions, and two unrelated writing-role families. All eight had unknown
  pay, none was hard rejected, and two worldwide writing listings remain safe
  candidates for manual scope review without implying readiness.
- Added a closed safe readiness-diagnostic contract with aggregate primary
  blocker counts and bounded per-opportunity previews. It includes no source
  description, raw provider response, private profile data, URL, or internal
  identifier. `REQUIRES REVIEW` is explicitly cross-cutting and may overlap a
  readiness label; in this run all eight require pay review.
- Fixed one conservative classification gap: an explicit geography that yields
  no Philippines/international/worldwide eligible view now prevents `READY NOW`
  or `LEARNABLE FAST WITH AI`. This tightens eligibility and does not loosen the
  existing experience, seniority, certification, risk, adjacency, or bounded-
  scope rules.
- The Preview result now displays `READY NOW`, `LEARNABLE FAST WITH AI`,
  `NOT READY`, `REQUIRES REVIEW`, and `HARD REJECTED`, plus top readiness
  blockers. Disabled Tavily and Gemini Search sources say
  `Disabled — usage not queried` rather than showing misleading zero quota.
- Focused ingestion classification/scan tests passed 33/33, dashboard freelance
  UI tests passed 5/5, ingestion and dashboard strict TypeScript passed, and
  `git diff --check` passed. No live API, scan, Trigger.dev task, or database
  write was performed during this audit.

---

## Session — Phase 7.1B.7A Freelance Opportunity Discovery

- Repaired the local Phase 7.1B.7A schema initialization mismatch that blocked
  `/freelance`. An early empty `freelance_opportunities` table predated
  `semantic_identity_key`, `opportunity_categories`, and
  `ethics_compliance_status`; `CREATE TABLE IF NOT EXISTS` could not add them.
  The established `ensureSchema` boundary now applies an atomic, idempotent
  additive migration, backfills any legacy semantic identity from the existing
  unique identity, uses fail-closed defaults for category/ethics metadata, and
  adds the semantic-identity unique index.
- The local database was snapshotted externally before repair. All six
  freelance tables were empty, all other expected columns/indexes/checks/
  foreign keys already matched, and regular job/application/persistence table
  contents remained byte-stable by aggregate hashes. SQLite integrity and
  foreign-key checks passed. Focused migration/repository tests passed 9/9,
  dashboard freelance server/page tests passed 7/7, both strict TypeScript
  checks passed, and a dashboard-only GET of `/freelance` returned HTTP 200
  with the empty state. No source, model, Trigger.dev, scan, or persistence
  operation occurred.

- Added a separate freelance opportunity domain and additive SQLite tables for
  normalized opportunities, multi-source attribution, scan idempotency,
  candidate caches, a separate 20-per-Asia/Manila-day persistence ledger, and
  local review/preparation events. Regular jobs and their five-per-day budget
  remain unchanged.
- Added exact worker-controlled sources for the no-key Himalayas JSON API,
  no-key Remotive public API, Tavily URL discovery through the existing shared
  Search/Extract ledger, optional Gemini Search, and one SSRF-protected manual
  public URL import. Upwork/Freelancer official adapters remain pending; neither
  marketplace is scraped or called.
- Added strict explicit-pay handling: USD hourly pay must be greater than
  `$3.00`; exactly `$3.00` is below preference. Non-USD pay is not converted,
  fixed budgets never receive guessed hourly rates, and missing pay remains
  visible at lower priority.
- Added the user-facing readiness states `READY NOW`, `LEARNABLE FAST WITH AI`,
  and `NOT READY`. Learnable work is not limited to existing skills, but every
  missing core skill must be a narrow 4–24-hour catalogued gap adjacent to a
  verified skill. Mandatory experience/certification, regulated work, senior
  ownership, unbounded scope, high-risk work, or AI availability alone cannot
  establish readiness.
- Added the local-only `Mark Preparation Complete` gate. It records completed
  practice, sample state/note, concerns, and manual confirmation before a
  learnable opportunity becomes application-ready. It sends no proposal, bid,
  message, or application.
- Added `/freelance` with Philippines, International Clients, and Worldwide
  Remote views, pay/readiness filters, source status and usage, risk indicators,
  cards, details, shortlist/dismiss/manual-applied states, and public source
  links. The unscheduled development scan task uses the existing concurrency-one
  discovery queue and has one task attempt.
- Added deterministic risk/ethics gates and wording that reports only
  “Potential risk indicators detected.” No unsupported fraud accusation is
  made. Only LOW/MEDIUM risk opportunities may be automatically saved;
  hard-rejected/expired records cannot be persisted.
- Focused verification passed 33 tests (26 ingestion and 7 dashboard). The full
  workspace suite passed 586/586 tests across 54 files; the workspace build,
  dashboard production build, dashboard strict TypeScript, ingestion strict
  TypeScript, `git diff --check`, and generated client-bundle security scan all
  passed. No live Himalayas, Remotive, Tavily, Gemini, Trigger.dev, dashboard
  scan, or database operation occurred in this phase.

See `docs/FREELANCE_OPPORTUNITY_DISCOVERY.md` for the complete boundaries.

---

## Session — Phase 7.1B.6B Gemini Search failure diagnosis

- Inspected the installed `@google/genai` 2.13.0 declarations and runtime. The
  configured `gemini-2.5-flash-lite` search model remains independent from the
  extraction model. The SDK supports `{googleSearch: {}}`, uses Gemini API
  `v1beta` by default, exposes candidate grounding chunks and usage metadata,
  and performs no retry unless retry options are explicitly enabled.
- Ran exactly one isolated, non-persistent live diagnostic request with one
  attempt and no Tavily, Trigger.dev, orchestration, cache, quota, or SQLite
  path. It produced no HTTP status, response, grounding, finish reason, or token
  metadata. A subsequent mocked-transport check (no network) proved that the
  same installed SDK serializes the configured model/tool request correctly and
  parses grounding plus usage metadata. The defensible closed classification is
  `NETWORK_FAILURE` at the pre-response boundary, not model/tool/schema
  incompatibility. No second live request was made.
- Gemini Search failures now retain only safe fields: source, closed provider
  category, safe HTTP status when available, request-reached state,
  reservation/release state, and grounded URL count. Raw messages, responses,
  prompts, credentials, and stack traces remain excluded. Failed prompt
  reservations remain released, while successful provider calls remain counted.
- Focused Gemini Search, combined-discovery, dashboard-result, and dashboard UI
  tests passed. Ingestion/dashboard strict TypeScript and `git diff --check`
  passed. No Tavily call, database write, persistence, application, or submission
  operation occurred.

---

## Session — Phase 7.1B.6B Fresh Preview accounting repair

- Diagnosed Trigger.dev run `run_06frqcnq6ngth1g4strq1puf01` without another
  provider request. Tavily completed two Basic Search calls and consumed two
  current-run credits before the project ledger stopped further Tavily work.
  Gemini Search independently attempted all eight prompts and completed none;
  those closed `API_ERROR` warnings had been mislabeled as Tavily warnings by
  the combined dashboard result.
- Reconciled the local ledger against the authoritative Tavily Billing total of
  22 credits. Eight migrated provenance mirrors duplicated eight native live
  Search charges and had inflated the project aggregate to 30. The mirrors are
  preserved but excluded/released from aggregate consumption. The repaired
  PHT-day/month totals are 22 confirmed, 0 reserved, 8 daily remaining, and
  878 monthly remaining under the project cap.
- Failed Search/Prompt reservations now release zero confirmed usage. Sixteen
  failed Gemini Search prompt rows from the two live attempts were retained as
  audit history but released from quota accounting. Confirmed Search and
  Extract consumption remains counted, including provider-consuming test-origin
  work; no automatic retry or pay-as-you-go assumption was added.
- Dashboard metrics now distinguish current-run Tavily credits from confirmed
  and reserved day/month ledger totals. Safe warnings carry explicit
  `TAVILY_SEARCH`, `GEMINI_SEARCH`, or `TAVILY_EXTRACT` attribution.
- The before snapshot is
  `E:\DevStorage\Temp\ai-job-6b-fresh-preview-failure-20260801-200529\before`;
  the after snapshot is
  `E:\DevStorage\Temp\ai-job-6b-fresh-preview-repair-20260801-201937\after`.
  SQLite integrity passed, and job identity plus raw-description aggregate
  hashes were unchanged. No job, score, extraction, application, activity, or
  persistence-run row was modified.
- Focused verification passed 41 ingestion tests and 7 dashboard UI tests,
  ingestion/dashboard strict TypeScript, and `git diff --check`. No second live
  scan was run.

---

## Session — Phase 7.1B.6B Combined Web Search and Bounded Deep Scan

- Added four fixed eight-intent query groups covering entry-level software,
  mobile/backend, AI/workflow automation, and direct employer/ATS vacancies.
  Fresh selection rotates deterministically from Asia/Manila date, active
  profiles, six-hour cache state, and persisted execution history. No random
  or model-generated query expansion exists.
- Normal scans now explicitly choose `CACHED` (default) or `FRESH`. Fully
  cached groups issue no fresh search requests. Fresh scans run enabled Tavily
  Basic Search and Gemini Google Search independently, merge source
  attribution, canonicalize/deduplicate cross-source URLs, and stop at 250
  unique public URLs.
- Gemini Search uses only the separately configured `GEMINI_SEARCH_MODEL` and
  supported Google Search grounding metadata. Generated text is ignored; only
  grounded URLs enter the original-page safety pipeline. Token usage is actual
  SDK metadata or unavailable, never estimated.
- Direct public-page retrieval remains mandatory. JSON-LD `JobPosting`, known
  ATS data, and conservative attributable HTML are preferred. Tavily Basic
  Extract is available only after an eligible direct-fetch/parser failure;
  login, CAPTCHA, private/internal, search, submission, prohibited, and unsafe
  redirect pages never reach Extract. Recovered content still passes normal
  candidate validation.
- Search and Extract share a transactional persistent Tavily budget: 30
  credits per PHT date and 900 per PHT month by default, with provider-reported
  Basic Extract usage. Gemini Search has an independent transactional 60-prompt
  PHT-day project cap. Six-hour caches and safe bounded cleanup are persistent.
- Added a development-only, explicitly confirmed Deep Web Scan. It is
  preview-only by default, has a hard 1,000-canonical-URL ceiling (not a target),
  batches at most 100 page attempts, starts at most once per rolling seven PHT
  days, supports future-batch cancellation, and preserves task idempotency and
  the concurrency-one discovery queue. Optional verification selects at most
  ten new matches and can save only within the existing five-job daily cap.
- Added persistent query history, search caches, usage ledgers, Deep cooldown/
  idempotency rows, cancellation state, and body-free batch checkpoints through
  additive schema initialization. No raw search answers, snippets, page bodies,
  prompts, keys, or environment values are stored.
- Dashboard results distinguish Search, Extract, Gemini Search, direct-page,
  cross-source deduplication, matching, verification, and persistence metrics.
  It shows real stages without fake percentages or currency estimates.
- Arbeitnow, Remotive, and Lever remain preserved and disabled unless their
  exact worker switches are lowercase `true`; no failure activates them.
  Morning/evening task IDs and schedules are unchanged, evening remains
  dry-run-only, and production persistence remains disabled.
- No deliberate live Phase 7.1B.6B validation was run. One early focused
  orchestration test, before the injected-repository fallback was corrected,
  opened the default local SQLite web store and initiated eight Tavily Basic
  Search requests for the fixed EVENING `DIRECT_EMPLOYER_ATS` group. Its job
  repository and persistence boundary were mocked, so no job persistence path
  ran. An authorized copied-snapshot inspection later correlated that exact
  run with eight cache rows and one query-history row; those nine test-owned
  rows were removed atomically. The associated eight credit-ledger rows were
  retained because the provider requests and credit consumption were real.
  The earlier user Preview Scan's eight legacy cache/credit rows and their
  migrated usage mirrors were preserved. Subsequent repository-injected tests
  resolve web discovery to an in-memory store, with focused regression
  coverage for that isolation boundary.
  Live Phase 7.1B.6B validation remains pending.
- Final verification passed 543/543 tests across 47 files, the 6/6 workspace
  build, the standalone dashboard production build, dashboard and ingestion
  strict TypeScript, client-bundle credential/runtime scanning, and
  `git diff --check`. The pre-existing non-fatal Next.js NFT trace warning for
  the analyze-job server route remains unchanged.

---

## Session — Phase 7.1B.6A Tavily Web Job Discovery

- Added a server-only Tavily Basic Search adapter at the fixed official Search
  endpoint. It uses eight deterministic profile-oriented queries, at most ten
  results per query, no generated answer or raw content, and none of Advanced
  Search, Extract, Crawl, Map, or Research.
- Tavily is a URL-discovery source only. Snippets never become job evidence.
  Only validated, canonical public URLs with attributable jobs parsed from the
  original page enter shared deduplication, filters, matching, and persistence.
- An additive SQLite cache/credit boundary gives identical normalized queries
  a six-hour cache and transactionally limits uncached Basic searches to 16
  credits per Asia/Manila date. One scan issues at most eight search requests.
- One server-only exact-switch resolver selects sources. Tavily is primary via
  `JOB_DISCOVERY_TAVILY_ENABLED=true`; Arbeitnow, Remotive, and Lever are
  preserved but disabled by default behind independent switches. Disabled
  sources initialize no client, fetch nothing, and are never fallbacks.
- All-disabled execution returns `NO_DISCOVERY_SOURCES_ENABLED` before network,
  Gemini, or persistence work. Tavily failures remain isolated.
- Dashboard results now include a compact source summary, Tavily credit/cache/
  URL/page metrics, and separate match/existing/saveable/Gemini/saved counts.
  No currency estimate is shown.
- Morning/evening task IDs, schedules, queue, idempotency, and the shared
  five-job Philippine-day cap are unchanged. Evening remains dry-run-only and
  production persistence remains disabled.
- The first live 6A Preview completed eight uncached Tavily searches, consumed
  eight Search credits, discovered 67 URLs, parsed seven pages, found one new
  saveable profile match, made zero Gemini verification calls, and persisted
  zero jobs. It reported `PARTIAL_FAILURE` because some original pages failed
  safely. Repeated previews hit all eight six-hour caches and consumed zero new
  Search credits while reproducing the same 67-URL result, as designed.
- Phase 7.1B.6A verification passed 12 focused Tavily tests and the wider
  54-test discovery/dashboard group. The full workspace passed 527/527 tests
  across 46 files, workspace build passed 6/6, the standalone dashboard
  production build passed, dashboard and ingestion strict TypeScript passed,
  and `git diff --check` passed. The existing non-fatal Next.js NFT trace
  warning remains unchanged.

---

## Session — Phase 7.1B.5C Dashboard Manual Job Scan

- Added a compact `Scan Jobs` dashboard action with an accessible native modal.
  `Preview Scan` clearly states that it uses no Gemini calls, saves nothing,
  and consumes no daily slots. `Scan & Save` shows current PHT-day usage and
  is disabled at zero remaining capacity while Preview stays available.
- Added the unscheduled `public-job-discovery-dashboard-scan` Trigger.dev task.
  It uses the existing discovery queue with concurrency one, `maxAttempts: 1`,
  a 30-minute TTL, and a 600-second maximum duration. The fixed morning and
  evening task IDs and behaviors were not changed.
- Dashboard scans require Trigger.dev `DEVELOPMENT`, the dedicated task ID, and
  `JOB_DISCOVERY_DASHBOARD_SCAN_ENABLED` exactly equal to lowercase `true`.
  The switch is read only on the server and is independent from both scheduled
  and manual-controlled persistence switches.
- Local process environments are now explicitly separated. Root `.env.local`
  contains only the worker's Gemini/Tavily configuration and switches;
  `apps/dashboard/.env.local` contains only the server-side Trigger credential
  and dashboard scan switch. Both real files are ignored, with tracked safe
  placeholders in their corresponding `.env.example` files.
- Preview reuses provider validation, normalization, orchestration-wide
  deduplication, unchanged local filters, unchanged morning profiles, and the
  Phase 7.1B.5B matcher audit. It cannot call requirements Gemini, persist,
  reserve daily budget, or create applications/submissions.
- Save reuses the fixed morning profile group, verified candidate-first
  Flash-Lite extraction, fail-closed verification, all-or-nothing SQLite
  transaction, final database deduplication, and shared five-job
  Asia/Manila-day budget. The new `DASHBOARD_SCAN` run kind adds only a distinct
  safe completion activity; no migration was needed.
- Same-origin strict POST validation, strict payloads, task-level idempotency,
  one process-local active dashboard run, and the shared queue prevent normal
  double-click/concurrent execution. Persistent job and daily-cap idempotency
  remains authoritative at the SQLite boundary.
- Progress reports named stages without a fabricated percentage. Results show
  safe counts, failures, selected/saved jobs, remaining capacity, and elapsed
  time. Actual Gemini prompt/output/total usage metadata is aggregated when
  supplied; otherwise the UI says `Usage unavailable` and never estimates.
- No live dashboard scan was run in this phase. Providers, Gemini, Trigger.dev,
  and live SQLite job data were not contacted or changed during implementation.
  Production persistence and evening persistence remain disabled.
- Focused verification passed 69 ingestion tests and 9 dashboard tests. The
  full workspace passed 511/511 tests across 45 files, workspace build passed
  6/6, the standalone dashboard production build passed, dashboard and
  ingestion strict TypeScript passed, and `git diff --check` passed. The
  existing Next.js NFT trace warning remains non-fatal and predates this flow.

---

## Session — Phase 7.1B.5B Profile Matcher Coverage Audit

- Added safe, closed diagnostic reasons at the source-validation,
  normalization, deduplication, local-filter, profile-matching, and pipeline
  boundaries. The diagnostic path returns configured signal labels only and
  never returns job-description excerpts.
- The matcher itself is unchanged. The audit reports the current matcher's
  primary and supporting evidence, exact blocker stage, and deterministic top
  near-matches for `software_development` and `ai_automation`.
- One live dry-run fetched 134 records and produced 105 unique accepted
  identities at that later provider snapshot. It made zero Gemini calls,
  persisted nothing, and created no applications or submissions.
- Local filtering accounted for all 112 pre-match exclusions: 47 Arbeitnow
  and 41 Lever records lacked explicit remote evidence, while 24 Remotive
  records did not match the fixed local `software-dev` category. Twelve jobs
  reached matching and remained untargeted.
- The pool contained nine current `software_development` matcher hits before
  local-filter/dedup finalization. Four were blocked by location/remote
  filtering; five were already-saved database duplicates. Therefore zero new
  unique software matches reached scoring. `ai_automation` had zero primary
  matches; 13 unique candidates had supporting signals only.
- The audit identified bounded title-coverage candidates such as Android
  Engineer and a Full-Stack Rails Engineer, but also confirmed that broad
  Lemon.io skill boilerplate and source-category aliases cannot create a
  match. No matcher loosening was implemented.
- The smallest recommended follow-up is a reviewed exact-title fixture for
  `Android Engineer` (and any other individually verified role title), plus a
  separate review of the Remotive one-request category recall tradeoff. Do not
  promote technology/category metadata to primary evidence.

---

## Session — Phase 7.1B.5A Development Morning Scheduled Persistence

- The existing `public-job-discovery-morning-dry-run` schedule keeps its
  `0 8 * * *` Asia/Manila cron, DEVELOPMENT-only registration, shared
  concurrency-one queue, 30-minute TTL, and 600-second duration. Its task-level
  retry limit is now one.
- Morning remains dry-run by default. It enters the controlled write path only
  when the Trigger.dev environment is `DEVELOPMENT` and the independent process
  switch `JOB_DISCOVERY_SCHEDULED_PERSISTENCE_ENABLED` is exactly lowercase
  `true`. This does not reuse or weaken the manual
  `JOB_DISCOVERY_CONTROLLED_PERSISTENCE_ENABLED` gate.
- The evening `public-job-discovery-evening-dry-run` task is unchanged in
  behavior: DEVELOPMENT-only, DRY_RUN-only, and unable to reserve budget or
  call the persistence repository.
- Added the additive `job_discovery_persistence_runs` SQLite ledger keyed by
  idempotency key. It records Philippine date, task ID, run kind, persisted job
  count, and timestamps. A database trigger rejects any reservation that would
  raise the PHT-date total above five.
- Manual controlled and scheduled morning persistence share this same ledger.
  Remaining capacity is rechecked inside the same SQLite transaction that
  writes the selected jobs, scores, verified extractions, and completion
  activity. Duplicate final-database candidates do not consume capacity.
- The scheduled idempotency key is deterministically derived from the fixed
  task ID, `MORNING`, and the Asia/Manila calendar date. A completed same-day
  invocation returns `ALREADY_COMPLETED`; an exhausted date returns
  `DAILY_CAP_REACHED`. Both return before provider or Gemini calls.
- Morning continues to use only the fixed `software_development` and
  `ai_automation` profiles. Selection is stable and bounded by the remaining
  daily capacity. Any source or extraction failure preserves the all-or-nothing
  write boundary and consumes no daily budget.
- No applications, submissions, resumes, cover letters, email, messages, or
  browser automation were added. Production persistence and evening
  persistence remain disabled.
- Registered DEVELOPMENT run `run_06frj6g5id1v7jt47pv73m7e01` completed on
  Philippine date `2026-08-01`. Arbeitnow, Remotive, and Lever fetched 134
  records; no job matched the fixed morning profiles, so selection,
  requirements Gemini calls, and persistence were all zero. Zero persistence
  is a valid safe outcome and left jobs 14, scores 6, applications 0, and
  extractions 14. Exactly one scheduled completion activity and its zero-count
  ledger row were written, changing activity 2→3 while daily persisted budget
  remained 0 with capacity 5.
- The completed ledger key
  `public-job-discovery-morning-dry-run:MORNING:2026-08-01` blocks the normal
  later 8:00 AM invocation for that same PHT date before provider or Gemini
  calls. No duplicate identities, partial writes, applications, submissions,
  or second Trigger.dev run occurred.
- Automated verification also passed: focused persistence/schedule coverage
  46/46, full suite 489/489 across 41 files, workspace build 6/6, standalone
  dashboard build, dashboard/ingestion strict TypeScript, and
  `git diff --check`.

---

## Session — Phase 7.1B.4B Candidate-First Extraction and Reprocessing

Phase 7.1B.4B.1 stabilizes the server-only requirements pipeline without
discarding the uncommitted Phase 7.1B.4A/7.1B.4B work.

- Existing Gemini use was previously limited to the dashboard manual-import
  analysis route. Controlled discovery and saved-job reprocessing had no
  contextual requirements extraction, which is why the saved Spotify job
  retained only the older deterministic fields and omitted most qualifications.
- Preprocessing now uses an HTML parser, preserves headings/list boundaries and
  the byte-identical raw description, normalizes supported provider dates and
  explicit salary syntax, and reuses the existing canonical URL implementation.
- Deterministic preprocessing now enumerates every heading, bullet, standalone
  clause, and available provider metadata value as a stable candidate. Gemini
  returns exactly one ordered decision per candidate ID and cannot supply
  replacement evidence or scalar numbers. Missing, unknown, duplicate, or
  reordered IDs fail closed.
- Requirements extraction explicitly uses the configured primary model slot,
  currently `gemini-3.5-flash-lite`, once per job with a bounded 45-second
  timeout and no silent requirements-model fallback.
- Independent local verification owns experience/salary numbers, exact
  evidence, required/preferred cues, safe aliases, restrictions, and timezones.
  Salary currency, minimum, maximum, period, and additional compensation have
  separate statuses, so an uncertain period no longer invalidates a range.
  Only `VERIFIED` facts can reach scoring or hard rejection; review/conflict
  facts remain display-only.
- Added one additive `job_extractions` table keyed one-to-one by job ID. It
  stores versioned verified JSON, content hash, safe model identifier, status,
  and timestamps. Raw descriptions are never overwritten.
- Manual import and future controlled persistence use the same candidate,
  verification, and stored-extraction contracts. Controlled persistence calls
  Gemini only after final unique candidate selection, at most five times, and
  skips a selected candidate on extraction failure without replacement.
- Added dry-run-first `pnpm reprocess-job-extractions` support for existing jobs.
  Apply is all-or-nothing: every eligible non-skipped job must have a valid
  completed write plan before the single SQLite transaction begins. It never
  creates/deletes jobs or applications, uses a separate
  `JOB_REQUIREMENTS_REPROCESSING_COMPLETED` activity event, and skips unchanged
  content/model/schema hashes.
- The dashboard Requirements view now presents verified experience,
  required/preferred qualifications, degrees/certifications/languages,
  restrictions, timezone/schedule, salary, work setup, evidence, provenance,
  conflicts, and whether each fact affected scoring.
- The original Spotify salary conflict was diagnosed exactly: Gemini returned
  `"$"` while local parsing resolved `USD`; all numbers, equity, and the null
  period agreed. Candidate-first extraction removes model-authored numbers.
- Spotify now stores verified 3 years `REQUIRED`, USD 132949–189927 plus
  equity, North America, and Eastern Standard Time. The timezone display value
  was canonically repaired from `Eastern Standard` without changing its exact
  evidence, score, status, salary, or requirements.
- Stage B passed on the saved LawnStarter and A.Team layouts without accepting
  ambiguous currency or responsibility-only technologies. The final all-14
  shadow used `gemini-3.5-flash-lite` once per job with no fallback, produced
  14 valid extractions, accepted zero unsupported facts, and confirmed that
  conflicts/review-only facts affected neither scoring nor hard rejection.
- Exactly one all-or-nothing apply wrote 14 extraction records, updated six
  score rows, removed PSA's obsolete score, and added one distinct
  `JOB_REQUIREMENTS_REPROCESSING_COMPLETED` activity entry. Jobs remained 14;
  job scores changed 7→6; applications remained 0; activity changed 1→2; and
  job extractions changed 0→14. Raw descriptions and job identities were
  unchanged.
- Status/score reconciliation: Spotify Android 39→38, SEPPmail 42→41,
  Spotify Backend 30→28, A.Team 41→40, Lemon.io DevOps 30→44, and Kettner
  35→34 all moved `DISCOVERED`→`SCORING_COMPLETED`. PSA moved
  `SCORING_COMPLETED` (43)→`HARD_REJECTED` (no score) solely because verified
  provider expiry `2026-07-28` produced `EXPIRED`.
- The garden3d salary conflict and PSA employment-type conflict remain
  review-only and had no automatic effect. Existing hard-rejected jobs were
  not promoted.
- The final full suite passed 472/472. Workspace build passed 6/6; dashboard
  and ingestion strict TypeScript/build verification and `git diff --check`
  passed.
- The post-apply idempotency dry-run made 0 Gemini calls, skipped all 14 rows by
  content hash, and wrote 0 records/scores/activity entries.
- At Phase 7.1B.4B completion both recurring schedules were dry-run-only.
  Phase 7.1B.5A later adds independently gated DEVELOPMENT morning
  persistence; evening and production persistence remain disabled.

See `docs/JOB_REQUIREMENTS_EXTRACTION.md` for the trust boundary, storage model,
shadow results, and current limitations.

---

## Session — Phase 7.1B.4A Controlled Persistence

Phase 7.1B.4A adds one manually triggered, unscheduled persistence task while
leaving the morning and evening cron tasks dry-run-only.

- Dedicated task ID:
  `public-job-discovery-controlled-persistence`.
- Persistence is rejected unless the Trigger.dev environment is
  `DEVELOPMENT`, the process-local
  `JOB_DISCOVERY_CONTROLLED_PERSISTENCE_ENABLED` kill switch is exactly
  `true`, the strict payload requests `CONTROLLED`, the limit is 1–5, and the
  dedicated task ID is executing.
- The strict payload accepts only `scheduleGroup`, `persistenceMode`,
  `maxJobsToPersist`, and a bounded `idempotencyKey`. Profiles and provider
  hints come from the existing fixed MORNING/EVENING configurations.
- Final candidates come from the Phase 7.1B.3 shared identity registry after
  filtering, targeting, deterministic hard rejection/scoring, and
  cross-source deduplication. No new score threshold or recommendation policy
  is added.
- The cap is enforced in payload validation, before repository persistence,
  and again at the repository boundary. Stable source processing and registry
  order determine selection.
- Final database deduplication, selected job/score writes, and a completion
  ledger row in the existing `activity_log` table occur in one SQLite
  transaction. A completed idempotency key returns `ALREADY_COMPLETED` without
  another write. No migration is introduced.
- The persistent idempotency guarantee is local to the SQLite database and the
  controlled task's concurrency-one queue. The activity ledger has no unique
  database constraint, so unrelated writers that bypass this task/queue are
  outside the guarantee. Trigger.dev task-level idempotency should also be
  supplied by the caller.
- Task retries are disabled (`maxAttempts: 1`), queue concurrency is one, and
  the task retains the bounded 30-minute TTL / 600-second duration.
- At the time of the Phase 7.1B.4A validation, applications, submissions,
  resumes, cover letters, email, browsers, and LLMs were not part of this path.
  The later uncommitted Phase 7.1B.4B work adds bounded requirements-only Gemini
  enrichment before future controlled writes; it still adds no application
  workflow.
- The required one-time DEVELOPMENT validation completed through the actual
  registered task as run `run_06fqk1omnhaft7a9ipea2iqc01` with status
  `COMPLETED`. The MORNING profiles were `software_development` and
  `ai_automation`. Across Arbeitnow, Remotive, and Lever, 136 records were
  fetched; five authoritative persistence candidates were qualified and
  selected, with no cap exclusions or final database duplicates.
- The run persisted five jobs and one score: four established
  `HARD_REJECTED` Remotive records and one scored `DISCOVERED` Lever record.
  Copied-snapshot counts changed from 9 to 14 jobs, 6 to 7 scores, 0 to 0
  applications, and 0 to 1 activity-log entries. No pre-existing job or score
  row changed. The task reported zero applications and zero submissions.
- The payload idempotency key and Trigger.dev task-level idempotency key were
  both `phase-7-1b4a-20260729-023908107`; the persisted completion ledger
  recorded the same five jobs, one score, and zero final duplicates. The task
  was triggered exactly once and was not rerun.
- At the time of the Phase 7.1B.4A run, morning and evening recurring tasks were
  `DRY_RUN`-only. Phase 7.1B.5A later adds independently gated DEVELOPMENT
  morning persistence; evening and production persistence remain disabled.

---

## Session — Phase 7.1B.3 Job Search Profiles / Category-Aware Discovery

Added deterministic, versioned job-search profiles and integrated profile-aware
targeting into discovery orchestration while preserving dry-run safety.

- Added `packages/ingestion/src/discovery/job-search-profiles.v1.ts` with
  strict Zod validation, stable profile IDs, schedule grouping, deterministic
  matching, duplicate-ID rejection, and non-IT false-positive protections.
- Added `packages/ingestion/src/discovery/profile-retrieval-hints.v1.ts` for
  deterministic schedule-group retrieval hints with one fetch per source per
  run and explicit recall-limit notes where source APIs cannot express combined
  search.
- Extended discovery contracts/runner to carry strongly typed active profile
  IDs, per-profile match stats/previews, and `UNTARGETED` summary counts.
  Every valid adapter candidate now enters identity deduplication before local
  filters or targeting; filtered and untargeted jobs remain excluded from
  scoring/persistence while retaining safe source provenance.
- Preserved existing deterministic eligibility, hard rejection, scoring,
  recommendation, and deduplication as authoritative after profile targeting.
- Preserved manual Trigger payload controls (source toggles, limits, remoteOnly,
  Lever companies, query/category) and additively introduced validated
  `profileIds` and optional `scheduleGroup`.
- Updated schedule shared payloads to fixed MORNING/EVENING profile splits while
  keeping `DEVELOPMENT`-only schedules, queue concurrency 1, retries, TTL, and
  dry-run-only behavior.
- Added backward-compatible snapshot metadata for future apply runs by storing
  `targeting.matchedProfileIds` in the existing `raw_snapshot` JSON (no schema
  migration).
- Updated dashboard read model/UI to derive profile matches server-side at read
  time, pass plain IDs/labels to client components, and expose profile badges +
  filters (including Untargeted) without mutating existing rows.
- Added tests for profile config/matching, retrieval-hint behavior, untargeted
  flow, manual payload control retention, schedule profile split, and dashboard
  badge/filter presence.
- Hardened `ai_augmented_development` after live false positives. Generic AI,
  software, product, prompt, Cursor, Copilot, media, marketing, content, video,
  editing, and design wording does not qualify. Primary evidence is limited to
  an explicit configured AI-assisted development title or a closed
  applicant-attributed `use <AI coding tool> to <direct action> <bounded
  technical object>` clause.
- Added deterministic per-profile evidence using short configured phrases only:
  primary `title_phrase`, `title_role`, `applicant_responsibility`, or
  `applicant_contextual_phrase`, followed only by configured supporting
  technology/platform/tag/skill/category labels. Full source descriptions are
  never included in preview evidence.
- Corrected vibe-coding reporting so it counts actual job evidence rather than
  configuration presence. Multi-profile jobs still pass through ingestion and
  scoring once, while untargeted jobs remain unscored and unpersisted.
- Phase 7.1B.3 review hardening now uses a bounded deterministic grammar rather
  than broad description search. It prioritizes precision over recall:
  description primary evidence must match a complete configured
  applicant-subject/action/object clause, with the technical object within a
  small fixed token bound, or an imperative bullet inside an explicit
  responsibilities section. Punctuation and HTML block/list boundaries are
  parsed before matching, and later headings close responsibility sections.
  Separate clauses, tags, skills, category, team, and department fields cannot
  be combined into primary evidence; they can add supporting labels only after
  a primary match. Unsupported or unusually phrased responsibilities may be
  missed intentionally.
- Lever board fetches now have independent company failure boundaries. Scheduled
  orchestration attempts Spotify, Highspot, and Aleph at most once each,
  preserves successful boards, and reports `SUCCESS`, `PARTIAL_SUCCESS`, or
  `FAILED` with safe company IDs, a closed public error-code enum, and accurate
  attempted/completed request counts.
- Discovery orchestration now shares one in-memory deduplication context seeded
  from the read-only database snapshot. Stable source order and the existing
  canonical URL/company/title/date rules prevent cross-source duplicate scoring,
  previews, profile totals, persistable totals, and vibe counts. Filtered and
  untargeted identities are included: a later accepted or targeted duplicate
  can promote the single identity, is scored at most once, and retains earlier
  sources as safe provenance. Combined unique totals are finalized from
  registry identities rather than duplicate-counter subtraction.
- `runDiscovery()` now returns a detached source-summary snapshot. Later shared
  context promotion updates internal registry accounting only; orchestration
  explicitly materializes a fresh final source view, so an earlier caller's
  counts, previews, persistence records, and provenance arrays do not mutate.
- Supported profile IDs are now an explicit readonly tuple, producing both a
  literal TypeScript union and runtime Zod validation without widening casts.
- Dashboard profile options are built server-side and passed as plain
  serializable IDs/labels. Behavioural tests cover badges, `Untargeted`, `ALL`,
  individual profile filters, and multi-profile rows without importing the
  ingestion runtime into client components.
- Verified provider inputs against current official documentation. Remotive
  uses its supported `software-dev` category in the morning and one broad
  `developer` search in the evening. Arbeitnow uses its normal page once; Lever
  caps each configured board at one request. Local matching remains authoritative and
  the documented recall limits remain explicit.
- Final automated verification for the bounded matcher/immutable-summary
  acceptance candidate: focused matcher/runner/orchestration coverage passed
  108/108 tests; the full suite passed 416/416 tests across 36 files; workspace
  build passed 6/6; standalone dashboard production build and strict TypeScript
  passed. No replacement live provider run was performed because the registered
  task wrapper and provider request behavior did not change.
- Historical registered Trigger.dev task
  `public-job-discovery-evening-dry-run` completed as run
  `run_06fqigvi9p0np4a1o5csdrov01`. Arbeitnow fetched 50 records in one request
  (45 remote-filter exclusions, 5 untargeted); Remotive fetched 36 records in
  one request (36 untargeted). The pre-fix Lever adapter timed out on Spotify
  and incorrectly stopped before Highspot and Aleph. There were zero profile
  matches, zero vibe-coding roles, zero
  low-code roles, zero scored/persistable jobs, and no persistence,
  applications, or submissions.
- Replacement registered evening task run
  `run_06fqiq5oifn5pbkmmlbqcgrg01` completed through Trigger.dev worker
  `20260728.38`. Arbeitnow made one completed request; Remotive made one
  completed request; Lever attempted and completed Spotify, Highspot, and Aleph
  exactly once each and reported `SUCCESS` with no failed companies. The run
  fetched 136 accepted records, classified 49 as untargeted, and identified one
  duplicate without scoring it again. It produced zero profile matches, zero
  vibe-coding roles, zero eligible/scored jobs, and zero jobs that would be
  persisted. `persistenceEnabled` was false; applications and submissions
  created were both zero.
- The replacement evening run above predates the final same-clause
  actor-attribution and pre-filter identity-registration changes. It remains
  evidence for the Trigger.dev wrapper and Lever isolation behavior, not a
  claim that the later deterministic matcher/registry code ran against live
  providers.
- SQLite was verified from copied before/after snapshots. `app.db` remained
  byte-identical at SHA-256
  `6BE8C92867401B5059933F102C69FB80BCC85493DD3D4725A92CCCD197780F38`;
  no WAL/SHM sidecars existed before or after. Counts remained jobs 9,
  job_scores 6, applications 0, and activity_log 0.

---

## Session — Phase 7.1B.1 Trigger.dev Manual Public-Job Discovery Orchestration

Added a manual Trigger.dev development task that orchestrates the committed
Arbeitnow, Remotive, and Lever discovery adapters through the shared discovery
runner. No cron schedule, Gemini extraction, browser automation, application
package, message, submission, or SQLite write behavior was added.

- Added `public-job-discovery-dry-run` in `src/trigger/public-job-discovery-dry-run.ts`
  with conservative retry, queue concurrency limit 1, TTL, and validation-error
  no-retry handling.
- Added shared orchestration in
  `packages/ingestion/src/discovery/orchestration.ts` plus extracted runtime and
  Lever company-selection helpers reused by the existing CLIs.
- The task accepts a strict Zod payload with per-source enable flags, query,
  remote-only filtering, per-source limits, and configured Lever companies only.
- Execution runs enabled sources sequentially, uses dry-run options only, opens
  local SQLite read-only for deduplication, catches per-source failures safely,
  and returns combined totals with at most five preview jobs per source and no
  descriptions.
- Added mocked orchestration tests covering defaults, validation, unknown Lever
  companies, sequential invocation, disabled sources, partial failure, combined
  totals, no persistence, no applications, safe output, no shell execution, no
  Gemini dependency, no cron attachment, and existing per-source limits.
- Documentation updated in `docs/PUBLIC_JOB_DISCOVERY.md`, `PROJECT_STATUS.md`,
  and `NEXT_ACTIONS.md`.
- Final verification passes: 311/311 tests, workspace build 6/6, standalone
  dashboard production build, dashboard strict TypeScript, and
  `git diff --check`.
- One manual Trigger.dev live dry run completed successfully as run
  `run_06fqhiridn3vvgm33oj7261n01` with default payload (`query: developer`,
  `remoteOnly: true`, all three sources enabled). Combined totals: 136 fetched,
  128 excluded by filters, 8 jobs that would be persisted, 0 persisted.
- Focused SQLite immutability verification confirmed the task does not modify
  original `app.db`, `app.db-wal`, or `app.db-shm` after the orchestration
  layer was updated to copy the database into a temporary read-only snapshot.
  An earlier inconclusive result was caused by unsafe `sqlite3 data/app.db`
  verification (possible WAL checkpoint) and by the pre-fix task opening the
  original files directly, which created empty WAL/SHM sidecars.
- SQLite row counts remained unchanged before and after the verified run (1
  job, 1 score, 0 applications, 0 activity).
- Cron scheduling remains deferred to Phase 7.1B.2.

---

## Session — Phase 7.1B.2 Trigger.dev Development Cron Scheduling

Added two development-only declarative schedules for public-job discovery while
keeping the manual task intact.

- Added `public-job-discovery-morning-dry-run` at `0 8 * * *` and
  `public-job-discovery-evening-dry-run` at `0 19 * * *`, both in
  `Asia/Manila` and `["DEVELOPMENT"]` only.
- Both scheduled tasks call one shared helper that invokes
  `runPublicJobDiscoveryDryRun()` with a fixed dry-run payload:
  `developer` query, remote-only, source limits 50/50/50, and Lever companies
  `spotify`, `highspot`, `aleph`.
- Shared queue concurrency was preserved across manual + scheduled discovery via
  one queue (`concurrencyLimit: 1`), with max attempts 2 and TTL `30m`.
- Dry-run safety remains unchanged: temporary SQLite snapshot reads only, no
  persistence, no applications/submissions, no Gemini, no shell spawning, and
  safe logs without full descriptions.
- Added mocked schedule-focused tests for cron/timezone/environment boundaries,
  shared helper usage, queue/retry/TTL constraints, no imperative scheduling,
  and safety guards.
- Trigger.dev development schedules require `pnpm trigger:dev` and a running
  local machine; production deployment/scheduling remains out of scope.

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
| Phase 7 — Limited Automation | 🟨 IN PROGRESS | Public adapters, profile-aware discovery, manual controlled persistence, verified extraction, and the gated DEVELOPMENT morning persistence path are implemented and live-validated; monitor additional daily morning runs before considering evening persistence, which remains disabled with production persistence |

---

## What's Built — 8 Packages + 1 App

| Package | Purpose | Tests |
|---|---|---|
| `@job-app/core` | Zod schemas (candidate, job, scoring) | Used by all |
| `@job-app/classification` | PH/intl category, work-setup, eligibility, dedup | 32 ✅ |
| `@job-app/scoring` | Hard rejection, 100-point factor scoring | 25 ✅ |
| `@job-app/resume` | Resume profiles, DOCX generation, cover letters, quality gates | 16 ✅ |
| `@job-app/db` | Drizzle ORM + SQLite (`dist` entry points, `exports`, `ensureSchema()` auto-provision) | Schema ready |
| `@job-app/ingestion` | Normalizer, pipeline, content cleaning, Gemini contracts, government enrichment, reusable public discovery, Arbeitnow, Remotive, Lever, manual + **URL-import adapter (SSRF-hardened)** | 274 ✅ |
| `@job-app/application` | Package builder, state machine, daily limits | 12 ✅ |
| `@job-app/dashboard` | Next.js productivity UI + hybrid Gemini importer + `ingestJob`-backed confirmation | 57 ✅ + build/runtime green |

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
