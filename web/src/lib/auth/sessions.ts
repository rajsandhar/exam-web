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

export function createSession(userId: string): IssuedSession {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_MS);

  db.insert(sessions)
    .values({
      id: randomUUID(),
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      createdAt: new Date(),
    })
    .run();

  db.update(users)
    .set({ lastSignedInAt: new Date() })
    .where(eq(users.id, userId))
    .run();

  return { token, expiresAt };
}

/**
 * Resolves a cookie token to a user, or null.
 *
 * A disabled account resolves to null and its sessions are destroyed, so
 * disabling somebody takes effect on their next request rather than whenever
 * their cookie happens to expire.
 */
export function resolveSession(token: string | undefined): SessionUser | null {
  if (!token) return null;

  const row = db
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
    .get();

  if (!row) return null;

  if (row.expiresAt.getTime() <= Date.now()) {
    db.delete(sessions).where(eq(sessions.id, row.sessionId)).run();
    return null;
  }

  if (row.disabled) {
    db.delete(sessions).where(eq(sessions.userId, row.id)).run();
    return null;
  }

  // Sliding expiry, but only when it is worth a write.
  if (row.expiresAt.getTime() - Date.now() < REFRESH_AFTER_MS) {
    db.update(sessions)
      .set({ expiresAt: new Date(Date.now() + SESSION_MS) })
      .where(eq(sessions.id, row.sessionId))
      .run();
  }

  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    mustChangePassword: row.mustChangePassword,
  };
}

export function destroySession(token: string | undefined): void {
  if (!token) return;
  db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token))).run();
}

/** Signing out everywhere — used after a password change or an admin reset. */
export function destroyAllSessionsFor(userId: string): void {
  db.delete(sessions).where(eq(sessions.userId, userId)).run();
}

export function purgeExpiredSessions(): void {
  db.delete(sessions).where(lt(sessions.expiresAt, new Date())).run();
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
export function sessionExists(token: string | undefined): boolean {
  if (!token) return false;
  return (
    db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.tokenHash, hashToken(token))))
      .get() !== undefined
  );
}
