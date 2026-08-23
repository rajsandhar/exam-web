import { desc } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { attempts, exams } from "@/lib/db/schema";

export type ExamHistoryRow = {
  id: string;
  title: string;
  createdAt: number;
  status: string;
  totalMarks: number;
  attemptCount: number;
  bestScore: number | null;
  latestAttemptId: string | null;
  latestAttemptMarked: boolean;
};

export function listExamHistory(): ExamHistoryRow[] {
  const examRows = db.select().from(exams).orderBy(desc(exams.createdAt)).all();
  const attemptRows = db.select().from(attempts).orderBy(desc(attempts.createdAt)).all();

  return examRows.map((exam) => {
    const own = attemptRows.filter((a) => a.examId === exam.id);
    const scores = own
      .map((a) => a.finalScore)
      .filter((s): s is number => typeof s === "number");
    const latest = own[0];
    return {
      id: exam.id,
      title: exam.title,
      createdAt: exam.createdAt.getTime(),
      status: exam.status,
      totalMarks: exam.totalMarks,
      attemptCount: own.length,
      bestScore: scores.length > 0 ? Math.max(...scores) : null,
      latestAttemptId: latest?.id ?? null,
      latestAttemptMarked: latest?.status === "marked",
    };
  });
}
