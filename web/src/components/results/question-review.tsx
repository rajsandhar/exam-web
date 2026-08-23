"use client";

import { useState } from "react";

import { htmlToPlainText, sanitiseResponseHtml } from "@/lib/sanitise";
import type { ReviewGroup, ReviewPart } from "@/lib/results/build-results";
import {
  dropdownCompletionConfigSchema,
  matchingMatrixConfigSchema,
  multiSelectConfigSchema,
  orderingConfigSchema,
  singleChoiceConfigSchema,
  tableResponseConfigSchema,
} from "@/lib/schemas/renderers";

import { Stimulus } from "../exam/stimulus";

/**
 * Per-question review (CLAUDE.md §19): the original question and stimulus, the
 * student's response, the mark, the criteria, what was missing, and the correct
 * answer with its explanation.
 */

export function QuestionReview({ group }: { group: ReviewGroup }) {
  const [open, setOpen] = useState(false);

  return (
    <article className="overflow-hidden rounded-lg border border-line bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-5 py-4 text-left"
      >
        <span className="font-semibold text-navy-800">Question {group.position}</span>
        <span className="text-sm text-ink-muted">
          {group.section === "objective" ? "Objective response" : "Short answer"}
        </span>
        <span className="ml-auto flex items-center gap-3">
          <ScoreBadge awarded={group.awardedMarks} total={group.totalMarks} />
          <span aria-hidden="true" className="text-ink-muted">
            {open ? "−" : "+"}
          </span>
        </span>
      </button>

      {open && (
        <div className="border-t border-line px-5 py-5">
          {group.stimulus && (
            <div data-exam-theme="default" className="mb-6 bg-transparent text-sm">
              <Stimulus spec={group.stimulus} region={`review.${group.id}`} />
            </div>
          )}
          <div className="space-y-7">
            {group.parts.map((part) => (
              <PartReview key={part.id} part={part} />
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function PartReview({ part }: { part: ReviewPart }) {
  if (part.marks === 0) return null;

  const marking = part.marking;
  const notMarked = marking?.method === "not_marked";

  return (
    <section className="border-l-4 border-line pl-4">
      <header className="flex items-baseline justify-between gap-4">
        <h3 className="font-semibold">
          {part.label ? `Part (${part.label})` : "Question"}
        </h3>
        <span className="text-sm font-semibold tabular-nums">
          {notMarked ? "—" : (part.awardedMarks ?? 0)} / {part.marks}
        </span>
      </header>

      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">
        {part.prompt}
      </p>

      <Block title="Your response">
        <StudentResponse part={part} />
      </Block>

      {marking?.detail && (
        <p className="mt-3 text-sm">
          <span className="font-semibold">Marker note. </span>
          {marking.detail}
        </p>
      )}

      {marking?.reasoning && (
        <Block title="Why this mark">
          <p className="text-sm leading-relaxed">{marking.reasoning}</p>
          {marking.evidence && marking.evidence.length > 0 && (
            <>
              <p className="mt-3 text-sm font-semibold">What you did well</p>
              <ul className="ml-5 mt-1 list-disc text-sm">
                {marking.evidence.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </>
          )}
          {marking.missingElements && marking.missingElements.length > 0 && (
            <>
              <p className="mt-3 text-sm font-semibold">What was missing</p>
              <ul className="ml-5 mt-1 list-disc text-sm">
                {marking.missingElements.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </>
          )}
          {marking.confidence && (
            <p className="mt-3 text-xs text-ink-muted">
              Marker confidence: {marking.confidence}
              {marking.moderated ? " · moderated" : ""}
            </p>
          )}
        </Block>
      )}

      <CorrectAnswer part={part} />

      {part.markingGuideline && (
        <Block title="Marking criteria">
          <ul className="space-y-1.5 text-sm">
            {part.markingGuideline.criteria.map((criterion, index) => (
              <li key={index} className="flex gap-3">
                <span className="w-10 shrink-0 font-semibold tabular-nums">
                  {criterion.marks}
                </span>
                <span>{criterion.description}</span>
              </li>
            ))}
          </ul>
          {part.markingGuideline.commandVerbNote && (
            <p className="mt-3 text-xs italic text-ink-muted">
              {part.markingGuideline.commandVerbNote}
            </p>
          )}
        </Block>
      )}

      {marking?.hiddenTests && (
        <Block title="Automated tests">
          <p className="text-sm">
            {marking.hiddenTests.passed} of {marking.hiddenTests.total} test
            {marking.hiddenTests.total === 1 ? "" : "s"} passed.
          </p>
          {marking.hiddenTests.cases.length > 0 && (
            <ul className="mt-2 space-y-1.5 text-sm">
              {marking.hiddenTests.cases.map((testCase, index) => (
                <li key={index} className="flex gap-2">
                  <span
                    aria-hidden="true"
                    className={testCase.passed ? "text-ok" : "text-danger"}
                  >
                    {testCase.passed ? "✓" : "✗"}
                  </span>
                  <span>
                    <span className="font-medium">{testCase.name}</span>
                    <span className="sr-only">
                      {testCase.passed ? " passed" : " failed"}
                    </span>
                    {!testCase.passed && (
                      <span className="block text-xs text-ink-muted">
                        {testCase.error
                          ? testCase.error
                          : `Expected ${testCase.expected}; your code returned ${
                              testCase.actual ?? "nothing"
                            }.`}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Block>
      )}

      {notMarked && marking?.fullMarkExemplar && (
        <Block title="Full-mark response">
          <p className="whitespace-pre-line text-sm leading-relaxed">
            {marking.fullMarkExemplar}
          </p>
        </Block>
      )}

      <Block title="Syllabus content assessed">
        <ul className="space-y-1 text-sm">
          {part.syllabusItems.map((item) => (
            <li key={item.id} className="flex gap-2">
              <span className="font-mono text-xs text-ink-muted">{item.id}</span>
              <span>{item.exactText}</span>
            </li>
          ))}
        </ul>
      </Block>
    </section>
  );
}

function StudentResponse({ part }: { part: ReviewPart }) {
  const response = part.response;
  if (!response) {
    return <p className="text-sm italic text-ink-muted">No response given.</p>;
  }

  switch (response.rendererType) {
    case "single_choice": {
      const config = singleChoiceConfigSchema.safeParse(part.config);
      const chosen = config.success
        ? config.data.options.find((o) => o.id === response.optionId)
        : undefined;
      return (
        <p className="text-sm">{chosen?.text ?? "No response given."}</p>
      );
    }
    case "multi_select": {
      const config = multiSelectConfigSchema.safeParse(part.config);
      const chosen = config.success
        ? config.data.options.filter((o) => response.optionIds.includes(o.id))
        : [];
      return chosen.length === 0 ? (
        <p className="text-sm italic text-ink-muted">No response given.</p>
      ) : (
        <ul className="ml-5 list-disc text-sm">
          {chosen.map((option) => (
            <li key={option.id}>{option.text}</li>
          ))}
        </ul>
      );
    }
    case "ordering": {
      const config = orderingConfigSchema.safeParse(part.config);
      const labels = config.success
        ? response.order
            .map((id) => config.data.items.find((item) => item.id === id)?.text)
            .filter((text): text is string => text !== undefined)
        : [];
      return labels.length === 0 ? (
        <p className="text-sm italic text-ink-muted">No response given.</p>
      ) : (
        <ol className="ml-5 list-decimal text-sm">
          {labels.map((text, index) => (
            <li key={index}>{text}</li>
          ))}
        </ol>
      );
    }

    case "matching_matrix": {
      const config = matchingMatrixConfigSchema.safeParse(part.config);
      if (!config.success) break;
      return (
        <ul className="space-y-1 text-sm">
          {config.data.rows.map((row) => {
            const chosen = (response.matches[row.id] ?? [])
              .map((id) => config.data.columns.find((column) => column.id === id)?.text)
              .filter((text): text is string => text !== undefined);
            return (
              <li key={row.id}>
                <span className="font-medium">{row.text}</span>
                {" → "}
                {chosen.length > 0 ? (
                  chosen.join(", ")
                ) : (
                  <span className="italic text-ink-muted">not answered</span>
                )}
              </li>
            );
          })}
        </ul>
      );
    }

    case "dropdown_completion": {
      const config = dropdownCompletionConfigSchema.safeParse(part.config);
      if (!config.success) break;
      const blanks = config.data.segments.filter((segment) => segment.kind === "blank");
      return (
        <ol className="ml-5 list-decimal text-sm">
          {blanks.map((blank) => {
            const chosen = blank.options.find(
              (option) => option.id === response.blanks[blank.blankId],
            );
            return (
              <li key={blank.blankId}>
                {chosen ? (
                  chosen.text
                ) : (
                  <span className="italic text-ink-muted">not answered</span>
                )}
              </li>
            );
          })}
        </ol>
      );
    }

    case "table_response": {
      const config = tableResponseConfigSchema.safeParse(part.config);
      if (!config.success) break;
      return (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {config.data.columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  className="border border-line bg-surface-2 px-2 py-1 text-left font-semibold"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {config.data.rows.map((row) => (
              <tr key={row.id}>
                {config.data.columns.map((column) => (
                  <td key={column.id} className="border border-line px-2 py-1 font-mono">
                    {row.fixed?.[column.id] ??
                      response.cells[`${row.id}.${column.id}`] ??
                      ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    case "short_text":
      return response.text.trim() === "" ? (
        <p className="text-sm italic text-ink-muted">No response given.</p>
      ) : (
        <p className="whitespace-pre-line text-sm leading-relaxed">{response.text}</p>
      );
    case "rich_text_response": {
      const text = htmlToPlainText(response.html);
      return text === "" ? (
        <p className="text-sm italic text-ink-muted">No response given.</p>
      ) : (
        <div
          className="prose-exam text-sm leading-relaxed"
          // Sanitised on save and again here before rendering (CLAUDE.md §23).
          dangerouslySetInnerHTML={{
            __html: sanitiseResponseHtml(response.html),
          }}
        />
      );
    }
    default:
      break;
  }

  return (
    <pre className="overflow-x-auto whitespace-pre-wrap text-sm">
      {JSON.stringify(response, null, 2)}
    </pre>
  );
}

function CorrectAnswer({ part }: { part: ReviewPart }) {
  const key = part.answerKey;
  if (!key) return null;

  if (key.rendererType === "single_choice") {
    const config = singleChoiceConfigSchema.safeParse(part.config);
    const correct = config.success
      ? config.data.options.find((o) => o.id === key.correctOptionId)
      : undefined;
    return (
      <Block title="Correct answer">
        <p className="text-sm font-medium">{correct?.text}</p>
        <p className="mt-2 text-sm leading-relaxed">{key.explanation}</p>
      </Block>
    );
  }

  if (key.rendererType === "multi_select") {
    const config = multiSelectConfigSchema.safeParse(part.config);
    const correct = config.success
      ? config.data.options.filter((o) => key.correctOptionIds.includes(o.id))
      : [];
    return (
      <Block title="Correct answer">
        <ul className="ml-5 list-disc text-sm font-medium">
          {correct.map((option) => (
            <li key={option.id}>{option.text}</li>
          ))}
        </ul>
        <p className="mt-2 text-sm leading-relaxed">{key.explanation}</p>
      </Block>
    );
  }

  if (key.rendererType === "ordering") {
    const config = orderingConfigSchema.safeParse(part.config);
    return (
      <Block title="Correct order">
        <ol className="ml-5 list-decimal text-sm font-medium">
          {key.correctOrder.map((id) => (
            <li key={id}>
              {config.success
                ? (config.data.items.find((item) => item.id === id)?.text ?? id)
                : id}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-sm leading-relaxed">{key.explanation}</p>
      </Block>
    );
  }

  if (key.rendererType === "matching_matrix") {
    const config = matchingMatrixConfigSchema.safeParse(part.config);
    return (
      <Block title="Correct answer">
        <ul className="space-y-1 text-sm font-medium">
          {Object.entries(key.matches).map(([rowId, columnIds]) => (
            <li key={rowId}>
              {config.success
                ? (config.data.rows.find((row) => row.id === rowId)?.text ?? rowId)
                : rowId}
              {" → "}
              {columnIds
                .map((id) =>
                  config.success
                    ? (config.data.columns.find((column) => column.id === id)?.text ?? id)
                    : id,
                )
                .join(", ")}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm leading-relaxed">{key.explanation}</p>
      </Block>
    );
  }

  if (key.rendererType === "dropdown_completion") {
    const config = dropdownCompletionConfigSchema.safeParse(part.config);
    const blanks = config.success
      ? config.data.segments.filter((segment) => segment.kind === "blank")
      : [];
    return (
      <Block title="Correct answer">
        <ol className="ml-5 list-decimal text-sm font-medium">
          {blanks.map((blank) => (
            <li key={blank.blankId}>
              {blank.options.find((option) => option.id === key.blanks[blank.blankId])
                ?.text ?? key.blanks[blank.blankId]}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-sm leading-relaxed">{key.explanation}</p>
      </Block>
    );
  }

  if (key.rendererType === "table_response") {
    return (
      <Block title="Accepted answers">
        <ul className="space-y-1 text-sm">
          {Object.entries(key.cells).map(([ref, expected]) => (
            <li key={ref}>
              <span className="font-mono text-xs text-ink-muted">{ref}</span>{" "}
              {expected.accepted.join(" / ")}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm leading-relaxed">{key.explanation}</p>
      </Block>
    );
  }

  if (key.rendererType === "short_text") {
    return (
      <Block title="Expected response">
        <ul className="ml-5 list-disc space-y-1 text-sm">
          {key.accepted.map((answer, index) => (
            <li key={index}>{answer}</li>
          ))}
        </ul>
        <p className="mt-2 text-sm leading-relaxed">{key.explanation}</p>
      </Block>
    );
  }

  if (key.rendererType === "rich_text_response") {
    return (
      <Block title="Full-mark response">
        <p className="whitespace-pre-line text-sm leading-relaxed">{key.modelAnswer}</p>
        <p className="mt-3 text-sm font-semibold">Expected concepts</p>
        <ul className="ml-5 mt-1 list-disc text-sm">
          {key.expectedConcepts.map((concept, index) => (
            <li key={index}>{concept}</li>
          ))}
        </ul>
      </Block>
    );
  }

  return null;
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {title}
      </p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function ScoreBadge({ awarded, total }: { awarded: number; total: number }) {
  const ratio = total === 0 ? 0 : awarded / total;
  const tone =
    ratio >= 0.8
      ? "border-ok/40 bg-ok/10 text-ok"
      : ratio >= 0.5
        ? "border-line-strong bg-surface-2 text-ink"
        : "border-danger/40 bg-danger/5 text-danger";
  return (
    <span
      className={`rounded border px-2.5 py-1 text-sm font-semibold tabular-nums ${tone}`}
    >
      {awarded} / {total}
    </span>
  );
}
