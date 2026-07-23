# Next Actions

**Last updated:** 2026-07-24T03:35 PHT
**Current state:** 141/141 tests passing (18 files). Job URL importer + automated scoring validation integrated on branch `handoff/cursor-integration`.

---

## Run the dashboard

```powershell
pnpm --filter @job-app/dashboard dev
```

Then open http://localhost:3000. New **Import URL** page: http://localhost:3000/import-job

### Quick test of the URL importer
1. Start the dashboard (command above).
2. Go to **Import URL** in the sidebar (`/import-job`).
3. Paste a public job-posting URL (a page with JSON-LD `JobPosting` works best, e.g. a Greenhouse/Lever posting) and click **Extract Job Data**.
4. Review/edit the extracted fields in the preview, then **Confirm & Score**.
5. Expect a category / work-setup / eligibility / score result. Private, loopback, and link-local URLs (e.g. `http://169.254.169.254/`, `http://localhost`) are rejected before any fetch.

Fast unit check of the extractor + SSRF guards (no network):
```powershell
pnpm --filter @job-app/ingestion exec vitest run tests/url-extractor.test.ts
```

---

## ⚠️ Known Pre-Existing Build Failures (out of scope for the integration commit)

These pre-date the URL-importer and validation work (confirmed against `HEAD` / commit `5540f9f`). They are **not** caused by that work and were intentionally left untouched. Recommend handling on a **separate branch/commit**. The project's green gate is `pnpm test` (Vitest via esbuild, no type-check).

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

---

## Product backlog (unchanged, deferred)

- **Phase 6 — Browser Assistance** (Playwright) — NOT STARTED.
- **Phase 7 — Limited Automation** (Trigger.dev) — NOT STARTED.
- Additional source adapters (Gmail alerts, RSS/Atom).
- Answer remaining candidate questions (Q6–Q12: salary, location, schedule, equipment, English level).
