import type { GeneratedPaper, QuestionPartForMarking } from "@/lib/schemas/question";
import type { ResponsePayload } from "@/lib/schemas/renderers";

import {
  GENERATION_STAGE_LABELS,
  type GenerationProgress,
  type GenerationProviderName,
  type GenerationStage,
  type MarkingProviderName,
} from "./provider-names";
import { readStoredSettings, resolveEndpointConfig } from "./settings";

// The stage labels are re-exported because the generating screen is a client
// component: it imports them from `./provider-names` directly, and server code
// keeps importing them from here.
export {
  GENERATION_STAGE_LABELS,
  type GenerationProgress,
  type GenerationProviderName,
  type GenerationStage,
  type MarkingProviderName,
};

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
 * How papers are produced. The settings screen wins; `GENERATION_PROVIDER` is
 * the fallback, and the default is `sample` so the app runs with no endpoint
 * configured at all (SPEC_ADDENDUM.md §5).
 */
export function resolveGenerationProvider(): GenerationProviderName {
  const stored = readStoredSettings().generationProvider;
  if (stored) return stored;

  const explicit = process.env.GENERATION_PROVIDER?.trim().toLowerCase();
  if (explicit === "model" || explicit === "sample") return explicit;
  return "sample";
}

/**
 * Who marks written responses. The settings screen wins, then
 * `MARKING_PROVIDER`; failing both it turns on as soon as an endpoint is
 * configured, so supplying one enables real marking without also
 * enabling paid generation — the two are independent decisions and marking is by
 * far the cheaper and more valuable one.
 *
 * With `none`, written responses are left unmarked and the results screen shows
 * the marking guideline and a full-mark exemplar instead of inventing a score.
 */
export function resolveMarkingProvider(): MarkingProviderName {
  const stored = readStoredSettings().markingProvider;
  if (stored) return stored;

  const explicit = process.env.MARKING_PROVIDER?.trim().toLowerCase();
  if (explicit === "none" || explicit === "model") return explicit;

  // Marking turns on as soon as an endpoint exists, because it is the cheap
  // half and the half a model is irreplaceable for. Generation stays off until
  // it is asked for.
  return resolveEndpointConfig() !== null ? "model" : "none";
}
