# Public Job Discovery

## Phase 7.1B.6B combined web-discovery strategy

Tavily Basic Search and Gemini Google Search are independent public-URL
discovery sources. Source selection is resolved once on the worker with exact
environment switches:

- `JOB_DISCOVERY_TAVILY_ENABLED=true`
- `JOB_DISCOVERY_GEMINI_SEARCH_ENABLED=true`
- `JOB_DISCOVERY_TAVILY_EXTRACT_ENABLED=true`
- `JOB_DISCOVERY_DEEP_SCAN_ENABLED=true`
- `JOB_DISCOVERY_ARBEITNOW_ENABLED=true`
- `JOB_DISCOVERY_REMOTIVE_ENABLED=true`
- `JOB_DISCOVERY_LEVER_ENABLED=true`

Only exact lowercase `true` enables a feature or source. Arbeitnow, Remotive,
and Lever remain available for explicit controlled comparison but are disabled
by default. They are optional sources, not fallbacks. A web-source limit or
outage never activates them. If every discovery source is disabled, the shared
collector returns `NO_DISCOVERY_SOURCES_ENABLED` with no network, model, job
persistence, application, or submission operation.

The root worker `.env.local` owns `GEMINI_API_KEY`, `GEMINI_MODEL`,
`GEMINI_SEARCH_MODEL`, `TAVILY_API_KEY`, the four web feature switches, the
three optional legacy-source switches, and the Tavily/Gemini Search quota
caps. The Next.js `apps/dashboard/.env.local` remains limited to server-side
`TRIGGER_SECRET_KEY` and `JOB_DISCOVERY_DASHBOARD_SCAN_ENABLED`. Real files are
ignored; tracked `.env.example` files contain empty secrets and disabled
switches. No provider key, model configuration, quota, or source switch is
placed in `NEXT_PUBLIC_*` state or a browser bundle.

Dashboard classifications are informational and contain no currency estimate:

- Tavily Basic Search — API credits
- Tavily Basic Extract — API credits
- Gemini Search — API quota
- Gemini verification — model API usage
- Arbeitnow public feed — `FREE`
- Remotive public feed — `FREE`
- Lever public postings — `FREE`, limited to configured company boards

### Cached/fresh queries and source boundaries

- Four fixed eight-intent groups cover entry-level software, mobile/backend,
  AI/workflow automation, and direct employer/ATS vacancies. Gemini never
  invents or expands them. Fresh group selection is deterministic from the
  PHT date, active profiles, six-hour cache state, and persisted recent group
  history. It avoids the last group while another eligible group exists.
- `CACHED` is the dashboard default. Valid Tavily and Gemini Search caches are
  reused without fresh search quota, so repeated scans can intentionally show
  identical results. `FRESH` rotates to another eligible group. When all four
  were run within six hours, `QUERY_GROUPS_RECENTLY_EXHAUSTED` requires an
  explicit override before quota is spent on the oldest group.
- Normal fresh scans run enabled Tavily Basic Search and Gemini Search together
  and independently, up to eight requests/prompts each. They merge canonical
  URL attribution as `TAVILY`, `GEMINI_SEARCH`, or `BOTH`, then stop at 250
  combined unique URLs. One source failure does not stop the other.
- Tavily remains Basic Search only: no generated answer, raw-content search,
  images, Advanced Search, Crawl, Map, or Research. Gemini Search uses only the
  explicitly configured `GEMINI_SEARCH_MODEL` and supported Google Search
  grounding. Its generated text is discarded.
- Tavily snippets and Gemini Search text are URL leads only. Each URL must pass
  HTTP/HTTPS/public-network and unsafe-page checks, canonicalization, and
  original-page retrieval with SSRF/redirect/size/timeout protection.
- Original-page parsing prefers JSON-LD `JobPosting`, then attributable known
  ATS/employer metadata, then conservative page extraction. A job needs title,
  employer, canonical URL, and meaningful original-page text. Unparseable
  pages cannot reach matching, verification, or persistence.
- Tavily Basic Extract is fetch recovery only after eligible direct retrieval
  fails or yields an unusable public job body. It is never used for login,
  authentication, CAPTCHA, private/internal, search, submission, unsafe
  redirect, or prohibited pages. Recovered content must pass the same
  attributable-candidate checks and raw provider responses are not stored.
- Tavily Search and Extract share a persistent transactional 30-credit PHT-day
  and 900-credit PHT-month budget. Extract usage comes from provider response
  metadata. Gemini Search has a separate persistent 60-prompt PHT-day cap.
  Caps apply across dashboard, scheduled, controlled, and diagnostic entries.
- Preview may spend search/extract quota only when fresh work is requested, but
  makes zero verification calls, writes no jobs, and consumes no job slots.
  Save calls verification only for final new saveable matches and retains the
  shared five-job PHT-day cap and all-or-nothing persistence boundary.

### Deep Web Scan

