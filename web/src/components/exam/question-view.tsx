"use client";

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
  children,
}: {
  group: StudentQuestionGroup;
  part: QuestionPartForStudent;
  showMarks: boolean;
  children: React.ReactNode;
}) {
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
          {showMarks && part.marks > 0 && (
            <p className="mt-1 text-[0.85em] font-semibold text-[var(--exam-muted)]">
              {part.marks} {part.marks === 1 ? "mark" : "marks"}
            </p>
          )}
          {children}
        </div>
      </div>
    </section>
  );
}
