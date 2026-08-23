"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  checkSignInAllowed,
  clearSignInAttempts,
  recordFailedSignIn,
} from "@/lib/auth/rate-limit";
import {
  createSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/sessions";
import { verifyCredentials } from "@/lib/auth/users";

/** Only same-origin paths, so `next` cannot be used as an open redirect. */
function safeNext(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/build";
  return value;
}

export async function signInAction(formData: FormData): Promise<void> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));

  const headerList = await headers();
  const client =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const throttleKey = `${client}:${username.toLowerCase()}`;

  const throttle = checkSignInAllowed(throttleKey);
  if (!throttle.allowed) {
    redirect(
      `/login?problem=${encodeURIComponent(
        `Too many sign-in attempts. Try again in ${Math.ceil(
          throttle.retryAfterSeconds / 60,
        )} minutes.`,
      )}`,
    );
  }

  const user = await verifyCredentials(username, password);
  if (!user) {
    recordFailedSignIn(throttleKey);
    // Deliberately the same message whether the username is unknown, the
    // password is wrong, or the account is disabled.
    redirect(
      `/login?problem=${encodeURIComponent("That username and password do not match.")}` +
        `&username=${encodeURIComponent(username)}` +
        (next !== "/build" ? `&next=${encodeURIComponent(next)}` : ""),
    );
  }

  clearSignInAttempts(throttleKey);

  const session = createSession(user.id);
  const store = await cookies();
  store.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));

  redirect(next);
}
