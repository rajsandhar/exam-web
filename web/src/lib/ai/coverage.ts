import { COVERAGE_RULES } from "@/lib/config";

/**
 * Which selected dot points this paper will assess (SPEC_ADDENDUM.md §2).
 *
 * Enumeration is impossible above ~25 selected leaves: a 100-mark paper is
 * roughly 43 items, and even at an optimistic 1.5 syllabus items per question
 * that is ~65 touches against 73 leaves. So coverage is sampling, and the
 * sampling is weighted towards content earlier papers skipped — that is what
 * makes generating a second paper worthwhile.
 *
 * Deterministic, and deliberately not a model call: the model has no access to
 * coverage history, and a sampling decision it made could not be validated
 * against the rules below.
 */

export type CoverageHistoryEntry = {
  syllabusItemId: string;
  timesAssessed: number;
  timesSelected: number;
  lastAssessedAt: number | null;
};

export type CoverageSelection = {
  /** Items the blueprint must assess. */
  assess: string[];
  /** Selected items this paper will not reach. Surfaced on the results screen. */
  skip: string[];
  /** Relative emphasis, 1 = ordinary. Higher means "give this more marks". */
  weights: Record<string, number>;
  mode: "full" | "sampled";
};

/** Deterministic PRNG so a fixed seed reproduces a selection exactly. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * How many leaves a 100-mark paper can genuinely assess. Around 43 items at
 * ~1.5 syllabus items each, minus the overlap that integrated questions create.
 */
const REACHABLE_LEAVES = 48;

export function planCoverage(
  selectedItemIds: readonly string[],
  history: readonly CoverageHistoryEntry[],
  seed = Date.now(),
): CoverageSelection {
  const selected = [...new Set(selectedItemIds)].sort();
  const historyById = new Map(history.map((entry) => [entry.syllabusItemId, entry]));

  if (selected.length <= COVERAGE_RULES.fullCoverageThreshold) {
    // Every selected leaf must be assessed; validation fails if any is missed.
    return {
      assess: selected,
      skip: [],
      weights: Object.fromEntries(
        selected.map((id) => [id, weightFor(historyById.get(id))]),
      ),
      mode: "full",
    };
  }

  const random = mulberry32(hashSeed(seed, selected));

  // Weighted sampling without replacement, using the exponential-race trick:
  // a key of -ln(U)/w orders items so higher-weight items come first in
  // expectation, without ever making the draw deterministic.
  const ranked = selected
    .map((id) => {
      const weight = weightFor(historyById.get(id));
      const u = Math.max(random(), Number.EPSILON);
      return { id, weight, key: -Math.log(u) / weight };
    })
    .sort((a, b) => a.key - b.key);

  const target = Math.max(
    Math.ceil(selected.length * COVERAGE_RULES.minSampledCoverage),
    Math.min(selected.length, REACHABLE_LEAVES),
  );

  const assess = ranked.slice(0, Math.min(target, selected.length)).map((r) => r.id);
  const assessSet = new Set(assess);

  return {
    assess: assess.sort(),
    skip: selected.filter((id) => !assessSet.has(id)),
    weights: Object.fromEntries(
      ranked.map((entry) => [entry.id, Math.round(entry.weight * 100) / 100]),
    ),
    mode: "sampled",
  };
}

/**
 * Never assessed → heaviest. Assessed recently or often → lighter, but never
 * zero, so nothing becomes permanently unreachable.
 */
function weightFor(entry: CoverageHistoryEntry | undefined): number {
  if (!entry || entry.timesAssessed === 0) return 3;
  const staleness = entry.lastAssessedAt
    ? Math.min(1, (Date.now() - entry.lastAssessedAt) / (1000 * 60 * 60 * 24 * 14))
    : 1;
  return Math.max(0.4, 1 / (1 + entry.timesAssessed) + staleness);
}

function hashSeed(seed: number, items: readonly string[]): number {
  let hash = seed | 0;
  for (const id of items) {
    for (let i = 0; i < id.length; i += 1) {
      hash = (Math.imul(hash, 31) + id.charCodeAt(i)) | 0;
    }
  }
  return hash;
}
