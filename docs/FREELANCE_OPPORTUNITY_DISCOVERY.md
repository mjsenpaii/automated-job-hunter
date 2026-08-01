# Freelance Opportunity Discovery

## Purpose and boundary

Phase 7.1B.7A adds a separate **Freelance Jobs** workspace for public,
short-term earning opportunities. It discovers, normalizes, ranks, saves, and
supports manual review. It never submits a proposal, places a bid, sends a
message, accepts an offer, creates a contract, processes a payment, or creates
an application.

Freelance opportunities are stored separately from regular employment jobs.
The three dashboard views are overlapping filters rather than separate copies:

- **Philippines** — the client/listing targets the Philippines, accepts
  Philippine applicants, or is Philippine-based.
- **International Clients** — the client is outside the Philippines and the
  listing accepts Philippine or worldwide applicants without a conflicting
  restriction.
- **Worldwide Remote** — the listing explicitly permits worldwide work, has no
  country restriction, or includes the Philippines, with any stated timezone
  retained for review.

## Sources and attribution

All automated sources require the exact freelance feature switch and their own
exact lowercase `true` source switch in the Trigger.dev worker environment.
Malformed, padded, differently-cased, or missing values remain disabled.

| Source | Classification | Use |
| --- | --- | --- |
| Himalayas public JSON API | FREE — NO API KEY | Public part-time, contractor, temporary, intern, and clearly freelance listings |
| Remotive public API | FREE PUBLIC API — NO API KEY | Listings explicitly classified as freelance, contract, part-time, temporary, project-based, or independent-contractor work |
| Tavily public-web discovery | API CREDITS | URL discovery only, using the existing shared Search/Extract credit ledger |
| Gemini Search | API QUOTA | Optional grounded URL discovery only; failure is isolated |
| Manual public URL import | No provider credential | One SSRF-checked public listing for local review |

Himalayas and Remotive source attribution and public links are retained after
deduplication. Tavily snippets and Gemini-generated search text are never
opportunity evidence. A web-discovered URL must be fetched and parsed from the
original attributable public page. Login, private-network, CAPTCHA,
search-result, and submission pages are rejected; authenticated scraping and
browser cookies are not used.

The present Gemini Search transport issue remains fail-closed as
`NETWORK_FAILURE`. Himalayas, Remotive, Tavily, and manual imports continue
independently. There is no automatic Gemini retry or fallback to the
requirements-verification model.

Upwork and Freelancer.com are extension points only:

- **Upwork official GraphQL API — approval pending**
- **Freelancer.com official API — access pending**

Neither marketplace is scraped, and no network call is made until official
credentials and a compliant adapter are added in a later phase.

## Forum first-party updates

Forum topics have an additional authorship boundary. The first post is the
listing source, and only later replies attributable to the same stable forum
author may act as first-party listing updates. Those replies may clarify
eligible countries, timezone requirements, role closure or a filled position,
explicit experience, pay, or task scope. Replies from applicants or unrelated
community members never modify requirements, even when they make confident
claims about eligibility or experience.

The original-poster update text remains preserved as bounded first-party
evidence. Deterministic normalization may derive a closed fact such as
`Philippines excluded`, but it does not invent a timezone from a generic
reference to time difference. An explicit Philippines exclusion overrides
unresolved or broader geography and blocks positive readiness with
`GEOGRAPHIC_RESTRICTION`.

Forum listings more than 90 days old without a recent semantic confirmation
from the original poster are flagged `POTENTIALLY_STALE_LISTING`. This is a
manual freshness warning, not a claim that the client is fraudulent and not a
reason to trust replies from other users. Confirmed original-poster closure or
filled updates are treated as expired locally.

## Pay handling

The preference is strictly **more than USD 3.00 per hour**. Exactly USD 3.00 is
`BELOW_MINIMUM`; USD 3.01 is `ABOVE_MINIMUM`.

