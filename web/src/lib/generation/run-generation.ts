import { getPaperGenerator } from "@/lib/ai";
import {
  createPendingExam,
  failExam,
  persistPaper,
  setExamProgress,
} from "@/lib/db/queries/exams";
import type { GenerationProgress } from "@/lib/ai/provider";
import { validAssetIds } from "@/lib/assets/queries";
import { validatePaper } from "@/lib/schemas/paper-validation";
import { generatedPaperSchema } from "@/lib/schemas/question";
import { IMPLEMENTED_RENDERERS } from "@/lib/schemas/renderers";

/**
 * Orchestrates generation for one paper.
 *
 * The exam row is created immediately so the browser can navigate to the
 * progress screen, and the paper is then built and written before the request
 * answers. The comment here used to claim the work continued in the background;
 * `void await` awaits it, so it never did — and on a serverless host it must
 * not, because a function stops executing once it has responded.
 *
 * Keeping it inside the request is what makes it reliable, and it is affordable
 * because the sample paper builds in about 20 ms and persistence is now a
 * handful of statements rather than a few hundred. A model-backed paper is a
 * different matter: roughly a hundred calls will not fit in one request, and
 * that needs a queue or a resumable run, which SPEC_ADDENDUM.md §21 has views
 * on. Nothing here pretends otherwise.
 */

export async function startGeneration(
  selectedSyllabusItemIds: string[],
  userId: string,
): Promise<string> {
  // Resolve the provider first: a missing API key or model should surface as a
  // failed request, not as a paper row stuck in "generating".
  const generator = await getPaperGenerator();

  const examId = await createPendingExam(selectedSyllabusItemIds, userId);

  if (generator.name === "sample") {
    // The built-in paper is assembled in about twenty milliseconds, so there is
    // nothing to gain by making the browser come back for it.
    await runGeneration(examId, selectedSyllabusItemIds);
    return examId;
  }

  // A model-backed paper is roughly sixty calls and cannot finish inside one
  // request — this used to await it and be killed at the function's five-minute
  // ceiling, leaving the row at "generating" for ever. The progress screen
  // drives it a step at a time instead (see `lib/generation/resumable.ts`).
  await setExamProgress(examId, {
    stage: "planning",
    lastProgressAt: new Date().toISOString(),
  } as GenerationProgress);

  return examId;
}

export async function runGeneration(
  examId: string,
  selectedSyllabusItemIds: string[],
): Promise<void> {
  const generator = await getPaperGenerator();
  try {
    const paper = await generator.generatePaper({
      selectedSyllabusItemIds,
      // Progress is advisory: the generator reports a stage and carries on, so
      // this is deliberately not awaited.
      onProgress: (progress) => void setExamProgress(examId, progress),
    });

    const parsed = generatedPaperSchema.parse(paper);

    // The sample paper is fixed, so it cannot honour an arbitrary selection.
    // Its coverage is reported on the results screen rather than blocking;
    // every other rule, including the syllabus boundary, still applies.
    const result = validatePaper(parsed, {
      availableRenderers: IMPLEMENTED_RENDERERS,
      availableAssetIds: await validAssetIds(),
      enforceCoverage: generator.name !== "sample",
    });

    if (!result.ok) {
      throw new Error(
        `Generated paper failed validation:\n` +
          result.issues.map((i) => `  • ${i.path}: ${i.message}`).join("\n"),
      );
    }

    if (result.warnings.length > 0) {
      // Not fatal, but recorded on the paper so a mix that drifted away from a
      // real examination is visible afterwards rather than only in the moment.
      console.warn(
        `Paper ${examId} generated with warnings:\n` +
          result.warnings.map((w) => `  • ${w.path}: ${w.message}`).join("\n"),
      );
    }

    await persistPaper(examId, {
      ...parsed,
      generationMetadata: {
        ...parsed.generationMetadata,
        validationWarnings: result.warnings.map((w) => w.message),
        objectiveRendererMarks: result.stats.objectiveRendererMarks,
      },
    });
  } catch (cause) {
    await failExam(examId, describe(cause));
  }
}

/**
 * The whole chain, not the outermost message.
 *
 * A query builder reports `Failed query: insert into …` and keeps the reason —
 * the constraint, the ambiguous column, the type mismatch — as `cause`. Storing
 * only the top of that chain is what left three failed papers on the deployment
 * saying which statement failed and nothing about why, and made the screen show
 * nothing an author could act on.
 */
function describe(cause: unknown): string {
  if (!(cause instanceof Error)) return String(cause);

  const messages: string[] = [];
  const seen = new Set<unknown>();
  for (let error: unknown = cause; error instanceof Error && !seen.has(error); ) {
    seen.add(error);
    const code = (error as { code?: string }).code;
    messages.push(`${error.message}${code ? ` [${code}]` : ""}`);
    error = (error as { cause?: unknown }).cause;
  }
  return messages.join("\n  caused by: ");
}
