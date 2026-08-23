import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end coverage of the flow in CLAUDE.md §26.
 *
 * Runs against `AI_PROVIDER=mock`, so no API call is made and no key is needed
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

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command: `pnpm exec next dev --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/build`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      AI_PROVIDER: "mock",
      DATABASE_URL: "file:./data/e2e.db",
    },
  },
});
