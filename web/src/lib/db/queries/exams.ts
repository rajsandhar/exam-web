import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  coverageHistory,
  examSyllabusItems,
  exams,
  questionFingerprints,
  questionGroups,
  questionPartSyllabusItems,
  questionParts,
} from "@/lib/db/schema";
import type { GenerationProgress } from "@/lib/ai/provider";
import type { GeneratedPaper } from "@/lib/schemas/question";

export function createPendingExam(
  selectedSyllabusItemIds: string[],
  userId: string,
): string {
  const id = randomUUID();
  db.transaction((tx) => {
    tx.insert(exams)
      .values({
        id,
        userId,
        createdAt: new Date(),
        title: "Software Engineering — Trial Examination",
        totalMarks: 100,
        status: "generating",
        progressJson: { stage: "planning" },
      })
      .run();

    if (selectedSyllabusItemIds.length > 0) {
      tx.insert(examSyllabusItems)
        .values(
          selectedSyllabusItemIds.map((syllabusItemId) => ({
            examId: id,
            syllabusItemId,
          })),
        )
        .run();
    }
  });
  return id;
}

export function setExamProgress(examId: string, progress: GenerationProgress): void {
  db.update(exams)
    .set({ progressJson: progress as unknown as Record<string, unknown> })
    .where(eq(exams.id, examId))
    .run();
}

export function failExam(examId: string, message: string): void {
  db.update(exams)
    .set({
      status: "failed",
      error: message,
      progressJson: { stage: "failed", detail: message },
    })
    .where(eq(exams.id, examId))
    .run();
}

/** Writes a validated paper. Replaces any partial content from a failed run. */
export function persistPaper(examId: string, paper: GeneratedPaper): void {
  db.transaction((tx) => {
    tx.delete(questionGroups).where(eq(questionGroups.examId, examId)).run();

    tx.update(exams)
      .set({
        title: paper.title,
        totalMarks: paper.totalMarks,
        status: "ready",
        progressJson: { stage: "complete" },
        generationMetadataJson: paper.generationMetadata as unknown as Record<string, unknown>,
        unassessedItemsJson: paper.unassessedSyllabusItemIds,
        error: null,
      })
      .where(eq(exams.id, examId))
      .run();

    for (const group of paper.groups) {
      const groupId = `${examId}:${group.id}`;
      tx.insert(questionGroups)
        .values({
          id: groupId,
          examId,
          position: group.position,
          totalMarks: group.totalMarks,
          section: group.section,
          stimulusJson: group.stimulus as unknown as Record<string, unknown> | null,
          layout: group.layout,
          cognitiveDemand: group.cognitiveDemand,
          metadataJson: {
            kind: group.kind,
            syllabusItemIds: group.syllabusItemIds,
            sourceReferences: group.sourceReferences,
            generationMetadata: group.generationMetadata,
          },
        })
        .run();

      group.parts.forEach((part, index) => {
        const partId = `${examId}:${part.id}`;
        tx.insert(questionParts)
          .values({
            id: partId,
            questionGroupId: groupId,
            position: index + 1,
            label: part.label,
            rendererType: part.rendererType,
            marks: part.marks,
            prompt: part.prompt,
            configJson: {
              ...(part.config as Record<string, unknown>),
              ...(part.commandVerb ? { __commandVerb: part.commandVerb } : {}),
            },
            answerKeyJson: part.answerKey as unknown as Record<string, unknown> | null,
            markingGuidelineJson: part.markingGuideline as unknown as Record<
              string,
              unknown
            > | null,
          })
          .run();

        if (part.syllabusItemIds.length > 0) {
          tx.insert(questionPartSyllabusItems)
            .values(
              part.syllabusItemIds.map((syllabusItemId) => ({
                questionPartId: partId,
                syllabusItemId,
              })),
            )
            .run();
        }
      });

      const domain = group.generationMetadata.scenarioDomain;
      if (domain) {
        tx.insert(questionFingerprints)
          .values({
            id: randomUUID(),
            examId,
            questionGroupId: groupId,
            archetypeId: group.generationMetadata.archetypeId ?? null,
            scenarioDomain: domain,
            syllabusItemIdsJson: group.syllabusItemIds,
            createdAt: new Date(),
          })
          .run();
      }
    }

    // Coverage history drives the weighting of later papers (SPEC_ADDENDUM §2).
    const assessed = new Set(
      paper.groups.flatMap((g) => g.parts.flatMap((p) => p.syllabusItemIds)),
    );
    for (const id of paper.selectedSyllabusItemIds) {
      tx.insert(coverageHistory)
        .values({
          syllabusItemId: id,
          timesSelected: 1,
          timesAssessed: assessed.has(id) ? 1 : 0,
          lastAssessedAt: assessed.has(id) ? new Date() : null,
        })
        .onConflictDoUpdate({
          target: coverageHistory.syllabusItemId,
          set: {
            timesSelected: sqlIncrement("times_selected"),
            ...(assessed.has(id)
              ? { timesAssessed: sqlIncrement("times_assessed"), lastAssessedAt: new Date() }
              : {}),
          },
        })
        .run();
    }
  });
}

/** Drizzle needs a raw expression for `column = column + 1`. */
function sqlIncrement(column: string) {
  return sql.raw(`${column} + 1`);
}

export function getExam(examId: string) {
  return db.select().from(exams).where(eq(exams.id, examId)).get();
}

/**
 * A paper the given user is allowed to see. Administrators are not given a
 * blanket pass here: an administrator opening someone else's paper would be
 * reading their answers, which is not what the role is for.
 */
export function getExamFor(examId: string, userId: string) {
  const exam = getExam(examId);
  if (!exam) return undefined;
  return exam.userId === userId ? exam : undefined;
}

export function getExamSelectedItemIds(examId: string): string[] {
  return db
    .select({ id: examSyllabusItems.syllabusItemId })
    .from(examSyllabusItems)
    .where(eq(examSyllabusItems.examId, examId))
    .all()
    .map((r) => r.id);
}

/** Recent fingerprints for the novelty exclusion list (SPEC_ADDENDUM §3). */
export function recentFingerprints(limit: number) {
  return db
    .select()
    .from(questionFingerprints)
    .orderBy(desc(questionFingerprints.createdAt))
    .limit(limit)
    .all();
}

export function deleteExam(examId: string): void {
  db.delete(exams).where(eq(exams.id, examId)).run();
}

export function examsSelectingItems(ids: string[]) {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(examSyllabusItems)
    .where(and(inArray(examSyllabusItems.syllabusItemId, ids)))
    .all();
}
