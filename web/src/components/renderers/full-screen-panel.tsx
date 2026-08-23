"use client";

import { useEffect, useState } from "react";

/**
 * Full screen for an answer area.
 *
 * NESA papers put a Full screen control on every large answer area — code, SQL,
 * pseudocode and the diagram canvas — because a 14-line editor inside a
 * split-screen question is not enough room to write an algorithm in. This is
 * the shared shell so the three editors do not each grow their own.
 *
 * Escape leaves, which is what anyone will try first, and the page behind is
 * frozen so the exam does not scroll underneath the overlay.
 */
export function FullScreenPanel({
  label,
  toolbar,
  children,
}: {
  /** Names the panel for a screen reader, e.g. "Python answer". */
  label: string;
  /** Controls that belong beside the full-screen button, e.g. Run. */
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <div
      className={
        open
          ? "fixed inset-0 z-50 flex flex-col overflow-auto bg-[var(--exam-canvas-bg)] p-6"
          : "mt-3"
      }
      {...(open ? { role: "dialog", "aria-modal": true, "aria-label": label } : {})}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          className="h-9 border border-[var(--exam-line)] px-3 text-[0.85em] font-semibold"
        >
          {open ? "Exit full screen" : "Full screen"}
        </button>
        {toolbar}
      </div>

      <div className={open ? "flex-1" : undefined}>{children}</div>

      {open && (
        <p className="mt-2 text-[0.8em] text-[var(--exam-muted)]">
          Press Escape to leave full screen. Your answer is saved either way.
        </p>
      )}
    </div>
  );
}
