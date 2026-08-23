"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/current-user";
import { createUser, setDisabled, setPassword, setRole } from "@/lib/auth/users";

/**
 * Account administration.
 *
 * Every action re-checks `requireAdmin`, because a server action is a public
 * endpoint: rendering the page for administrators only is not what makes these
 * safe. The rules that stop an administrator locking everyone out live in
 * `lib/auth/users.ts` and are enforced there, not here.
 */

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function back(params: Record<string, string>): never {
  const query = new URLSearchParams(params).toString();
  redirect(`/admin/users${query ? `?${query}` : ""}`);
}

export async function createUserAction(formData: FormData): Promise<void> {
  await requireAdmin("/admin/users");

  const username = field(formData, "username");
  const password = field(formData, "password");
  const displayName = field(formData, "displayName");
  const role = field(formData, "role") === "admin" ? "admin" : "student";

  const created = await createUser({
    username,
    password,
    role,
    displayName: displayName || undefined,
    // The administrator has just typed this password and will have to pass it
    // on, so the account changes it at first sign-in.
    mustChangePassword: true,
  });

  if (!created.ok) back({ problem: created.problem, username });

  revalidatePath("/admin/users");
  back({ created: username });
}

export async function setRoleAction(formData: FormData): Promise<void> {
  await requireAdmin("/admin/users");

  const userId = field(formData, "userId");
  const role = field(formData, "role") === "admin" ? "admin" : "student";

  const result = await setRole(userId, role);
  if (!result.ok) back({ problem: result.problem });

  revalidatePath("/admin/users");
  back({});
}

export async function setDisabledAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin("/admin/users");

  const userId = field(formData, "userId");
  const disabled = field(formData, "disabled") === "true";

  if (disabled && userId === admin.id) {
    back({ problem: "You cannot disable the account you are signed in with." });
  }

  const result = await setDisabled(userId, disabled);
  if (!result.ok) back({ problem: result.problem });

  revalidatePath("/admin/users");
  back({});
}

export async function resetPasswordAction(formData: FormData): Promise<void> {
  await requireAdmin("/admin/users");

  const userId = field(formData, "userId");
  const password = field(formData, "password");

  // Forces a change at next sign-in: the administrator has seen this password.
  const result = await setPassword(userId, password, { mustChange: true });
  if (!result.ok) back({ problem: result.problem });

  revalidatePath("/admin/users");
  back({ reset: "1" });
}
