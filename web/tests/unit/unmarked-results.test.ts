import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { SamplePaperGenerator } from "@/lib/ai/sample-generator";
import { db } from "@/lib/db/client";
import { createAttempt, saveResponse } from "@/lib/db/queries/attempts";
import { createPendingExam, persistPaper } from "@/lib/db/queries/exams";
import { listExamHistory } from "@/lib/db/queries/history";
import { getMarkingPaper, saveMark, setAttemptScore } from "@/lib/db/queries/marking";
import { syllabusItems } from "@/lib/db/schema";
import { buildResults } from "@/lib/results/build-results";
import { isResponsive } from "@/lib/schemas/renderers";
import { readSyllabusSeed, seedLeafItems, syllabusInsertRows } from "@/lib/syllabus/seed";
import type { GeneratedPaper } from "@/lib/schemas/question";

import { insertUser, truncate } from "../support/db";

/**
 * What the results screen says when nothing could mark the written half.
 *
 * A live paper reported 3 / 100 with SHORT ANSWER 0 / 75 and no explanation
 * anywhere on the page: 75 unmarkable marks presented as earned zeros, and a
 * percentage computed against them. Scoring zero and being unmarkable are
 * different states, and conflating them is the failure SPEC_ADDENDUM.md §10
 * says loses a student for good.
 */

const USER = "unmarked-results-user";

async function paperFor(selected: string[]): Promise<GeneratedPaper> {
  const paper = await new SamplePaperGenerator().generatePaper({
    selectedSyllabusItemIds: selected,
    onProgress: () => {},
  });
  return { ...paper, selectedSyllabusItemIds: selected } as GeneratedPaper;
}

/**
 * Marks a paper the way `markAttempt` does with no endpoint: objective items
 * marked, written items recorded as not marked rather than as zero.
 */
async function markAsIfNoEndpoint(attemptId: string, examId: string) {
  const groups = await getMarkingPaper(examId);
  let awarded = 0;

  for (const group of groups) {
    for (const part of group.parts) {
      if (!isResponsive(part.rendererType)) continue;

      if (group.section === "objective") {
        // Full marks, so a wrong total is obvious rather than plausible.
        awarded += part.marks;
        await saveMark(attemptId, part.id, part.marks, {
          method: "deterministic",
          awardedMarks: part.marks,
          maxMarks: part.marks,
          correct: true,
        });
      } else {
        await saveResponse(attemptId, part.id, { rendererType: "rich_text_response", html: "<p>An answer.</p>" });
        await saveMark(attemptId, part.id, 0, {
          method: "not_marked",
          notMarkedReason: "no_model_endpoint",
          awardedMarks: 0,
          maxMarks: part.marks,
        });
      }
    }
  }

  await setAttemptScore(attemptId, awarded, "complete");
  return awarded;
}

async function sit() {
  const selected = seedLeafItems(readSyllabusSeed()).slice(0, 12).map((i) => i.id);
  const examId = await createPendingExam(selected, USER);
  await persistPaper(examId, await paperFor(selected));
  const attemptId = await createAttempt(examId, USER);
  const awarded = await markAsIfNoEndpoint(attemptId, examId);
  await db.execute(sql`update attempts set status = 'marked' where id = ${attemptId}`);
  return { examId, attemptId, awarded };
}

describe("a paper whose written half could not be marked", () => {
  beforeEach(async () => {
    await truncate("coverage_history", "question_fingerprints", "exams", "users");
    await db.insert(syllabusItems).values(syllabusInsertRows(readSyllabusSeed())).onConflictDoNothing();
    await insertUser({ id: USER });
  });

  afterAll(async () => {
    await truncate("coverage_history", "question_fingerprints", "exams", "users");
    await truncate("syllabus_items");
  });

  it("reports written items as not marked rather than as zero", async () => {
    const { attemptId } = await sit();
    const results = (await buildResults(attemptId))!;

    const written = results.groups
      .flatMap((g) => g.parts)
      .filter((p) => p.marking?.method === "not_marked");

    expect(written.length).toBeGreaterThan(0);
    expect(written.every((p) => (p.marking as { notMarkedReason?: string }).notMarkedReason === "no_model_endpoint")).toBe(true);
    expect(results.awaitingMarking).toBeGreaterThan(0);
  });

  it("does not present unmarkable marks as a denominator", async () => {
    const { attemptId, awarded } = await sit();
    const results = (await buildResults(attemptId))!;

    // The mark is out of what was marked, not out of the whole paper.
    expect(results.markedMarksAvailable).toBeLessThan(results.totalMarks);
    expect(results.markedMarksAvailable + results.awaitingMarking).toBe(results.totalMarks);
    expect(results.awardedMarks).toBe(awarded);

    // Written marks are not counted as available and not earned.
    expect(results.constructed.available).toBe(0);
    expect(results.constructed.notMarked).toBeGreaterThan(0);

    // The percentage a screen would compute must not be a near-zero fraction of
    // a paper that was mostly unmarkable.
    const percentage = Math.round((results.awardedMarks / results.markedMarksAvailable) * 100);
    expect(percentage).toBe(100);
  });

  it("keeps unmarked marks out of the syllabus aggregate", async () => {
    const { attemptId } = await sit();
    const results = (await buildResults(attemptId))!;

    const dragged = results.syllabusPerformance.filter(
      (row) => row.percentage === 0 && row.notMarked > 0 && row.earned === 0,
    );
    // Nothing may be reported at 0% purely because it could not be marked.
    expect(dragged).toEqual([]);

    for (const row of results.syllabusPerformance) {
      expect(row.earned).toBeLessThanOrEqual(row.available);
    }
  });

  it("does not report a misleading total in the history list", async () => {
    const { awarded } = await sit();
    const [row] = await listExamHistory(USER);

    expect(row?.bestScore).toBe(awarded);
    expect(row?.bestScoreNotMarked).toBeGreaterThan(0);
    expect(row?.bestScoreOutOf).toBe(row!.totalMarks - row!.bestScoreNotMarked);
  });
});
