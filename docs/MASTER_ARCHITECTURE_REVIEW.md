# Master Architecture Review

**Author:** Principal Architect  
**Date:** 2026-07-23  
**Status:** DRAFT — awaiting user review  
**Source document:** `00_READ_ME_FIRST_JOB_APPLICATION_AI.docx` v1.0, 23 July 2026

---

## 1. Executive Summary

The specification describes a local-first AI job-discovery and application assistant for
an early-career developer in the Philippines. The ambition is high — the document covers
ingestion, classification, scoring, resume generation, browser prefill, application
tracking, and daily reporting across eight implementation phases.

This review identifies **architectural strengths to preserve**, **contradictions and
over-engineering to resolve**, and **a refined architecture** that delivers the same
outcomes with fewer moving parts.

---

## 2. Specification Strengths

| Area | Assessment |
|---|---|
| Factual integrity model | Excellent. The "no fabrication" rule, evidence-linked facts, and verification statuses are the most important part of the system. **Preserve exactly.** |
| PH vs International separation | Correct. These have different eligibility rules and must remain separate pipelines. |
| Phased rollout with approval gates | Sound engineering discipline. Prevents premature automation. |
| Score decomposition (100-point model) | Clear and auditable. The factor weights are reasonable for a junior profile. |
| Resume source hierarchy | Correct ordering: profile → evidence → master → job description (emphasis only). |
| Security posture | Appropriate: Git exclusions, secret redaction, kill switch, audit trail. |
| Status model | Complete lifecycle from DISCOVERED → OFFER with all terminal states. |

---

## 3. Contradictions and Ambiguities

### 3.1 Scheduling: Windows Task Scheduler vs Trigger.dev

The spec mandates **Windows Task Scheduler** (Section 5, row "Scheduling"). The user
instruction mandates defining tasks for **Trigger.dev**. These are incompatible
approaches.

**Resolution:** Adopt Trigger.dev as the task orchestrator. It provides:
- Durable execution with retries and timeouts
- A web UI for monitoring runs
- Cron scheduling built-in
- TypeScript-native SDK

Windows Task Scheduler becomes unnecessary. All scheduled work (ingestion, scoring,
report generation) runs as Trigger.dev tasks.

### 3.2 Two OJT/Certification Entries

The CV lists:
- Work Experience: "On-the-Job Training - 486 hrs (DOST-PSTO Marinduque, 2026)"
- Certification: "DOST - Marinduque – On-the-Job Training (486 hrs) (2026)"
- Certification: "DOST – LODIXR – On-the-Job Training (486 hrs) (2026)"

Are these one event, two events, or one event with two organizational attributions?
The spec (Section 2) flags this as an ambiguity but does not resolve it.

**Resolution:** Mark as `NEEDS_USER_CLARIFICATION`. Do not merge or split until the
candidate confirms.

### 3.3 Dashboard: Next.js Complexity

The spec mandates Next.js for the dashboard (Section 5). For a local approval interface
used by a single person, Next.js introduces:
- Server components, routing, build pipeline
- Significant dependency tree
- Deployment complexity for a "local-first" app

**Resolution:** Keep Next.js — it aligns with the candidate's skill development goals
and the spec is explicit. But scope the first dashboard to **four views** (PH Jobs,
International Jobs, Job Detail, Settings), not eight. Add remaining views in later phases.

### 3.4 ORM: Prisma vs Drizzle

The spec defers this choice. Both work with SQLite.

**Decision: Drizzle ORM.**

Rationale:
- Lighter runtime (no Rust binary, no generated client)
- SQL-first mental model — better for a developer learning databases
- TypeScript-native schema definition
- Simpler migration story for SQLite → PostgreSQL path
- Faster cold starts (matters for Trigger.dev task execution)

### 3.5 Email Ingestion Timing

Gmail API with OAuth (Section 5) is a Phase 2 concern. The spec correctly places it
in the Discovery phase, but the database schema and adapter interface should be designed
now to accommodate it.

**Resolution:** Define the `job_sources` adapter interface in Phase 1. Implement only
the `manual_url` and `fixture` adapters. Email and browser adapters come in Phase 2+.

