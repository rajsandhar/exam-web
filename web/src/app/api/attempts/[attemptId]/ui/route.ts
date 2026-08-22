import { NextResponse } from "next/server";
import { z } from "zod";

import { saveUiState } from "@/lib/db/queries/attempts";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  fontSize: z.enum(["s", "m", "l", "xl"]).optional(),
  colourTheme: z.enum(["default", "high-contrast", "cream", "dark"]).optional(),
  lastQuestion: z.number().int().min(1).max(200).optional(),
});

/** Persists exam tool choices so a refresh restores them (CLAUDE.md §10.7). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const { attemptId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed UI state." }, { status: 400 });
  }
  saveUiState(attemptId, parsed.data);
  return NextResponse.json({ ok: true });
}
