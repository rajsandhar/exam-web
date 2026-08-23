import { redirect } from "next/navigation";

import { AuthCard, AuthField, AuthSubmit } from "@/components/auth/auth-card";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hasAnyUser } from "@/lib/auth/users";

import { signInAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ problem?: string; next?: string; username?: string }>;
}) {
  // Nobody has an account yet: sending them to sign in would be a dead end.
  if (!hasAnyUser()) redirect("/setup");

  const existing = await getCurrentUser();
  if (existing) redirect("/build");

  const { problem, next, username } = await searchParams;

  return (
    <AuthCard title="Sign in" problem={problem}>
      <form action={signInAction} className="space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <AuthField
          label="Username"
          name="username"
          autoComplete="username"
          defaultValue={username}
          required
          autoFocus
        />
        <AuthField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <AuthSubmit>Sign in</AuthSubmit>
      </form>

      <p className="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-ink-muted">
        Accounts are created by an administrator. If you have forgotten your
        password, ask them to reset it — there is no email on this installation.
      </p>
    </AuthCard>
  );
}
