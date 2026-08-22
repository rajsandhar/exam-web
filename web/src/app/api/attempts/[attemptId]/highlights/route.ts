import { NextResponse } from "next/server";
import { z } from "zod";

import {
  addHighlight,
  getAttempt,
  removeHighlight,
} from "@/lib/db/queries/attempts";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  questionGroupId: z.string().min(1),
  region: z.string().min(1).max(200),
  text: z.string().min(1).max(2000),
  occurrence: z.number().int().min(0).max(500),
  colour: z.string().min(1).max(20),
});

export async function POST(
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
    return NextResponse.json({ error: "Malformed highlight." }, { status: 400 });
  }

  const id = addHighlight(attemptId, parsed.data);
  return NextResponse.json({ id }, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const { attemptId } = await params;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing highlight id." }, { status: 400 });
  }
  removeHighlight(attemptId, id);
  return NextResponse.json({ ok: true });
}
