"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/current-user";
import {
  createSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/sessions";
import { setPassword, verifyCredentials } from "@/lib/auth/users";

function problem(message: string): never {
  redirect(`/account/password?problem=${encodeURIComponent(message)}`);
}

/**
 * Changing your own password.
 *
 * The current password is required even though there is already a session:
 * without it, an unattended signed-in browser is enough to take an account over.
 *
 * `setPassword` ends every session for the account, including this one, so a
 * fresh session is issued here — otherwise changing a password would sign you
 * out, which reads as a failure.
 *
 * This reads the session directly instead of calling `requireUser`, which sends
 * an account with a temporary password here: this action is how that account
 * gets out of it, so going through the guard would bounce it in a circle.
 */
export async function changePasswordAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Faccount%2Fpassword");

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!(await verifyCredentials(user.username, current))) {
    problem("That is not your current password.");
  }
  if (next !== confirm) {
    problem("The two new passwords do not match.");
  }
  if (next === current) {
    problem("The new password must be different from the current one.");
  }

  const result = await setPassword(user.id, next, { mustChange: false });
  if (!result.ok) problem(result.problem);

  const session = createSession(user.id);
  const store = await cookies();
  store.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));

  redirect("/build?passwordChanged=1");
}
