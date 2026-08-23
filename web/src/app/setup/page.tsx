import { redirect } from "next/navigation";

import { AuthCard, AuthField, AuthSubmit } from "@/components/auth/auth-card";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/passwords";
import { hasAnyUser } from "@/lib/auth/users";

import { createFirstAdminAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * First run. Creates the administrator account before anything else is
 * reachable, so the application is never briefly open to whoever finds it and
 * never ships with a default password.
 */
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ problem?: string; username?: string }>;
}) {
  if (await hasAnyUser()) redirect("/login");
  const { problem, username } = await searchParams;

  return (
    <AuthCard
      title="Create the administrator account"
      intro="This is the first time the application has run. The account you create here can manage the model endpoint and add other people."
      problem={problem}
    >
      <form action={createFirstAdminAction} className="space-y-4">
        <AuthField
          label="Username"
          name="username"
          autoComplete="username"
          defaultValue={username}
          required
          autoFocus
          hint="Letters, numbers, full stops, hyphens and underscores."
        />
        <AuthField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          hint={`At least ${MIN_PASSWORD_LENGTH} characters. Length matters more than punctuation.`}
        />
        <AuthField
          label="Confirm password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
        <AuthSubmit>Create account</AuthSubmit>
      </form>

      <p className="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-ink-muted">
        Any papers generated before accounts existed will be transferred to this
        account, so nothing already created is lost.
      </p>
    </AuthCard>
  );
}
