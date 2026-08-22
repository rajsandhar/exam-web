"use client";

import type { z } from "zod";

import type { matchingMatrixConfigSchema } from "@/lib/schemas/renderers";

type Config = z.infer<typeof matchingMatrixConfigSchema>;

/**
 * Row/column matching matrix (CLAUDE.md §8), as used for matching concepts
 * against protocols, ports or features. `single` mode gives one radio per row;
 * `multi` gives checkboxes.
 */
export function MatchingMatrix({
  partId,
  config,
  value,
  onChange,
  disabled,
}: {
  partId: string;
  config: Config;
  value: Record<string, string[]>;
  onChange: (matches: Record<string, string[]>) => void;
  disabled: boolean;
}) {
  function toggle(rowId: string, columnId: string, on: boolean) {
    const current = value[rowId] ?? [];
    const next =
      config.mode === "single"
        ? on
          ? [columnId]
          : []
        : on
          ? [...new Set([...current, columnId])]
          : current.filter((id) => id !== columnId);

    onChange({ ...value, [rowId]: next });
  }

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full border-collapse text-[0.95em]">
        <caption className="sr-only">
          {config.mode === "single"
            ? "Select one column for each row"
            : "Select every column that applies to each row"}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="border border-[var(--exam-line)] px-3 py-2 text-left">
              <span className="sr-only">Item</span>
            </th>
            {config.columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className="border border-[var(--exam-line)] bg-[var(--exam-nav-answered-bg)] px-3 py-2 text-center font-semibold"
              >
                {column.text}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {config.rows.map((row) => (
            <tr key={row.id}>
              <th
                scope="row"
                className="border border-[var(--exam-line)] px-3 py-2 text-left font-normal"
              >
                {row.text}
              </th>
              {config.columns.map((column) => {
                const checked = (value[row.id] ?? []).includes(column.id);
                return (
                  <td
                    key={column.id}
                    className="border border-[var(--exam-line)] px-3 py-2 text-center"
                  >
                    <label className="inline-flex cursor-pointer items-center justify-center p-1">
                      <span className="sr-only">
                        {row.text} — {column.text}
                      </span>
                      <input
                        type={config.mode === "single" ? "radio" : "checkbox"}
                        name={
                          config.mode === "single"
                            ? `part-${partId}-${row.id}`
                            : `part-${partId}-${row.id}-${column.id}`
                        }
                        checked={checked}
                        disabled={disabled}
                        onChange={(event) => toggle(row.id, column.id, event.target.checked)}
                        className="h-4 w-4 accent-[var(--exam-accent)]"
                      />
                    </label>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
