import { desc } from "drizzle-orm";

import { NOVELTY_RULES } from "@/lib/config";
import { db } from "@/lib/db/client";
import {
  coverageHistory,
  questionFingerprints,
  syllabusItems,
} from "@/lib/db/schema";
import { IMPLEMENTED_RENDERERS } from "@/lib/schemas/renderers";

import { AnthropicAiProvider, type ProviderContext } from "./anthropic-provider";
import { getClient, getModel } from "./client";
import { markResponseWithRubric } from "./marker";
import { MockAiProvider } from "./mock-provider";
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
 * `GENERATION_PROVIDER=anthropic`, and written responses are left unmarked
 * unless a key is present.
 */

let cachedGenerator: PaperGenerator | null = null;
let cachedMarker: RubricMarker | null = null;

export function getPaperGenerator(): PaperGenerator {
  if (cachedGenerator) return cachedGenerator;

  if (resolveGenerationProvider() === "anthropic") {
    // Fail here rather than part-way through generation: a missing key or model
    // should be reported before a paper row is created.
    getModel();
    getClient();
    cachedGenerator = new AnthropicAiProvider(loadProviderContext);
  } else {
    cachedGenerator = new MockAiProvider();
  }
  return cachedGenerator;
}

export function getRubricMarker(): RubricMarker {
  if (cachedMarker) return cachedMarker;

  cachedMarker =
    resolveMarkingProvider() === "anthropic"
      ? new AnthropicRubricMarker()
      : new UnmarkedRubricMarker();
  return cachedMarker;
}

/** Marks written responses with the model (CLAUDE.md §18). */
class AnthropicRubricMarker implements RubricMarker {
  readonly name = "anthropic" as const;

  constructor() {
    getModel();
    getClient();
  }

  async markResponse(request: MarkRequest): Promise<RubricMarkResult> {
    return markResponseWithRubric(request);
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
        "Set ANTHROPIC_API_KEY to have this marked.",
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
export function loadProviderContext(): ProviderContext {
  const syllabusRows = db
    .select({
      id: syllabusItems.id,
      exactText: syllabusItems.exactText,
      including: syllabusItems.includingJson,
    })
    .from(syllabusItems)
    .all();

  const coverageRows = db.select().from(coverageHistory).all();

  const fingerprints = db
    .select()
    .from(questionFingerprints)
    .orderBy(desc(questionFingerprints.createdAt))
    .limit(NOVELTY_RULES.exclusionWindow)
    .all();

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
  };
}

/** Test seams. */
export function __setPaperGenerator(generator: PaperGenerator | null): void {
  cachedGenerator = generator;
}

export function __setRubricMarker(marker: RubricMarker | null): void {
  cachedMarker = marker;
}

export * from "./provider";