- Explicit USD hourly rates are compared directly.
- Original currency is preserved. Non-USD pay is
  `NON_USD_UNCONVERTED`; no exchange rate is fabricated.
- Fixed-price work is `FIXED_PRICE_SCOPE_REQUIRED`. The system never divides a
  fixed budget by AI-guessed hours.
- Missing pay remains visible as `UNKNOWN` and ranks below confirmed
  above-minimum work.
- Confirmed below-minimum work is hidden by default but can be included with a
  dashboard filter.

## Readiness

The user-facing labels are:

- **READY NOW** — the core task is supported by verified candidate skills.
- **LEARNABLE FAST WITH AI** — a truthful, bounded preparation path exists.
- **NOT READY** — a mandatory or unbounded gap prevents a safe readiness claim.

Discovery is not restricted to skills the candidate already possesses.
`LEARNABLE FAST WITH AI` requires all of the following deterministic gates:

1. The core task is narrow and sufficiently clear.
2. Every missing core skill is in the curated learning map and is adjacent to a
   verified existing skill.
3. Practice is defensibly bounded to 4–24 focused hours.
4. No mandatory certification, license, clearance, or regulated qualification
   is required.
5. No material years-of-experience requirement exists.
6. The role is not senior, lead, architect, managerial, or high-risk production
   ownership.
7. A truthful deterministic sample template is available.
8. Limited direct experience can be disclosed honestly.
9. Delivery does not require qualification misrepresentation.
10. Scam, ethics, safety, and compliance rules do not hard-reject the work.

AI availability by itself never establishes readiness. The dashboard displays
verified transferable skills, exact missing skills, a bounded learning range,
the narrow-gap rationale, required practice, a suggested sample, delivery
risks, readiness confidence, and a recommended action. When task boundaries
remain vague, it shows:

> Learning time uncertain — review the full scope first.

The local **Mark Preparation Complete** action records learning completion,
whether a sample was created, a sample link or local note, remaining concerns,
and explicit manual readiness confirmation. Only that local action can move a
learnable opportunity to application-ready. It contacts no client and sends no
proposal, bid, message, or application.

Any future drafting must preserve truthful language such as “My direct
experience with this specific platform is limited.” It must not claim expertise,
years, similar client work, or existing tool knowledge without verified evidence.

## Risk and ethics controls

Hard exclusions include pay-to-work schemes, credential/OTP sharing, account
rental, fake engagement, impersonation, academic cheating, malware, credential
theft, prohibited automation, deposit/investment demands, money laundering,
reshipping, identity misuse, adult-content production, illegal activity, and
unlicensed regulated work.

Lower-confidence indicators—such as unpaid tests, vague scope, messaging-only
recruitment, off-platform payment, shortened URLs, or urgent personal-document
requests—are displayed as:

> Potential risk indicators detected.

This is a review warning, not a factual accusation of fraud. Risk levels are
`LOW`, `MEDIUM`, `HIGH`, and `HARD_REJECTED`. Automatic saving accepts only LOW
or MEDIUM risk records; hard-rejected and expired records are not saved.

## Ranking and persistence

Ranking combines readiness, explicit pay confidence and amount, location
eligibility, recency, contract/scope clarity, skill overlap, learning effort,
risk, and attributable source quality. It does not fabricate applicant
competition. A strong learnable opportunity can outrank a weak ready-now one
when its pay, scope, source, risk, and preparation burden are materially better.

The separate freelance persistence budget is at most 20 opportunities per
Asia/Manila date. It does not consume or increase the regular-job five-per-day
budget. The SQLite transaction records the batch idempotency key, reserves the
daily capacity, writes opportunities and source attribution, and records one
safe activity atomically. Duplicate identities do not consume another slot.
Preview writes no opportunity and consumes no save capacity.

Public-web candidates also pass a page-quality boundary before readiness.
Search/category pages, articles/guides, service or freelancer-profile pages,
generic landing pages, and marketplace result pages are
`NON_OPPORTUNITY_PAGE`; they are not displayed as `NOT READY` jobs. Search
snippets are never task-scope evidence. A valid attributable individual page
whose scope remains incomplete can be shown as `REVIEW SCOPE MANUALLY`, which
does not imply `READY NOW` or `LEARNABLE FAST WITH AI` and does not bypass save
or submission safeguards.

