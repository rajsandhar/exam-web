import { randomUUID } from "node:crypto";

import { asc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { attempts, exams, users, type UserRow } from "@/lib/db/schema";

import { describePasswordProblem, hashPassword, verifyPassword } from "./passwords";
import { destroyAllSessionsFor } from "./sessions";

/**
 * Accounts.
 *
 * There is no self sign-up. The first account is created on first run and is an
 * administrator; every later account is created by one. Anything else would let
 * a study tool exposed on a network hand out accounts to strangers.
 */

export type CreateUserInput = {
  username: string;
  password: string;
  role: "admin" | "student";
  displayName?: string;
  mustChangePassword?: boolean;
};

export type UserSummary = {
  id: string;
  username: string;
  displayName: string | null;
  role: "admin" | "student";
  disabled: boolean;
  createdAt: number;
  lastSignedInAt: number | null;
};

export function hasAnyUser(): boolean {
  const row = db.select({ count: sql<number>`count(*)` }).from(users).get();
  return (row?.count ?? 0) > 0;
}

export function countAdmins(): number {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.role, "admin"))
    .get();
  return row?.count ?? 0;
}

export function describeUsernameProblem(username: string): string | null {
  const value = username.trim();
  if (value.length < 3) return "Use at least 3 characters.";
  if (value.length > 40) return "Use at most 40 characters.";
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    return "Use only letters, numbers, full stops, hyphens and underscores.";
  }
  return null;
}

export async function createUser(
  input: CreateUserInput,
): Promise<{ ok: true; id: string } | { ok: false; problem: string }> {
  const username = input.username.trim();

  const usernameProblem = describeUsernameProblem(username);
  if (usernameProblem) return { ok: false, problem: usernameProblem };

  const passwordProblem = describePasswordProblem(input.password);
  if (passwordProblem) return { ok: false, problem: passwordProblem };

  const usernameLower = username.toLowerCase();
  const existing = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.usernameLower, usernameLower))
    .get();
  if (existing) return { ok: false, problem: "That username is already taken." };

  const id = randomUUID();
  db.insert(users)
    .values({
      id,
      username,
      usernameLower,
      displayName: input.displayName?.trim() || null,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      disabled: false,
      mustChangePassword: input.mustChangePassword ?? false,
      createdAt: new Date(),
    })
    .run();

  return { ok: true, id };
}

/**
 * Creates the first administrator and adopts anything generated before accounts
 * existed, so an upgraded installation does not lose its papers.
 */
export async function createFirstAdmin(
  username: string,
  password: string,
): Promise<{ ok: true; id: string } | { ok: false; problem: string }> {
  if (hasAnyUser()) {
    return { ok: false, problem: "An account already exists. Sign in instead." };
  }

  const created = await createUser({ username, password, role: "admin" });
  if (!created.ok) return created;

  db.update(exams).set({ userId: created.id }).where(isNull(exams.userId)).run();
  db.update(attempts).set({ userId: created.id }).where(isNull(attempts.userId)).run();

  return created;
}

/**
 * Verifies credentials. Returns the same failure whether the username is
 * unknown, the password is wrong or the account is disabled, so the form cannot
 * be used to discover which usernames exist.
 */
export async function verifyCredentials(
  username: string,
  password: string,
): Promise<UserRow | null> {
  const user = db
    .select()
    .from(users)
    .where(eq(users.usernameLower, username.trim().toLowerCase()))
    .get();

  if (!user) {
    // Spend comparable time on an unknown username so the response does not
    // reveal which half of the credentials was wrong.
    await verifyPassword(password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");
    return null;
  }

  if (!(await verifyPassword(password, user.passwordHash))) return null;
  if (user.disabled) return null;

  return user;
}

export function listUsers(): UserSummary[] {
  return db
    .select()
    .from(users)
    .orderBy(asc(users.usernameLower))
    .all()
    .map((user) => ({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      disabled: user.disabled,
      createdAt: user.createdAt.getTime(),
      lastSignedInAt: user.lastSignedInAt?.getTime() ?? null,
    }));
}

export function getUser(id: string): UserRow | undefined {
  return db.select().from(users).where(eq(users.id, id)).get();
}

export async function setPassword(
  userId: string,
  password: string,
  { mustChange = false }: { mustChange?: boolean } = {},
): Promise<{ ok: true } | { ok: false; problem: string }> {
  const problem = describePasswordProblem(password);
  if (problem) return { ok: false, problem };

  db.update(users)
    .set({ passwordHash: await hashPassword(password), mustChangePassword: mustChange })
    .where(eq(users.id, userId))
    .run();

  // A password change ends every other session for that account.
  destroyAllSessionsFor(userId);
  return { ok: true };
}

/**
 * Guards against locking everyone out: the last remaining administrator cannot
 * be disabled or demoted.
 */
export function setDisabled(
  userId: string,
  disabled: boolean,
): { ok: true } | { ok: false; problem: string } {
  const user = getUser(userId);
  if (!user) return { ok: false, problem: "That account no longer exists." };

  if (disabled && user.role === "admin" && countAdmins() <= 1) {
    return { ok: false, problem: "This is the only administrator account." };
  }

  db.update(users).set({ disabled }).where(eq(users.id, userId)).run();
  if (disabled) destroyAllSessionsFor(userId);
  return { ok: true };
}

export function setRole(
  userId: string,
  role: "admin" | "student",
): { ok: true } | { ok: false; problem: string } {
  const user = getUser(userId);
  if (!user) return { ok: false, problem: "That account no longer exists." };

  if (role === "student" && user.role === "admin" && countAdmins() <= 1) {
    return { ok: false, problem: "This is the only administrator account." };
  }

  db.update(users).set({ role }).where(eq(users.id, userId)).run();
  return { ok: true };
}
