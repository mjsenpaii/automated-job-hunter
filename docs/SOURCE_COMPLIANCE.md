# Source Compliance Framework

**IMPORTANT**: Only sources explicitly approved below are enabled. New sources
must be documented before implementation.

Phase 7.1B.5A live validation used only the approved Arbeitnow, Remotive, and
configured Lever paths. DEVELOPMENT run `run_06frj6g5id1v7jt47pv73m7e01`
fetched 134 records and persisted zero because no record matched the fixed
morning profiles. No application or submission occurred. Evening remains
DRY_RUN-only, production persistence remains disabled, and additional daily
morning outcomes must be monitored before any broader scheduled persistence is
considered.

## Source Documentation Template
For every job board or data source, document the following before enabling:

- **Name**: 
- **Access Method**: (API / RSS / Email / Browser)
- **ToS Summary**: 
- **Rate Limits**: 
- **Permitted Automation**: 
- **Restrictions**: 
- **Compliance Status**: (Approved / Pending / Rejected)

---

## Arbeitnow public job API

- **Name**: Arbeitnow
- **Access Method**: Official public JSON API
- **Endpoint**: `https://www.arbeitnow.com/api/job-board-api`
- **Official documentation**: https://www.arbeitnow.com/blog/job-board-api
- **Authentication**: No API key
- **ToS Summary**: The API response identifies it as a free public jobs API,
  asks clients not to abuse it, requests attribution, and documents `?page=`
  pagination. The adapter preserves Arbeitnow attribution and canonical URLs.
- **Rate Limits**: No numeric public limit is stated in the official
  documentation reviewed for Phase 7.1A. This repository conservatively caps a
  manual run at three pages and 50 accepted jobs.
- **Permitted Automation**: Read-only retrieval of public structured job data
  through the documented API.
- **Restrictions**: Fixed Arbeitnow API host only; no employer-page crawling,
  authentication, CAPTCHA handling, rate-limit bypass, application creation, or
  submission.
- **Compliance Status**: Approved for manual and development-only Trigger.dev
  dry runs, the separately gated manual controlled task, and the independently
  gated Phase 7.1B.5A DEVELOPMENT morning path. Manual and morning writes share
  a persistent five-job Asia/Manila daily cap. Evening and production
  persistence remain disabled.

---

## Remotive public remote-jobs API

- **Name**: Remotive
- **Access Method**: Official public JSON API
- **Endpoint**: `https://remotive.com/api/remote-jobs`
- **Official documentation**: https://github.com/remotive-io/remote-jobs-api
- **Official source/terms page**: https://remotive.com/remote-jobs/api
- **Authentication**: No API key
- **ToS Summary**: Public access is provided so developers can share Remotive
  jobs with clear attribution and links back to the canonical Remotive URL.
  Jobs are delayed by 24 hours. The terms prohibit republishing the feed to
  third-party job boards and using listings to collect signups or email
  addresses.
- **Rate Limits**: Remotive advises at most four requests per day and states
  that excessive traffic above two requests per minute will be blocked. The
  repository performs one request per run, caps it at 50 accepted jobs, and
  keeps the two development schedules within the four-requests-per-day
  guidance when manual runs are avoided on the same day.
- **Supported retrieval inputs**: The official API documents `category`,
  `company_name`, `search`, and `limit`. Discovery uses only one category or
  search hint per scheduled request: `software-dev` in the morning and the
  broad search `developer` in the evening. Local deterministic profile
  matching remains authoritative.
- **Permitted Automation**: Local, read-only retrieval and deterministic review
  of public structured listings while retaining Remotive attribution.
- **Restrictions**: Fixed Remotive API host only; no redistribution to other
  job boards, employer/application-link crawling, authentication, CAPTCHA
  handling, rate-limit bypass, application creation, or submission.
- **Compliance Status**: Approved for manual and development-only Trigger.dev
  dry runs, the separately gated manual controlled task, and the independently
  gated Phase 7.1B.5A DEVELOPMENT morning path. Manual and morning writes share
  a persistent five-job Asia/Manila daily cap. Evening and production
  persistence remain disabled.

---

## Lever Postings API

- **Name**: Lever public company boards
- **Access Method**: Official public JSON Postings API
- **Endpoint**: `https://api.lever.co/v0/postings/{site}`
- **Official documentation**: https://github.com/lever/postings-api
- **Official access guidance**: https://hire.lever.co/developer/support
- **Authentication**: No authentication is required for read-only retrieval of
  published postings. Lever application submission is a separate authenticated
  operation and is not used.
- **Response and pagination**: `GET /v0/postings/{site}` returns published
  postings as a JSON array when JSON mode is requested. The documented `skip`
  and `limit` query parameters provide offset pagination.
- **Workplace field compatibility**: Official Lever documentation uses both
  `on-site` (public Postings API) and `onsite` (Lever developer API) for the
  onsite workplace type. The adapter accepts only the documented values and
  normalizes `onsite` to canonical `on-site`; unknown enum values are rejected.
- **Verified Phase 7.1A.3 boards (2026-07-28)**:
  - Spotify (`spotify`)
  - Highspot (`highspot`)
  - Aleph (`aleph`)
- **Rate Limits**: No numeric public read limit is stated in the official
  documentation reviewed for Phase 7.1A.3. This repository uses explicit manual
  runs, a ten-second request timeout, at most ten configured companies, and no
  more than 100 accepted jobs per run.
- **Failure isolation and reporting**: Scheduled discovery attempts each
  configured company at most once. Each board has an independent failure
  boundary, so a failed board cannot prevent later configured boards or discard
  jobs from earlier successful boards. Reports include only configured site
  IDs, the closed safe error-code set `TIMEOUT`, `HTTP_ERROR`,
  `INVALID_RESPONSE`, `NETWORK_ERROR`, and `UNKNOWN_SAFE_ERROR`, plus
  attempted/completed request counts; response payloads, headers, stack traces,
  raw URLs, and provider diagnostics are never returned. This boundary fixes
  the historical run in which a Spotify timeout stopped Highspot and Aleph
  before they were attempted.
- **Permitted Automation**: Read-only retrieval of published jobs from
  explicitly configured public company boards through Lever's documented API.
- **Restrictions**: Fixed global Lever API host only; configured and
  live-verified site identifiers only; no arbitrary host or URL input; no
  internal/hidden jobs, application-form retrieval or submission,
  employer-page crawling, browser automation, login, cookies, CAPTCHA handling,
  rate-limit bypass, or auto-application.
- **Compliance Status**: Approved for manual and development-only Trigger.dev
  dry runs, the separately gated manual controlled task, and the independently
  gated Phase 7.1B.5A DEVELOPMENT morning path. Trigger orchestration attempts
  each configured board at most once per run; manual and morning writes share a
  persistent five-job Asia/Manila daily cap. Evening and production
  persistence remain disabled.
