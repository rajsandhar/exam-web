import { PlatformShell } from "@/components/platform/shell";
import { requireAdmin } from "@/lib/auth/current-user";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/passwords";
import { listUsers, type UserSummary } from "@/lib/auth/users";

import {
  createUserAction,
  resetPasswordAction,
  setDisabledAction,
  setRoleAction,
} from "./actions";

export const dynamic = "force-dynamic";

/**
 * Accounts.
 *
 * There is no self sign-up and no email on this installation, so this screen is
 * the only way an account comes into existence or gets back in after forgetting
 * a password.
 */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    problem?: string;
    created?: string;
    reset?: string;
    username?: string;
  }>;
}) {
  const admin = await requireAdmin("/admin/users");
  const { problem, created, reset, username } = await searchParams;
  const users = await listUsers();

  return (
    <PlatformShell active="users">
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-800">Accounts</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Accounts are created here — there is no self sign-up, and no email to
          reset a password with. A new account must change its password the first
          time it signs in.
        </p>

        {problem && (
          <p role="alert" className="mt-6 rounded border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
            {problem}
          </p>
        )}
        {created && (
          <p role="status" className="mt-6 rounded border border-ok/40 bg-ok/5 p-3 text-sm">
            Created <strong>{created}</strong>. Give them the password you typed;
            they will be asked to change it when they sign in.
          </p>
        )}
        {reset && (
          <p role="status" className="mt-6 rounded border border-ok/40 bg-ok/5 p-3 text-sm">
            Password reset. They will be asked to change it when they sign in.
          </p>
        )}

        <section className="mt-8 rounded-lg border border-line bg-white p-6">
          <h2 className="text-base font-semibold text-navy-800">Add an account</h2>
          <form action={createUserAction} className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextField
              label="Username"
              name="username"
              defaultValue={username ?? ""}
              required
              hint="Letters, numbers, full stops, hyphens and underscores."
            />
            <TextField label="Display name" name="displayName" hint="Optional." />
            <TextField
              label="Temporary password"
              name="password"
              type="password"
              required
              hint={`At least ${MIN_PASSWORD_LENGTH} characters. They must change it at first sign-in.`}
            />
            <div>
              <label htmlFor="field-role" className="block text-sm font-medium">
                Role
              </label>
              <select
                id="field-role"
                name="role"
                defaultValue="student"
                className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-navy-600"
              >
                <option value="student">Student</option>
                <option value="admin">Administrator</option>
              </select>
              <p className="mt-1 text-xs text-ink-muted">
                Administrators can change model settings and manage accounts.
              </p>
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="rounded-md bg-navy-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-700"
              >
                Add account
              </button>
            </div>
          </form>
        </section>

        <h2 className="mt-10 text-base font-semibold text-navy-800">
          {users.length} account{users.length === 1 ? "" : "s"}
        </h2>

        <div className="mt-4 space-y-4">
          {users.map((user) => (
            <UserCard key={user.id} user={user} isSelf={user.id === admin.id} />
          ))}
        </div>
      </main>
    </PlatformShell>
  );
}

function UserCard({ user, isSelf }: { user: UserSummary; isSelf: boolean }) {
  return (
    <article
      className={`rounded-lg border bg-white p-5 ${
        user.disabled ? "border-line opacity-70" : "border-line"
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-semibold text-navy-800">{user.username}</h3>
        {user.displayName && (
          <span className="text-sm text-ink-muted">{user.displayName}</span>
        )}
        <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
          {user.role === "admin" ? "Admin" : "Student"}
        </span>
        {user.disabled && (
          <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-danger">
            Disabled
          </span>
        )}
        {isSelf && <span className="text-xs text-ink-muted">(you)</span>}
      </div>

      <p className="mt-1 text-xs text-ink-muted">
        Added {new Date(user.createdAt).toLocaleDateString()}
        {user.lastSignedInAt
          ? ` · last signed in ${new Date(user.lastSignedInAt).toLocaleString()}`
          : " · never signed in"}
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-4 border-t border-line pt-4">
        <form action={setRoleAction} className="flex items-end gap-2">
          <input type="hidden" name="userId" value={user.id} />
          <div>
            <label
              htmlFor={`role-${user.id}`}
              className="block text-xs font-medium text-ink-muted"
            >
              Role
            </label>
            <select
              id={`role-${user.id}`}
              name="role"
              defaultValue={user.role}
              className="mt-1 rounded-md border border-line bg-white px-2 py-1.5 text-sm"
            >
              <option value="student">Student</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          <SmallButton>Change</SmallButton>
        </form>

        <form action={resetPasswordAction} className="flex items-end gap-2">
          <input type="hidden" name="userId" value={user.id} />
          <div>
            <label
              htmlFor={`password-${user.id}`}
              className="block text-xs font-medium text-ink-muted"
            >
              New password
            </label>
            <input
              id={`password-${user.id}`}
              name="password"
              type="password"
              autoComplete="new-password"
              required
              className="mt-1 rounded-md border border-line bg-white px-2 py-1.5 text-sm"
            />
          </div>
          <SmallButton>Reset</SmallButton>
        </form>

        {!isSelf && (
          <form action={setDisabledAction} className="flex items-end">
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="disabled" value={user.disabled ? "false" : "true"} />
            <SmallButton>{user.disabled ? "Enable" : "Disable"}</SmallButton>
          </form>
        )}
      </div>
    </article>
  );
}

function SmallButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="rounded-md border border-line bg-white px-3 py-1.5 text-sm font-medium text-navy-800 transition-colors hover:bg-surface-2"
    >
      {children}
    </button>
  );
}

function TextField({
  label,
  name,
  type = "text",
  hint,
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  hint?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  const id = `field-${name}`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        autoComplete={type === "password" ? "new-password" : "off"}
        className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-navy-600"
      />
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
