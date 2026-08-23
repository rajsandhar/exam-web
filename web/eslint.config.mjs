import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored runtimes copied in by `pnpm setup:assets`. They are build
    // outputs of node_modules, not source, and linting them is meaningless.
    "public/monaco/**",
    "public/pyodide/**",
    "public/sqljs/**",
    "data/**",
    "drizzle/**",
  ]),
]);

export default eslintConfig;
