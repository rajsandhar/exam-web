"use client";

import { useFormStatus } from "react-dom";

/**
 * A submit button that says what it is doing.
 *
 * Testing a connection makes a real model call and can take several seconds, so
 * the button has to show that something is happening rather than looking dead.
 */
export function PendingButton({
  children,
  pendingLabel,
  variant = "primary",
}: {
  children: React.ReactNode;
  pendingLabel: string;
  variant?: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();

  const styles =
    variant === "primary"
      ? "bg-navy-800 text-white hover:bg-navy-700"
      : "border border-line bg-white text-navy-800 hover:bg-surface-2";

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-progress disabled:opacity-70 ${styles}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
