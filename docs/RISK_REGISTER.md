# Risk Register

**Author:** Principal Architect  
**Date:** 2026-07-23  
**Status:** ACTIVE — updated each phase

---

## Risk Severity Matrix

| Likelihood → | Low | Medium | High |
|---|---|---|---|
| **Impact: Critical** | Medium | High | Critical |
| **Impact: High** | Low | Medium | High |
| **Impact: Medium** | Low | Low | Medium |

---

## Active Risks

### R-001: Resume Fabrication
| Field | Value |
|---|---|
| **Severity** | CRITICAL |
| **Likelihood** | High (without safeguards) |
| **Impact** | Critical — destroys candidate credibility, potential legal consequences |
| **Description** | Any AI model used for resume generation or scoring may hallucinate skills, exaggerate experience, invent metrics, or conflate participation with employment. The spec's "no fabrication" rule is correct but must be enforced mechanically, not by instruction alone. |
| **Mitigation** | 1. Every resume claim links to a `candidate_evidence` record with `verification_status: VERIFIED`. 2. The fact-check gate rejects any claim without a linked evidence ID. 3. AI-generated wording is validated against the structured profile — new facts cannot be introduced by the generator. 4. Quality gate runs automatically; no resume passes to the dashboard without `FACT_CHECK: PASS`. |
| **Owner** | Resume engine (Phase 4) |
| **Status** | OPEN — mitigations designed, not yet implemented |

---

### R-002: Scope Creep / Over-Engineering
| Field | Value |
|---|---|
| **Severity** | HIGH |
| **Likelihood** | High |
| **Impact** | High — project never ships a usable product |
| **Description** | The specification describes an 8-phase, 12-table, 8-view system with browser automation, email integration, scam detection, and daily reports. For a single early-career developer, this scope risks producing an elaborate framework that never helps with actual job applications. |
| **Mitigation** | 1. Strict phase gates — do not start Phase N+1 until Phase N delivers verified value. 2. Prioritize the manual-URL-to-scored-job path end-to-end before building automated ingestion. 3. Track "time from job URL → ready application package" as the primary efficiency metric. 4. Cut features that don't reduce that time. |
| **Owner** | Principal architect |
| **Status** | OPEN — actively managed |

---

### R-003: Private Data Exposure via Git
| Field | Value |
|---|---|
| **Severity** | HIGH |
| **Likelihood** | Medium |
| **Impact** | Critical — personal data, API keys, application history leaked |
| **Description** | The candidate profile contains personal contact information, salary preferences, and application answers. Generated resumes contain full name, email, phone. `.env` contains API keys and OAuth tokens. Any of these committed to a public repository is an irreversible exposure. |
| **Mitigation** | 1. `.gitignore` created in Phase 0 with all private paths. 2. Pre-commit hook (or CI check) scanning for patterns: email addresses, phone numbers, API key formats. 3. All `*.private.json` files gitignored by pattern. 4. `resumes/generated/`, `applications/`, `logs/` directories gitignored. 5. `.env` gitignored; `.env.example` committed with placeholder values only. |
| **Owner** | Phase 0 setup |
| **Status** | OPEN — `.gitignore` not yet created |

---

### R-004: Platform Terms of Service Violations
| Field | Value |
|---|---|
| **Severity** | HIGH |
| **Likelihood** | Medium |
| **Impact** | High — account bans, legal exposure, blacklisting |
| **Description** | Automated scraping, form submission, and data extraction from job boards may violate their ToS. LinkedIn, Indeed, Glassdoor, and others actively detect and ban automated access. |
| **Mitigation** | 1. `docs/SOURCE_COMPLIANCE.md` must document each source's ToS, API availability, and permitted automation before enabling it. 2. Prefer official APIs, RSS feeds, and email alerts over scraping. 3. No CAPTCHA bypass, fingerprint evasion, or stealth plugins. 4. Browser automation (Phase 6+) only on explicitly allowlisted, tested sites. 5. Rate limiting on all external requests. |
| **Owner** | Phase 2 (Discovery) |
| **Status** | OPEN — compliance doc not yet populated |

---

### R-005: AI Output Validation Failures
| Field | Value |
|---|---|
| **Severity** | MEDIUM |
| **Likelihood** | High |
| **Impact** | Medium — incorrect scoring, bad classifications, broken pipelines |
| **Description** | LLM outputs for scoring, classification, and resume generation will sometimes return malformed JSON, hallucinated fields, or outputs that don't match the Zod schema. |
| **Mitigation** | 1. Zod-validate every AI response. 2. On validation failure: retry with constrained repair prompt (max 2 retries). 3. On repeated failure: mark job as `ERROR` and surface to user. 4. Log all AI inputs/outputs (redacted) for debugging. 5. Track validation failure rate per model/task. |
| **Owner** | Phase 3 (Scoring) |
| **Status** | OPEN — not yet implemented |

