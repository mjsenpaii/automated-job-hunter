# Next Actions

**Last updated:** 2026-07-23T20:56 PHT  
**Current state:** Foundation complete — 71/71 tests, dashboard scaffolded, resume engine ready

---

## What's Ready Now

You can **preview the dashboard** right now:
```
pnpm --filter @job-app/dashboard dev
```
Then open http://localhost:3000 in your browser.

---

## Recommended Next Steps (in priority order)

### 1. Phase 2 — Job Discovery (Source Adapters)
Build the pipeline to discover and ingest real job listings:
- Manual URL adapter (paste a job posting URL → extract and classify)
- Gmail inbox adapter (read job alert emails)
- RSS/Atom feed adapter (subscribe to job boards)
- Connect adapters → classification → scoring → database

### 2. Wire Dashboard to Database
Replace mock data in the dashboard with real database queries:
- API routes reading from SQLite via Drizzle
- Real-time job list views
- Score breakdown from stored scores

### 3. Resume DOCX/PDF Generation
Extend the resume engine to output formatted documents:
- DOCX generation (python-docx or docx-templates)
- ATS-friendly formatting
- Per-job tailored resumes

### 4. Phase 5 — Application Package Assembly
- Cover letter generation (from verified facts + job description)
- Application package (resume + cover letter + answers)
- Human approval gate before any submission

---

## User Actions (Optional)

### Answer Remaining Questions
- Q6: Salary expectations
- Q7-Q12: Location, schedule, equipment, English level