Deep Web Scan is `DEVELOPMENT`-only, requires
`JOB_DISCOVERY_DEEP_SCAN_ENABLED=true` plus explicit confirmation, and is
preview-only by default. It uses the same four fixed groups and enabled web
sources, stops at a hard cap of 1,000 unique canonical public URLs, and does
not promise to find that many. It allows at most 40 Tavily Search requests, 40
Gemini Search prompts, 200 Extract attempts/recoveries, and 100 page attempts
per batch, subject to the smaller remaining daily/monthly quotas. Original-page
fetches use global concurrency five and per-host concurrency one.

Only one Deep Scan may start in a rolling seven Asia/Manila days. Persistent
idempotency, cooldown, cancellation, and body-free batch checkpoints survive
worker restarts. `Cancel future batches` stops unstarted work but cannot
interrupt an active atomic persistence transaction. Optional `Verify and save
top new matches` is unchecked by default; when explicitly selected it verifies
at most ten new matches and saves no more than the existing daily job capacity.
No mode creates or submits an application.

Dashboard metrics distinguish query group/cache strategy, each search source,
cross-source URL deduplication, direct-page parsing, Extract recovery, profile
matches, existing matches, new saveable matches, selected verification calls,
and saved jobs. Actual token usage is shown when reported; otherwise it says
`Usage unavailable`. Live Phase 7.1B.6B validation remains pending.
Final combined mocked verification passed 632/632 tests, the 6/6 workspace
build, standalone dashboard production build, dashboard/ingestion strict
TypeScript, and the client-bundle security scan. The build is deployable, but
production-mutating discovery remains intentionally disabled by the existing
environment and exact-switch gates pending a separate production rollout. No
provider or model call was made by final release verification.

## Phase 7.1A scope

Phase 7.1A originally proved structured discovery before Trigger.dev
scheduling. Its Arbeitnow, Remotive, and selected Lever adapters remain intact,
but Phase 7.1B.6A and 6B disable them by default behind independent exact switches.

The flow is:

```text
public source adapter
  -> source envelope and per-record Zod validation
  -> common DiscoveredJob contract
  -> deterministic RawJobInput mapping
  -> existing ingestJob pipeline
  -> optional atomic persistence
  -> structured run summary
```

Normalization, category classification, work-setup classification, eligibility,
hard rejection, deduplication, scoring, and job/score persistence remain shared
with the manual importer. The discovery code does not create application,
resume, cover-letter, email, message, or submission records.

## Arbeitnow source

- Official API documentation:
  https://www.arbeitnow.com/blog/job-board-api
- Fixed API endpoint:
  https://www.arbeitnow.com/api/job-board-api
- Authentication: none; the official API requires no key.
- Attribution: source name and canonical Arbeitnow job URL are retained.
- Pagination: the adapter increments only the fixed endpoint's `page` query
  parameter. It never follows arbitrary pagination or employer hosts.
- Runtime limits: at most three pages and at most 50 accepted source jobs.
- Requests: descriptive User-Agent and a bounded ten-second timeout.
- Content: descriptions are cleaned with the existing HTML content cleaner.
- Exclusions: no linked-page crawling, authentication, CAPTCHA bypass, browser
  automation, or rate-limit bypass.

The source response is structured, so Gemini is not used.

## Remotive source

- Official API documentation:
  https://github.com/remotive-io/remote-jobs-api
- Official source and terms page:
  https://remotive.com/remote-jobs/api
- Fixed API endpoint:
  https://remotive.com/api/remote-jobs
- Authentication: none; the public API requires no key.
- Attribution: source name and the canonical Remotive job URL are retained.
- Runtime limit: at most 50 accepted source jobs in one request.
- Requests: descriptive User-Agent and a bounded ten-second timeout.
- Rate guidance: Remotive advises no more than four fetches per day and blocks
  excessive traffic above two requests per minute. Phase 7.1A.2 performs only
  an explicit manual request.
- Content: HTML descriptions are cleaned with the existing content cleaner.
  Structured tags and scalar fields are preserved without webpage-noise
  filtering.
- Exclusions: no employer/application-link crawling, redistribution to
  third-party job boards, authentication, CAPTCHA bypass, browser automation,
  or rate-limit bypass.

Remotive's public feed is delayed by 24 hours. The source response is
structured, so Gemini is not used.

## Lever source

- Official Postings API documentation:
  https://github.com/lever/postings-api
- Official access guidance:
  https://hire.lever.co/developer/support
- Fixed global API endpoint:
  `https://api.lever.co/v0/postings/{configured-site}`
- Authentication: none for read-only retrieval of published postings.
- Company-specific discovery: Lever does not provide a global feed. Phase
  7.1A.3 uses only the versioned, live-verified configuration in
  `packages/ingestion/src/discovery/lever-companies.v1.ts`.
- Verified initial boards (2026-07-28): Spotify (`spotify`), Highspot
  (`highspot`), and Aleph (`aleph`).
- Pagination: only documented `skip` and `limit` parameters are constructed on
  the fixed API host. The adapter does not follow source-provided API URLs.
- Runtime limits: at most ten configured companies and 100 accepted jobs across
  one run.
- Requests: descriptive User-Agent and a bounded ten-second timeout per
  request.
