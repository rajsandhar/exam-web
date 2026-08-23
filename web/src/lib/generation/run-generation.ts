import { getPaperGenerator } from "@/lib/ai";
import {
  createPendingExam,
  failExam,
  persistPaper,
  setExamProgress,
} from "@/lib/db/queries/exams";
import { validAssetIds } from "@/lib/assets/queries";
import { validatePaper } from "@/lib/schemas/paper-validation";
import { generatedPaperSchema } from "@/lib/schemas/question";
import { IMPLEMENTED_RENDERERS } from "@/lib/schemas/renderers";

/**
 * Orchestrates generation for one paper.
 *
 * The exam row is created immediately so the browser can navigate to the
 * progress screen, and generation continues in the background of the same
 * process. This is a single-user local application — there is no queue, and
 * SPEC_ADDENDUM.md §21 rules one out.
 */

export async function startGeneration(
  selectedSyllabusItemIds: string[],
  userId: string,
): Promise<string> {
  // Resolve the provider first: a missing API key or model should surface as a
  // failed request, not as a paper row stuck in "generating".
  await getPaperGenerator();

  const examId = await createPendingExam(selectedSyllabusItemIds, userId);
  void await runGeneration(examId, selectedSyllabusItemIds);
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
    await failExam(examId, cause instanceof Error ? cause.message : String(cause));
  }
}
