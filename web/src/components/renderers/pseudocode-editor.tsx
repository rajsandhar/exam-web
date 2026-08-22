"use client";

import type { z } from "zod";

import type { pseudocodeEditorConfigSchema } from "@/lib/schemas/renderers";

type Config = z.infer<typeof pseudocodeEditorConfigSchema>;

/**
 * Pseudocode answers (CLAUDE.md §8). Monospaced and never executed — NESA
 * pseudocode is a notation, not a language, so syntax highlighting or an error
 * squiggle would be actively misleading.
 */
export function PseudocodeEditor({
  partId,
  config,
  value,
  onChange,
  disabled,
}: {
  partId: string;
  config: Config;
  value: string;
  onChange: (code: string) => void;
  disabled: boolean;
}) {
  const code = value === "" ? (config.starterCode ?? "") : value;

  return (
    <div className="mt-3">
      <label className="sr-only" htmlFor={`pseudocode-${partId}`}>
        Your algorithm
      </label>
      <textarea
        id={`pseudocode-${partId}`}
        value={code}
        rows={config.rows ?? 14}
        disabled={disabled}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          // Tab indents rather than leaving the field: indentation carries
          // meaning in pseudocode, and re-typing spaces under exam conditions
          // is a waste of the student's time.
          if (event.key !== "Tab" || event.shiftKey) return;
          event.preventDefault();
          const target = event.currentTarget;
          const { selectionStart, selectionEnd } = target;
          const next = `${code.slice(0, selectionStart)}    ${code.slice(selectionEnd)}`;
          onChange(next);
          requestAnimationFrame(() => {
            target.selectionStart = target.selectionEnd = selectionStart + 4;
          });
        }}
        className="w-full resize-y border border-[var(--exam-line)] bg-[var(--exam-input-bg)] p-3 font-mono text-[0.9em] leading-[1.7] text-[var(--exam-fg)] outline-none disabled:opacity-60"
      />
      <p className="mt-1 text-[0.8em] text-[var(--exam-muted)]">
        Write your algorithm in pseudocode. Indentation is preserved; press Tab to indent.
      </p>
    </div>
  );
}
