import { NextResponse } from "next/server";
import { z } from "zod";

import { getAttempt } from "@/lib/db/queries/attempts";
import { saveMark } from "@/lib/db/queries/marking";
import { finaliseMarking } from "@/lib/marking/run-marking";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  outcomes: z
    .array(
      z.object({
        questionPartId: z.string().min(1),
        awardedMarks: z.number().int().min(0).max(20),
        maxMarks: z.number().int().min(0).max(20),
        detail: z.string().max(1000),
        passed: z.number().int().min(0),
        total: z.number().int().min(0),
        cases: z
          .array(
            z.object({
              name: z.string().max(200),
              passed: z.boolean(),
              expected: z.string().max(2000),
              actual: z.string().max(2000).nullable(),
              error: z.string().max(2000).nullable(),
            }),
          )
          .max(40),
      }),
    )
    .max(40),
});

/**
 * Phase two of submission: the browser reports what the student's code did.
 *
 * Marks are clamped to the part's maximum server-side, and the record is
 * labelled `executed_in_browser` so review and the rubric marker both know
 * where the evidence came from.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const { attemptId } = await params;
  const attempt = getAttempt(attemptId);
  if (!attempt) {
    return NextResponse.json({ error: "Unknown attempt." }, { status: 404 });
  }
  if (attempt.status !== "submitted" && attempt.status !== "marked") {
    return NextResponse.json(
      { error: "This attempt has not been submitted." },
      { status: 409 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed execution results." }, { status: 400 });
  }

  for (const outcome of parsed.data.outcomes) {
    const awarded = Math.max(0, Math.min(outcome.maxMarks, outcome.awardedMarks));
    saveMark(attemptId, outcome.questionPartId, awarded, {
      method: "executed_in_browser",
      awardedMarks: awarded,
      maxMarks: outcome.maxMarks,
      detail: outcome.detail,
      hiddenTests: { passed: outcome.passed, total: outcome.total, cases: outcome.cases },
    });
  }

  await finaliseMarking(attemptId);

  const marked = getAttempt(attemptId);
  return NextResponse.json({
    status: marked?.status ?? "submitted",
    markingStatus: marked?.markingStatus ?? "pending",
    finalScore: marked?.finalScore ?? null,
  });
}
