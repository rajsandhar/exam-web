import { getAiProvider } from "@/lib/ai";
import {
  createPendingExam,
  failExam,
  persistPaper,
  setExamProgress,
} from "@/lib/db/queries/exams";
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

export function startGeneration(selectedSyllabusItemIds: string[]): string {
  const examId = createPendingExam(selectedSyllabusItemIds);
  void runGeneration(examId, selectedSyllabusItemIds);
  return examId;
}

export async function runGeneration(
  examId: string,
  selectedSyllabusItemIds: string[],
): Promise<void> {
  const provider = getAiProvider();
  try {
    const paper = await provider.generatePaper({
      selectedSyllabusItemIds,
      onProgress: (progress) => setExamProgress(examId, progress),
    });

    const parsed = generatedPaperSchema.parse(paper);

    // The mock provider replays a fixed paper, so it cannot honour an arbitrary
    // selection; coverage is reported on the results screen instead of blocking.
    const result = validatePaper(parsed, {
      availableRenderers: IMPLEMENTED_RENDERERS,
      enforceCoverage: provider.name !== "mock",
    });

    if (!result.ok) {
      throw new Error(
        `Generated paper failed validation:\n` +
          result.issues.map((i) => `  • ${i.path}: ${i.message}`).join("\n"),
      );
    }

    persistPaper(examId, parsed);
  } catch (cause) {
    failExam(examId, cause instanceof Error ? cause.message : String(cause));
  }
}
