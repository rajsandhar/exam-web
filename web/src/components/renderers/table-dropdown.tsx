"use client";

import type { z } from "zod";

import type { tableDropdownConfigSchema } from "@/lib/schemas/renderers";

type Config = z.infer<typeof tableDropdownConfigSchema>;
type Option = { id: string; text: string };

/**
 * A table whose cells are dropdowns (CLAUDE.md §8).
 *
 * The format NESA papers use most for objective marks: match a strategy to a
 * development stage, complete a data dictionary, pair security features with
 * concepts. Each dropdown is a real `<select>`, so it is keyboard-operable and
 * announced by a screen reader without any extra work.
 *
 * Cells are addressed `rowId.columnId`, which is exactly how the answer key
 * addresses them.
 */
export function TableDropdown({
  partId,
  config,
  value,
  onChange,
  disabled,
}: {
  partId: string;
  config: Config;
  value: Record<string, string | null>;
  onChange: (cells: Record<string, string | null>) => void;
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
          {config.rows.map((row, rowIndex) => {
            // The first column usually names the row, so it labels the selects
            // on that row for anyone using a screen reader.
            const rowLabel =
              (config.columns[0] && row.fixed?.[config.columns[0].id]) ??
              `Row ${rowIndex + 1}`;

            return (
              <tr key={row.id}>
                {config.columns.map((column) => {
                  const ref = `${row.id}.${column.id}`;
                  const fixed = row.fixed?.[column.id];
                  const options: Option[] | undefined =
                    fixed !== undefined
                      ? undefined
                      : (row.options?.[column.id] ?? column.options);

                  if (!options) {
                    return (
                      <td
                        key={column.id}
                        className="border border-[var(--exam-line)] px-3 py-2"
                      >
                        {fixed ?? ""}
                      </td>
                    );
                  }

                  const id = `${partId}-${ref}`;
                  return (
                    <td
                      key={column.id}
                      className="border border-[var(--exam-line)] p-0 align-middle"
                    >
                      <label className="sr-only" htmlFor={id}>
                        {column.header}, {rowLabel}
                      </label>
                      <select
                        id={id}
                        disabled={disabled}
                        value={value[ref] ?? ""}
                        onChange={(event) =>
                          onChange({
                            ...value,
                            [ref]: event.target.value === "" ? null : event.target.value,
                          })
                        }
                        // The native caret is kept, so the cell reads as
                        // something to choose from rather than printed text.
                        className={`m-1.5 border border-[var(--exam-accent)] bg-[var(--exam-input-bg)] px-2 py-1.5 font-sans text-[var(--exam-fg)] outline-none focus:ring-2 focus:ring-[var(--exam-focus)] disabled:opacity-60 ${
                          column.width === "wide"
                            ? "min-w-64"
                            : column.width === "narrow"
                              ? "min-w-24"
                              : "min-w-44"
                        }`}
                      >
                        <option value="">Choose…</option>
                        {options.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.text}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
