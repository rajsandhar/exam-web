import { NextResponse } from "next/server";

import { beginReading, createAttempt } from "@/lib/db/queries/attempts";
import { getExam } from "@/lib/db/queries/exams";

export const dynamic = "force-dynamic";

/** Starts a new attempt and begins reading time. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ examId: string }> },
) {
  const { examId } = await params;
  const exam = getExam(examId);
  if (!exam) {
    return NextResponse.json({ error: "Unknown paper." }, { status: 404 });
  }
  if (exam.status !== "ready") {
    return NextResponse.json(
      { error: "This paper is not ready yet." },
      { status: 409 },
    );
  }

  const attemptId = createAttempt(examId);
  beginReading(attemptId);
  return NextResponse.json({ attemptId }, { status: 201 });
}
