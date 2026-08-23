import { NextResponse } from "next/server";

import { getApiUser } from "@/lib/auth/current-user";
import {
  computeTiming,
  getAttemptFor,
  reconcileAttemptPhase,
} from "@/lib/db/queries/attempts";

export const dynamic = "force-dynamic";

/**
 * Authoritative attempt state. The client displays a local countdown for
 * smoothness but reads the truth from here, so a refresh, a suspended laptop or
 * a changed system clock cannot alter the time available.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { attemptId } = await params;
  if (!await getAttemptFor(attemptId, user.id)) {
    return NextResponse.json({ error: "Unknown attempt." }, { status: 404 });
  }

  await reconcileAttemptPhase(attemptId);
  const timing = await computeTiming(attemptId);
  if (!timing) {
    return NextResponse.json({ error: "Unknown attempt." }, { status: 404 });
  }
  return NextResponse.json(timing, {
    headers: { "cache-control": "no-store" },
  });
}
