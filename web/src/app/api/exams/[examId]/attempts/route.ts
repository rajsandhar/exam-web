import { NextResponse } from "next/server";

import { getApiUser } from "@/lib/auth/current-user";
import { beginReading, createAttempt } from "@/lib/db/queries/attempts";
import { getExamFor } from "@/lib/db/queries/exams";

export const dynamic = "force-dynamic";

/** Starts a new attempt and begins reading time. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ examId: string }> },
) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { examId } = await params;
  // Someone else's paper is reported as missing rather than forbidden, so an
  // id cannot be probed for existence.
  const exam = await getExamFor(examId, user.id);
  if (!exam) {
    return NextResponse.json({ error: "Unknown paper." }, { status: 404 });
  }
  if (exam.status !== "ready") {
    return NextResponse.json(
      { error: "This paper is not ready yet." },
      { status: 409 },
    );
  }

  const attemptId = await createAttempt(examId, user.id);
  await beginReading(attemptId);
  return NextResponse.json({ attemptId }, { status: 201 });
}
