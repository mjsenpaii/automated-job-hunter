# Next Actions

**Last updated:** 2026-07-28 PHT
**Current state:** Gemini hybrid importer, professional dashboard redesign, job export, and deterministic Philippine national-government salary-grade enrichment are hardened locally for review. The local jobs database was explicitly cleared on 2026-07-28 and currently contains zero jobs. 232/232 tests pass across 26 files. No commit or push has been made.

---

## Review this implementation

1. Review the redesigned overview, `/import-job`, PH and international lists, and scored/rejected
   detail pages.
2. Confirm that the local `GEMINI_API_KEY` remains only in `apps/dashboard/.env.local`; never move it
   to a `NEXT_PUBLIC_*` variable. Optional model overrides are `GEMINI_PRIMARY_MODEL` and
   `GEMINI_FALLBACK_MODEL`. An existing `GEMINI_MODEL` is supported only as a legacy fallback
   override.
3. If a development server is already using `apps/dashboard/.next`, stop it before running
   `pnpm build`; concurrent Next dev/build processes can contend for the same output directory.
4. If the implementation is accepted, create a commit only after explicit user approval.
5. Review the PSA Salary Grade 6 import and its explicit “reference only” treatment. The committed
   2026 DBM schedule and enrichment rules are documented in
   `docs/GOVERNMENT_SALARY_ENRICHMENT.md`.

### Known limitations

- Local SQLite is a single-file store. WAL helps readers, but concurrent writers can still contend;
  keep manual imports serialized when running multiple local processes.
- Legacy schema columns require an empty-string sentinel for unknown posting dates. Extracted
  unknown dates remain semantically absent in the structured snapshot.
- Gemini cannot recover facts that are not present or visible in the supplied public content.
- The identical-input cache is intentionally process-local, memory-only, bounded to 32 entries, and
  expires after two minutes. It is not shared across processes or restarts.
- The two-call ceiling means a fallback 429/5xx error is returned immediately after the bounded
  Retry-After-aware wait; there is no third request or fallback loop.
- Authenticated pages should be pasted manually; login, CAPTCHA handling, browser automation, and
  automatic application submission remain intentionally out of scope.
- Trigger.dev scheduling and Lever discovery remain deferred.
- Government salary enrichment currently supports only the verified 2026 DBM national-government
  schedule. Unsupported years, local-government roles, private employers, and unclear government
  coverage intentionally receive no reference range.
- Existing saved rows are not automatically rewritten. The explicit
  `pnpm --filter @job-app/ingestion backfill:government` utility defaults to dry-run; use
  `-- --apply` only after reviewing its counts. Apply mode was not run in this session.

---

## Run the dashboard

```powershell
# Build workspace packages first (dashboard consumes their compiled `dist`):
pnpm build
# Then start the dev server:
pnpm --filter @job-app/dashboard dev
```

Then open http://localhost:3000. **Import Job** page: http://localhost:3000/import-job

> The dashboard consumes the workspace packages as compiled `dist`, so build the packages
> (`pnpm build`, or at least once) before `dev`/`build`. See
> `apps/dashboard/README.md` → "Workspace packages & build strategy".

### Quick test of the unified importer
1. Start the dashboard (command above).
2. Go to **Import Job** in the sidebar (`/import-job`).
3. Paste a public URL, copied webpage, raw HTML, or plain job description and press Enter.
4. Review Gemini's structured extraction, edit any fields, then select **Confirm & Score**.
5. Hard-rejected / ineligible jobs show **Not evaluated** plus rejection reasons (never a fake score).
6. Private, loopback, and link-local URLs remain blocked before any fetch.
7. A saved job detail page provides **Copy all details** and **Download .txt** actions in its
   header. Both include the complete sanitized job, decision, score, application, and raw source
   snapshot without changing the database. The decision controls now sit in a compact full-width
   bar above a full-width, non-scrolling tab workspace. **Generate resume** remains visible as a
   clearly disabled **Soon** action after the two export buttons, keeping Shortlist/Reject compact.
8. Desktop/laptop navigation can collapse to a 72px labelled icon rail and expand again. The
   control is centred across the sidebar/content boundary, the preference is stored locally, and
   mobile continues to use the existing bottom navigation.
9. Job detail headers use explicit **Position** and **Company** labels. The redundant overview back
   link and idle export-helper sentence were removed.
10. Philippine national-government jobs with an explicit salary grade and a supported posting year
    can show a separate DBM reference range. Contract-of-Service postings keep actual salary empty
    unless the source explicitly states compensation. Government metadata remains editable before
    confirmation and is included in both text exports.

Fast unit check of the extractor + SSRF guards (no network):
```powershell
pnpm --filter @job-app/ingestion exec vitest run tests/url-extractor.test.ts
```

Fast check of import contracts / UI state helpers:
```powershell
pnpm --filter @job-app/ingestion exec vitest run tests/import-contracts.test.ts
pnpm --filter @job-app/dashboard exec vitest run
```

---

## ✅ Build Failures — RESOLVED on `fix/dashboard-build-runtime`

