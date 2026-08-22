import { NextResponse } from "next/server";

import { getAttempt, submitAttempt } from "@/lib/db/queries/attempts";
import { markAttempt } from "@/lib/marking/run-marking";

export const dynamic = "force-dynamic";

/**
 * Submits the attempt and marks it.
 *
 * Marking runs inline: deterministic marking of a whole paper is milliseconds,
 * and the rubric marker is bounded by the number of written responses.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const { attemptId } = await params;
  const attempt = getAttempt(attemptId);
  if (!attempt) {
    return NextResponse.json({ error: "Unknown attempt." }, { status: 404 });
  }

  submitAttempt(attemptId);
  await markAttempt(attemptId);

  const marked = getAttempt(attemptId);
  return NextResponse.json({
    status: marked?.status ?? "submitted",
    markingStatus: marked?.markingStatus ?? "pending",
    finalScore: marked?.finalScore ?? null,
  });
}