---

### R-006: Duplicate OJT/Certification Entries in CV
| Field | Value |
|---|---|
| **Severity** | MEDIUM |
| **Likelihood** | Confirmed (present in CV) |
| **Impact** | Medium — incorrect resume, credibility risk if duplicated content appears |
| **Description** | The CV lists what appears to be overlapping entries: an OJT work experience at "DOST-PSTO Marinduque" and two certifications at "DOST-Marinduque" and "DOST-LODIXR", all 486 hours in 2026. It is unclear whether these represent one, two, or three distinct activities. |
| **Mitigation** | 1. Flag in questionnaire as highest-priority clarification. 2. Do not merge or split entries until user confirms. 3. In the provisional resume, list them exactly as they appear in the CV with a `[NEEDS_CLARIFICATION]` annotation. |
| **Owner** | Phase 0 (Questionnaire) |
| **Status** | OPEN — awaiting user input |

---

### R-007: Single Point of Failure — Architecture Knowledge
| Field | Value |
|---|---|
| **Severity** | MEDIUM |
| **Likelihood** | Medium |
| **Impact** | Medium — if the AI agent context is lost, the project stalls |
| **Description** | The entire architectural context lives in the AI agent's conversation and the generated docs. If the conversation is lost or a new agent starts without reading the docs, architectural decisions may be contradicted. |
| **Mitigation** | 1. All decisions documented in `docs/MASTER_ARCHITECTURE_REVIEW.md`. 2. `AGENTS.md` contains operating instructions for any agent. 3. `PROJECT_STATUS.md` and `NEXT_ACTIONS.md` provide entry points. 4. Code includes JSDoc comments on non-obvious design choices. |
| **Owner** | Ongoing |
| **Status** | OPEN — documents being created now |

---

### R-008: SQLite Concurrency Under Trigger.dev
| Field | Value |
|---|---|
| **Severity** | LOW |
| **Likelihood** | Medium |
| **Impact** | Medium — write contention if multiple tasks run simultaneously |
| **Description** | SQLite supports only one writer at a time. If Trigger.dev runs multiple tasks concurrently (e.g., ingestion + scoring), write contention may cause failures. |
| **Mitigation** | 1. Enable WAL mode for SQLite (allows concurrent reads during writes). 2. Design Trigger.dev tasks to be sequential by default (ingestion → normalization → scoring pipeline). 3. If contention becomes a real issue, migrate to PostgreSQL (Drizzle makes this straightforward). |
| **Owner** | Phase 1 (Database setup) |
| **Status** | OPEN — mitigated by design |

---

### R-009: Candidate Profile Staleness
| Field | Value |
|---|---|
| **Severity** | LOW |
| **Likelihood** | High (over time) |
| **Impact** | Medium — resumes generated from outdated profile miss new skills/experience |
| **Description** | The candidate's skills, projects, and experience will grow over time. If the profile is not updated, generated resumes will underrepresent the candidate. |
| **Mitigation** | 1. `verification.last_user_reviewed_at` timestamp in the profile. 2. Dashboard warning when profile hasn't been reviewed in 30 days. 3. Easy profile update flow from the Settings view. |
| **Owner** | Phase 3 (Dashboard) |
| **Status** | OPEN — designed, not implemented |

---

### R-010: DotOrbit Academic Ghostwriting Exposure
| Field | Value |
|---|---|
| **Severity** | HIGH |
| **Likelihood** | Medium |
| **Impact** | Critical — candidate credibility destroyed if discovered on resume |
| **Description** | The candidate disclosed that DotOrbit currently earns revenue by building capstone/thesis systems for students. If this work appears on a resume or application and an employer discovers the context, it would raise serious integrity concerns about the candidate. |
| **Mitigation** | 1. System rule: **never** include DotOrbit capstone work in any resume, cover letter, or application. 2. Technical skills from any context remain verifiable — but the work context itself cannot be listed. 3. Legitimate DotOrbit clients (hotels, government) can be added when they materialize. 4. Decision D-009 enforces this permanently. |
| **Owner** | Resume engine (all phases) |
| **Status** | OPEN — rule established, enforcement in resume engine pending |

---

## Closed Risks

### R-006: Duplicate OJT/Certification Entries in CV ✅ RESOLVED
**Resolution (2026-07-23):** User confirmed all three entries refer to **one OJT**
under the LODIXR program. They were WFH for DOST Central Office and volunteered onsite
at DOST-Marinduque (hybrid 3 onsite / 2 WFH). Resume will list as one consolidated
entry. Decision D-008 documents this.
