"use client";

import { useId, useState } from "react";

import type { StudentQuestionGroup } from "@/lib/db/queries/student";
import type { QuestionPartForStudent } from "@/lib/schemas/question";
import { isResponsive, type ResponsePayload } from "@/lib/schemas/renderers";

import { QuestionRenderer } from "../renderers";
import { Highlightable } from "./highlightable";
import { Stimulus } from "./stimulus";

/**
 * Adaptive question layout (CLAUDE.md §10.6).
 *
 * A plain multiple-choice question gets one wide panel; anything with a
 * stimulus that benefits from being read alongside the response is split. The
 * layout comes from the question specification, not from a global setting.
 */

export function QuestionView({
  group,
  responses,
  onRespond,
  disabled,
}: {
  group: StudentQuestionGroup;
  responses: Record<string, ResponsePayload | null>;
  onRespond: (partId: string, value: ResponsePayload) => void;
  disabled: boolean;
}) {
  const heading = (
    <h1 className="text-[1.45em] font-bold text-[var(--exam-accent)]">
      Question {group.position} ({group.totalMarks}{" "}
      {group.totalMarks === 1 ? "mark" : "marks"})
    </h1>
  );

  const responseParts = group.parts.filter((p) => isResponsive(p.rendererType));
  const displayParts = group.parts.filter((p) => !isResponsive(p.rendererType));

  const responseColumn = (
    <div className="space-y-6">
      {displayParts.map((part) => (
        <PartBlock key={part.id} group={group} part={part} showMarks={false}>
          <QuestionRenderer
            part={part}
            value={null}
            onChange={() => undefined}
            disabled
          />
        </PartBlock>
      ))}
      {responseParts.map((part) => (
        <PartBlock
          key={part.id}
          group={group}
          part={part}
          showMarks={group.parts.length > 1}
          // Only a question with several sub-parts is worth collapsing, which is
          // where the real papers offer it: it clears the screen for the part
          // being written while the shared stimulus stays put.
          collapsible={responseParts.length > 1}
        >
          <QuestionRenderer
            part={part}
            value={responses[part.id] ?? null}
            onChange={(value) => onRespond(part.id, value)}
            disabled={disabled}
          />
        </PartBlock>
      ))}
    </div>
  );

  if (group.layout === "split" && group.stimulus) {
    return (
      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <section className="min-w-0">
          {heading}
          <div className="mt-5 leading-relaxed">
            <Stimulus spec={group.stimulus} region={`${group.id}.stimulus`} />
          </div>
        </section>
        <section className="min-w-0">{responseColumn}</section>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      {heading}
      {group.stimulus && (
        <div className="mt-5 leading-relaxed">
          <Stimulus spec={group.stimulus} region={`${group.id}.stimulus`} />
        </div>
      )}
      <div className="mt-5">{responseColumn}</div>
    </div>
  );
}

function PartBlock({
  group,
  part,
  showMarks,
  collapsible = false,
  children,
}: {
  group: StudentQuestionGroup;
  part: QuestionPartForStudent;
  showMarks: boolean;
  collapsible?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();

  return (
    <section className="border-l-4 border-[var(--exam-panel-bar)] bg-[var(--exam-panel-bg)] px-5 py-4">
      <div className="flex items-start gap-3">
        {part.label && (
          <span className="pt-0.5 font-bold" aria-hidden="true">
            ({part.label})
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-relaxed">
            {part.label && <span className="sr-only">Part {part.label}. </span>}
            {part.prompt.split("\n\n").map((paragraph, index) => (
              <p key={index} className="mb-2 last:mb-0">
                <Highlightable region={`${group.id}.${part.id}.p${index}`}>
                  {paragraph}
                </Highlightable>
              </p>
            ))}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {showMarks && part.marks > 0 && (
              <p className="text-[0.85em] font-semibold text-[var(--exam-muted)]">
                {part.marks} {part.marks === 1 ? "mark" : "marks"}
              </p>
            )}
            {collapsible && (
              <button
                type="button"
                onClick={() => setOpen((wasOpen) => !wasOpen)}
                aria-expanded={open}
                aria-controls={bodyId}
                className="text-[0.85em] font-semibold text-[var(--exam-accent)] underline"
              >
                {open ? "hide" : "show"}
              </button>
            )}
          </div>

          {/* Hidden rather than unmounted: an answer half-typed into a code
              editor must survive collapsing the part it sits in. */}
          <div id={bodyId} hidden={!open}>
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
