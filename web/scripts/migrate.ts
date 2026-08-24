/**
 * Applies Drizzle migrations and creates the full-text search index used for
 * reference retrieval (CLAUDE.md §16).
 *
 *   pnpm db:migrate
 *
 * The search column is a generated `tsvector`, so unlike the FTS5 virtual table
 * and triggers it replaced, it cannot drift out of step with the content. It is
 * created here rather than in the schema because Drizzle does not model
 * generated columns.
 *
 * Runs against the direct connection when set — `DIRECT_DATABASE_URL`, or the
 * `POSTGRES_URL_NON_POOLING` that Vercel's Supabase integration provides.
 * Supabase's pooled endpoint is in transaction mode and cannot run this.
 */
import "./load-env";

import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import {
  isPostgresUrl,
  mismatchMessage,
  resolveDatabaseUrl,
  resolveDirectDatabaseUrl,
} from "../src/lib/db/config";
import { MIGRATIONS_DIR } from "../src/lib/paths";

// One statement each: a prepared query cannot carry two.
const SEARCH_SETUP = [
  `ALTER TABLE reference_chunks
     ADD COLUMN IF NOT EXISTS search tsvector
     GENERATED ALWAYS AS (to_tsvector('english', content)) STORED`,
  `CREATE INDEX IF NOT EXISTS reference_chunks_search_idx
     ON reference_chunks USING GIN (search)`,
];

async function main(): Promise<void> {
  const resolved = resolveDirectDatabaseUrl();

  if (!resolved) {
    throw new Error(
      "Set DATABASE_URL (or POSTGRES_URL), and DIRECT_DATABASE_URL (or " +
        "POSTGRES_URL_NON_POOLING) for a pooled host, before migrating.",
    );
  }

  const mismatch = mismatchMessage(resolveDatabaseUrl(), resolved);
  if (mismatch) throw new Error(mismatch);

  const url = resolved.url;

  if (isPostgresUrl(url)) {
    const client = postgres(url, { max: 1, prepare: false });
    const db = drizzlePostgres(client);
    await migratePostgres(db, { migrationsFolder: MIGRATIONS_DIR });
    for (const statement of SEARCH_SETUP) await client.unsafe(statement);
    await client.end();
  } else {
    const dataDir = url === "memory://" ? "memory://" : url.replace(/^file:/, "");
    const db = drizzlePglite(dataDir);
    await migratePglite(db, { migrationsFolder: MIGRATIONS_DIR });
    for (const statement of SEARCH_SETUP) await db.$client.exec(statement);
    await db.$client.close();
  }

  process.stdout.write(`Migrated ${redact(url)} (from ${resolved.variable})\n`);
}

/** Never print a password to a terminal or a build log. */
function redact(url: string): string {
  return url.replace(/\/\/([^:]+):[^@]+@/, "//$1:***@");
}

main().catch((cause) => {
  process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
  process.exit(1);
});
