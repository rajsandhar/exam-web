import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  attempts,
  questionGroups,
  questionPartSyllabusItems,
  questionParts,
  responses,
} from "@/lib/db/schema";
import {
  answerKeySchema,
  markingGuidelineSchema,
  rendererTypeSchema,
} from "@/lib/schemas/renderers";
import type { AnswerKey, MarkingGuideline } from "@/lib/schemas/renderers";
import type { StimulusSpec } from "@/lib/schemas/stimulus";

/**
 * Server-only queries that DO read the answer key and marking guideline.
 *
 * Nothing in this module may be imported from a client component or passed
 * whole into one. The student-facing counterpart is `queries/student.ts`.
 */

export type MarkingPart = {
  id: string;
  questionGroupId: string;
  position: number;
  label: string | null;
  rendererType: ReturnType<typeof rendererTypeSchema.parse>;
  marks: number;
  prompt: string;
  config: Record<string, unknown>;
  answerKey: AnswerKey | null;
  markingGuideline: MarkingGuideline | null;
  syllabusItemIds: string[];
};

export type MarkingGroup = {
  id: string;
  position: number;
  totalMarks: number;
  section: "objective" | "constructed";
  layout: "single" | "split";
  stimulus: StimulusSpec | null;
  syllabusItemIds: string[];
  parts: MarkingPart[];
};

export function getMarkingPaper(examId: string): MarkingGroup[] {
  const groupRows = db
    .select()
    .from(questionGroups)
    .where(eq(questionGroups.examId, examId))
    .orderBy(asc(questionGroups.position))
    .all();

  if (groupRows.length === 0) return [];

  const groupIds = new Set(groupRows.map((g) => g.id));
  const partRows = db
    .select()
    .from(questionParts)
    .orderBy(asc(questionParts.position))
    .all()
    .filter((p) => groupIds.has(p.questionGroupId));

  const syllabusRows = db.select().from(questionPartSyllabusItems).all();
  const syllabusByPart = new Map<string, string[]>();
  for (const row of syllabusRows) {
    const list = syllabusByPart.get(row.questionPartId) ?? [];
    list.push(row.syllabusItemId);
    syllabusByPart.set(row.questionPartId, list);
  }

  return groupRows.map((group) => {
    const metadata = group.metadataJson as { syllabusItemIds?: string[] };
    return {
      id: group.id,
      position: group.position,
      totalMarks: group.totalMarks,
      section: group.section,
      layout: group.layout,
      stimulus: (group.stimulusJson as StimulusSpec | null) ?? null,
      syllabusItemIds: metadata.syllabusItemIds ?? [],
      parts: partRows
        .filter((p) => p.questionGroupId === group.id)
        .map((p) => {
          const config = { ...(p.configJson as Record<string, unknown>) };
          delete config.__commandVerb;
          const key = answerKeySchema.safeParse(p.answerKeyJson);
          const guideline = markingGuidelineSchema.safeParse(p.markingGuidelineJson);
          return {
            id: p.id,
            questionGroupId: p.questionGroupId,
            position: p.position,
            label: p.label,
            rendererType: rendererTypeSchema.parse(p.rendererType),
            marks: p.marks,
            prompt: p.prompt,
            config,
            answerKey: key.success ? key.data : null,
            markingGuideline: guideline.success ? guideline.data : null,
            syllabusItemIds: syllabusByPart.get(p.id) ?? [],
          };
        }),
    };
  });
}

export function saveMark(
  attemptId: string,
  questionPartId: string,
  awardedMarks: number,
  marking: Record<string, unknown>,
): void {
  const existing = db
    .select({ id: responses.id })
    .from(responses)
    .where(
      and(
        eq(responses.attemptId, attemptId),
        eq(responses.questionPartId, questionPartId),
      ),
    )
    .get();

  if (existing) {
    db.update(responses)
      .set({ awardedMarks, markingJson: marking })
      .where(eq(responses.id, existing.id))
      .run();
    return;
  }

  // The student never opened this item: record the zero so review is complete.
  db.insert(responses)
    .values({
      id: `${attemptId}:${questionPartId}`,
      attemptId,
      questionPartId,
      responseJson: null,
      updatedAt: new Date(),
      awardedMarks,
      markingJson: marking,
    })
    .run();
}

/** Total of the marks stored on this attempt's responses. */
export function sumAwardedMarks(attemptId: string): number {
  return db
    .select({ awardedMarks: responses.awardedMarks })
    .from(responses)
    .where(eq(responses.attemptId, attemptId))
    .all()
    .reduce((sum, row) => sum + (row.awardedMarks ?? 0), 0);
}

export function setAttemptScore(
  attemptId: string,
  finalScore: number,
  markingStatus: "running" | "complete" | "failed",
  error?: string,
): void {
  db.update(attempts)
    .set({
      finalScore,
      markingStatus,
      markingError: error ?? null,
      ...(markingStatus === "complete" ? { status: "marked" as const } : {}),
    })
    .where(eq(attempts.id, attemptId))
    .run();
}
