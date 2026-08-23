import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import * as passwords from "@/lib/auth/passwords";
import * as sessions from "@/lib/auth/sessions";
import * as users from "@/lib/auth/users";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

import { insertOwnerlessExam, insertUser, truncate } from "../support/db";

/**
 * Accounts, sessions and ownership.
 *
 * Runs against the suite's own PGlite database, created by
 * `tests/setup/test-database.ts`. Nothing here touches a shared database — the
 * cases below truncate tables.
 */

beforeEach(async () => {
  // Papers do not cascade from their owner (see `exams.userId`), so everything
  // is emptied together.
  await truncate("attempts", "exams", "sessions", "users");
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
    await users.setDisabled(id, true);
    expect(await users.verifyCredentials("ada", "correct-horse-battery")).toBeNull();
  });

  it("will not disable or demote the last administrator", async () => {
    const admin = await makeUser("root", "admin");
    expect((await users.setDisabled(admin, true)).ok).toBe(false);
    expect((await users.setRole(admin, "student")).ok).toBe(false);

    const second = await makeUser("root2", "admin");
    expect((await users.setRole(admin, "student")).ok).toBe(true);
    expect((await users.setDisabled(second, true)).ok).toBe(false);
  });

  it("creates the first administrator only once", async () => {
    expect(await users.hasAnyUser()).toBe(false);
    const first = await users.createFirstAdmin("root", "correct-horse-battery");
    expect(first.ok).toBe(true);
    expect(await users.hasAnyUser()).toBe(true);

    const second = await users.createFirstAdmin("other", "correct-horse-battery");
    expect(second.ok).toBe(false);
  });

  it("hands papers generated before accounts existed to the first administrator", async () => {
    await insertOwnerlessExam("legacy-exam", "Legacy paper");

    const admin = await users.createFirstAdmin("root", "correct-horse-battery");
    expect(admin.ok).toBe(true);
    if (!admin.ok) return;

    const { getExamFor } = await import("@/lib/db/queries/exams");
    expect(await getExamFor("legacy-exam", admin.id)).toBeDefined();
  });
});

describe("sessions", () => {
  it("stores only a hash, so the database does not contain a usable token", async () => {
    const id = await makeUser("ada");
    const { token } = await sessions.createSession(id);

    const stored = await db
      .select({ tokenHash: schema.sessions.tokenHash })
      .from(schema.sessions);

    expect(stored).toHaveLength(1);
    expect(stored[0]?.tokenHash).not.toEqual(token);
    expect(stored[0]?.tokenHash).toEqual(sessions.hashToken(token));
  });

  it("resolves its own token and nothing else", async () => {
    const id = await makeUser("ada");
    const { token } = await sessions.createSession(id);

    expect((await sessions.resolveSession(token))?.id).toEqual(id);
    expect(await sessions.resolveSession("some-other-token")).toBeNull();
    expect(await sessions.resolveSession(undefined)).toBeNull();
  });

  it("refuses an expired session and clears it", async () => {
    const id = await makeUser("ada");
    const { token } = await sessions.createSession(id);

    await db
      .update(schema.sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) });

    expect(await sessions.resolveSession(token)).toBeNull();
    expect(await sessions.sessionExists(token)).toBe(false);
  });

  it("drops every session of an account as soon as it is disabled", async () => {
    const id = await makeUser("ada");
    const first = await sessions.createSession(id);
    const second = await sessions.createSession(id);

    await users.setDisabled(id, true);
    expect(await sessions.resolveSession(first.token)).toBeNull();
    expect(await sessions.resolveSession(second.token)).toBeNull();
  });

  it("ends other sessions when the password changes", async () => {
    const id = await makeUser("ada");
    const { token } = await sessions.createSession(id);

    await users.setPassword(id, "a-brand-new-password");
    expect(await sessions.resolveSession(token)).toBeNull();
  });

  it("signs out only the session presented", async () => {
    const id = await makeUser("ada");
    const keep = await sessions.createSession(id);
    const drop = await sessions.createSession(id);

    await sessions.destroySession(drop.token);
    expect(await sessions.resolveSession(drop.token)).toBeNull();
    expect((await sessions.resolveSession(keep.token))?.id).toEqual(id);
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

    const examId = await createPendingExam([], mine);
    await db
      .update(schema.exams)
      .set({ status: "ready" })
      .where(eq(schema.exams.id, examId));
    const attemptId = await createAttempt(examId, mine);

    expect(await getExamFor(examId, mine)).toBeDefined();
    expect(await getExamFor(examId, theirs)).toBeUndefined();

    expect(await getAttemptFor(attemptId, mine)).toBeDefined();
    expect(await getAttemptFor(attemptId, theirs)).toBeUndefined();
  });

  it("lists only the signed-in account's history", async () => {
    const mine = await makeUser("ada");
    const theirs = await makeUser("grace");

    const { createPendingExam } = await import("@/lib/db/queries/exams");
    const { listExamHistory } = await import("@/lib/db/queries/history");

    await createPendingExam([], mine);
    await createPendingExam([], theirs);
    await createPendingExam([], theirs);

    expect(await listExamHistory(mine)).toHaveLength(1);
    expect(await listExamHistory(theirs)).toHaveLength(2);
  });
});

describe("schema guards", () => {
  it("keeps usernames unique at the database level, not just in application code", async () => {
    const id = await makeUser("ada");
    // A second account differing only in case must be refused by the database
    // itself, not merely by the check in application code.
    await expect(
      insertUser({ id: "second", username: "Ada", role: "student" }),
    ).rejects.toThrow();
    expect(schema.users).toBeDefined();
    expect(id).toBeTruthy();
  });
});
