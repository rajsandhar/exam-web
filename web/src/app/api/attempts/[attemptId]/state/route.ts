import { NextResponse } from "next/server";

import { computeTiming, reconcileAttemptPhase } from "@/lib/db/queries/attempts";

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
  const { attemptId } = await params;
  reconcileAttemptPhase(attemptId);
  const timing = computeTiming(attemptId);
  if (!timing) {
    return NextResponse.json({ error: "Unknown attempt." }, { status: 404 });
  }
  return NextResponse.json(timing, {
    headers: { "cache-control": "no-store" },
  });
}
