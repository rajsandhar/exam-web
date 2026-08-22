"use client";

import type { z } from "zod";

import type { dropdownCompletionConfigSchema } from "@/lib/schemas/renderers";

type Config = z.infer<typeof dropdownCompletionConfigSchema>;

/**
 * Inline dropdown completion (CLAUDE.md §8) — the archetype used for
 * reconstructing a SQL query from source and result tables, and for completing
 * the output of a traced code fragment.
 *
 * `code` and `query` layouts keep the surrounding text monospaced and preserve
 * its line structure, so a query reads as a query.
 */
export function DropdownCompletion({
  partId,
  config,
  value,
  onChange,
  disabled,
}: {
  partId: string;
  config: Config;
  value: Record<string, string | null>;
  onChange: (blanks: Record<string, string | null>) => void;
  disabled: boolean;
}) {
  const monospaced = config.layout === "code" || config.layout === "query";

  // Blank numbering is computed before render rather than counted during it,
  // so the labels are stable no matter how often the list re-renders.
  const blankNumbers = new Map<string, number>();
  for (const segment of config.segments) {
    if (segment.kind === "blank" && !blankNumbers.has(segment.blankId)) {
      blankNumbers.set(segment.blankId, blankNumbers.size + 1);
    }
  }

  return (
    <div
      className={`mt-3 border-l-2 border-[var(--exam-panel-bar)] bg-[var(--exam-input-bg)] px-4 py-3 leading-[2.4] ${
        monospaced ? "font-mono text-[0.9em]" : ""
      }`}
    >
      {config.segments.map((segment, index) => {
        if (segment.kind === "text") {
          // Line breaks matter in a code or query layout.
          return (
            <span key={index} className={monospaced ? "whitespace-pre-wrap" : undefined}>
              {segment.text}
            </span>
          );
        }

        const width =
          segment.width === "long"
            ? "min-w-52"
            : segment.width === "short"
              ? "min-w-24"
              : "min-w-36";

        return (
          <span key={index} className="mx-1 inline-block align-middle">
            <label className="sr-only" htmlFor={`${partId}-${segment.blankId}`}>
              Blank {blankNumbers.get(segment.blankId)}
            </label>
            <select
              id={`${partId}-${segment.blankId}`}
              disabled={disabled}
              value={value[segment.blankId] ?? ""}
              onChange={(event) =>
                onChange({
                  ...value,
                  [segment.blankId]: event.target.value === "" ? null : event.target.value,
                })
              }
              className={`${width} border border-[var(--exam-accent)] bg-[var(--exam-input-bg)] px-2 py-1 font-sans text-[0.95em] text-[var(--exam-fg)] disabled:opacity-60`}
            >
              <option value="">— select —</option>
              {segment.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.text}
                </option>
              ))}
            </select>
          </span>
        );
      })}
    </div>
  );
}