- Failure isolation: each configured company board has an independent failure
  boundary. A timeout, non-2xx response, or invalid response from one board
  does not stop later boards or discard jobs from earlier successful boards.
  Scheduled orchestration attempts each configured board at most once and
  reports only the configured site ID plus a safe error code.
- Content: opening, description, requirements/list sections, and additional
  rich text are cleaned using the existing content cleaner.
- Workplace variants: Lever's public Postings documentation uses `on-site`,
  while its official developer documentation also defines `onsite`. The source
  schema explicitly accepts both and deterministically normalizes `onsite` to
  canonical `on-site`. Other unknown values remain invalid.
- Identity and attribution: the stable Lever posting ID and canonical
  `jobs.lever.co` hosted-job URL are retained. The application-form URL is not
  fetched or submitted.
- Exclusions: no arbitrary sites or hosts, internal/hidden posting access,
  employer-site crawling, application-form retrieval, login, cookies, CAPTCHA,
  browser automation, rate-limit bypass, or application submission.

The structured Lever response is mapped deterministically. Gemini is not used.
An explicit Lever workplace type, or a location that explicitly says remote,
may establish work setup for filtering; it does not establish Philippine
country eligibility.

## Arbeitnow CLI

Dry run is the default:

```powershell
pnpm discovery:arbeitnow
pnpm discovery:arbeitnow -- --limit 10 --pages 1 --remote-only
pnpm discovery:arbeitnow -- --query "typescript"
```

Persistence must be requested explicitly:

```powershell
pnpm discovery:arbeitnow -- --apply
```

Apply mode was not run during Phase 7.1A implementation.

Supported options:

- `--limit <1-50>`
- `--pages <1-3>`
- `--remote-only`
- `--query <text>`
- `--apply`
- `--help`

## Remotive CLI

Dry run is also the default:

```powershell
pnpm discovery:remotive -- --limit 20
pnpm discovery:remotive -- --limit 50 --query "developer"
pnpm discovery:remotive -- --category "software-dev"
```

Persistence must be requested explicitly:

```powershell
pnpm discovery:remotive -- --apply
```

Apply mode was not run during Phase 7.1A.2 implementation.

Supported options:

- `--limit <1-50>`
- `--query <text>`
- `--category <text>`
- `--apply`
- `--help`

Remotive is remote-only, so it does not expose a redundant `--remote-only`
option. Query matching runs locally across title, company, category, tags,
candidate location, and cleaned description. Category accepts a
case-insensitive category name or slug.

## Lever CLI

List the configured seed without making a network request:

```powershell
pnpm discovery:lever -- --list-companies
```

Dry run is the default, and either a configured company selection or
`--all-companies` is required:

```powershell
pnpm discovery:lever -- --company spotify --limit 25
pnpm discovery:lever -- --company spotify --company highspot --remote-only
pnpm discovery:lever -- --all-companies --query "developer" --limit 100
```

Persistence must be requested explicitly:

```powershell
pnpm discovery:lever -- --company spotify --apply
```

File-backed apply mode was not run during Phase 7.1A.3 implementation.

Supported options:

- `--company <configured-id-or-name>` (repeatable)
- `--all-companies`
- `--list-companies`
- `--limit <1-100>`
- `--remote-only`
- `--query <text>`
- `--apply`
- `--help`

Unknown or disabled companies, URLs, arbitrary hosts, and selections above ten
companies are rejected before fetching. Query matching runs locally across
title, company, team, department, location, commitment, and cleaned
description.

Dry runs open the existing SQLite database read-only for deduplication. They do
not initialize schema or write database/WAL state. The summary omits full job
descriptions and prints at most ten concise previews.

## Status and approval boundary

The repository does not define `AWAITING_REVIEW`. Its existing equivalent is
`DISCOVERED`, which the dashboard renders and counts as requiring review.
Successfully scored public discoveries are therefore persisted with
`DISCOVERED`. Deterministically rejected jobs use `HARD_REJECTED`.

Discovery never creates an `applications` row. Human review remains required
before shortlist, resume generation, or any future application action.

## Phase 7.1B Trigger.dev development scheduling

Phase 7.1B.1 adds a manual Trigger.dev development task that orchestrates the
existing Arbeitnow, Remotive, and Lever discovery adapters through the shared
discovery runner. It is dry-run only and never creates applications or
submissions.

### Trigger.dev manual development orchestration

Task id: `public-job-discovery-dry-run`

The task lives in `src/trigger/public-job-discovery-dry-run.ts` and calls the
shared orchestration entry point in
`packages/ingestion/src/discovery/orchestration.ts`. It reuses the existing
adapters, filters, scoring, deduplication, and summary contracts. It does not
spawn shell commands, duplicate discovery logic, or write to SQLite.

Payload defaults:

- all three sources enabled
- `query`: `developer`
- `remoteOnly`: `true`
- Arbeitnow and Remotive limits: `50`
- Lever limit: `50`
- Lever companies: `spotify`, `highspot`, `aleph`

Unknown payload properties, arbitrary Lever hosts/URLs, unknown Lever companies,
and out-of-range limits are rejected with Zod validation.

Manual development runs require the Trigger.dev dev CLI to remain running:

```powershell
pnpm build
pnpm trigger:dev
```

