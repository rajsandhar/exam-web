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
import { MockAiProvider } from "./mock-provider";
import { type AiProvider, resolveProviderName } from "./provider";

/**
 * Provider selection. `AI_PROVIDER` defaults to `mock`, so the application runs
 * end to end with no API key at all (SPEC_ADDENDUM.md §5).
 */

let cached: AiProvider | null = null;

export function getAiProvider(): AiProvider {
  if (cached) return cached;
  if (resolveProviderName() === "anthropic") {
    // Fail here rather than part-way through generation: a missing key or model
    // should be reported before a paper row is created.
    getModel();
    getClient();
    cached = new AnthropicAiProvider(loadProviderContext);
  } else {
    cached = new MockAiProvider();
  }
  return cached;
}

/**
 * Everything the live provider needs from the database: exact syllabus wording,
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

/** Test seam. */
export function __setAiProvider(provider: AiProvider | null): void {
  cached = provider;
}

export * from "./provider";
