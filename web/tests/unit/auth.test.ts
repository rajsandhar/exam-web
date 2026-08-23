import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Accounts, sessions and ownership.
 *
 * The database module binds its connection at import time, so this file points
 * `DATABASE_URL` at a scratch file and then imports everything dynamically.
 * Nothing here touches the development database.
 */

const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "hsc-auth-"));
const DB_FILE = path.join(TEMP_DIR, "auth-test.db");

type Passwords = typeof import("@/lib/auth/passwords");
type Users = typeof import("@/lib/auth/users");
type Sessions = typeof import("@/lib/auth/sessions");
type Schema = typeof import("@/lib/db/schema");
type Client = typeof import("@/lib/db/client");

let passwords: Passwords;
let users: Users;
let sessions: Sessions;
let schema: Schema;
let client: Client;

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${DB_FILE}`;

  const { MIGRATIONS_DIR } = await import("@/lib/paths");
  const sqlite = new Database(DB_FILE);
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_DIR });
  sqlite.close();

  passwords = await import("@/lib/auth/passwords");
  users = await import("@/lib/auth/users");
  sessions = await import("@/lib/auth/sessions");
  schema = await import("@/lib/db/schema");
  client = await import("@/lib/db/client");
});

beforeEach(() => {
  // Papers do not cascade from their owner (see `exams.userId`), so they are
  // cleared first; sessions do cascade but are removed here for clarity.
  client
    .rawSqlite()
    .exec(
      "DELETE FROM attempts; DELETE FROM exams; DELETE FROM sessions; DELETE FROM users;",
    );
});

async function makeUser(
  username: string,
  role: "admin" | "student" = "student",
  password = "correct-horse-battery",
): Promise<string> {
  const created = await users.createUser({ username, password, role });
  if (!created.ok) throw new Error(created.problem);
  return created.id;
}

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await passwords.hashPassword("correct-horse-battery");
    expect(await passwords.verifyPassword("correct-horse-battery", hash)).toBe(true);
    expect(await passwords.verifyPassword("Correct-horse-battery", hash)).toBe(false);
    expect(await passwords.verifyPassword("", hash)).toBe(false);
  });

  it("never stores the password, and salts each hash separately", async () => {
    const a = await passwords.hashPassword("correct-horse-battery");
    const b = await passwords.hashPassword("correct-horse-battery");
    expect(a).not.toEqual(b);
    expect(a).not.toContain("correct-horse-battery");
    expect(a.startsWith("scrypt$")).toBe(true);
  });

  it("rejects a malformed stored hash rather than throwing", async () => {
    expect(await passwords.verifyPassword("anything", "not-a-hash")).toBe(false);
    expect(await passwords.verifyPassword("anything", "scrypt$1$2$3")).toBe(false);
  });

  it("requires a password long enough to be worth hashing", () => {
    expect(passwords.describePasswordProblem("short")).not.toBeNull();
    expect(passwords.describePasswordProblem("correct-horse-battery")).toBeNull();
  });
});

describe("accounts", () => {
  it("treats usernames as case-insensitive for uniqueness", async () => {
    await makeUser("Ada");
    const clash = await users.createUser({
      username: "ADA",
      password: "correct-horse-battery",
      role: "student",
    });
    expect(clash.ok).toBe(false);
  });

  it("signs in regardless of the case typed", async () => {
    await makeUser("Ada");
    expect(await users.verifyCredentials("aDa", "correct-horse-battery")).not.toBeNull();
  });

  it("gives the same answer for a wrong password and an unknown user", async () => {
    await makeUser("ada");
    expect(await users.verifyCredentials("ada", "wrong-password-here")).toBeNull();
    expect(await users.verifyCredentials("nobody", "wrong-password-here")).toBeNull();
  });

  it("refuses a disabled account", async () => {
    const id = await makeUser("ada");
    users.setDisabled(id, true);
    expect(await users.verifyCredentials("ada", "correct-horse-battery")).toBeNull();
  });

  it("will not disable or demote the last administrator", async () => {
    const admin = await makeUser("root", "admin");
    expect(users.setDisabled(admin, true).ok).toBe(false);
    expect(users.setRole(admin, "student").ok).toBe(false);

    const second = await makeUser("root2", "admin");
    expect(users.setRole(admin, "student").ok).toBe(true);
    expect(users.setDisabled(second, true).ok).toBe(false);
  });

  it("creates the first administrator only once", async () => {
    expect(users.hasAnyUser()).toBe(false);
    const first = await users.createFirstAdmin("root", "correct-horse-battery");
    expect(first.ok).toBe(true);
    expect(users.hasAnyUser()).toBe(true);

    const second = await users.createFirstAdmin("other", "correct-horse-battery");
    expect(second.ok).toBe(false);
  });

  it("hands papers generated before accounts existed to the first administrator", async () => {
    client
      .rawSqlite()
      .prepare(
        "INSERT INTO exams (id, created_at, title, total_marks, status) VALUES (?, ?, ?, 100, 'ready')",
      )
      .run("legacy-exam", Date.now(), "Legacy paper");

    const admin = await users.createFirstAdmin("root", "correct-horse-battery");
    expect(admin.ok).toBe(true);
    if (!admin.ok) return;

    const { getExamFor } = await import("@/lib/db/queries/exams");
    expect(getExamFor("legacy-exam", admin.id)).toBeDefined();
  });
});

describe("sessions", () => {
  it("stores only a hash, so the database does not contain a usable token", async () => {
    const id = await makeUser("ada");
    const { token } = sessions.createSession(id);

    const stored = client
      .rawSqlite()
      .prepare("SELECT token_hash FROM sessions")
      .all() as { token_hash: string }[];

    expect(stored).toHaveLength(1);
    expect(stored[0]?.token_hash).not.toEqual(token);
    expect(stored[0]?.token_hash).toEqual(sessions.hashToken(token));
  });

  it("resolves its own token and nothing else", async () => {
    const id = await makeUser("ada");
    const { token } = sessions.createSession(id);

    expect(sessions.resolveSession(token)?.id).toEqual(id);
    expect(sessions.resolveSession("some-other-token")).toBeNull();
    expect(sessions.resolveSession(undefined)).toBeNull();
  });

  it("refuses an expired session and clears it", async () => {
    const id = await makeUser("ada");
    const { token } = sessions.createSession(id);

    client
      .rawSqlite()
      .prepare("UPDATE sessions SET expires_at = ?")
      .run(Date.now() - 1000);

    expect(sessions.resolveSession(token)).toBeNull();
    expect(sessions.sessionExists(token)).toBe(false);
  });

  it("drops every session of an account as soon as it is disabled", async () => {
    const id = await makeUser("ada");
    const first = sessions.createSession(id);
    const second = sessions.createSession(id);

    users.setDisabled(id, true);
    expect(sessions.resolveSession(first.token)).toBeNull();
    expect(sessions.resolveSession(second.token)).toBeNull();
  });

  it("ends other sessions when the password changes", async () => {
    const id = await makeUser("ada");
    const { token } = sessions.createSession(id);

    await users.setPassword(id, "a-brand-new-password");
    expect(sessions.resolveSession(token)).toBeNull();
  });

  it("signs out only the session presented", async () => {
    const id = await makeUser("ada");
    const keep = sessions.createSession(id);
    const drop = sessions.createSession(id);

    sessions.destroySession(drop.token);
    expect(sessions.resolveSession(drop.token)).toBeNull();
    expect(sessions.resolveSession(keep.token)?.id).toEqual(id);
  });

  it("marks the cookie http-only and same-site lax", () => {
    const options = sessions.sessionCookieOptions(new Date(Date.now() + 1000));
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
  });
});

describe("ownership", () => {
  it("hides another account's paper and its attempts", async () => {
    const mine = await makeUser("ada");
    const theirs = await makeUser("grace");

    const { createPendingExam, getExamFor } = await import("@/lib/db/queries/exams");
    const { createAttempt, getAttemptFor } = await import("@/lib/db/queries/attempts");

    const examId = createPendingExam([], mine);
    client
      .rawSqlite()
      .prepare("UPDATE exams SET status = 'ready' WHERE id = ?")
      .run(examId);
    const attemptId = createAttempt(examId, mine);

    expect(getExamFor(examId, mine)).toBeDefined();
    expect(getExamFor(examId, theirs)).toBeUndefined();

    expect(getAttemptFor(attemptId, mine)).toBeDefined();
    expect(getAttemptFor(attemptId, theirs)).toBeUndefined();
  });

  it("lists only the signed-in account's history", async () => {
    const mine = await makeUser("ada");
    const theirs = await makeUser("grace");

    const { createPendingExam } = await import("@/lib/db/queries/exams");
    const { listExamHistory } = await import("@/lib/db/queries/history");

    createPendingExam([], mine);
    createPendingExam([], theirs);
    createPendingExam([], theirs);

    expect(listExamHistory(mine)).toHaveLength(1);
    expect(listExamHistory(theirs)).toHaveLength(2);
  });
});

describe("schema guards", () => {
  it("keeps usernames unique at the database level, not just in application code", async () => {
    const id = await makeUser("ada");
    expect(() =>
      client
        .rawSqlite()
        .prepare(
          "INSERT INTO users (id, username, username_lower, password_hash, role, disabled, must_change_password, created_at) VALUES (?, ?, ?, ?, 'student', 0, 0, ?)",
        )
        .run("second", "Ada", "ada", "x", Date.now()),
    ).toThrow();
    expect(schema.users).toBeDefined();
    expect(id).toBeTruthy();
  });
});
