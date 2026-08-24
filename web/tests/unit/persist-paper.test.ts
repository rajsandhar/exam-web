import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { SamplePaperGenerator } from "@/lib/ai/sample-generator";
import { db, rawQuery } from "@/lib/db/client";
import { createPendingExam, getExam, persistPaper } from "@/lib/db/queries/exams";
import { syllabusItems } from "@/lib/db/schema";
import { readSyllabusSeed, seedLeafItems, syllabusInsertRows } from "@/lib/syllabus/seed";
import type { GeneratedPaper } from "@/lib/schemas/question";

import { insertUser, truncate } from "../support/db";

/**
 * Writing a paper had no test at all, and a Postgres error shipped because of
 * it: the coverage upsert referred to its own columns unqualified, which SQLite
 * accepted and Postgres rejects as ambiguous — so every generation failed on the
 * live database while everything here stayed green.
 *
 * These run the real sample paper through the real query, against PGlite, which
 * is the same dialect the deployment runs.
 */

const USER = "persist-paper-user";

async function seedSyllabus(): Promise<void> {
  const rows = syllabusInsertRows(readSyllabusSeed());
  await db.insert(syllabusItems).values(rows).onConflictDoNothing();
}

async function samplePaper(selected: string[]): Promise<GeneratedPaper> {
  const paper = await new SamplePaperGenerator().generatePaper({
    selectedSyllabusItemIds: selected,
    onProgress: () => {},
  });
  return { ...paper, selectedSyllabusItemIds: selected } as GeneratedPaper;
}

function selection(count: number): string[] {
  return seedLeafItems(readSyllabusSeed())
    .slice(0, count)
    .map((item) => item.id);
}

async function count(table: string): Promise<number> {
  const [row] = await rawQuery<{ n: string }>(sql.raw(`select count(*) as n from ${table}`));
  return Number(row?.n ?? 0);
}

describe("persisting a generated paper", () => {
  beforeEach(async () => {
    await truncate("coverage_history", "question_fingerprints", "exams", "users");
    await seedSyllabus();
    await insertUser({ id: USER });
  });

  // The suite shares one PGlite instance, in one process, in file order. Left
  // behind, these exams reference a user that a later file's `truncate("users")`
  // then cannot delete — so this file cleans up after itself.
  afterAll(async () => {
    await truncate("coverage_history", "question_fingerprints", "exams", "users");
    await truncate("syllabus_items");
  });

  it("writes the paper and marks the exam ready", async () => {
    const selected = selection(10);
    const examId = await createPendingExam(selected, USER);
    const paper = await samplePaper(selected);

    await persistPaper(examId, paper);

    const exam = await getExam(examId);
    expect(exam?.status).toBe("ready");
    expect(exam?.totalMarks).toBe(100);
    expect(exam?.error).toBeNull();

    const parts = paper.groups.reduce((n, g) => n + g.parts.length, 0);
    expect(await count("question_groups")).toBe(paper.groups.length);
    expect(await count("question_parts")).toBe(parts);
  });

  it("records coverage for every selected item, assessed or not", async () => {
    const selected = selection(10);
    await persistPaper(await createPendingExam(selected, USER), await samplePaper(selected));

    const rows = await rawQuery<{ syllabus_item_id: string; times_selected: number }>(
      sql`select syllabus_item_id, times_selected from coverage_history`,
    );
    expect(rows).toHaveLength(selected.length);
    expect(rows.every((r) => Number(r.times_selected) === 1)).toBe(true);
  });

  it("accumulates coverage across papers", async () => {
    // The upsert branch. This is the statement that failed on Postgres with
    // `column reference "times_selected" is ambiguous`, on every generation.
    const selected = selection(10);
    for (let i = 0; i < 3; i += 1) {
      await persistPaper(await createPendingExam(selected, USER), await samplePaper(selected));
    }

    const rows = await rawQuery<{ times_selected: number; times_assessed: number }>(
      sql`select times_selected, times_assessed from coverage_history`,
    );
    expect(rows).toHaveLength(selected.length);
    expect(rows.every((r) => Number(r.times_selected) === 3)).toBe(true);
    // Nothing may exceed the number of papers that selected it.
    expect(rows.every((r) => Number(r.times_assessed) <= 3)).toBe(true);
  });

  it("survives a selection that repeats an item", async () => {
    // The browser sends this list; a duplicate would make one upsert statement
    // touch the same row twice, which Postgres refuses.
    const selected = selection(5);
    const withDuplicates = [...selected, ...selected];

    const examId = await createPendingExam(selected, USER);
    await persistPaper(examId, await samplePaper(withDuplicates));

    expect(await count("coverage_history")).toBe(selected.length);
  });

  it("replaces the content of a paper generated twice", async () => {
    const selected = selection(10);
    const examId = await createPendingExam(selected, USER);
    const paper = await samplePaper(selected);

    await persistPaper(examId, paper);
    await persistPaper(examId, paper);

    expect(await count("question_groups")).toBe(paper.groups.length);
  });
});
