import type { GeneratedPaper, QuestionPartForMarking } from "@/lib/schemas/question";
import type { ResponsePayload } from "@/lib/schemas/renderers";

/**
 * The seam between the application and anything that produces a paper or a mark.
 *
 * Generation and marking are separate choices, because they have opposite
 * characteristics:
 *
 * - **Generation** costs roughly 100 model calls per paper, and a model-asserted
 *   answer key can be wrong — which marks a correct student incorrectly, the
 *   failure SPEC_ADDENDUM.md §10 says loses a user's trust for good.
 * - **Marking** costs roughly 30 small calls, and judging a 6-mark "evaluate"
 *   response is the one thing code genuinely cannot do.
 *
 * So `GENERATION_PROVIDER` and `MARKING_PROVIDER` are set independently rather
 * than through one switch. Adding an API key turns on real marking without also
 * turning on paid generation, which is the cheaper and more valuable half.
 */

export type GenerationStage =
  | "planning"
  | "mapping_coverage"
  | "building_stimuli"
  | "generating_questions"
  | "validating"
  | "reviewing_difficulty"
  | "finalising_marking"
  | "complete"
  | "failed";

export const GENERATION_STAGE_LABELS: Record<GenerationStage, string> = {
  planning: "Planning 100-mark paper",
  mapping_coverage: "Mapping syllabus coverage",
  building_stimuli: "Creating stimuli",
  generating_questions: "Generating questions",
  validating: "Validating code and data",
  reviewing_difficulty: "Reviewing HSC difficulty",
  finalising_marking: "Finalising marking guidelines",
  complete: "Ready",
  failed: "Generation failed",
};

export type GenerationProgress = {
  stage: GenerationStage;
  detail?: string;
  /** Completed / total question groups, when that is genuinely known. */
  questionsDone?: number;
  questionsTotal?: number;
};

export type GeneratePaperRequest = {
  selectedSyllabusItemIds: string[];
  onProgress?: (progress: GenerationProgress) => void;
  signal?: AbortSignal;
  /** Fixed seed reproduces a paper exactly. Used by tests. */
  seed?: number;
};

/** What the rubric marker returns for one part (CLAUDE.md §18). */
export type RubricMarkResult = {
  awardedMarks: number;
  maxMarks: number;
  criterionJudgements: Array<{
    description: string;
    met: "yes" | "partial" | "no";
    comment: string;
  }>;
  evidence: string[];
  missingElements: string[];
  reasoning: string;
  confidence: "high" | "medium" | "low";
  fullMarkExemplar: string;
  moderated?: {
    reviewed: boolean;
    originalMarks: number;
    agreed: boolean;
    note: string;
  };
};

export type MarkRequest = {
  part: QuestionPartForMarking;
  /** Rendered stimulus text for the group the part belongs to. */
  stimulusText: string | null;
  response: ResponsePayload | null;
  syllabusWording: Array<{ id: string; exactText: string }>;
  /** Note chunks retrieved for grounding. */
  noteChunks: Array<{ id: string; content: string }>;
  /** e.g. hidden Python test outcomes. */
  deterministicEvidence?: Record<string, unknown>;
};

export type GenerationProviderName = "mock" | "anthropic";
export type MarkingProviderName = "anthropic" | "none";

/** Produces a 100-mark paper. */
export interface PaperGenerator {
  readonly name: GenerationProviderName;
  generatePaper(request: GeneratePaperRequest): Promise<GeneratedPaper>;
}

/** Marks the responses no deterministic checker can handle. */
export interface RubricMarker {
  readonly name: MarkingProviderName;
  markResponse(request: MarkRequest): Promise<RubricMarkResult>;
}

/**
 * `GENERATION_PROVIDER` selects how papers are produced, and defaults to `mock`
 * so the app runs with no key at all (SPEC_ADDENDUM.md §5). `AI_PROVIDER` is
 * still honoured, so existing configurations keep working unchanged.
 */
export function resolveGenerationProvider(): GenerationProviderName {
  const explicit = process.env.GENERATION_PROVIDER?.trim().toLowerCase();
  if (explicit === "anthropic" || explicit === "mock") return explicit;

  const legacy = process.env.AI_PROVIDER?.trim().toLowerCase();
  return legacy === "anthropic" ? "anthropic" : "mock";
}

/**
 * `MARKING_PROVIDER` selects who marks written responses. It defaults to
 * whichever key is present, so adding `ANTHROPIC_API_KEY` alone turns on real
 * marking without also turning on paid generation — the two are independent
 * decisions and marking is by far the cheaper and more valuable one.
 *
 * With `none`, written responses are left unmarked and the results screen shows
 * the marking guideline and a full-mark exemplar instead of inventing a score.
 */
export function resolveMarkingProvider(): MarkingProviderName {
  const explicit = process.env.MARKING_PROVIDER?.trim().toLowerCase();
  if (explicit === "none" || explicit === "anthropic") return explicit;

  // An explicitly mocked build should not quietly start spending money.
  if (process.env.AI_PROVIDER?.trim().toLowerCase() === "mock") return "none";

  return process.env.ANTHROPIC_API_KEY?.trim() ? "anthropic" : "none";
}
