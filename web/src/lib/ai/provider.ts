import type { GeneratedPaper, QuestionPartForMarking } from "@/lib/schemas/question";
import type { ResponsePayload } from "@/lib/schemas/renderers";

/**
 * The single seam between the application and any model call.
 *
 * `AI_PROVIDER` selects the implementation and defaults to `mock`, so the whole
 * product — exam shell, attempt engine, deterministic marking, results — can be
 * built and tested without a single API call (SPEC_ADDENDUM.md §5).
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
  /** Note chunks retrieved for grounding. Empty for the mock provider. */
  noteChunks: Array<{ id: string; content: string }>;
  /** e.g. hidden Python test outcomes. */
  deterministicEvidence?: Record<string, unknown>;
};

export interface AiProvider {
  readonly name: "mock" | "anthropic";
  generatePaper(request: GeneratePaperRequest): Promise<GeneratedPaper>;
  markResponse(request: MarkRequest): Promise<RubricMarkResult>;
}

export function resolveProviderName(): "mock" | "anthropic" {
  return process.env.AI_PROVIDER === "anthropic" ? "anthropic" : "mock";
}