### 3.6 Browser Automation Scope

The spec mentions Playwright for "permitted extraction/prefill only" but also lists
browser tests. Playwright is a large dependency.

**Resolution:** Do not install Playwright until Phase 6. Browser tests for the
dashboard can use Vitest's happy-dom or jsdom environment initially.

---

## 4. Unnecessary Complexity Identified

### 4.1 Over-specified Database Schema

The spec lists 12 database entities (Section 6). For Phase 1, only these are needed:

| Entity | Phase |
|---|---|
| `candidate_profiles` | 0 |
| `candidate_evidence` | 0 |
| `job_sources` | 1 |
| `jobs` | 1 |
| `job_requirements` | 2 |
| `job_scores` | 3 |
| `resume_versions` | 4 |
| `application_packages` | 5 |
| `applications` | 5 |
| `employer_messages` | 6 |
| `workflow_runs` | 1 (simplified) |
| `audit_events` | 1 |

Build tables incrementally. Drizzle migrations handle additive schema changes cleanly.

### 4.2 Four Resume Profiles from Day One

The spec defines four resume profiles (Software Dev, AI Automation, FlutterFlow/UI-UX,
Technical Support). With the candidate's current verified experience, only two are
meaningfully distinguishable:

1. **Software / Full-Stack Developer** (covers web, mobile, AI integration)
2. **Technical Support / IT** (covers networking, cybersecurity, hardware)

**Resolution:** Start with two profiles. Add AI Automation and FlutterFlow profiles
when the candidate provides enough differentiated evidence.

### 4.3 Daily and Weekly Report System

Reports (Section 4) require ingestion, scoring, and application data to be meaningful.
They are a Phase 3+ deliverable.

### 4.4 Scam Detection Engine

The employer risk checks (Section 10) describe a moderately complex classifier.
For Phase 1, a simple keyword-pattern allowlist/blocklist is sufficient. AI-powered
scam detection comes in Phase 3 alongside scoring.

---

## 5. Refined Production Architecture

```
job-application-ai/
│
├── apps/
│   └── dashboard/              # Next.js app (local approval UI)
│       ├── app/                # App router
│       ├── components/
│       └── lib/
│
├── packages/
│   ├── core/                   # Shared types, schemas, constants
│   │   ├── src/
│   │   │   ├── candidate/      # Profile types, validation (Zod)
│   │   │   ├── jobs/           # Job types, normalization types
│   │   │   ├── scoring/        # Score types, factor weights
│   │   │   └── resume/         # Resume types, template types
│   │   └── index.ts
│   │
│   ├── db/                     # Drizzle schema, migrations, queries
│   │   ├── src/
│   │   │   ├── schema.ts
│   │   │   ├── migrations/
│   │   │   └── queries/
│   │   └── drizzle.config.ts
│   │
│   ├── classification/         # PH/intl, work-setup, eligibility
│   │   ├── src/
│   │   └── tests/
│   │
│   ├── scoring/                # Deterministic + AI scoring
│   │   ├── src/
│   │   └── tests/
│   │
│   ├── ingestion/              # Source adapters
│   │   ├── src/
│   │   │   ├── adapters/       # manual, email, rss, ats
│   │   │   └── normalize.ts
│   │   └── tests/
│   │
│   └── resume/                 # Resume engine
│       ├── src/
│       │   ├── parser.ts       # DOCX → structured data
│       │   ├── mapper.ts       # Facts → resume sections
│       │   ├── generator.ts    # Sections → DOCX/PDF
│       │   └── quality.ts      # Fact-check, ATS-check gates
│       └── tests/
│
├── trigger/                    # Trigger.dev task definitions
│   ├── src/
│   │   ├── ingest.ts           # Scheduled ingestion
│   │   ├── score.ts            # Score new jobs
│   │   ├── generate-resume.ts  # Resume generation for approved jobs
│   │   └── report.ts           # Daily/weekly reports
│   └── trigger.config.ts
│
├── candidate/                  # Candidate data (mostly gitignored)
│   ├── profile.public.json
│   ├── profile.private.json
│   ├── skills.verified.json
│   ├── experience.verified.json
│   ├── projects.verified.json
│   ├── answer-bank.private.json
│   └── source-evidence/
│
├── resumes/
│   ├── master/
│   ├── templates/
│   └── generated/              # gitignored
│
├── docs/
├── tests/                      # Integration tests
├── scripts/                    # One-off utilities
├── .env.example
├── .gitignore
├── package.json                # Workspace root (pnpm)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vitest.workspace.ts
└── turbo.json                  # Turborepo for build orchestration
```

