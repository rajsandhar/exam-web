import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { responses as responsesTable } from "@/lib/db/schema";
import { getAttempt, getResponses } from "@/lib/db/queries/attempts";
import { getExam, getExamSelectedItemIds } from "@/lib/db/queries/exams";
import { getMarkingPaper } from "@/lib/db/queries/marking";
import { getSyllabusTextById } from "@/lib/db/queries/syllabus";
import type { MarkingRecord } from "@/lib/marking/run-marking";
import type { AnswerKey, MarkingGuideline, ResponsePayload } from "@/lib/schemas/renderers";
import { isResponsive } from "@/lib/schemas/renderers";
import type { StimulusSpec } from "@/lib/schemas/stimulus";

/**
 * Assembles the results view (CLAUDE.md §19).
 *
 * Answer keys and marking guidelines are read here deliberately — the attempt
 * has been submitted, and §19 requires the correct answer, the criteria and a
 * full-mark exemplar to be shown in review.
 */

export type ReviewPart = {
  id: string;
  label: string | null;
  marks: number;
  rendererType: string;
  prompt: string;
  config: Record<string, unknown>;
  response: ResponsePayload | null;
  awardedMarks: number | null;
  marking: MarkingRecord | null;
  answerKey: AnswerKey | null;
  markingGuideline: MarkingGuideline | null;
  syllabusItems: Array<{ id: string; exactText: string }>;
};

export type ReviewGroup = {
  id: string;
  position: number;
  totalMarks: number;
  awardedMarks: number;
  section: "objective" | "constructed";
  layout: "single" | "split";
  stimulus: StimulusSpec | null;
  parts: ReviewPart[];
};

export type SyllabusPerformance = {
  id: string;
  exactText: string;
  earned: number;
  available: number;
  questionCount: number;
  /** Null when there is too little evidence to state a percentage. */
  percentage: number | null;
};

export type ResultsView = {
  attemptId: string;
  examId: string;
  title: string;
  submittedAt: number | null;
  timeUsedMs: number | null;
  markingStatus: string;
  totalMarks: number;
  awardedMarks: number;
  markedMarksAvailable: number;
  awaitingMarking: number;
  objective: { earned: number; available: number };
  constructed: { earned: number; available: number };
  groups: ReviewGroup[];
  syllabusPerformance: SyllabusPerformance[];
  notAssessed: Array<{ id: string; exactText: string }>;
};

/** Below this many marks of evidence, a percentage is not reported. */
const MIN_MARKS_FOR_PERCENTAGE = 3;

export function buildResults(attemptId: string): ResultsView | null {
  const attempt = getAttempt(attemptId);
  if (!attempt) return null;

  const exam = getExam(attempt.examId);
  if (!exam) return null;

  const groups = getMarkingPaper(attempt.examId);
  const responses = getResponses(attemptId);
  const syllabusText = getSyllabusTextById();

  // Marks and marking records live on the response rows.
  const markRows = getResponseMarks(attemptId);

  let awarded = 0;
  let markedAvailable = 0;
  let awaiting = 0;
  const objective = { earned: 0, available: 0 };
  const constructed = { earned: 0, available: 0 };

  const perItem = new Map<string, { earned: number; available: number; questions: Set<string> }>();

  const reviewGroups: ReviewGroup[] = groups.map((group) => {
    let groupAwarded = 0;

    const parts: ReviewPart[] = group.parts.map((part) => {
      const mark = markRows.get(part.id);
      const marking = (mark?.marking as MarkingRecord | null) ?? null;
      const awardedMarks = mark?.awardedMarks ?? null;
      const counted = awardedMarks ?? 0;

      if (isResponsive(part.rendererType)) {
        groupAwarded += counted;
        awarded += counted;

        if (marking?.method === "not_marked") {
          awaiting += part.marks;
        } else {
          markedAvailable += part.marks;
        }

        const bucket = group.section === "objective" ? objective : constructed;
        bucket.earned += counted;
        bucket.available += part.marks;

        for (const id of part.syllabusItemIds) {
          const entry = perItem.get(id) ?? {
            earned: 0,
            available: 0,
            questions: new Set<string>(),
          };
          entry.earned += counted;
          entry.available += part.marks;
          entry.questions.add(group.id);
          perItem.set(id, entry);
        }
      }

      return {
        id: part.id,
        label: part.label,
        marks: part.marks,
        rendererType: part.rendererType,
        prompt: part.prompt,
        config: part.config,
        response: responses[part.id] ?? null,
        awardedMarks,
        marking,
        answerKey: part.answerKey,
        markingGuideline: part.markingGuideline,
        syllabusItems: part.syllabusItemIds.map((id) => ({
          id,
          exactText: syllabusText.get(id) ?? id,
        })),
      };
    });

    return {
      id: group.id,
      position: group.position,
      totalMarks: group.totalMarks,
      awardedMarks: groupAwarded,
      section: group.section,
      layout: group.layout,
      stimulus: group.stimulus,
      parts,
    };
  });

  const selected = getExamSelectedItemIds(attempt.examId);
  const assessed = new Set(perItem.keys());

  const syllabusPerformance: SyllabusPerformance[] = [...perItem.entries()]
    .map(([id, entry]) => ({
      id,
      exactText: syllabusText.get(id) ?? id,
      earned: entry.earned,
      available: entry.available,
      questionCount: entry.questions.size,
      percentage:
        entry.available >= MIN_MARKS_FOR_PERCENTAGE
          ? Math.round((entry.earned / entry.available) * 100)
          : null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const notAssessed = selected
    .filter((id) => !assessed.has(id))
    .map((id) => ({ id, exactText: syllabusText.get(id) ?? id }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const timeUsedMs =
    attempt.workingStartedAt && attempt.submittedAt
      ? attempt.submittedAt.getTime() - attempt.workingStartedAt.getTime()
      : null;

  return {
    attemptId,
    examId: attempt.examId,
    title: exam.title,
    submittedAt: attempt.submittedAt?.getTime() ?? null,
    timeUsedMs,
    markingStatus: attempt.markingStatus,
    totalMarks: exam.totalMarks,
    awardedMarks: awarded,
    markedMarksAvailable: markedAvailable,
    awaitingMarking: awaiting,
    objective,
    constructed,
    groups: reviewGroups,
    syllabusPerformance,
    notAssessed,
  };
}

/** Awarded marks and marking records are stored on the response rows. */
function getResponseMarks(attemptId: string) {
  const rows = db
    .select({
      questionPartId: responsesTable.questionPartId,
      awardedMarks: responsesTable.awardedMarks,
      markingJson: responsesTable.markingJson,
    })
    .from(responsesTable)
    .where(eq(responsesTable.attemptId, attemptId))
    .all();

  return new Map(
    rows.map((row) => [
      row.questionPartId,
      { awardedMarks: row.awardedMarks, marking: row.markingJson },
    ]),
  );
}
