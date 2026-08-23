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
    // The setup file assigns the real value before the client is imported.
    env: { DATABASE_URL: "./data/unit-test-pg" },
    globalSetup: ["./tests/setup/reset-database.ts"],
    setupFiles: ["./tests/setup/test-database.ts"],
    // PGlite is a single embedded Postgres: two processes opening the same
    // store abort its WebAssembly runtime. So the files run one after another,
    // in one process, sharing one module registry and one instance.
    fileParallelism: false,
    isolate: false,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["tests/e2e/**", "tests/live/**"],
  },
});
