import { defineConfig } from "drizzle-kit";

/**
 * Migrations run against the *direct* connection, never the pooler.
 *
 * Supabase's pooled endpoint runs in transaction mode, which cannot hold the
 * advisory locks and multi-statement DDL a migration needs. `DIRECT_DATABASE_URL`
 * is the unpooled connection; it falls back to `DATABASE_URL` for a local
 * database, where the two are the same thing.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: false,
});
