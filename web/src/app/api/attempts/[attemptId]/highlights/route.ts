import { NextResponse } from "next/server";

import { z } from "zod";

import { getApiUser } from "@/lib/auth/current-user";
import {
  addHighlight,
  getAttemptFor,
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
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { attemptId } = await params;
  const attempt = await getAttemptFor(attemptId, user.id);
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

  const id = await addHighlight(attemptId, parsed.data);
  return NextResponse.json({ id }, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { attemptId } = await params;
  if (!await getAttemptFor(attemptId, user.id)) {
    return NextResponse.json({ error: "Unknown attempt." }, { status: 404 });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing highlight id." }, { status: 400 });
  }
  await removeHighlight(attemptId, id);
  return NextResponse.json({ ok: true });
}
