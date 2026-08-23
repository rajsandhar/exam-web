import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/current-user";

/**
 * The chrome used everywhere except exam mode. Clean and modern; exam mode
 * deliberately does not use it.
 *
 * It reads the session itself rather than taking a user prop, so every page
 * that uses it shows who is signed in without having to thread it through.
 */
export async function PlatformShell({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: "build" | "history" | "settings" | "users";
}) {
  const user = await getCurrentUser();

  return (
    <>
      <header className="border-b border-line bg-navy-900 text-white">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-6 py-4">
          <Link href="/build" className="text-sm font-semibold tracking-tight">
            HSC Software Engineering — Trial Exam Builder
          </Link>
          <nav className="ml-auto flex items-center gap-1 text-sm">
            <NavLink href="/build" current={active === "build"}>
              Build trial
            </NavLink>
            <NavLink href="/history" current={active === "history"}>
              History
            </NavLink>
            {user?.role === "admin" && (
              <>
                <NavLink href="/settings" current={active === "settings"}>
                  Model settings
                </NavLink>
                <NavLink href="/admin/users" current={active === "users"}>
                  Accounts
                </NavLink>
              </>
            )}
          </nav>

          {user ? (
            <div className="flex items-center gap-3 border-l border-white/20 pl-4 text-sm">
              <Link
                href="/account/password"
                className="rounded px-2 py-1 text-white/80 transition-colors hover:bg-white/10"
              >
                {user.displayName ?? user.username}
                {user.role === "admin" ? (
                  <span className="ml-1.5 rounded bg-white/15 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
                    Admin
                  </span>
                ) : null}
              </Link>
              {/* A POST, so no link a page can be tricked into following signs
                  the student out mid-paper. */}
              <form action="/logout" method="post">
                <button
                  type="submit"
                  className="rounded px-2 py-1 text-white/80 transition-colors hover:bg-white/10"
                >
                  Sign out
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t border-line bg-surface-2">
        <div className="mx-auto w-full max-w-6xl px-6 py-6 text-xs leading-relaxed text-ink-muted">
          An independent practice tool for NSW HSC Software Engineering. Not
          affiliated with, endorsed by, or connected to the NSW Education
          Standards Authority. Syllabus wording is reproduced from the NESA
          Software Engineering 11–12 (2022) course for study purposes. Marks
          awarded here are estimates in the style of HSC marking, not official
          results.
        </div>
      </footer>
    </>
  );
}

function NavLink({
  href,
  current,
  children,
}: {
  href: string;
  current?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`rounded px-3 py-1.5 transition-colors ${
        current ? "bg-white/15 font-semibold" : "text-white/80 hover:bg-white/10"
      }`}
    >
      {children}
    </Link>
  );
}
