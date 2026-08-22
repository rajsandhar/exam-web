"use client";

import { useState } from "react";
import type { z } from "zod";

import type { orderingConfigSchema } from "@/lib/schemas/renderers";

type Config = z.infer<typeof orderingConfigSchema>;

/**
 * Drag-to-order, with a keyboard equivalent that is not a second-class path
 * (CLAUDE.md §8, §24). Every item carries Move up / Move down buttons, so the
 * question is fully answerable without a pointer.
 */
export function Ordering({
  partId,
  config,
  value,
  onChange,
  disabled,
}: {
  partId: string;
  config: Config;
  value: string[];
  onChange: (order: string[]) => void;
  disabled: boolean;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // The stored order is authoritative; anything the student has not placed yet
  // keeps its original position at the end.
  const known = new Set(config.items.map((item) => item.id));
  const ordered = [
    ...value.filter((id) => known.has(id)),
    ...config.items.map((item) => item.id).filter((id) => !value.includes(id)),
  ];

  const itemsById = new Map(config.items.map((item) => [item.id, item]));

  function move(from: number, to: number) {
    if (to < 0 || to >= ordered.length || from === to) return;
    const next = [...ordered];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    onChange(next);
  }

  return (
    <div className="mt-3">
      {config.instruction && (
        <p className="mb-2 font-semibold">{config.instruction}</p>
      )}
      <ol className="space-y-1.5" aria-label="Drag or use the buttons to reorder">
        {ordered.map((id, index) => {
          const item = itemsById.get(id);
          if (!item) return null;
          return (
            <li
              key={id}
              draggable={!disabled}
              onDragStart={() => setDraggingId(id)}
              onDragEnd={() => setDraggingId(null)}
              onDragOver={(event) => {
                if (disabled || draggingId === null) return;
                event.preventDefault();
              }}
              onDrop={(event) => {
                if (disabled || draggingId === null) return;
                event.preventDefault();
                move(ordered.indexOf(draggingId), index);
                setDraggingId(null);
              }}
              className={`flex items-center gap-3 border border-[var(--exam-line)] bg-[var(--exam-input-bg)] px-3 py-2 ${
                draggingId === id ? "opacity-50" : ""
              } ${disabled ? "opacity-60" : "cursor-grab"}`}
            >
              <span
                aria-hidden="true"
                className="select-none font-mono text-[0.85em] text-[var(--exam-muted)]"
              >
                {index + 1}.
              </span>
              <span className="flex-1">{item.text}</span>
              <span className="flex gap-1">
                <button
                  type="button"
                  disabled={disabled || index === 0}
                  onClick={() => move(index, index - 1)}
                  aria-label={`Move "${item.text}" up`}
                  className="h-7 w-7 border border-[var(--exam-line)] disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={disabled || index === ordered.length - 1}
                  onClick={() => move(index, index + 1)}
                  aria-label={`Move "${item.text}" down`}
                  className="h-7 w-7 border border-[var(--exam-line)] disabled:opacity-30"
                >
                  ↓
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite" id={`order-${partId}`}>
        Current order: {ordered.map((id) => itemsById.get(id)?.text).join(", ")}
      </p>
    </div>
  );
}