Dry-run orchestration copies `data/app.db` and any existing WAL/SHM sidecars into a
temporary read-only snapshot before opening SQLite. This prevents Trigger.dev task
runs from creating or mutating the original database files while still allowing
deduplication against current saved jobs.

Then trigger `public-job-discovery-dry-run` from the Trigger.dev dashboard or
another authenticated Trigger.dev client. Do not use `--apply` or any
persistence option from this task. The task always returns:

- `mode: DRY_RUN`
- per-source structured summaries with at most five preview jobs and no
  descriptions
- combined totals
- `persistenceEnabled: false`
- `applicationsCreated: 0`
- `submissionsCreated: 0`

Retry and concurrency settings are conservative: two attempts maximum, short
exponential backoff, queue concurrency limit of one, and a TTL that prevents
stale queued discovery runs. Deterministic validation errors are not retried.

### Trigger.dev development declarative schedules (Phase 7.1B.2)

Two development-only declarative schedules are attached with `schedules.task()`:

- `public-job-discovery-morning-dry-run`
  - cron: `0 8 * * *`
  - timezone: `Asia/Manila`
  - environments: `["DEVELOPMENT"]`
- `public-job-discovery-evening-dry-run`
  - cron: `0 19 * * *`
  - timezone: `Asia/Manila`
  - environments: `["DEVELOPMENT"]`

The schedules use different fixed profile payloads and retrieval hints. Morning
targets software development and AI automation, while evening targets
AI-augmented development and low-code/no-code. Both remain remote-only with
50/50/50 source limits and configured Lever boards
`spotify`/`highspot`/`aleph`. Manual Trigger.dev payload defaults and the
source-specific manual CLIs remain separate controls.

Development schedules trigger only while the Trigger.dev dev CLI is running,
and the local PC must be running for those scheduled runs to execute. These
schedules never enable application submission. The evening schedule always
calls the dry-run helper. As of Phase 7.1B.5A, morning still calls that helper
by default but may enter controlled persistence only in `DEVELOPMENT` when
`JOB_DISCOVERY_SCHEDULED_PERSISTENCE_ENABLED` is exactly lowercase `true`.

## Phase 7.1B.3 Job Search Profiles / Category-Aware Discovery

Phase 7.1B.3 replaces single-keyword targeting with deterministic, versioned
job-search profiles while keeping all Trigger.dev schedules development-only and
dry-run-only.

- Profile configuration is versioned and validated in
  `packages/ingestion/src/discovery/job-search-profiles.v1.ts`.
- Active profile IDs are strongly typed and validated; unknown IDs and unknown
  payload properties are rejected.
- Manual Trigger payload controls are preserved (source toggles, limits,
  remote-only, Lever companies, query/category), with `profileIds` added as a
  validated optional selector.
- Arbeitnow and Remotive are each fetched once per scheduled run. Lever is
  invoked once and attempts each configured company board at most once.
  Fetching is never multiplied by profile count.
- Deterministic retrieval hints are schedule-group specific (morning vs
  evening) and provider-local-profile matching remains authoritative.
- Sources that cannot express combined server-side queries are still fetched
  once from their normal feed; recall limitations are documented in retrieval
  hint notes.
- Every valid adapter-normalized source candidate is normalized for identity
  and registered before remote-only, query, or category filters. A filtered
  variant remains unscored and unpersisted, but its source identity and safe
  provenance remain available to later source variants.
- Jobs that pass local filters but match no active profile are summarized as
  `UNTARGETED`, remain unscored, and are not persistence candidates.
- Every match carries at least one deterministic primary evidence item.
  Evidence uses only short configured phrases such as `title_phrase`,
  `title_role`, `applicant_responsibility`, or
  `applicant_contextual_phrase`; source description passages are never copied
  into summaries. The matcher is a bounded deterministic grammar that
  prioritizes precision over recall. Primary evidence comes only from an
  explicit profile-specific technical title or a complete applicant-attributed
  clause matching a configured direct action followed by a technical object
  within a small fixed token bound. Imperative clauses qualify only as bullets
  inside an explicit responsibilities section. HTML blocks/list items and
  punctuation boundaries are separated before matching, and later headings end
  the section. Separate description clauses, tags, skills, category, team, and
  department fields are never combined to construct primary evidence; those
  fields can add only short supporting evidence after a primary match exists.
  Unusual wording and unsupported grammatical forms may be missed.
- `ai_augmented_development` requires explicit AI-assisted coding or
  development language. Generic AI, software, product, Cursor, Copilot, prompt,
  media, marketing, content, video, editing, or design wording is insufficient.
  Tool names may supplement an explicit contextual match but cannot create one.
- `Vibe-coding roles found` is counted from actual matched job evidence. Merely
  configuring `vibe coding` as a profile phrase never increments the count.
- Existing deterministic eligibility, hard rejection, scoring, recommendation,
  and deduplication logic remains authoritative for targeted jobs.
