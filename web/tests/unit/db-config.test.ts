import { afterEach, describe, expect, it } from "vitest";

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

const ORIGINAL = {
  DATABASE_URL: process.env.DATABASE_URL,
  VERCEL: process.env.VERCEL,
};

afterEach(() => {
  process.env.DATABASE_URL = ORIGINAL.DATABASE_URL;
  if (ORIGINAL.VERCEL === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = ORIGINAL.VERCEL;
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
    await expect(connect()).rejects.toThrow(/DATABASE_URL is not set/);
  });

  it("explains that a serverless host cannot use a local database", async () => {
    // Exactly the value the failing deployment still had.
    process.env.DATABASE_URL = "file:./data/app.db";
    process.env.VERCEL = "1";

    await expect(connect()).rejects.toThrow(/needs a hosted database/);
    await expect(connect()).rejects.toThrow(/DIRECT_DATABASE_URL/);
  });

  it("allows a local database anywhere with a filesystem", async () => {
    process.env.DATABASE_URL = "./data/unit-test-pg";
    delete process.env.VERCEL;

    await expect(connect()).resolves.toBeUndefined();
  });

  it("accepts a hosted connection string on a serverless host", async () => {
    process.env.DATABASE_URL = "postgresql://user:pw@db.example:6543/postgres";
    process.env.VERCEL = "1";

    // Resolving the configuration must not require the database to answer.
    await expect(connect()).resolves.toBeUndefined();
  });
});
