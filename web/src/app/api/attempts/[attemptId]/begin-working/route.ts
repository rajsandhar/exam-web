import { NextResponse } from "next/server";

import { getApiUser } from "@/lib/auth/current-user";
import {
  beginWorking,
  computeTiming,
  getAttemptFor,
} from "@/lib/db/queries/attempts";

export const dynamic = "force-dynamic";

/**
 * Ends reading time early. Idempotent — `beginWorking` refuses to move the
 * expiry once it has been set, so repeated calls cannot extend the paper.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { attemptId } = await params;
  const attempt = getAttemptFor(attemptId, user.id);
  if (!attempt) {
    return NextResponse.json({ error: "Unknown attempt." }, { status: 404 });
  }

  beginWorking(attemptId);
  return NextResponse.json(computeTiming(attemptId));
}
