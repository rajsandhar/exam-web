import { defineConfig } from "drizzle-kit";

import { resolveDirectDatabaseUrl } from "./src/lib/db/config";

/**
 * Migrations run against the *direct* connection, never the pooler.
 *
 * Supabase's pooled endpoint runs in transaction mode, which cannot hold the
 * advisory locks and multi-statement DDL a migration needs. The direct
 * connection is `DIRECT_DATABASE_URL`, or the `POSTGRES_URL_NON_POOLING` that
 * Vercel's Supabase integration sets; either falls back to the pooled names for
 * a local database, where the two are the same thing.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: resolveDirectDatabaseUrl()?.url ?? "",
  },
  strict: true,
  verbose: false,
});
