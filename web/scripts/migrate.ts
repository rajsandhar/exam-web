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
 * Runs against `DIRECT_DATABASE_URL` when set. Supabase's pooled endpoint is in
 * transaction mode and cannot run this.
 */
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

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
  const url = (
    process.env.DIRECT_DATABASE_URL ??
    process.env.DATABASE_URL ??
    ""
  ).trim();

  if (!url) {
    throw new Error(
      "Set DATABASE_URL (and DIRECT_DATABASE_URL for a pooled host) before migrating.",
    );
  }

  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
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

  process.stdout.write(`Migrated ${redact(url)}\n`);
}

/** Never print a password to a terminal or a build log. */
function redact(url: string): string {
  return url.replace(/\/\/([^:]+):[^@]+@/, "//$1:***@");
}

main().catch((cause) => {
  process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
  process.exit(1);
});
