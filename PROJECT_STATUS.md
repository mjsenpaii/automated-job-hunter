# Project Status

**Last updated:** 2026-07-24T03:35 PHT  
**Current phase:** Phase 5 Complete + Job URL Importer & Automated Scoring Validation integrated  
**Overall health:** 🟢 141/141 tests passing (18 files)  
**Active branch:** `handoff/cursor-integration`

---

## Phase Summary

| Phase | Status | Notes |
|---|---|---|
| Phase 0 — Audit & Profile | ✅ DONE | Docs, candidate profiles, questionnaire |
| Phase 1 — Foundation & Tests | ✅ DONE | Monorepo, schemas, classification, scoring, DB |
| Phase 2 — Job Discovery | ✅ DONE | Ingestion pipeline, API routes, add-job form |
| Phase 3 — Dashboard | ✅ DONE | Next.js premium dark UI, wired to real DB |
| Phase 4 — Resume Engine | ✅ DONE | DOCX generation, cover letters, CLI, quality gates |
| Phase 5 — Application Package | ✅ DONE | Package builder, state machine, daily limits, kill switch |
| Phase 6 — Browser Assistance | ⬜ NOT STARTED | Playwright (deferred) |
| Phase 7 — Limited Automation | ⬜ NOT STARTED | Trigger.dev orchestration |

---

## What's Built — 8 Packages + 1 App

| Package | Purpose | Tests |
|---|---|---|
| `@job-app/core` | Zod schemas (candidate, job, scoring) | Used by all |
| `@job-app/classification` | PH/intl category, work-setup, eligibility, dedup | 32 ✅ |
| `@job-app/scoring` | Hard rejection, 100-point factor scoring | 24 ✅ |
| `@job-app/resume` | Resume profiles, DOCX generation, cover letters, quality gates | 16 ✅ |
| `@job-app/db` | Drizzle ORM + SQLite | Schema ready |
| `@job-app/ingestion` | Normalizer, pipeline, manual + **URL-import adapter (SSRF-hardened)**, realistic validation | 57 ✅ |
| `@job-app/application` | Package builder, state machine, daily limits | 12 ✅ |
| `@job-app/dashboard` | Next.js premium dark UI + **Import URL page & `/api/extract`** | Running |

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
| _(this commit)_ | feat: complete job URL importer and automated scoring validation | 141 |

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
