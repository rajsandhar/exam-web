import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { assets, assetSyllabusItems, exams, users } from "@/lib/db/schema";

/**
 * Direct database access for tests.
 *
 * The suite empties tables between cases and occasionally inserts a row the
 * application has no function for — an account with a known id, a paper from
 * before accounts existed. Both used the raw better-sqlite3 handle, which
 * Postgres has no equivalent of.
 *
 * `DATABASE_URL` points at PGlite for the suite (see
 * `tests/setup/test-database.ts`). These statements truncate, so they must
 * never be pointed at a shared database.
 */

/**
 * Empties the named tables and anything referencing them.
 *
 * `DELETE` rather than `TRUNCATE`: PGlite reports a storage error for the
 * latter, and at these row counts there is nothing to gain from it.
 */
export async function truncate(...tables: string[]): Promise<void> {
  for (const table of tables) {
    await db.execute(sql.raw(`DELETE FROM "${table}"`));
  }
}

/** Clears everything these suites touch, in one statement. */
export async function resetAll(): Promise<void> {
  await truncate("users", "exams", "assets", "ai_settings");
}

export async function insertUser(input: {
  id: string;
  username?: string;
  role?: "admin" | "student";
  passwordHash?: string;
}): Promise<void> {
  await db.insert(users).values({
    id: input.id,
    username: input.username ?? input.id,
    usernameLower: (input.username ?? input.id).toLowerCase(),
    passwordHash: input.passwordHash ?? "x",
    role: input.role ?? "admin",
    disabled: false,
    mustChangePassword: false,
    createdAt: new Date(),
  });
}

/** A paper with no owner, as one generated before accounts existed. */
export async function insertOwnerlessExam(id: string, title: string): Promise<void> {
  await db.insert(exams).values({
    id,
    createdAt: new Date(),
    title,
    totalMarks: 100,
    status: "ready",
  });
}

export { assets, assetSyllabusItems };