- One orchestration-scoped in-memory deduplication context starts with the
  read-only SQLite snapshot and is shared in stable Arbeitnow, Remotive, Lever
  order. Filtered, targeted, untargeted, hard-rejected, and persisted-existing
  identities from an earlier source participate in the same
  existing canonical URL/company/title/date deduplication rules for later
  sources. Cross-source duplicates are not scored, previewed, or counted as
  persistable/profile/vibe matches twice.
- When an earlier occurrence is filtered or untargeted and a later equivalent
  occurrence has valid primary profile evidence, the single identity is
  deterministically promoted to the later targeted record and scored once.
  The earlier source is reclassified as a duplicate/provenance supplier, and
  the combined preview retains it in `additionalSourceNames`. Filtered plus
  filtered remains one unscored identity; filtered plus untargeted becomes one
  untargeted identity; a later duplicate of an already targeted identity is
  never rescored.
- Per-source fetched/accepted counts continue to describe provider input.
  Duplicate and untargeted source accounting is updated when promotion occurs,
  while combined accepted/persistable/scored/profile/vibe totals are finalized
  directly from unique registry identities rather than inferred by subtracting
  source duplicate counters.
- `runDiscovery()` returns an immutable snapshot of that source run. Later
  variants update only internal registry accounting. Orchestration materializes
  fresh final source summaries after all enabled sources finish, preserving
  promotion/provenance without changing previously returned summary objects.
- Future apply-mode metadata is backward-compatible: matched profile IDs are
  stored additively under `targeting.matchedProfileIds` inside the existing
  `raw_snapshot` JSON. No schema migration is required.
- Dashboard profile badges/filters are derived server-side at read-time from
  stored data and deterministic matching fallback, without mutating saved rows.

Schedule retrieval remains one adapter run per source and one request per
configured Lever board for the fixed 50-job scheduled payload:

- Arbeitnow exposes no suitable full-text job query, so its latest remote page
  is fetched once and filtered locally. Recall is limited to that page window.
- Remotive officially supports `category` and `search`. Morning uses the
  `software-dev` category; evening uses one broad `developer` search with no
  category. The latter can miss low-code builder roles without developer
  wording, and both remain subject to the 50-job ceiling.
- Lever has no full-text search endpoint. Each configured board is attempted
  once and filtered locally; roles outside those board results cannot be
  recalled. Board outcomes are reported as `SUCCESS`, `PARTIAL_SUCCESS`, or
  `FAILED`, with attempted/completed request counts and safe failed-board IDs.

Provider hints only narrow retrieval. Deterministic local profile matching is
always authoritative.

The latest actual Trigger.dev evening verification run predates the final
pre-filter registry work and this bounded matcher/immutable-summary fix. These
deterministic changes are verified through automated matcher, runner,
orchestration, adapter, dashboard, and schedule tests plus production builds;
they are not represented as a replacement live provider run.

## Phase 7.1B.4A Controlled persistence gate

Task ID: `public-job-discovery-controlled-persistence`

This manually triggered task has no cron schedule. It remains independent from
the separately gated Phase 7.1B.5A morning schedule. Evening continues to call
only `runPublicJobDiscoveryDryRun()` with its fixed dry-run payload.

All independent persistence gates must pass before any provider fetch or
database access:

1. Trigger.dev environment type is `DEVELOPMENT`.
2. Process-local `JOB_DISCOVERY_CONTROLLED_PERSISTENCE_ENABLED` is exactly
   `true`.
3. The strict payload requests `persistenceMode: "CONTROLLED"`.
4. `maxJobsToPersist` is an integer from 1 through 5.
5. The executing task ID is the dedicated controlled-persistence task.

The strict payload contains only `scheduleGroup`, `persistenceMode`,
`maxJobsToPersist`, and a bounded `idempotencyKey`. It rejects unknown fields;
callers cannot supply profiles, matcher rules, provider hosts, applications,
submissions, documents, or secrets. MORNING always uses
`software_development` plus `ai_automation` and its existing retrieval hints;
EVENING uses the existing AI-augmented/low-code pair.

Every source still runs through adapter validation, pre-filter shared identity
registration, local filters, evidence-backed profile matching, deterministic
hard rejection/scoring, and cross-source deduplication. Only the finalized
registry persistence candidates are considered. The existing contract includes
both scored `DISCOVERED` jobs and deterministic `HARD_REJECTED` records; this
phase does not add a score threshold or change that established behavior.

The candidate cap is enforced by Zod, before repository invocation, and again
inside the repository. Selection follows stable source/registry order. The
repository rechecks the live database with the existing canonical/semantic
deduplication logic immediately before each insert.

Selected job/score/extraction inserts, persistent daily-budget reservation, and
a completion record are one SQLite transaction. A completed idempotency key
returns `ALREADY_COMPLETED` and writes nothing. Phase 7.1B.5A adds the unique
`job_discovery_persistence_runs` ledger and database-level daily-limit trigger,
so manual and morning scheduled persistence share one durable PHT-day budget
across worker restarts. Callers should still pass the same payload key as
Trigger.dev's task-level idempotency key.

The task has queue concurrency one, `maxAttempts: 1`, a 30-minute TTL, and a
600-second maximum duration. A task failure is never automatically retried
after an ambiguous persistence outcome. Partial provider success may still
produce candidates from successful sources, but the selected database batch is
atomic.

