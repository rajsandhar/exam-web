import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "node",
    // A database of its own: modules that resolve settings open a connection on
    // import, and a test run must never touch the developer's papers.
    env: { DATABASE_URL: "file:./data/unit-test.db" },
    globalSetup: ["./tests/setup/test-database.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["tests/e2e/**", "tests/live/**"],
  },
});
