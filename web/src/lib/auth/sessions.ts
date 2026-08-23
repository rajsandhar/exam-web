import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, eq, lt } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { sessions, users, type UserRow } from "@/lib/db/schema";

/**
 * Session handling.
 *
 * The cookie carries a random token; the database stores only its SHA-256 hash.
 * Reading the database therefore does not hand anyone a working session, which
 * matters here because the database file sits next to the application on disk.
 */

export const SESSION_COOKIE = "hsc_se_session";

const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
/** Re-issue the expiry when a session is over halfway through its life. */
const REFRESH_AFTER_MS = SESSION_MS / 2;

export type SessionUser = {
  id: string;
  username: string;
  displayName: string | null;
  role: "admin" | "student";
  mustChangePassword: boolean;
};

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type IssuedSession = { token: string; expiresAt: Date };

export async function createSession(userId: string): Promise<IssuedSession> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_MS);

  await db.insert(sessions)
    .values({
      id: randomUUID(),
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      createdAt: new Date(),
    });

  await db
    .update(users)
    .set({ lastSignedInAt: new Date() })
    .where(eq(users.id, userId));

  return { token, expiresAt };
}

/**
 * Resolves a cookie token to a user, or null.
 *
 * A disabled account resolves to null and its sessions are destroyed, so
 * disabling somebody takes effect on their next request rather than whenever
 * their cookie happens to expire.
 */
export async function resolveSession(
  token: string | undefined,
): Promise<SessionUser | null> {
  if (!token) return null;

  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      disabled: users.disabled,
      mustChangePassword: users.mustChangePassword,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, hashToken(token)))
    .limit(1);

  if (!row) return null;

  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, row.sessionId));
    return null;
  }

  if (row.disabled) {
    await db.delete(sessions).where(eq(sessions.userId, row.id));
    return null;
  }

  // Sliding expiry, but only when it is worth a write.
  if (row.expiresAt.getTime() - Date.now() < REFRESH_AFTER_MS) {
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + SESSION_MS) })
      .where(eq(sessions.id, row.sessionId));
  }

  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    mustChangePassword: row.mustChangePassword,
  };
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

/** Signing out everywhere — used after a password change or an admin reset. */
export async function destroyAllSessionsFor(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function purgeExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export function toSessionUser(user: UserRow): SessionUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
}

/** Cookie options. `sameSite: lax` is what defends the forms against CSRF. */
export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

export function expiredCookieOptions() {
  return { ...sessionCookieOptions(new Date(0)), maxAge: 0 };
}

/** Used by the sign-in screen to hide a session that belongs to nobody. */
export async function sessionExists(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [row] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hashToken(token))))
    .limit(1);
  return row !== undefined;
}
