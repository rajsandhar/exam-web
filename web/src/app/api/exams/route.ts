import { NextResponse } from "next/server";
import { z } from "zod";

import { getSelectableLeafIds } from "@/lib/db/queries/syllabus";
import { startGeneration } from "@/lib/generation/run-generation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  syllabusItemIds: z.array(z.string()).min(1),
});

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Select at least one syllabus dot point." },
      { status: 400 },
    );
  }

  // Only ids that exist in the seed may be selected — never trust the client.
  const valid = new Set(getSelectableLeafIds());
  const selected = parsed.data.syllabusItemIds.filter((id) => valid.has(id));
  if (selected.length === 0) {
    return NextResponse.json(
      { error: "None of the selected items exist in the Year 12 syllabus." },
      { status: 400 },
    );
  }

  try {
    const examId = startGeneration(selected);
    return NextResponse.json({ examId }, { status: 201 });
  } catch (cause) {
    // A missing ANTHROPIC_API_KEY or ANTHROPIC_MODEL lands here.
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Generation could not be started." },
      { status: 500 },
    );
  }
}
