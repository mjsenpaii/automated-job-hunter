This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Workspace packages & build strategy

**The workspace packages (`@job-app/core`, `@job-app/db`, `@job-app/classification`,
`@job-app/scoring`, `@job-app/ingestion`) are consumed as COMPILED `dist` output**, not as raw
TypeScript source. Each package's `package.json` `main`/`types`/`exports` point at `dist/*.js` /
`dist/*.d.ts`, and their relative imports keep explicit `.js` specifiers (valid Node ESM). This is
the single, consistent strategy for the whole repo:

- **Do NOT** add `transpilePackages` for these packages or try to make Turbopack consume their
  `src/*.ts`. Next 16.2's Turbopack cannot map `.js` → `.ts` for workspace source
  (`resolveExtensionAlias` isn't recognized on this version), which is what originally broke the
  build. Consuming `dist` sidesteps this entirely.
- **Build packages before running the dashboard.** `pnpm build` (Turbo) builds all packages first
  via `dependsOn: ["^build"]`, then the dashboard. If you run `pnpm --filter @job-app/dashboard dev`
  or `... build` directly, run `pnpm build` (or build the packages) at least once first so `dist`
  exists. Editing package source requires a rebuild to take effect in the dashboard.
- **Tests are unaffected:** Vitest resolves `@job-app/*` to `src` via its own config aliases, so the
  141-test suite always runs against source regardless of the `dist` strategy.

### Database

`@job-app/db` uses `better-sqlite3` (native). It must have a binary for your Node version:
`better-sqlite3 >= 12` ships prebuilt binaries for Node 24, so a normal `pnpm install` provisions it
(the package is approved to run its install script via `allowBuilds` in `pnpm-workspace.yaml`). No
C++ toolchain is required. The dashboard opens the SQLite file lazily (in request handlers, not at
import) and `getDb()` calls `ensureSchema()` to create tables on first connect, so `/api/stats` and
`/api/jobs` return valid JSON against a fresh `data/app.db`. API routes always return structured
JSON (including errors) — never HTML 500s.

## Import a job from a URL

The dashboard can import a public job posting directly from its URL.

1. Start the dev server: `pnpm --filter @job-app/dashboard dev`.
2. Open **Import URL** in the sidebar (`/import-job`).
3. Paste a public job-posting URL and click **Extract Job Data**. Extraction tries JSON-LD (`JobPosting`) first, then Open Graph / meta tags, then an HTML heuristic — with a per-field confidence badge.
4. Review and edit the extracted fields in the preview, then **Confirm & Score** to normalize, classify, check eligibility, and score the job.

Extraction is backed by `POST /api/extract` → `extractFromUrl()` in `@job-app/ingestion`. The endpoint applies SSRF protections (scheme allow-list, private/loopback/link-local IPv4+IPv6 blocking, DNS-resolution checks, per-redirect-hop validation, request timeout, and a response-size cap). See `docs/SECURITY.md` → "URL Importer — SSRF Protection". Private/loopback/link-local URLs are rejected before any network request. The importer only reads public postings — it never performs authenticated scraping, CAPTCHA bypass, or application submission.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
