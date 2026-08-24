"use client";

import { type ReactNode } from "react";

import { useExamTools } from "./exam-tools-context";

/**
 * Text the student may highlight (CLAUDE.md §24).
 *
 * Highlights are stored semantically — the region, the selected text and which
 * occurrence of it — rather than as DOM ranges, so they survive re-render, a
 * font-size change and a page reload.
 *
 * This renders them. Capturing a selection belongs to the document-level
 * listener in `use-highlight-selection.ts`: it lived here, on this span's own
 * `mouseup`, and a release landing anywhere but on the text — past the end of a
 * line, in the next paragraph — was never delivered.
 */

export function Highlightable({
  region,
  children,
}: {
  region: string;
  children: string;
}) {
  const { highlightMode, highlightsForRegion, removeHighlight } = useExamTools();

  const applicable = highlightsForRegion(region);

  return (
    <span
      data-highlight-region={region}
      className={highlightMode ? "cursor-text" : undefined}
    >
      {renderWithHighlights(children, applicable, removeHighlight, highlightMode)}
    </span>
  );
}

type AppliedHighlight = {
  id: string;
  text: string;
  occurrence: number;
};

function renderWithHighlights(
  source: string,
  marks: AppliedHighlight[],
  removeHighlight: (id: string) => void,
  highlightMode: boolean,
): ReactNode {
  if (marks.length === 0) return source;

  type Span = { start: number; end: number; id: string };
  const spans: Span[] = [];

  for (const mark of marks) {
    let index = -1;
    for (let seen = 0; seen <= mark.occurrence; seen += 1) {
      index = source.indexOf(mark.text, index + 1);
      if (index === -1) break;
    }
    if (index === -1) continue;
    spans.push({ start: index, end: index + mark.text.length, id: mark.id });
  }

  spans.sort((a, b) => a.start - b.start);

  const out: ReactNode[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue; // overlapping highlight; keep the first
    if (span.start > cursor) out.push(source.slice(cursor, span.start));
    out.push(
      <mark
        key={span.id}
        className="exam-highlight"
        role={highlightMode ? "button" : undefined}
        tabIndex={highlightMode ? 0 : undefined}
        title={highlightMode ? "Remove highlight" : undefined}
        onClick={highlightMode ? () => removeHighlight(span.id) : undefined}
        onKeyDown={
          highlightMode
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  removeHighlight(span.id);
                }
              }
            : undefined
        }
      >
        {source.slice(span.start, span.end)}
      </mark>,
    );
    cursor = span.end;
  }
  if (cursor < source.length) out.push(source.slice(cursor));
  return out;
}



