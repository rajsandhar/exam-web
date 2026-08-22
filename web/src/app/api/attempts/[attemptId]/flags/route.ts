import { NextResponse } from "next/server";
import { z } from "zod";

import { getAttempt, setFlag } from "@/lib/db/queries/attempts";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  questionGroupId: z.string().min(1),
  flagged: z.boolean(),
});

/** Flagging works during reading time as well as working time (§10.3). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const { attemptId } = await params;
  const attempt = getAttempt(attemptId);
  if (!attempt) {
    return NextResponse.json({ error: "Unknown attempt." }, { status: 404 });
  }
  if (attempt.status !== "reading" && attempt.status !== "working") {
    return NextResponse.json({ error: "Attempt is closed." }, { status: 409 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed flag payload." }, { status: 400 });
  }

  setFlag(attemptId, parsed.data.questionGroupId, parsed.data.flagged);
  return NextResponse.json({ ok: true });
}
