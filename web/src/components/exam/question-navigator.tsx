"use client";

import { useMemo, useState } from "react";

/**
 * Horizontal numbered navigator with paging when the numbers overflow
 * (CLAUDE.md §10.4). Answered / unanswered / flagged states are visually
 * distinct and also announced, since colour alone is not sufficient.
 */

export type NavigatorItem = {
  position: number;
  answered: boolean;
  flagged: boolean;
};

const PAGE_SIZE = 20;

export function QuestionNavigator({
  items,
  current,
  onSelect,
}: {
  items: NavigatorItem[];
  current: number;
  onSelect: (position: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));

  // The page follows the current question by default, and a manual page choice
  // holds only until the student moves to a different question. Deriving it
  // this way avoids an effect that would fight the user's own paging.
  const [manual, setManual] = useState<{ page: number; forQuestion: number } | null>(null);
  const page =
    manual !== null && manual.forQuestion === current
      ? manual.page
      : Math.floor((current - 1) / PAGE_SIZE);

  const showPage = (next: number) =>
    setManual({
      page: Math.min(Math.max(0, next), pageCount - 1),
      forQuestion: current,
    });

  const visible = useMemo(
    () => items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [items, page],
  );

  return (
    <nav aria-label="Question navigation" className="flex items-center gap-1">
      {pageCount > 1 && (
        <NavArrow
          direction="previous"
          disabled={page === 0}
          onClick={() => showPage(page - 1)}
        />
      )}

      <ul className="flex flex-wrap items-center gap-1">
        {visible.map((item) => {
          const isCurrent = item.position === current;
          return (
            <li key={item.position}>
              <button
                type="button"
                onClick={() => onSelect(item.position)}
                aria-current={isCurrent ? "true" : undefined}
                aria-label={`Question ${item.position}${
                  item.flagged ? ", flagged" : ""
                }${item.answered ? ", answered" : ", not answered"}`}
                className={[
                  "relative h-9 min-w-9 border px-2 text-[0.95em] font-medium tabular-nums transition-colors",
                  isCurrent
                    ? "border-[var(--exam-nav-current-bg)] bg-[var(--exam-nav-current-bg)] text-[var(--exam-nav-current-fg)]"
                    : item.answered
                      ? "border-[var(--exam-accent)] bg-[var(--exam-nav-answered-bg)] text-[var(--exam-accent)]"
                      : "border-[var(--exam-accent)] bg-transparent text-[var(--exam-accent)]",
                ].join(" ")}
              >
                {item.position}
                {item.flagged && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-0.5 -top-0.5 block h-2 w-2 rotate-45 bg-[var(--flag,#c2410c)]"
                    style={{ background: "var(--flag)" }}
                  />
                )}
                {isCurrent && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-0.5 block h-0.5 bg-[var(--exam-nav-current-bg)]"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {pageCount > 1 && (
        <NavArrow
          direction="next"
          disabled={page >= pageCount - 1}
          onClick={() => showPage(page + 1)}
        />
      )}
    </nav>
  );
}

function NavArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: "previous" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Show ${direction} question numbers`}
      className="h-9 w-9 border border-[var(--exam-accent)] bg-[var(--exam-nav-current-bg)] text-[var(--exam-nav-current-fg)] disabled:opacity-30"
    >
      {direction === "previous" ? "‹" : "›"}
    </button>
  );
}
