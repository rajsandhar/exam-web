import { NextResponse } from "next/server";

import { getApiUser } from "@/lib/auth/current-user";
import { failExam, getExamFor } from "@/lib/db/queries/exams";
import {
  hasStalled,
  STALLED_MESSAGE,
  type ResumableState,
} from "@/lib/generation/resumable";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ examId: string }> },
) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { examId } = await params;
  const exam = await getExamFor(examId, user.id);
  if (!exam) {
    return NextResponse.json({ error: "Unknown paper." }, { status: 404 });
  }
  // A run whose invocation was killed reports nothing further and would sit at
  // "generating" for ever — the spinner that never ends. Whoever asks about it
  // next is the one who notices.
  if (exam.status === "generating" && hasStalled(exam.progressJson as ResumableState)) {
    await failExam(examId, STALLED_MESSAGE);
    return NextResponse.json({
      status: "failed",
      progress: { stage: "failed", detail: STALLED_MESSAGE },
      error: STALLED_MESSAGE,
    });
  }

  return NextResponse.json({
    status: exam.status,
    progress: exam.progressJson,
    error: exam.error,
  });
}
