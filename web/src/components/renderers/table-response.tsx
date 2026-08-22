"use client";

import type { z } from "zod";

import type { tableResponseConfigSchema } from "@/lib/schemas/renderers";

type Config = z.infer<typeof tableResponseConfigSchema>;

/**
 * Editable-cell table (CLAUDE.md §8) — test data with expected output, trace
 * tables, and SQL result sets the student must complete.
 *
 * Fixed cells come from the question; editable cells are inputs keyed
 * `rowId.columnId`, which is exactly how the answer key addresses them.
 */
export function TableResponse({
  partId,
  config,
  value,
  onChange,
  disabled,
}: {
  partId: string;
  config: Config;
  value: Record<string, string>;
  onChange: (cells: Record<string, string>) => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full border-collapse text-[0.95em]">
        {config.caption && (
          <caption className="mb-1.5 text-left text-[0.9em] text-[var(--exam-muted)]">
            {config.caption}
          </caption>
        )}
        <thead>
          <tr>
            {config.columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className="border border-[var(--exam-line)] bg-[var(--exam-nav-answered-bg)] px-3 py-2 text-left font-semibold"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {config.rows.map((row, rowIndex) => (
            <tr key={row.id}>
              {config.columns.map((column) => {
                const ref = `${row.id}.${column.id}`;
                const fixed = row.fixed?.[column.id];

                if (!column.editable || fixed !== undefined) {
                  return (
                    <td
                      key={column.id}
                      className="border border-[var(--exam-line)] px-3 py-2 font-mono"
                    >
                      {fixed ?? ""}
                    </td>
                  );
                }

                return (
                  <td key={column.id} className="border border-[var(--exam-line)] p-0">
                    <label className="sr-only" htmlFor={`${partId}-${ref}`}>
                      {column.header}, row {rowIndex + 1}
                    </label>
                    <input
                      id={`${partId}-${ref}`}
                      type="text"
                      disabled={disabled}
                      value={value[ref] ?? ""}
                      onChange={(event) =>
                        onChange({ ...value, [ref]: event.target.value })
                      }
                      className={`w-full bg-[var(--exam-input-bg)] px-3 py-2 font-mono text-[var(--exam-fg)] outline-none disabled:opacity-60 ${
                        column.width === "wide"
                          ? "min-w-64"
                          : column.width === "narrow"
                            ? "min-w-20"
                            : "min-w-36"
                      }`}
                    />
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
