# Source Compliance Framework

**IMPORTANT**: Only sources explicitly approved below are enabled. New sources
must be documented before implementation.

Phase 7.1B.6B keeps Tavily primary and adds independently gated Gemini Google
Search for public-URL discovery plus Tavily Basic Extract for eligible fetch
recovery. Arbeitnow, Remotive, and Lever remain approved but disabled by
default behind their own exact switches. They are never automatic fallbacks.
Live Phase 7.1B.6B validation is pending.

Phase 7.1B.5A live validation used only the approved Arbeitnow, Remotive, and
configured Lever paths. DEVELOPMENT run `run_06frj6g5id1v7jt47pv73m7e01`
fetched 134 records and persisted zero because no record matched the fixed
morning profiles. No application or submission occurred. Evening remains
DRY_RUN-only, production persistence remains disabled, and additional daily
morning outcomes must be monitored before any broader scheduled persistence is
considered.

Phase 7.1B.5C adds a development-only dashboard entry point to the same approved
APIs; it does not add a source, arbitrary host, employer crawl, or application
request. Preview and Save each perform the existing bounded source fetches when
explicitly started. Operators must count dashboard scans alongside scheduled
and CLI runs when observing provider request guidance, especially Remotive's
four-fetches-per-day recommendation. No live dashboard scan was performed
during implementation.

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

## Tavily Basic Search

- **Name**: Tavily Basic Search
- **Access Method**: Official Search API used only for public job-URL discovery
- **Endpoint**: `https://api.tavily.com/search`
- **Official API reference**: https://docs.tavily.com/documentation/api-reference/endpoint/search
- **Official credit documentation**: https://docs.tavily.com/documentation/api-credits
- **Authentication**: Worker-only bearer API key; never available to Next.js
  client code or returned scan payloads.
- **Rate/Credit Limits**: Basic Search only. Normal scans use at most eight
  requests and ten results per query; Deep Scan uses at most 40 Search requests.
  Search and Basic Extract share a transactionally enforced 30-credit
  Asia/Manila-day and 900-credit Asia/Manila-month project budget. Identical
  normalized queries use a six-hour cache at zero additional credit.
- **Permitted Automation**: Bounded public URL discovery followed by retrieval
  and deterministic parsing of the original public job page.
- **Restrictions**: No Advanced Search, generated answer, raw-content search,
  Crawl, Map, Research, login, CAPTCHA bypass, application retrieval or
  submission, robots/rate-limit bypass, or use of snippets as job evidence.
  Unsafe and unparseable pages are rejected before matching or verification.
- **Compliance Status**: Implemented for development-only discovery behind
  `JOB_DISCOVERY_TAVILY_ENABLED=true`; live Phase 7.1B.6B validation pending.
  Preview has no verification/job writes. Save retains verified extraction,
  the atomic five-job PHT-day cap, and zero application/submission behavior.
  Production persistence remains disabled.

---

## Tavily Basic Extract

- **Name**: Tavily Basic Extract
- **Access Method**: Official Extract API, only as recovery after an eligible
  direct public-page fetch/parser failure
- **Endpoint**: `https://api.tavily.com/extract`
- **Official API reference**: https://docs.tavily.com/documentation/api-reference/endpoint/extract
- **Authentication**: The same worker-only Tavily bearer key; never dashboard
  client state or output.
- **Rate/Credit Limits**: At most 25 attempted/recovered URLs in a normal scan
  and 200 in Deep Scan, in batches of five. Provider-reported Extract credits
  consume the same daily/monthly Tavily ledger as Search.
- **Permitted Automation**: Recovery of a specific attributable public vacancy
  URL after direct retrieval times out, returns an unusable public body, or
  produces a JavaScript shell with no meaningful vacancy content.
- **Restrictions**: Never used on authentication/login, CAPTCHA, private or
  internal addresses, search results, application forms, unsafe redirects,
  prohibited sources, or generic career pages. Recovered content is revalidated
  and raw Extract responses are not persisted.
- **Compliance Status**: Development-only and disabled unless
  `JOB_DISCOVERY_TAVILY_EXTRACT_ENABLED=true`; live validation pending.

---

## Gemini Google Search grounding

- **Name**: Gemini Search
- **Access Method**: Google Search grounding through the installed Gemini SDK,
  using the separately configured worker-only `GEMINI_SEARCH_MODEL`
- **Authentication**: Worker-only Gemini API key; no dashboard/client access.
- **Rate/Quota Limits**: Normal scans use at most eight prompts and Deep Scan at
  most 40 prompts, within a transactionally enforced 60-prompt Asia/Manila-day
  project cap. Identical normalized model/prompt inputs use a six-hour cache.
- **Permitted Automation**: Public job-URL discovery from grounding metadata.
  Tavily and Gemini Search may run together and fail independently.
- **Restrictions**: Generated model text, summaries, titles, and interpretations
  are discarded. They cannot establish employer, title, description, location,
  salary, experience, qualifications, or eligibility. Every grounded URL must
  pass original-page retrieval and attributable vacancy parsing.
- **Compliance Status**: Development-only and disabled unless
  `JOB_DISCOVERY_GEMINI_SEARCH_ENABLED=true`; live validation pending.

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

## Freelance discovery sources (Phase 7.1B.7A)

### Himalayas public remote-jobs API

- **Access**: Official public JSON API; no API key.
- **Documentation**: https://himalayas.app/docs/remote-jobs-api
- **Use**: Bounded keyword/country/worldwide/seniority/employment-type queries,
  recent sorting, maximum page size 20, and bounded pagination. Only Part Time,
  Contractor, Temporary, Intern, or other records with explicit freelance
  evidence enter the freelance pipeline.
- **Attribution**: The dashboard visibly labels Himalayas and retains the
  public listing/application link. The roughly 24-hour source refresh is not
  presented as real-time availability.
- **Restrictions**: No republication as another marketplace, authenticated
  scraping, proposal submission, or application automation.

### Remotive freelance subset

- **Access**: Existing official public JSON API; no API key.
- **Documentation**: https://github.com/remotive-io/remote-jobs-api
- **Use**: The existing adapter is followed by a freelance-specific layer.
  `freelance`, `contract`, `part_time`, temporary, project-based, or independent
  contractor evidence is required; ordinary full-time remote work is excluded.
- **Attribution**: Every accepted record retains a visible Remotive label and
  canonical Remotive link. The documented 24-hour listing delay and request
  guidance still apply.

### Tavily, Gemini Search, manual URLs, and pending marketplaces

- Tavily retains its existing **API CREDITS** Search/Extract ledger. Search is
  URL discovery and Extract is eligible fetch recovery only.
- Gemini Search retains its existing **API QUOTA** adapter and separate model.
  It is optional and isolated; the known `NETWORK_FAILURE` cannot stop other
  freelance sources.
- Neither snippets nor generated text is evidence. Original attributable public
  pages must pass the existing URL, SSRF, compliance, and parser boundaries.
- Manual import accepts one public HTTP/HTTPS opportunity URL and performs no
  login, CAPTCHA bypass, cookie reuse, or submission.
- Upwork official GraphQL API access is pending approval. Freelancer.com
  official API access is pending. Neither site is scraped and neither adapter
  makes a request in Phase 7.1B.7A.

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
