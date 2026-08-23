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

export async function createPendingExam(
  selectedSyllabusItemIds: string[],
  userId: string,
): Promise<string> {
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(exams)
      .values({
        id,
        userId,
        createdAt: new Date(),
        title: "Software Engineering — Trial Examination",
        totalMarks: 100,
        status: "generating",
        progressJson: { stage: "planning" },
      })

    if (selectedSyllabusItemIds.length > 0) {
      await tx.insert(examSyllabusItems)
        .values(
          selectedSyllabusItemIds.map((syllabusItemId) => ({
            examId: id,
            syllabusItemId,
          })),
        )
    }
  });
  return id;
}

export async function setExamProgress(examId: string, progress: GenerationProgress): Promise<void> {
  await db.update(exams)
    .set({ progressJson: progress as unknown as Record<string, unknown> })
    .where(eq(exams.id, examId))
}

export async function failExam(examId: string, message: string): Promise<void> {
  await db.update(exams)
    .set({
      status: "failed",
      error: message,
      progressJson: { stage: "failed", detail: message },
    })
    .where(eq(exams.id, examId))
}

/** Writes a validated paper. Replaces any partial content from a failed run. */
export async function persistPaper(examId: string, paper: GeneratedPaper): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(questionGroups).where(eq(questionGroups.examId, examId));

    await tx.update(exams)
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

    for (const group of paper.groups) {
      const groupId = `${examId}:${group.id}`;
      await tx.insert(questionGroups)
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

      for (const [index, part] of group.parts.entries()) {
        const partId = `${examId}:${part.id}`;
        await tx.insert(questionParts)
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

        if (part.syllabusItemIds.length > 0) {
          await tx.insert(questionPartSyllabusItems)
            .values(
              part.syllabusItemIds.map((syllabusItemId) => ({
                questionPartId: partId,
                syllabusItemId,
              })),
            );
        }
      }

      const domain = group.generationMetadata.scenarioDomain;
      if (domain) {
        await tx.insert(questionFingerprints)
          .values({
            id: randomUUID(),
            examId,
            questionGroupId: groupId,
            archetypeId: group.generationMetadata.archetypeId ?? null,
            scenarioDomain: domain,
            syllabusItemIdsJson: group.syllabusItemIds,
            createdAt: new Date(),
          })
      }
    }

    // Coverage history drives the weighting of later papers (SPEC_ADDENDUM §2).
    const assessed = new Set(
      paper.groups.flatMap((g) => g.parts.flatMap((p) => p.syllabusItemIds)),
    );
    for (const id of paper.selectedSyllabusItemIds) {
      await tx.insert(coverageHistory)
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
    }
  });
}

/** Drizzle needs a raw expression for `column = column + 1`. */
function sqlIncrement(column: string) {
  return sql.raw(`${column} + 1`);
}

export async function getExam(examId: string) {
  const [row] = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);
  return row;
}

/**
 * A paper the given user is allowed to see. Administrators are not given a
 * blanket pass here: an administrator opening someone else's paper would be
 * reading their answers, which is not what the role is for.
 */
export async function getExamFor(examId: string, userId: string) {
  const exam = await getExam(examId);
  if (!exam) return undefined;
  return exam.userId === userId ? exam : undefined;
}

export async function getExamSelectedItemIds(examId: string): Promise<string[]> {
  const rows = await db
    .select({ id: examSyllabusItems.syllabusItemId })
    .from(examSyllabusItems)
    .where(eq(examSyllabusItems.examId, examId));
  return rows.map((r) => r.id);
}

/** Recent fingerprints for the novelty exclusion list (SPEC_ADDENDUM §3). */
export async function recentFingerprints(limit: number) {
  return await db
    .select()
    .from(questionFingerprints)
    .orderBy(desc(questionFingerprints.createdAt))
    .limit(limit)
}

export async function deleteExam(examId: string): Promise<void> {
  await db.delete(exams).where(eq(exams.id, examId));
}

export async function examsSelectingItems(ids: string[]) {
  if (ids.length === 0) return [];
  return await db
    .select()
    .from(examSyllabusItems)
    .where(and(inArray(examSyllabusItems.syllabusItemId, ids)))
}