Phase 7.1B.4A itself created no applications or submissions and originally had
no Gemini/LLM dependency. Phase 7.1B.4B additively places one verified
requirements-extraction call after final unique candidate selection and before
future controlled writes. It remains bounded to at most five selected jobs,
fails closed on extraction error, and still has no application, email, browser,
resume, cover-letter, login, CAPTCHA, or form-submission dependency. Production
and evening scheduled persistence remain disabled.

The required one-time DEVELOPMENT validation completed through the registered
task as run `run_06fqk1omnhaft7a9ipea2iqc01` with status `COMPLETED`. The
MORNING group activated `software_development` and `ai_automation`. Arbeitnow,
Remotive, and Lever fetched 136 records in total; the finalized registry
qualified five persistence candidates. All five were selected and persisted,
one corresponding score was written, no candidate was skipped by the cap, and
the final database write found zero duplicates.

Copied SQLite snapshots verified the result without querying the live database:
jobs changed from 9 to 14, job scores from 6 to 7, applications remained 0,
and the activity log changed from 0 to 1 for the controlled-run completion
ledger. No pre-existing job or score row changed. The task reported zero
applications and zero submissions. The same bounded idempotency key,
`phase-7-1b4a-20260729-023908107`, was used at both payload and Trigger.dev
task level, and the task was triggered exactly once.

This historical validation did not itself enable recurring writes. Phase
7.1B.5A later adds independently gated DEVELOPMENT morning persistence;
evening and production persistence remain disabled.

## Phase 7.1B.4B verified requirements enrichment

The controlled-persistence order is now:

1. fetch and provider validation;
2. pre-filter shared identity registration;
3. filters and evidence-backed profile matching;
4. deterministic deduplication and persistence-candidate finalization;
5. select at most five in stable registry order;
6. deterministic requirement-candidate enumeration for each selected job;
7. one server-only Gemini classification decision per candidate ID;
8. strict Zod/ID-set parsing and independent exact-evidence verification;
9. recompute only from individually verified facts;
10. one atomic controlled write.

Filtered, untargeted, duplicate, and unselected candidates never call Gemini.
An extraction failure blocks the entire selected write batch and does not pull
in a nondeterministic replacement. Evening remains dry-run-only; the morning
schedule can reach this verified extraction boundary only behind the Phase
7.1B.5A DEVELOPMENT gate.

Gemini is a candidate classifier, not the source of truth. Deterministic code
owns candidate evidence and explicit salary/experience numbers. The model must
classify every supplied candidate ID exactly once and cannot add evidence or
scalar values. Local code independently checks candidate-set equality,
required/preferred cues, safe aliases, geographic restriction wording, and
collaboration timezone wording. Only individually `VERIFIED` facts may
influence scoring or hard rejection. Partial, conflict, and review facts remain
visible but inert.

The final Phase 7.1B.4B copied-snapshot validation and apply used the explicit
primary `gemini-3.5-flash-lite` requirements model with no fallback. Spotify
stores verified 3 years, USD 132949–189927 plus equity, North America, Eastern
Standard Time, the complete required baseline concept list, and preferred
data-engineering/Scala. The salary aggregate is `PARTIAL`, not `CONFLICT`,
because the pay period is not stated.

The accepted all-14 shadow produced 14 valid extraction results with zero
unsupported accepted facts. The one all-or-nothing apply wrote all 14
extractions, updated six score rows, removed PSA's score when verified expiry
`2026-07-28` produced `EXPIRED`, and added one separate reprocessing activity
entry. Final counts are 14 jobs, 6 scores, 0 applications, 2 activity entries,
and 14 extraction rows. Existing hard-rejected jobs were not promoted; the
garden3d salary and PSA employment conflicts did not affect automated
decisions. A subsequent dry-run made 0 Gemini calls, skipped all 14 unchanged
hashes, and wrote nothing.

This completed local reprocessing did not itself enable discovery persistence
on a schedule. Phase 7.1B.5A later adds an independently gated DEVELOPMENT
morning path; evening and production persistence remain disabled. Gemini is not
treated as infallible: the guarantee is strict fail-closed verification, not
perfect extraction accuracy.

## Phase 7.1B.5A DEVELOPMENT morning scheduled persistence

Phase 7.1B.5A preserves the existing morning task ID, `0 8 * * *`
Asia/Manila cron, DEVELOPMENT-only registration, concurrency-one queue,
30-minute TTL, and 600-second duration. Morning uses `maxAttempts: 1` and is
dry-run by default. Controlled persistence requires all of these conditions:

1. Trigger.dev reports the `DEVELOPMENT` environment.
2. `JOB_DISCOVERY_SCHEDULED_PERSISTENCE_ENABLED` is exactly lowercase `true`.
3. The fixed morning task ID is executing.
4. The Asia/Manila daily ledger has remaining capacity.

The scheduled switch is intentionally separate from the manual controlled
switch. Morning uses only the fixed `software_development` and `ai_automation`
profiles and established retrieval hints; callers cannot provide alternate
persistence controls.

