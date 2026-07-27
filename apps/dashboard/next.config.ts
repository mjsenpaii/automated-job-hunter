import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allows production verification beside a running local dev server without
  // both processes writing to `.next`. Normal development remains unchanged.
  distDir: process.env.JOB_APP_NEXT_DIST_DIR?.trim() || '.next',
  // Workspace-package strategy: packages are COMPILED to `dist` (valid Node ESM) and consumed
  // as compiled output. Their `main`/`types`/`exports` point at `dist`, so Turbopack resolves
  // their real `.js` files directly — no source transpilation or `.js`→`.ts` aliasing needed.
  // Prerequisite: build the workspace packages (`pnpm build`) before `next build`/`next dev`.
  // `pnpm build` (Turbo) does this automatically via `dependsOn: ["^build"]`.
  serverExternalPackages: ["better-sqlite3"],
  async redirects() {
    return [
      {
        source: '/add-job',
        destination: '/import-job',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
