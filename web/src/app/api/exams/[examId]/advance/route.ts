import { NextResponse } from "next/server";

import { getPaperGenerator } from "@/lib/ai";
import { ModelPaperGenerator } from "@/lib/ai/model-generator";
import { getApiUser } from "@/lib/auth/current-user";
import { getExamFor } from "@/lib/db/queries/exams";
import { advanceGeneration } from "@/lib/generation/resumable";
import { databaseStore } from "@/lib/generation/store";

export const dynamic = "force-dynamic";

/**
 * Advances one paper by one step.
 *
 * A paper is roughly sixty model calls and cannot be produced inside a single
 * request, so each call here does a bounded piece of the work — the blueprint,
 * or a batch of questions, or publication — and returns. The progress screen
 * calls this on the same tick it polls for status, so the work continues for as
 * long as someone is watching, and a run nobody is watching is swept up as
 * stalled rather than left spinning.
 *
 * Every step is idempotent: a question is only generated for a position with
 * nothing stored, so a step that dies is retried rather than duplicated.
 */
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ examId: string }> },
) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { examId } = await params;
  const exam = await getExamFor(examId, user.id);
  if (!exam) return NextResponse.json({ error: "Unknown paper." }, { status: 404 });

  const generator = await getPaperGenerator();
  if (!(generator instanceof ModelPaperGenerator)) {
    // The sample paper is written whole, inside the original request.
    return NextResponse.json({ status: exam.status, more: false });
  }

  const started = Date.now();
  const result = await advanceGeneration(examId, generator, databaseStore);

  // Timing per step, so a slow paper can be diagnosed without reading the
  // host's logs — which is how the five-minute failure had to be found.
  console.info(
    `[generation] ${examId} ${result.stage} ` +
      `${result.questionsDone}/${result.questionsTotal} in ${Date.now() - started}ms`,
  );

  return NextResponse.json(result);
}