The additive `job_discovery_persistence_runs` table records a unique
idempotency key, Philippine date, task ID, run kind, persisted count, and
timestamps. Manual controlled runs and morning scheduled runs share a daily
limit of five persisted jobs. Remaining capacity is rechecked in the same
SQLite transaction as the ledger reservation, jobs, scores, verified
extractions, and completion activity. A database trigger rejects a reservation
that would take the PHT-date sum above five, preserving the cap across process
restarts and racing writers that use this repository.

The scheduled idempotency key is derived from the fixed task identity,
`MORNING`, and Philippine calendar date. A repeat returns
`ALREADY_COMPLETED` before provider or Gemini calls. An exhausted daily budget
returns `DAILY_CAP_REACHED` at the same early boundary. Final database
duplicates do not consume capacity. Any source or extraction failure produces
no job, score, extraction, activity, or budget write.

The evening task remains DEVELOPMENT-only and DRY_RUN-only and cannot reserve
daily budget. Production persistence remains disabled. No applications,
submissions, resumes, cover letters, messages, email, or browser automation are
part of either controlled persistence path.

The registered DEVELOPMENT validation run
`run_06frj6g5id1v7jt47pv73m7e01` completed for Philippine date `2026-08-01`.
It fetched 134 provider records and found zero matches for the fixed morning
profiles, so it selected and persisted zero jobs and made zero Gemini calls.
This is a valid safe outcome: jobs, scores, applications, and extractions were
unchanged; activity increased once for the scheduled completion; and the
ledger recorded zero persisted jobs with all five daily slots remaining. No
duplicate identity, partial write, application, submission, or second run was
created.

The completed key
`public-job-discovery-morning-dry-run:MORNING:2026-08-01` causes the normal
later 8:00 AM execution on the same Philippine date to return
`ALREADY_COMPLETED` before provider or Gemini calls. Focused coverage passed
46/46; the full suite passed 489/489 across 41 files, workspace build passed
6/6, standalone dashboard build and dashboard/ingestion strict TypeScript
passed, and `git diff --check` passed. Additional daily morning runs should be
monitored before evening persistence is considered.

See `docs/JOB_REQUIREMENTS_EXTRACTION.md` for the detailed data model and
verification contract.

## Phase 7.1B.5C dashboard manual scans

Task ID: `public-job-discovery-dashboard-scan`

The dashboard Overview page exposes one compact `Scan Jobs` action with three
explicit modes and a cached/fresh discovery choice for normal scans:

- `Preview Scan` runs the existing source adapters, validation,
  orchestration-wide identity deduplication, local filters, fixed morning
  profile matching, and matcher-audit summaries. It performs zero requirements
  Gemini calls, writes zero jobs, and does not reserve a daily save slot. It
  therefore remains usable when the PHT-day save budget is exhausted.
- `Scan & Save` uses the same fixed morning profiles and existing verified
  persistence sequence: unique persistence-candidate selection, at most five
  candidate-first Flash-Lite calls, deterministic verification, recomputation
  from verified facts only, and one all-or-nothing SQLite transaction. It
  shares the persistent five-job Asia/Manila-day budget with scheduled morning
  and manual controlled runs.
- `Deep Web Scan` is explicitly confirmed, development-only, preview-only by
  default, and subject to its seven-PHT-day cooldown plus the 1,000-URL hard
  cap. Its optional verification/save checkbox is off by default.

`Use cached results` is the normal default and can intentionally repeat recent
listings at zero fresh Search/prompt quota when all selected caches are valid.
`Use fresh web results` rotates to another deterministic fixed group and may
consume Tavily and Gemini Search quota. Neither option guarantees new jobs.

The unscheduled dashboard task is registered on the same concurrency-one queue
as the existing discovery tasks, with one task attempt, a 30-minute TTL, and a
600-second maximum duration. It requires `DEVELOPMENT`, its dedicated task ID,
and `JOB_DISCOVERY_DASHBOARD_SCAN_ENABLED` exactly equal to lowercase `true`.
This switch is separate from
`JOB_DISCOVERY_SCHEDULED_PERSISTENCE_ENABLED` and
`JOB_DISCOVERY_CONTROLLED_PERSISTENCE_ENABLED`; none is exposed to client code.

The strict payload contains a closed mode (`PREVIEW`, `SAVE`, or `DEEP`), the
cached/fresh choice, bounded confirmation flags, and a bounded idempotency key.
Server routes require same-origin POST semantics, trigger only the fixed task
ID, return only closed progress/result contracts, expose a safe future-batch
cancellation action for Deep Scan, and permit one active dashboard scan per
dashboard server process. Trigger.dev task
idempotency and the SQLite ledger remain authoritative across process restarts.
The shared queue prevents dashboard and scheduled write operations from running
concurrently, while the SQLite transaction and daily-limit trigger enforce the
durable write cap.

The modal reports named stages rather than fake percentages. Completed results
include query/cache choice, Search/Extract quotas, URL attribution and
deduplication, direct/recovered/rejected pages, profile/near-match counts, safe
source failures, selected and persisted counts, remaining daily slots, and
elapsed time. Requirements Gemini calls aggregate actual provider
`usageMetadata` for input, output, and total tokens. If metadata is absent or a
call fails before returning it, the affected totals are `null` and the UI shows
`Usage unavailable`; the system never estimates tokens.

