/**
 * The pure half of the provider seam: names and progress labels, with no
 * database or network behind them.
 *
 * The generating screen is a client component and needs the stage labels, so
 * they live here rather than in `provider.ts` — which now reaches the database
 * to resolve settings and must stay server-side.
 */

export type GenerationProviderName = "sample" | "model";
export type MarkingProviderName = "model" | "none";

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
