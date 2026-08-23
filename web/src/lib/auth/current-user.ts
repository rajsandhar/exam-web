import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { resolveSession, SESSION_COOKIE, type SessionUser } from "./sessions";
import { hasAnyUser } from "./users";

/**
 * Where authorisation is actually enforced.
 *
 * Middleware cannot do this job: it runs before the database is reachable, so
 * it can only see whether a cookie is present, not whether it means anything.
 * It exists to redirect early; these functions are what make a page safe, and
 * every protected page and route handler calls one of them.
 */

export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return resolveSession(store.get(SESSION_COOKIE)?.value);
}

/**
 * Redirects to sign-in, or to first-run setup when no account exists yet.
 *
 * An account still on a password an administrator chose is sent to change it
 * before anything else, so a temporary password cannot quietly become permanent.
 * `/account/password` reads the session directly rather than calling this, which
 * is what stops that being a loop.
 */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await getCurrentUser();

  if (user) {
    if (user.mustChangePassword) redirect("/account/password");
    return user;
  }

  if (!hasAnyUser()) redirect("/setup");
  redirect(returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login");
}

export async function requireAdmin(returnTo?: string): Promise<SessionUser> {
  const user = await requireUser(returnTo);
  if (user.role !== "admin") redirect("/");
  return user;
}

/**
 * For route handlers, which return a response rather than redirecting.
 * Returns null when the caller should reject the request — including for an
 * account that has not yet replaced the password an administrator gave it.
 */
export async function getApiUser(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  return user && !user.mustChangePassword ? user : null;
}
