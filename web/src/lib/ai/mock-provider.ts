import fixturePaper from "./fixtures/fixture-paper.json";
import type {
  AiProvider,
  GeneratePaperRequest,
  MarkRequest,
  RubricMarkResult,
} from "./provider";

import { generatedPaperSchema, type GeneratedPaper } from "@/lib/schemas/question";
import { isAnswered } from "@/lib/schemas/renderers";

/**
 * Deterministic provider used for development and tests (SPEC_ADDENDUM.md §5).
 *
 * `generatePaper` returns the hand-written fixture paper, re-based onto the
 * student's actual selection so the results screen can still report which
 * selected dot points went unassessed. It never invents new questions, so a
 * selection the fixture does not cover produces a large "not assessed" list —
 * that is the honest answer for a fixture, and the anthropic provider is what
 * makes the selection meaningful.
 */
export class MockAiProvider implements AiProvider {
  readonly name = "mock" as const;

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
    const selected = request.selectedSyllabusItemIds;

    return {
      ...paper,
      selectedSyllabusItemIds: selected.length > 0 ? selected : paper.selectedSyllabusItemIds,
      unassessedSyllabusItemIds: selected.filter((id) => !assessed.has(id)),
    };
  }

  async markResponse(request: MarkRequest): Promise<RubricMarkResult> {
    const { part, response } = request;
    const answered = isAnswered(response);

    // A fixed, obviously-provisional result: enough for the results screen to
    // render end to end before Step 12, and never mistakable for a real mark.
    return {
      awardedMarks: 0,
      maxMarks: part.marks,
      criterionJudgements:
        part.markingGuideline?.criteria.map((criterion) => ({
          description: criterion.description,
          met: "no" as const,
          comment: "Not assessed — AI marking is not enabled.",
        })) ?? [],
      evidence: [],
      missingElements: [],
      reasoning: answered
        ? "This response needs marking against the rubric. Set AI_PROVIDER=anthropic and supply ANTHROPIC_API_KEY to have it marked."
        : "No response was given.",
      confidence: "low",
      fullMarkExemplar:
        part.answerKey && "modelAnswer" in part.answerKey
          ? part.answerKey.modelAnswer
          : (part.markingGuideline?.modelAnswer ?? ""),
    };
  }
}
