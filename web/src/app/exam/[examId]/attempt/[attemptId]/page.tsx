import { notFound, redirect } from "next/navigation";

import { ExamShell } from "@/components/exam/exam-shell";
import { requireUser } from "@/lib/auth/current-user";
import {
  beginReading,
  computeTiming,
  getAttemptFor,
  getFlags,
  getHighlights,
  getResponses,
  reconcileAttemptPhase,
} from "@/lib/db/queries/attempts";
import { getExamFor } from "@/lib/db/queries/exams";
import { getStudentPaper } from "@/lib/db/queries/student";

export const dynamic = "force-dynamic";

/**
 * The exam page.
 *
 * It reads the paper through `getStudentPaper`, which never selects the answer
 * key or marking guideline columns, so nothing key-bearing can reach the RSC
 * payload (SPEC_ADDENDUM.md §7).
 */
export default async function AttemptPage({
  params,
}: {
  params: Promise<{ examId: string; attemptId: string }>;
}) {
  const { examId, attemptId } = await params;
  const user = await requireUser(`/exam/${examId}/attempt/${attemptId}`);

  const exam = getExamFor(examId, user.id);
  if (!exam || exam.status !== "ready") notFound();

  const existing = getAttemptFor(attemptId, user.id);
  if (!existing || existing.examId !== examId) notFound();

  if (existing.status === "not_started") beginReading(attemptId);
  reconcileAttemptPhase(attemptId);

  const attempt = getAttemptFor(attemptId, user.id);
  const timing = computeTiming(attemptId);
  if (!attempt || !timing) notFound();

  if (attempt.status === "submitted" || attempt.status === "marked") {
    redirect(`/results/${attemptId}`);
  }

  const groups = getStudentPaper(examId);
  const uiState = attempt.uiStateJson as {
    fontSize?: string;
    colourTheme?: string;
    lastQuestion?: number;
  };

  return (
    <ExamShell
      title={exam.title}
      groups={groups}
      attempt={{
        attemptId,
        examId,
        status: attempt.status === "reading" ? "reading" : "working",
        serverNow: timing.serverNow,
        remainingMs: timing.remainingMs,
      }}
      initialResponses={getResponses(attemptId)}
      initialFlags={getFlags(attemptId)}
      initialHighlights={getHighlights(attemptId).map((h) => ({ ...h }))}
      initialUi={uiState}
    />
  );
}
