import path from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Live tests hit the real Anthropic API and are excluded from `pnpm test`.
 * They skip themselves unless ANTHROPIC_API_KEY and ANTHROPIC_MODEL are set.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/live/**/*.live.test.ts"],
    testTimeout: 600_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