The build/runtime failures below (originally documented as out-of-scope for the integration commit)
are now **fixed**. `pnpm build`, all package builds, and `pnpm --filter @job-app/dashboard build`
pass, and the dashboard runs. The three items are kept as a record of what changed. See the
"Workspace packages & build strategy" section of `apps/dashboard/README.md` and the PROJECT_STATUS
session note for the full strategy — **do not reintroduce `transpilePackages` for the workspace
packages; they are consumed as compiled `dist`.**

Resolution summary:
- **#1 Turbo:** added `"packageManager": "pnpm@11.16.0"` to root `package.json`; also set pnpm 11
  `allowBuilds` in `pnpm-workspace.yaml` (and removed the ignored legacy `pnpm.onlyBuiltDependencies`).
- **#2 `tsc` package builds:** added `@types/node` to `classification` + `ingestion`; fixed
  `packages/ingestion/tsconfig.json` (`include: ["src"]`, dropped the sibling-source `paths`, excluded
  the report script); added nameable return types in `packages/db/src/connection.ts`.
- **#3 Next 16 `params`:** the three dynamic route handlers now use `params: Promise<{ id: string }>`
  + `await`.
- **Also fixed:** workspace packages now build to `dist` and the dashboard consumes that;
  `@job-app/db` exposes `exports` for `/schema` and `/connection`; `drizzle-orm` +
  `@job-app/ingestion` declared as dashboard deps; `api/jobs` POST rewritten to call the real
  `ingestJob` pipeline (nonexistent `classifyJob` removed); APIs return structured JSON; DB opens
  lazily and self-provisions via `ensureSchema()`; `better-sqlite3` bumped `9 → ^12` for a Node-24
  prebuilt binary; unimplemented sidebar links hidden.

<details><summary>Original failure records (now fixed)</summary>

### 1. Turbo cannot resolve the workspace
- **Command:** `pnpm build` (→ `turbo run build`) — also `pnpm lint` (`turbo run lint`).
- **Error:** `x Could not resolve workspace. -> Missing 'devEngines.packageManager' or legacy 'packageManager' field in package.json`
- **Why pre-existing:** root `package.json` has never declared a `packageManager` field; Turbo 2.x requires it. Root `package.json` is unmodified by this work.
- **Recommended minimal fix:** add `"packageManager": "pnpm@11.16.0"` (matching the installed pnpm) to root `package.json`.
- **Files likely affected:** `package.json` (root).

### 2. `tsc` package build fails — Web/Node globals unresolved
- **Command:** `pnpm -r --filter "./packages/*" build` (each package runs `tsc`).
- **Error:** `packages/classification/src/deduplication.ts(159,24): error TS2552: Cannot find name 'URL'. Did you mean 'url'?` (byte-identical at `HEAD`). The same class of error affects `fetch`/`URL`/`AbortController` usage elsewhere (incl. the new `url-extractor.ts`).
- **Why pre-existing:** `tsconfig.base.json` sets `"lib": ["ES2022"]` with no DOM lib, and packages don't include `@types/node`, so `URL`/`fetch` globals are undefined for `tsc`. Vitest/esbuild don't type-check, so tests stayed green.
- **Recommended minimal fix:** add `"types": ["node"]` (and `@types/node` as a devDependency) to the affected packages, or add `"DOM"` to `lib` in `tsconfig.base.json`. Also either drop `tests` from `include` in `packages/ingestion/tsconfig.json` or set `rootDir` appropriately (currently emits `TS6059` because `tests/**` is outside `rootDir: src`).
- **Files likely affected:** `tsconfig.base.json`, `packages/*/package.json` (add `@types/node`), `packages/ingestion/tsconfig.json`.

### 3. Dashboard `next build` fails — Next 16 route `params` migration
- **Command:** `pnpm --filter @job-app/dashboard exec next build` (and raw `tsc --noEmit`).
- **Error:** `Type '{ params: { id: string; } }' is not assignable to '{ params: Promise<{ id: string; }> }'` for `src/app/api/jobs/[id]/route.ts`, `.../approve/route.ts`, `.../reject/route.ts`.
- **Why pre-existing:** Next.js 16 changed dynamic route handler `params` to a `Promise`. These committed routes still use the old synchronous `{ params }` signature. The new importer route (`/api/extract`) and `import-job` page are **not** dynamic and don't add to this.
- **Recommended minimal fix:** update the three handlers to `({ params }: { params: Promise<{ id: string }> })` and `await params`. (See `apps/dashboard/AGENTS.md`: "This is NOT the Next.js you know.")
- **Files likely affected:** `apps/dashboard/src/app/api/jobs/[id]/route.ts`, `.../approve/route.ts`, `.../reject/route.ts`.

</details>

---

## Product backlog (unchanged, deferred)

- **Phase 6 — Browser Assistance** (Playwright) — NOT STARTED.
- **Phase 7 — Limited Automation** (Trigger.dev) — NOT STARTED.
- Additional source adapters (Gmail alerts, RSS/Atom).
- Answer remaining candidate questions (Q6–Q12: salary, location, schedule, equipment, English level).
