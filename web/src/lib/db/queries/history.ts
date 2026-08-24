import { desc, eq, sql } from "drizzle-orm";

import { db, rawQuery } from "@/lib/db/client";
import { attempts, exams } from "@/lib/db/schema";

export type ExamHistoryRow = {
  id: string;
  title: string;
  createdAt: number;
  status: string;
  totalMarks: number;
  attemptCount: number;
  bestScore: number | null;
  /** Marks the best attempt was actually marked out of. */
  bestScoreOutOf: number | null;
  /** Marks on that attempt nothing could mark. */
  bestScoreNotMarked: number;
  latestAttemptId: string | null;
  latestAttemptMarked: boolean;
};

/** One person's papers only. */
export async function listExamHistory(userId: string): Promise<ExamHistoryRow[]> {
  const examRows = await db
    .select()
    .from(exams)
    .where(eq(exams.userId, userId))
    .orderBy(desc(exams.createdAt));
  const attemptRows = await db
    .select()
    .from(attempts)
    .where(eq(attempts.userId, userId))
    .orderBy(desc(attempts.createdAt));

  // Marks nothing was able to mark, per attempt. Reporting a score against the
  // paper's full total presents unmarkable marks as earned zeros — the same
  // untruth the results screen used to tell, one screen earlier.
  const unmarked = new Map<string, number>();
  const unmarkedRows = await rawQuery<{ attempt_id: string; marks: string }>(sql`
    select r.attempt_id, coalesce(sum(p.marks), 0) as marks
    from responses r
    join question_parts p on p.id = r.question_part_id
    join attempts a on a.id = r.attempt_id
    where a.user_id = ${userId}
      and r.marking_json ->> 'method' = 'not_marked'
    group by r.attempt_id
  `);
  for (const row of unmarkedRows) unmarked.set(row.attempt_id, Number(row.marks));

  return examRows.map((exam) => {
    const own = attemptRows.filter((a) => a.examId === exam.id);
    const scored = own.filter(
      (a): a is typeof a & { finalScore: number } => typeof a.finalScore === "number",
    );
    const best = scored.reduce<(typeof scored)[number] | null>(
      (chosen, attempt) =>
        chosen === null || attempt.finalScore > chosen.finalScore ? attempt : chosen,
      null,
    );
    const bestNotMarked = best ? (unmarked.get(best.id) ?? 0) : 0;
    const latest = own[0];
    return {
      id: exam.id,
      title: exam.title,
      createdAt: exam.createdAt.getTime(),
      status: exam.status,
      totalMarks: exam.totalMarks,
      attemptCount: own.length,
      bestScore: best?.finalScore ?? null,
      bestScoreOutOf: best ? exam.totalMarks - bestNotMarked : null,
      bestScoreNotMarked: bestNotMarked,
      latestAttemptId: latest?.id ?? null,
      latestAttemptMarked: latest?.status === "marked",
    };
  });
}
