"use client";

import type { StimulusSpec, TableSpec } from "@/lib/schemas/stimulus";
import { Highlightable } from "./highlightable";

/**
 * Deterministic stimulus rendering (CLAUDE.md §9). Structured data in,
 * examination-style HTML out. Nothing here accepts markup from the model.
 */

export function Stimulus({
  spec,
  region,
}: {
  spec: StimulusSpec;
  region: string;
}) {
  switch (spec.kind) {
    case "text":
      return (
        <div>
          {spec.title && <h3 className="mb-2 font-semibold">{spec.title}</h3>}
          {spec.paragraphs.map((paragraph, index) => (
            <p key={index} className="mb-3 leading-relaxed last:mb-0">
              <Highlightable region={`${region}.p${index}`}>{paragraph}</Highlightable>
            </p>
          ))}
        </div>
      );

    case "list":
      return (
        <div>
          {spec.title && <h3 className="mb-2 font-semibold">{spec.title}</h3>}
          {spec.ordered ? (
            <ol className="ml-5 list-decimal space-y-1.5">
              {spec.items.map((item, index) => (
                <li key={index} className="leading-relaxed">
                  <Highlightable region={`${region}.li${index}`}>{item}</Highlightable>
                </li>
              ))}
            </ol>
          ) : (
            <ul className="ml-5 list-disc space-y-1.5">
              {spec.items.map((item, index) => (
                <li key={index} className="leading-relaxed">
                  <Highlightable region={`${region}.li${index}`}>{item}</Highlightable>
                </li>
              ))}
            </ul>
          )}
        </div>
      );

    case "code":
      return (
        <CodeBlock
          code={spec.code}
          caption={spec.caption}
          showLineNumbers={spec.showLineNumbers ?? true}
          highlightLines={spec.highlightLines}
        />
      );

    case "table":
      return <StimulusTable table={spec.table} />;

    case "table_set":
      return (
        <div className="space-y-5">
          {spec.caption && <p className="font-semibold">{spec.caption}</p>}
          {spec.tables.map((entry) => (
            <div key={entry.name}>
              <p className="mb-1.5 font-mono text-[0.85em] font-semibold">{entry.name}</p>
              <StimulusTable table={entry.table} />
            </div>
          ))}
        </div>
      );

    case "diagram":
      // diagram_viewer arrives at Step 13; until then the structured data is
      // rendered as a labelled outline rather than being dropped silently.
      return (
        <div className="border border-[var(--exam-line)] p-3 text-[0.9em]">
          <p className="font-semibold">{spec.diagram.title ?? spec.diagram.type}</p>
          <ul className="ml-5 mt-2 list-disc">
            {spec.diagram.nodes.map((node) => (
              <li key={node.id}>{node.label}</li>
            ))}
          </ul>
        </div>
      );

    case "composite":
      return (
        <div className="space-y-5">
          {spec.items.map((item, index) => (
            <Stimulus key={index} spec={item} region={`${region}.${index}`} />
          ))}
        </div>
      );
  }
}

export function CodeBlock({
  code,
  caption,
  showLineNumbers = true,
  highlightLines,
}: {
  code: string;
  caption?: string;
  showLineNumbers?: boolean;
  highlightLines?: number[];
}) {
  const lines = code.replace(/\n$/, "").split("\n");
  const marked = new Set(highlightLines ?? []);

  return (
    <figure className="my-1">
      {caption && (
        <figcaption className="mb-1.5 font-mono text-[0.82em] text-[var(--exam-muted)]">
          {caption}
        </figcaption>
      )}
      <pre className="overflow-x-auto border border-[var(--exam-line)] bg-[var(--exam-input-bg)] p-3 font-mono text-[0.86em] leading-[1.6]">
        <code>
          {lines.map((line, index) => (
            <span
              key={index}
              className={`grid grid-cols-[2.5em_1fr] ${
                marked.has(index + 1) ? "bg-[var(--exam-nav-answered-bg)]" : ""
              }`}
            >
              {showLineNumbers && (
                <span
                  aria-hidden="true"
                  className="select-none pr-3 text-right text-[var(--exam-muted)]"
                >
                  {index + 1}
                </span>
              )}
              <span className={showLineNumbers ? "" : "col-span-2"}>
                {line === "" ? " " : line}
              </span>
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}

export function StimulusTable({ table }: { table: TableSpec }) {
  return (
    <figure className="my-1 overflow-x-auto">
      {table.caption && (
        <figcaption className="mb-1.5 text-[0.9em] text-[var(--exam-muted)]">
          {table.caption}
        </figcaption>
      )}
      <table className="w-full border-collapse text-[0.9em]">
        <thead>
          <tr>
            {table.columns.map((column) => (
              <th
                key={column}
                scope="col"
                className="border border-[var(--exam-line)] bg-[var(--exam-nav-answered-bg)] px-2.5 py-1.5 text-left font-semibold"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) =>
                table.firstColumnIsHeader && cellIndex === 0 ? (
                  <th
                    key={cellIndex}
                    scope="row"
                    className="border border-[var(--exam-line)] px-2.5 py-1.5 text-right font-mono font-semibold"
                  >
                    {cell}
                  </th>
                ) : (
                  <td
                    key={cellIndex}
                    className="border border-[var(--exam-line)] px-2.5 py-1.5"
                  >
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