### Key Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Package manager | pnpm | Workspace support, disk efficiency, strict dependency resolution |
| Monorepo tool | Turborepo | Fast incremental builds, works with pnpm workspaces |
| ORM | Drizzle | Lighter than Prisma, SQL-first, faster for Trigger.dev tasks |
| Database | SQLite (local) | Simple, no server, migration path to PostgreSQL exists |
| Dashboard | Next.js (App Router) | Spec requirement; provides SSR and API routes in one framework |
| Task orchestration | Trigger.dev | Replaces Windows Task Scheduler; durable, observable, TypeScript-native |
| Validation | Zod | Spec requirement; validates all AI output and external data |
| Testing | Vitest | Fast, TypeScript-native, workspace-aware |
| AI abstraction | Vercel AI SDK or custom provider wrapper | Avoid provider lock-in as spec requires |

---

## 6. Trigger.dev Task Definitions

| Task | Schedule | Human Approval Required | Phase |
|---|---|---|---|
| `ingest-email-alerts` | Every 30 min | No (read-only) | 2 |
| `ingest-rss-feeds` | Every 2 hours | No (read-only) | 2 |
| `normalize-new-jobs` | On new ingestion | No | 2 |
| `deduplicate-jobs` | After normalization | No | 2 |
| `classify-and-filter` | After dedup | No | 3 |
| `score-eligible-jobs` | After classification | No | 3 |
| `generate-resume-package` | On user approval | No (pre-approved job) | 4 |
| `daily-report` | 08:00 daily | No | 3 |
| `weekly-report` | Monday 08:00 | No | 3 |
| `prefill-application` | On user trigger | **Yes — must stop before submit** | 6 |
| `submit-application` | On explicit user click | **Yes — always** | 7 |

---

## 7. Human Approval Gates

These actions **must never proceed without explicit user confirmation**:

1. Changing a verified candidate fact
2. Submitting any application or outgoing message
3. Enabling a new job source
4. Answering sensitive application questions (legal, salary, authorization)
5. Deleting any data
6. Enabling automatic submission mode
7. Changing scoring weights or rejection rules
8. Adding claims to a resume that don't have `VERIFIED` status
9. Sending any email on behalf of the candidate
10. Browser actions beyond read-only extraction

---

## 8. Recommendations

1. **Start with the candidate profile, not the job pipeline.** The entire system depends
   on verified facts. Without the questionnaire answers, the resume engine and scoring
   system produce unreliable output.

2. **Build classification and scoring as pure functions first.** They are the most
   testable components and have zero external dependencies. Get them right with fixtures
   before connecting any data source.

3. **Defer Playwright to Phase 6.** It adds ~50 MB of browser binaries and introduces
   flaky test dynamics. The first four phases need zero browser automation.

4. **Use a single `candidate/` directory as the source of truth**, not a database table,
   for Phase 0-1. Migrate to database-backed profiles in Phase 2 when ingestion begins.

5. **Ship the dashboard incrementally.** Phase 1 dashboard needs only: fixture job list,
   job detail view, and settings page. Add resume review and application queue as those
   subsystems are built.

---

## 9. Next Steps

See [IMPLEMENTATION_ROADMAP.md](file:///e:/dev/MJ/ai-job-application/docs/IMPLEMENTATION_ROADMAP.md) for the phased execution plan.
See [RISK_REGISTER.md](file:///e:/dev/MJ/ai-job-application/docs/RISK_REGISTER.md) for tracked risks.
See [MISSING_CANDIDATE_INFORMATION.md](file:///e:/dev/MJ/ai-job-application/docs/MISSING_CANDIDATE_INFORMATION.md) for the gap analysis.
