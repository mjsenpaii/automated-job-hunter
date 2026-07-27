# Public Job Discovery

## Phase 7.1A scope

Phase 7.1A proves public, structured job discovery before Trigger.dev scheduling
is introduced. It implements a reusable discovery core with two source
adapters: Arbeitnow and Remotive.

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

Trigger.dev scheduling is intentionally deferred. A future task should call the
same adapter and discovery runner rather than duplicating source, pipeline, or
persistence logic.
