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

/**
 * Marks a paper failed, keeping what it had recorded about itself.
 *
 * This replaced `progress_json` outright, which threw away the spend, the
 * failure count and how many questions had been planned — so every failed paper
 * reported "0 of 0 questions" no matter how far it had got, and the only record
 * of what it cost went with it. The stage and the reason are merged in instead.
 */
export async function failExam(examId: string, message: string): Promise<void> {
  const exam = await getExam(examId);
  const existing = (exam?.progressJson ?? {}) as Record<string, unknown>;

  await db.update(exams)
    .set({
      status: "failed",
      error: message,
      progressJson: { ...existing, stage: "failed", detail: message },
    })
    .where(eq(exams.id, examId))
}

/**
 * Writes a validated paper. Replaces any partial content from a failed run.
 *
 * One statement per table, not one per row.
 *
 * This wrote each question group, each part, each part's syllabus tags and each
 * selected item's coverage row in its own round trip — around 220 of them for a
 * full selection. On a database next to the application that is a few seconds;
 * on a serverless function a region away from the database it is most of a
 * minute, and generation was being killed by the platform's duration limit
 * before it could answer. The paper itself takes about 20 ms to build, so
 * latency was the whole of the problem.
 */
export async function persistPaper(examId: string, paper: GeneratedPaper): Promise<void> {
  const groupRows: (typeof questionGroups.$inferInsert)[] = [];
  const partRows: (typeof questionParts.$inferInsert)[] = [];
  const tagRows: (typeof questionPartSyllabusItems.$inferInsert)[] = [];
  const fingerprintRows: (typeof questionFingerprints.$inferInsert)[] = [];

  for (const group of paper.groups) {
    const groupId = `${examId}:${group.id}`;
    groupRows.push({
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
    });

    for (const [index, part] of group.parts.entries()) {
      const partId = `${examId}:${part.id}`;
      partRows.push({
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
        markingGuidelineJson: part.markingGuideline as unknown as Record<string, unknown> | null,
      });

      for (const syllabusItemId of new Set(part.syllabusItemIds)) {
        tagRows.push({ questionPartId: partId, syllabusItemId });
      }
    }

    const domain = group.generationMetadata.scenarioDomain;
    if (domain) {
      fingerprintRows.push({
        id: randomUUID(),
        examId,
        questionGroupId: groupId,
        archetypeId: group.generationMetadata.archetypeId ?? null,
        scenarioDomain: domain,
        syllabusItemIdsJson: group.syllabusItemIds,
        createdAt: new Date(),
      });
    }
  }

  // Coverage history drives the weighting of later papers (SPEC_ADDENDUM §2).
  const assessed = new Set(
    paper.groups.flatMap((g) => g.parts.flatMap((p) => p.syllabusItemIds)),
  );
  const now = new Date();
  // Deduplicated: the selection arrives from the browser, and Postgres refuses
  // an upsert that would touch the same row twice in one statement. Separate
  // round trips hid this.
  const coverageRows: (typeof coverageHistory.$inferInsert)[] =
    [...new Set(paper.selectedSyllabusItemIds)].map((syllabusItemId) => ({
      syllabusItemId,
      timesSelected: 1,
      timesAssessed: assessed.has(syllabusItemId) ? 1 : 0,
      lastAssessedAt: assessed.has(syllabusItemId) ? now : null,
    }));

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
      .where(eq(exams.id, examId));

    // Order matters: parts reference groups, tags reference parts.
    if (groupRows.length > 0) await tx.insert(questionGroups).values(groupRows);
    if (partRows.length > 0) await tx.insert(questionParts).values(partRows);
    if (tagRows.length > 0) await tx.insert(questionPartSyllabusItems).values(tagRows);
    if (fingerprintRows.length > 0) {
      await tx.insert(questionFingerprints).values(fingerprintRows);
    }

    if (coverageRows.length > 0) {
      // `excluded` is the row this statement tried to insert, so one upsert
      // covers every selected item — including the ones this paper assessed and
      // the ones it did not, which need different columns touched.
      await tx.insert(coverageHistory)
        .values(coverageRows)
        .onConflictDoUpdate({
          target: coverageHistory.syllabusItemId,
          set: {
            timesSelected: sql`${coverageHistory.timesSelected} + 1`,
            timesAssessed: sql`${coverageHistory.timesAssessed} + excluded.times_assessed`,
            lastAssessedAt: sql`coalesce(excluded.last_assessed_at, ${coverageHistory.lastAssessedAt})`,
          },
        });
    }
  });
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
