import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { ensureDataDir, MIGRATIONS_DIR, resolveDatabaseFile } from "@/lib/paths";

/**
 * Gives the unit suite its own database.
 *
 * Several modules now reach the database as soon as they are imported — the AI
 * settings resolver, for one — so without this a test run would read and write
 * the developer's own papers.
 *
 * `DATABASE_URL` is set here rather than read from `vitest.config.mts`: a
 * global setup runs in the main process, before the config's `test.env` is
 * applied to worker environments, so relying on that resolved the *developer's*
 * database and emptied it. The name is also checked before anything is deleted,
 * so this can only ever destroy a file it was meant to.
 */

const TEST_DATABASE_URL = "file:./data/unit-test.db";

export default function setup(): void {
  process.env.DATABASE_URL = TEST_DATABASE_URL;

  ensureDataDir();
  const file = resolveDatabaseFile(TEST_DATABASE_URL);

  const name = path.basename(file);
  if (!name.includes("test")) {
    throw new Error(
      `Refusing to reset ${name}: the unit-test database must have "test" in its name.`,
    );
  }

  // Start from empty every run, so a test can never pass because of something
  // an earlier run left behind.
  for (const suffix of ["", "-shm", "-wal"]) {
    fs.rmSync(`${file}${suffix}`, { force: true });
  }

  const sqlite = new Database(file);
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_DIR });
  sqlite.close();
}
