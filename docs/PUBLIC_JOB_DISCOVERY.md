# Public Job Discovery

## Phase 7.1A scope

Phase 7.1A proves public, structured job discovery before Trigger.dev scheduling
is introduced. It implements a reusable discovery core with three source
adapters: Arbeitnow, Remotive, and selected public Lever company boards.

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

## Future Phase 7.1B

Phase 7.1B.1 adds a manual Trigger.dev development task that orchestrates the
existing Arbeitnow, Remotive, and Lever discovery adapters through the shared
discovery runner. It is dry-run only, opens the local SQLite database read-only
for deduplication, and never creates applications or submissions.

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

No cron schedule, dashboard schedule, or recurring trigger is attached yet.
Phase 7.1B.2 will add cron scheduling only after manual approval.

Trigger.dev scheduling for unattended production runs remains deferred until
Phase 7.1B.2. A future scheduled task should continue calling these same
adapters and the discovery runner rather than duplicating source, pipeline, or
persistence logic.
