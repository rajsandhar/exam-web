"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  createSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/sessions";
import { createFirstAdmin, hasAnyUser } from "@/lib/auth/users";

/**
 * Creates the first administrator and signs them straight in.
 *
 * Re-checks `hasAnyUser` inside the action rather than trusting the page that
 * rendered the form: without that, this endpoint would keep accepting new
 * administrators for as long as somebody kept a stale form open.
 */
export async function createFirstAdminAction(formData: FormData): Promise<void> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (hasAnyUser()) redirect("/login");

  if (password !== confirmPassword) {
    redirect(
      `/setup?problem=${encodeURIComponent("The two passwords do not match.")}` +
        `&username=${encodeURIComponent(username)}`,
    );
  }

  const created = await createFirstAdmin(username, password);
  if (!created.ok) {
    redirect(
      `/setup?problem=${encodeURIComponent(created.problem)}` +
        `&username=${encodeURIComponent(username)}`,
    );
  }

  const session = createSession(created.id);
  const store = await cookies();
  store.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));

  redirect("/build");
}
