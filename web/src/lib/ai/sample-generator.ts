import fixturePaper from "./fixtures/fixture-paper.json";
import type { GeneratePaperRequest, PaperGenerator } from "./provider";

import { generatedPaperSchema, type GeneratedPaper } from "@/lib/schemas/question";

/**
 * The built-in sample paper, used when no model endpoint is configured
 * (SPEC_ADDENDUM.md §5).
 *
 * `generatePaper` replays the hand-written fixture paper. It cannot honour an
 * arbitrary selection — the questions are fixed — so the paper keeps its own
 * syllabus mapping and stays internally consistent, and the selection the
 * student actually made is recorded separately. The instructions screen says
 * plainly that this is a sample paper rather than one built from the selection;
 * generating with a model is what makes the selection meaningful.
 */
export class SamplePaperGenerator implements PaperGenerator {
  readonly name = "sample" as const;

  async generatePaper(request: GeneratePaperRequest): Promise<GeneratedPaper> {
    const stages = [
      "planning",
      "mapping_coverage",
      "building_stimuli",
      "generating_questions",
      "validating",
      "reviewing_difficulty",
      "finalising_marking",
    ] as const;

    const paper = generatedPaperSchema.parse(fixturePaper);

    for (const stage of stages) {
      request.signal?.throwIfAborted();
      request.onProgress?.({ stage });
    }

    const assessed = new Set(
      paper.groups.flatMap((g) => g.parts.flatMap((p) => p.syllabusItemIds)),
    );

    return {
      ...paper,
      // The fixture's own mapping is kept so every question still sits inside
      // the paper's declared content (CLAUDE.md §2.6).
      unassessedSyllabusItemIds: request.selectedSyllabusItemIds.filter(
        (id) => !assessed.has(id),
      ),
      generationMetadata: { ...paper.generationMetadata, provider: "sample" as const },
    };
  }
}