Phase 7.1B.6B did not run a live dashboard scan or external provider/model
call. Combined search, Extract, Deep Scan, persistence, and UI behavior were
verified with deterministic mocks. An early focused test may have written only
mock web cache/usage/query-history rows to the default local SQLite store before
the injected-repository fallback was changed to in-memory; no job-persistence
repository was used. That web-ledger state was not inspected or cleaned in this
phase. All subsequent tests use isolated stores. Live 6B validation remains
pending.
The independent 08:00 DEVELOPMENT morning schedule continues to operate under
its own switch. Evening remains DRY_RUN-only, production persistence remains
disabled, and no application/submission/document/messaging automation is part
of the dashboard task.

## Phase 7.1B.5B profile-matcher coverage audit

The profile coverage audit is a diagnostic-only view over the existing morning
orchestration. It does not change local filters, profile rules, deduplication,
scoring, or persistence. It records a safe reason at each actual boundary:

1. source validation;
2. normalization;
3. deduplication;
4. local filters;
5. deterministic profile matching;
6. the existing ingestion pipeline.

Reason codes are closed and include invalid record, duplicate, excluded title,
employment/location exclusion, seniority/experience rejection, unrelated role
family, insufficient positive evidence, conflicting negative evidence,
untargeted, and a safe existing-reason fallback. Counts are diagnostic events
and can overlap when a source record is both filtered and a known duplicate.
Near-match output contains title, company, source, short configured signal
labels, exact blocker, and blocker timing; it never contains descriptions.

The single Phase 7.1B.5B live dry-run fetched 134 records: Arbeitnow 50,
Remotive 34, and Lever 50. All passed provider validation. After canonical
identity handling there were 105 unique accepted candidates at this provider
snapshot. Local filters excluded 112 source variants: 47 Arbeitnow and 41
Lever records had no explicit remote indicator, and 24 Remotive records had a
category other than the fixed local `software-dev` category. Twelve candidates
reached profile matching and remained untargeted.

For Software Development, 30 unique candidates had at least one configured
signal and nine had valid primary title evidence before local filtering and
database deduplication. Four of those nine were location-filtered and five were
already-saved duplicates (four LawnStarter variants and one A.Team role), so
zero new unique match reached scoring. Representative pre-match exclusions
included Idnow and Walaris software-engineer roles plus two Highspot principal
software-engineer roles. The near-match list also exposed precision-safe title
coverage gaps such as Android Engineer and a Full-Stack Rails Engineer.

For AI Automation, 13 candidates had supporting signals and zero had valid
primary evidence. Lemon.io AI/LLM/technology text, source categories, and a
sales/operations role mentioning Zapier or Power Automate were correctly
insufficient. This is primarily a current-pool/retrieval limitation, not proof
that supporting evidence should be promoted to primary evidence.

The dry-run made zero Gemini calls, wrote zero jobs/scores, and created zero
applications or submissions. The root cause is mixed: restrictive explicit
remote/category filters and existing duplicates removed all current software
hits; the available pool lacked a valid AI Automation role; and a small exact
software-title coverage gap exists. No normalization defect was found. The
recommended next change is a separately reviewed, test-backed exact-title
addition beginning with Android Engineer, plus an independent review of the
single-request Remotive category recall tradeoff. Broad matcher loosening is
not recommended.

## Separate freelance opportunity discovery (Phase 7.1B.7A)

Freelance discovery is separate from the regular PH/international employment
lists, matcher profiles, regular score, and five-job daily budget. The
`/freelance` dashboard starts only the unscheduled
`freelance-opportunity-dashboard-scan` task; neither recurring schedule runs it.

Enabled freelance sources are the public no-key Himalayas JSON API, the public
no-key Remotive API with explicit contract/freelance classification, Tavily URL
discovery through the existing credit ledger, and optional Gemini Search URL
discovery. Manual public URL import reuses the SSRF boundary. Tavily snippets
and Gemini-generated search text never become evidence. Upwork and
Freelancer.com remain pending official API integrations and are not scraped.

Preview performs normalization, deduplication, pay/readiness/risk
classification, and ranking but writes no opportunity. Scan & Save uses a
separate atomic maximum-20-per-PHT-day freelance ledger, preserves source
attribution, and accepts only LOW/MEDIUM-risk non-expired records. It never
creates a regular job, application, proposal, bid, message, submission, or
contract.

Readiness is broader than verified current skills while remaining truthful.
`LEARNABLE FAST WITH AI` is allowed only for narrow missing skills adjacent to
verified skills with a deterministic 4–24-hour practice/sample template. AI
availability alone, material experience, mandatory credentials, regulated
work, senior ownership, or high-risk scope produces `NOT READY`. Learnable work
requires the local manual preparation-complete action before it becomes
application-ready. See `FREELANCE_OPPORTUNITY_DISCOVERY.md`.

No live Phase 7.1B.7A scan has occurred; source behavior is currently verified
only with deterministic mocks and isolated databases.
