import Link from "next/link";

/**
 * Shared chrome for the sign-in and first-run screens.
 *
 * Deliberately plain: these are the only pages someone sees before they are
 * authenticated, and there is nothing here worth decorating.
 */

export function AuthCard({
  title,
  intro,
  problem,
  children,
}: {
  title: string;
  intro?: string;
  problem?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <p className="text-sm font-semibold tracking-tight text-navy-800">
        HSC Software Engineering — Trial Exam Builder
      </p>

      <div className="mt-6 rounded-lg border border-line bg-white p-7">
        <h1 className="text-xl font-semibold tracking-tight text-navy-800">{title}</h1>
        {intro && (
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">{intro}</p>
        )}

        {problem && (
          <p
            role="alert"
            className="mt-4 rounded border border-danger/40 bg-danger/5 p-3 text-sm text-danger"
          >
            {problem}
          </p>
        )}

        <div className="mt-6">{children}</div>
      </div>

      <p className="mt-6 text-xs leading-relaxed text-ink-muted">
        An independent practice tool for NSW HSC Software Engineering. Not
        affiliated with, endorsed by, or connected to the NSW Education Standards
        Authority.
      </p>
    </main>
  );
}

export function AuthField({
  label,
  name,
  type = "text",
  hint,
  ...rest
}: {
  label: string;
  name: string;
  type?: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `field-${name}`;
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        aria-describedby={hintId}
        className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-navy-600"
        {...rest}
      />
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function AuthSubmit({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="w-full rounded-md bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-700"
    >
      {children}
    </button>
  );
}

export function AuthFooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="text-sm font-medium text-navy-700 underline">
      {children}
    </Link>
  );
}
