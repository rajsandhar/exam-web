import { afterEach, describe, expect, it } from "vitest";

import {
  mismatchMessage,
  resolveDatabaseUrl,
  resolveDirectDatabaseUrl,
} from "@/lib/db/config";

/**
 * What the application says when the database is misconfigured.
 *
 * The deployment that prompted the move to Postgres failed with
 * `ENOENT: mkdir '/var/task/web/data'` at module evaluation — a message that
 * named a directory rather than the problem. These check that the same mistake
 * now explains itself.
 *
 * The module is re-imported per case because the connection is resolved lazily
 * and the message depends on the environment at the time.
 */

const MANAGED = [
  "DATABASE_URL",
  "DIRECT_DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "VERCEL",
] as const;

const ORIGINAL = Object.fromEntries(MANAGED.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of MANAGED) {
    const value = ORIGINAL[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

/** Forces a fresh connection attempt with the environment as it stands. */
async function connect(): Promise<void> {
  const { db } = await import("@/lib/db/client");
  const globalForDb = globalThis as unknown as { __examDb?: unknown };
  delete globalForDb.__examDb;
  try {
    // Any property access resolves the connection.
    void (db as unknown as Record<string, unknown>).select;
  } finally {
    delete globalForDb.__examDb;
  }
}

describe("database configuration", () => {
  it("says so when nothing is configured at all", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    await expect(connect()).rejects.toThrow(/DATABASE_URL is not set/);
  });

  it("explains that a serverless host cannot use a local database", async () => {
    // Exactly the value the failing deployment still had.
    process.env.DATABASE_URL = "file:./data/app.db";
    delete process.env.POSTGRES_URL;
    process.env.VERCEL = "1";

    await expect(connect()).rejects.toThrow(/needs a hosted database/);
    await expect(connect()).rejects.toThrow(/DIRECT_DATABASE_URL/);
  });

  it("allows a local database anywhere with a filesystem", async () => {
    process.env.DATABASE_URL = "./data/unit-test-pg";
    delete process.env.POSTGRES_URL;
    delete process.env.VERCEL;

    await expect(connect()).resolves.toBeUndefined();
  });

  it("accepts a hosted connection string on a serverless host", async () => {
    process.env.DATABASE_URL = "postgresql://user:pw@db.example:6543/postgres";
    delete process.env.POSTGRES_URL;
    process.env.VERCEL = "1";

    // Resolving the configuration must not require the database to answer.
    await expect(connect()).resolves.toBeUndefined();
  });

  it("uses the integration's own variable names when ours are unset", async () => {
    // What Vercel's Supabase integration injects, and all it injects.
    delete process.env.DATABASE_URL;
    process.env.POSTGRES_URL = "postgresql://user:pw@db.example:6543/postgres";
    process.env.VERCEL = "1";

    await expect(connect()).resolves.toBeUndefined();
  });

  it("steps over a stale local path on a serverless host", async () => {
    // The state a project is left in when DATABASE_URL was set by hand before
    // the database existed: both names present, only one of them usable.
    process.env.DATABASE_URL = "file:./data/app.db";
    process.env.POSTGRES_URL = "postgresql://user:pw@db.example:6543/postgres";
    process.env.VERCEL = "1";

    await expect(connect()).resolves.toBeUndefined();
    expect(resolveDatabaseUrl()?.url).toBe(process.env.POSTGRES_URL);
  });

  it("keeps an explicit local database ahead of a pulled one off the host", async () => {
    // A developer who has pulled the deployment's environment must not have
    // tests and migrations silently retargeted at production.
    process.env.DATABASE_URL = "./data/unit-test-pg";
    process.env.POSTGRES_URL = "postgresql://user:pw@db.example:6543/postgres";
    delete process.env.VERCEL;

    expect(resolveDatabaseUrl()?.url).toBe("./data/unit-test-pg");
  });
});

describe("migration connection", () => {
  it("prefers the direct connection over the pooled one, under either name", () => {
    process.env.DATABASE_URL = "postgresql://user:pw@db.example:6543/postgres";
    process.env.DIRECT_DATABASE_URL = "postgresql://user:pw@db.example:5432/postgres";

    expect(resolveDirectDatabaseUrl()?.url).toContain(":5432/");

    delete process.env.DIRECT_DATABASE_URL;
    process.env.POSTGRES_URL_NON_POOLING = "postgresql://user:pw@db.example:5432/postgres";

    expect(resolveDirectDatabaseUrl()?.url).toContain(":5432/");
  });

  it("falls back to the pooled connection where there is no pooler", () => {
    delete process.env.DIRECT_DATABASE_URL;
    delete process.env.POSTGRES_URL_NON_POOLING;
    process.env.DATABASE_URL = "./data/unit-test-pg";

    expect(resolveDirectDatabaseUrl()?.url).toBe("./data/unit-test-pg");
  });
});

describe("migrating one database while the application reads another", () => {
  const local = { url: "./data/e2e-pg", variable: "DATABASE_URL" };
  const hosted = {
    url: "postgresql://user:pw@db.example:5432/postgres",
    variable: "DIRECT_DATABASE_URL",
  };

  it("refuses a hosted migration against a local application database", () => {
    // What a developer's .env.local does to the end-to-end suite, which sets
    // only DATABASE_URL and shells out to the migration script.
    const message = mismatchMessage(local, hosted);
    expect(message).toMatch(/Refusing to migrate/);
    expect(message).toContain("DIRECT_DATABASE_URL names a hosted database");
    expect(message).toContain("DATABASE_URL names a local database");
  });

  it("allows a pair that names the same kind of database", () => {
    expect(mismatchMessage(local, { ...local, variable: "DIRECT_DATABASE_URL" })).toBeNull();
    expect(mismatchMessage({ ...hosted, variable: "DATABASE_URL" }, hosted)).toBeNull();
  });

  it("says nothing when there is no pair to compare", () => {
    expect(mismatchMessage(null, hosted)).toBeNull();
    expect(mismatchMessage(local, null)).toBeNull();
  });
});
