import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql, type SQL } from "drizzle-orm";

import * as schema from "./schema";

if (typeof window !== "undefined") {
  throw new Error("src/lib/db is server-only and must never be imported by a client component.");
}

/**
 * The one place the application talks to a database.
 *
 * Everything above this file goes through `lib/db/queries`, so the driver is
 * not something the rest of the application can see or depend on. Two are
 * supported, and both speak Postgres — the dialect never changes, so nothing
 * can behave differently in one place and not the other:
 *
 * - **postgres-js**, for a hosted Postgres such as Supabase. This is what runs
 *   on a serverless host.
 * - **PGlite**, Postgres compiled to WebAssembly and run in-process. Used by
 *   the test suite, which needs no server, no container and no network — and
 *   which truncates tables, so it must never be pointed at a shared database.
 *
 * Selection is by connection string: anything starting `postgres://` or
 * `postgresql://` uses the network driver, and `memory://` or a bare path uses
 * PGlite.
 */

export type Database =
  | ReturnType<typeof drizzlePostgres<typeof schema>>
  | ReturnType<typeof drizzlePglite<typeof schema>>;

function connectionString(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Use a postgres:// connection string for a hosted " +
        "database, or memory:// to run against PGlite in-process.",
    );
  }
  return url;
}

function createDb(): Database {
  const url = connectionString();

  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    const client = postgres(url, {
      // A serverless function is one short-lived request, so a large pool is
      // wasted and a slow one is worse than none.
      max: Number(process.env.DATABASE_POOL_MAX ?? 1),
      idle_timeout: 20,
      connect_timeout: 10,
      // Supabase's pooled endpoint runs in transaction mode, where prepared
      // statements do not survive between statements. Turning them off is what
      // makes the pooler usable at all.
      prepare: false,
    });
    return drizzlePostgres(client, { schema });
  }

  // PGlite. `memory://` is a fresh database per process; anything else is a
  // directory PGlite persists into.
  const dataDir = url === "memory://" ? "memory://" : url.replace(/^file:/, "");
  return drizzlePglite(dataDir, { schema });
}

/**
 * The connection is opened on first use, never on import.
 *
 * Importing a module must not connect to anything. A build collects page data
 * by evaluating every route, and a serverless function evaluates its module
 * graph before it knows whether the request even needs a database — connecting
 * at import time turns a missing or unreachable database into a crash before
 * any code of ours runs, which is exactly how this failed on a serverless host.
 *
 * Next's dev server re-evaluates modules on every change, so the handle is
 * cached on `globalThis` rather than reconnecting on each reload.
 */
const globalForDb = globalThis as unknown as { __examDb?: Database };

function getDb(): Database {
  const existing = globalForDb.__examDb;
  if (existing) return existing;

  const created = createDb();
  globalForDb.__examDb = created;
  return created;
}

export const db: Database = new Proxy({} as Database, {
  get(_target, property, receiver) {
    return Reflect.get(getDb(), property, receiver);
  },
  has(_target, property) {
    return Reflect.has(getDb(), property);
  },
});

/**
 * Runs SQL the query builder does not model — the full-text search predicates,
 * and the schema statements the migration script issues.
 *
 * Takes a `sql` template rather than a string, so every value is bound as a
 * parameter. Retrieval passes a student's search terms through here, and
 * building that SQL by concatenation would be an injection hole.
 */
export async function rawQuery<T = Record<string, unknown>>(
  query: SQL,
): Promise<T[]> {
  const result = await db.execute(query);
  return (Array.isArray(result) ? result : (result.rows ?? [])) as T[];
}

/**
 * Executes schema statements. Only for DDL written in this repository — it does
 * no binding, so nothing derived from a request may reach it.
 */
export async function executeDdl(statements: string): Promise<void> {
  await db.execute(sql.raw(statements));
}

export { schema };
