# Source Compliance Framework

**IMPORTANT**: Only sources explicitly approved below are enabled. New sources
must be documented before implementation.

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
- **Compliance Status**: Approved for manual dry-run-first discovery in Phase
  7.1A. Trigger.dev scheduling remains disabled pending Phase 7.1B review.

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
  repository permits one explicit manual request per CLI run and caps it at 50
  accepted jobs.
- **Permitted Automation**: Local, read-only retrieval and deterministic review
  of public structured listings while retaining Remotive attribution.
- **Restrictions**: Fixed Remotive API host only; no redistribution to other
  job boards, employer/application-link crawling, authentication, CAPTCHA
  handling, rate-limit bypass, application creation, or submission.
- **Compliance Status**: Approved for manual dry-run-first local discovery in
  Phase 7.1A.2. Trigger.dev scheduling remains disabled pending Phase 7.1B
  review.
