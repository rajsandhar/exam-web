import { defineConfig, devices } from "@playwright/test";

import { STORAGE_STATE } from "./tests/e2e/accounts";

/**
 * End-to-end coverage of the flow in CLAUDE.md §26.
 *
 * Runs against `GENERATION_PROVIDER=sample`, so no API call is made and no key is needed
 * (SPEC_ADDENDUM.md §5). The suite starts its own dev server on a separate port
 * and uses its own database file, so it never disturbs the developer's own papers.
 */

const PORT = 3210;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    // Signs in once; every other spec reuses the cookie.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
    },
  ],

  webServer: {
    // Migrated and seeded first, so the suite runs against a database whose
    // shape matches the branch rather than whatever a previous run left behind.
    command: `pnpm exec tsx scripts/migrate.ts && pnpm exec tsx scripts/seed-syllabus.ts && pnpm exec next dev --port ${PORT}`,
    // `/build` redirects to the sign-in screens, so the readiness probe uses a
    // page that is reachable signed out.
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      GENERATION_PROVIDER: "sample",
      // A PGlite directory of its own, as the unit suite has. Not a file:
      // the SQLite-era `./data/e2e.db` is now read as a directory name, and
      // the leftover file of that name stops PGlite opening it at all.
      DATABASE_URL: "./data/e2e-pg",
      // Set explicitly, not left to fall back: the scripts read `.env.local`,
      // and a developer's copy of that file may hold a deployment's direct
      // connection. The suite migrates and seeds, so it must never reach one.
      DIRECT_DATABASE_URL: "./data/e2e-pg",
    },
  },
});
