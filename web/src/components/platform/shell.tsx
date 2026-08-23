import Link from "next/link";

/**
 * The chrome used everywhere except exam mode. Clean and modern; exam mode
 * deliberately does not use it.
 */
export function PlatformShell({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: "build" | "history";
}) {
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
          </nav>
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
