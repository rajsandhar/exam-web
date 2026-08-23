import { AuthCard, AuthField, AuthSubmit } from "@/components/auth/auth-card";
import { getCurrentUser } from "@/lib/auth/current-user";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/passwords";
import { redirect } from "next/navigation";

import { changePasswordAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Changing your own password, and the wall a temporary password runs into.
 *
 * This page deliberately does not call `requireUser`: that redirects here when
 * `mustChangePassword` is set, which would be a loop.
 */
export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ problem?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Faccount%2Fpassword");

  const { problem } = await searchParams;

  return (
    <AuthCard
      title="Change your password"
      intro={
        user.mustChangePassword
          ? "This account is using a password an administrator chose. Pick your own before going on."
          : undefined
      }
      problem={problem}
    >
      <form action={changePasswordAction} className="space-y-4">
        <AuthField
          label="Current password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
        />
        <AuthField
          label="New password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          hint={`At least ${MIN_PASSWORD_LENGTH} characters. Length matters more than punctuation.`}
        />
        <AuthField
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
        <AuthSubmit>Change password</AuthSubmit>
      </form>

      <p className="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-ink-muted">
        Changing your password signs out every other browser you are signed in
        on. This one stays signed in.
      </p>
    </AuthCard>
  );
}
