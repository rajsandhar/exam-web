import { NextResponse } from "next/server";

import { getApiUser } from "@/lib/auth/current-user";
import { getAttemptFor, submitAttempt } from "@/lib/db/queries/attempts";
import { buildExecutionRequests } from "@/lib/marking/execution-requests";
import { markAttempt } from "@/lib/marking/run-marking";

export const dynamic = "force-dynamic";

/**
 * Submits the attempt and marks everything that does not need the browser.
 *
 * Any Python or SQL work is returned as `executionRequests`: student code is
 * never executed on the server (CLAUDE.md §23), so the browser runs it and
 * posts the outcomes to `/execution-results`. The hidden tests are released
 * here because the attempt is now closed — during the attempt they are
 * unreachable from the client.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { attemptId } = await params;
  const attempt = await getAttemptFor(attemptId, user.id);
  if (!attempt) {
    return NextResponse.json({ error: "Unknown attempt." }, { status: 404 });
  }

  await submitAttempt(attemptId);
  await markAttempt(attemptId);

  const executionRequests = await buildExecutionRequests(attemptId, attempt.examId);
  const marked = await getAttemptFor(attemptId, user.id);

  return NextResponse.json({
    status: marked?.status ?? "submitted",
    markingStatus: marked?.markingStatus ?? "pending",
    finalScore: marked?.finalScore ?? null,
    executionRequests,
  });
}
