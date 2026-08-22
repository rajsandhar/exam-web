import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { ensureDataDir, resolveDatabaseFile } from "@/lib/paths";
import * as schema from "./schema";

if (typeof window !== "undefined") {
  throw new Error("src/lib/db is server-only and must never be imported by a client component.");
}

/**
 * One SQLite connection per process. Next's dev server re-evaluates modules on
 * every change, so the handle is cached on `globalThis` to avoid leaking file
 * handles and to keep `PRAGMA` settings stable.
 */

type Db = ReturnType<typeof createDb>;

function createDb() {
  ensureDataDir();
  const file = resolveDatabaseFile();
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return drizzle(sqlite, { schema });
}

const globalForDb = globalThis as unknown as { __examDb?: Db };

export const db: Db = globalForDb.__examDb ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__examDb = db;
}

/** Raw handle, for FTS5 statements Drizzle does not model. */
export function rawSqlite(): Database.Database {
  return (db.$client as Database.Database);
}

export { schema };
