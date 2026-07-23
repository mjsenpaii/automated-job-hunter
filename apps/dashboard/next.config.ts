import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace-package strategy: packages are COMPILED to `dist` (valid Node ESM) and consumed
  // as compiled output. Their `main`/`types`/`exports` point at `dist`, so Turbopack resolves
  // their real `.js` files directly — no source transpilation or `.js`→`.ts` aliasing needed.
  // Prerequisite: build the workspace packages (`pnpm build`) before `next build`/`next dev`.
  // `pnpm build` (Turbo) does this automatically via `dependsOn: ["^build"]`.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
