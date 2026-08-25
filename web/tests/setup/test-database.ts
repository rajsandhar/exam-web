import path from "node:path";

import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";

/**
 * Migrates the suite's database, once per test process.
 *
 * PGlite: Postgres compiled to WebAssembly and run in-process, so the suite
 * needs no server, no container and no network, and still exercises the dialect
 * production runs on. The suite empties tables, so it must never be pointed at
 * a shared database — which is why it ignores whatever `DATABASE_URL` happens
 * to be set to and uses a store of its own.
 *
 * Migrating here rather than in the global setup keeps the store to a single
 * process: two processes opening one PGlite instance abort its WebAssembly
 * runtime. `tests/setup/reset-database.ts` empties it beforehand, and
 * `vitest.config.mts` pins the suite to one fork for the same reason.
 */

const TEST_DATA_DIR = path.resolve(process.cwd(), "data", "unit-test-pg");

// One statement each: a prepared query cannot carry two.
const SEARCH_SETUP = [
  `ALTER TABLE reference_chunks
     ADD COLUMN IF NOT EXISTS search tsvector
     GENERATED ALWAYS AS (to_tsvector('english', content)) STORED`,
  `CREATE INDEX IF NOT EXISTS reference_chunks_search_idx
     ON reference_chunks USING GIN (search)`,
];

process.env.DATABASE_URL = TEST_DATA_DIR;

const alreadyMigrated = globalThis as unknown as { __examTestDbReady?: Promise<void> };

/**
 * Component tests run under happy-dom, where `window` exists and importing the
 * database client is refused outright — correctly, since it is server-only.
 * They touch no database, so there is nothing to prepare for them.
 */
const needsDatabase = typeof window === "undefined";

if (needsDatabase) {
  alreadyMigrated.__examTestDbReady ??= (async () => {
    // Imported after the URL is set: the client binds its connection on import.
    const { db } = await import("@/lib/db/client");
    const { MIGRATIONS_DIR } = await import("@/lib/paths");

    await migrate(db as never, { migrationsFolder: MIGRATIONS_DIR });

    // The generated search column lives outside Drizzle, created here exactly
    // as the migration script creates it against a hosted database.
    for (const statement of SEARCH_SETUP) {
      await db.execute(sql.raw(statement));
    }
  })();
}

await alreadyMigrated.__examTestDbReady;