Preview results report valid individual opportunities, rejected non-opportunity
pages, duplicate/repost pages, task-scope sufficiency, bounded query text/yield,
original pages fetched, and Extract recoveries. They also expose at most 20
strict browser-safe summaries of the final unique opportunities. Each summary
contains only bounded normalized display fields: title/source, attributable
public URL, pay/readiness/geography/contract state, skill and scope counts,
learning guidance, risk indicators, and recommended action. Complete
descriptions, page HTML, search snippets, provider responses, prompts, secrets,
environment values, database paths, and private profile data are excluded.

The completed Preview dialog presents these temporary summaries before its
collapsed source diagnostics. Readiness filters are local and immediate; they
never start another scan. `NON_OPPORTUNITY_PAGE` records remain aggregate
rejections and are never rendered as job cards. The separate main workspace is
labelled **Saved opportunities** so older persisted records cannot be mistaken
for the latest temporary Preview.

Preview continues to save nothing automatically. **Save for Review** is a
separate direct user action: the dashboard server retrieves the trusted
completed Preview output, revalidates the original public page through the
existing SSRF boundary, preserves the discovery source attribution, and writes
one record atomically through the separate freelance daily ledger. It is
deduplicated and cannot exceed 20 local freelance saves per PHT date. Saving a
`NOT READY` result requires an additional acknowledgement of the displayed
deterministic blocker. Hard-rejected, expired, invalid-URL, and unsafe results
cannot be saved. No proposal, bid, message, application, submission, offer, or
marketplace action occurs.

The Preview workspace was refined with project-local Impeccable 4.0.4 and Emil
Kowalski `emil-design-eng` instructions. Impeccable guided information
hierarchy, density, responsive behavior, accessible disclosure, and state
coverage. Emil's interaction review kept filtering instant, limited hover
feedback to pointer devices, stabilized the confirmation button, retained
native keyboard disclosures, and added no animation dependency. The skill
files live under `.agents/skills/` and remain uncommitted.

## Controls and configuration

Worker-only sample settings are documented in the root `.env.example`:

```text
JOB_DISCOVERY_FREELANCE_ENABLED=false
FREELANCE_SOURCE_HIMALAYAS_ENABLED=false
FREELANCE_SOURCE_REMOTIVE_ENABLED=false
FREELANCE_SOURCE_TAVILY_ENABLED=false
FREELANCE_SOURCE_GEMINI_SEARCH_ENABLED=false
FREELANCE_MIN_HOURLY_USD=3
FREELANCE_DAILY_SAVE_CAP=20
FREELANCE_FAST_LEARNING_MAX_HOURS=24
```

Provider keys and freelance source switches never enter the Next.js dashboard
environment or browser bundle. The dashboard only starts/polls the unscheduled
development Trigger.dev task using its existing server-only Trigger credential.
No freelance scan is attached to the regular morning or evening schedules.

## Remaining limitations

- Live Preview validation has run, but live Scan & Save remains unvalidated and
  disabled unless separately authorized. The latest Fresh Preview quality
  audit used cached/stored artifacts only and performed no additional request.
- Automated validation uses mocked sources and isolated temporary databases; it
  proves the safety contracts and deterministic classification behavior, not
  the current availability or completeness of public listings.
- Pay without explicit currency/period remains unverified; currency conversion
  is not implemented.
- Fixed-price effective hourly rates require manual scope review.
- Readiness uses a deliberately small, auditable skill catalog and learning map;
  unusual wording or adjacent skills outside that catalog may be missed.
- Risk rules are precautionary indicators, not proof that a client is unsafe.
- Upwork and Freelancer.com official APIs remain pending.
- Proposal drafting and all forms of submission remain out of scope.
