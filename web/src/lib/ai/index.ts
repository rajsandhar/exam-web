import { desc } from "drizzle-orm";

import { NOVELTY_RULES } from "@/lib/config";
import { db } from "@/lib/db/client";
import {
  coverageHistory,
  questionFingerprints,
  syllabusItems,
} from "@/lib/db/schema";
import { IMPLEMENTED_RENDERERS } from "@/lib/schemas/renderers";

import { getEndpointConfig } from "./client";
import { listAssets } from "@/lib/assets/queries";

import { ModelPaperGenerator, type ProviderContext } from "./model-generator";
import { markResponseWithRubric } from "./marker";
import { SamplePaperGenerator } from "./sample-generator";
import {
  resolveGenerationProvider,
  resolveMarkingProvider,
  type MarkRequest,
  type PaperGenerator,
  type RubricMarker,
  type RubricMarkResult,
} from "./provider";

/**
 * Generation and marking are resolved separately (see `provider.ts`).
 *
 * Both default to costing nothing: papers come from the built-in sample unless
 * `GENERATION_PROVIDER=model`, and written responses are left unmarked until an
 * endpoint is configured.
 */

let cachedGenerator: PaperGenerator | null = null;
let cachedMarker: RubricMarker | null = null;

export async function getPaperGenerator(): Promise<PaperGenerator> {
  if (cachedGenerator) return cachedGenerator;

  if (await resolveGenerationProvider() === "model") {
    // Fail here rather than part-way through generation: an unconfigured
    // endpoint should be reported before a paper row is created.
    await getEndpointConfig();
    cachedGenerator = new ModelPaperGenerator(loadProviderContext);
  } else {
    cachedGenerator = new SamplePaperGenerator();
  }
  return cachedGenerator;
}

export async function getRubricMarker(): Promise<RubricMarker> {
  if (cachedMarker) return cachedMarker;

  cachedMarker =
    await resolveMarkingProvider() === "model"
      ? new ModelRubricMarker()
      : new UnmarkedRubricMarker();
  return cachedMarker;
}

/** Marks written responses with the model (CLAUDE.md §18). */
class ModelRubricMarker implements RubricMarker {
  readonly name = "model" as const;

  // The endpoint is checked before this is constructed, in `getRubricMarker`:
  // a constructor cannot await, and failing at construction told the caller
  // nothing useful anyway.


  async markResponse(request: MarkRequest): Promise<RubricMarkResult> {
    return await markResponseWithRubric(request);
  }
}

/**
 * No marker configured. Returns an explicit "not assessed" result rather than a
 * fabricated score, and hands back the full-mark exemplar so the student can
 * still see what a strong answer looks like.
 */
class UnmarkedRubricMarker implements RubricMarker {
  readonly name = "none" as const;

  async markResponse(request: MarkRequest): Promise<RubricMarkResult> {
    const { part } = request;
    const exemplar =
      part.answerKey && "modelAnswer" in part.answerKey
        ? part.answerKey.modelAnswer
        : part.answerKey && "accepted" in part.answerKey
          ? part.answerKey.accepted.join("\n")
          : (part.markingGuideline?.modelAnswer ?? "");

    return {
      awardedMarks: 0,
      maxMarks: part.marks,
      criterionJudgements: [],
      evidence: [],
      missingElements: [],
      reasoning:
        "Written responses are marked by the rubric marker, which is not enabled. " +
        "Configure a model endpoint to have this marked.",
      confidence: "low",
      fullMarkExemplar: exemplar,
    };
  }
}

/**
 * Everything the live generator needs from the database: exact syllabus wording,
 * coverage history for weighting, and the recent fingerprints that drive the
 * novelty exclusion list (SPEC_ADDENDUM.md §2, §3).
 */
export async function loadProviderContext(): Promise<ProviderContext> {
  const syllabusRows = await db
    .select({
      id: syllabusItems.id,
      exactText: syllabusItems.exactText,
      including: syllabusItems.includingJson,
    })
    .from(syllabusItems);

  const coverageRows = await db.select().from(coverageHistory);

  const fingerprints = await db
    .select()
    .from(questionFingerprints)
    .orderBy(desc(questionFingerprints.createdAt))
    .limit(NOVELTY_RULES.exclusionWindow);

  // The "previous paper" is the most recent exam that produced fingerprints.
  const latestExamId = fingerprints[0]?.examId ?? null;
  const previousPaperPairs = new Set<string>();
  for (const fingerprint of fingerprints) {
    if (fingerprint.examId !== latestExamId) continue;
    for (const id of fingerprint.syllabusItemIdsJson) {
      previousPaperPairs.add(`${fingerprint.archetypeId ?? "unknown"}::${id}`);
    }
  }

  return {
    syllabus: {
      text: new Map(syllabusRows.map((row) => [row.id, row.exactText])),
      including: new Map(syllabusRows.map((row) => [row.id, row.including])),
    },
    coverageHistory: coverageRows.map((row) => ({
      syllabusItemId: row.syllabusItemId,
      timesAssessed: row.timesAssessed,
      timesSelected: row.timesSelected,
      lastAssessedAt: row.lastAssessedAt?.getTime() ?? null,
    })),
    recentDomains: fingerprints.map((fingerprint) => fingerprint.scenarioDomain),
    previousPaperPairs,
    availableRenderers: IMPLEMENTED_RENDERERS,
    availableAssets: (await listAssets()).map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      title: asset.title,
      description: asset.description,
      altText: asset.altText,
      hasCaptions: asset.hasCaptions,
      syllabusItemIds: asset.syllabusItemIds,
    })),
  };
}

/** Test seams. */
export async function __setPaperGenerator(generator: PaperGenerator | null): Promise<void> {
  cachedGenerator = generator;
}

export async function __setRubricMarker(marker: RubricMarker | null): Promise<void> {
  cachedMarker = marker;
}

export * from "./provider";
