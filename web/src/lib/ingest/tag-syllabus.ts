import type { SyllabusSeedItem } from "@/lib/syllabus/seed";

/**
 * Maps a chunk to the syllabus dot points it plausibly supports.
 *
 * Deterministic and lexical — no model call (CLAUDE.md §16). The signal is the
 * distinctive terminology of a dot point: its `including` values, and the
 * content words of its `exactText` with command verbs and syllabus filler
 * removed. Generic words would tag every chunk to everything, which is worse
 * than no tagging at all.
 */

export type SyllabusTag = { syllabusItemId: string; weight: number };

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "for", "on", "with", "by",
  "from", "at", "as", "is", "are", "be", "been", "that", "this", "these",
  "those", "it", "its", "their", "used", "using", "use", "when", "how", "why",
  "what", "which", "into", "than", "then", "also", "may", "can", "will",
  // Command verbs: they describe the task, never the subject matter.
  "describe", "explain", "investigate", "explore", "apply", "assess",
  "evaluate", "compare", "identify", "outline", "research", "design",
  "develop", "implement", "construct", "demonstrate", "model", "propose",
  "distinguish", "interpret", "analyse", "observe", "experiment", "test",
  // Words that appear across most Year 12 dot points.
  "software", "code", "programming", "solution", "solutions", "development",
  "developing", "developer", "developers", "application", "applications",
  "practise", "practice", "types", "type", "key", "common", "additional",
]);

/** Multi-word terms are far more discriminating than single words. */
const MIN_PHRASE_LENGTH = 6;
const MIN_WORD_LENGTH = 5;

type ItemTerms = {
  id: string;
  phrases: string[];
  words: string[];
};

export function buildItemTerms(items: SyllabusSeedItem[]): ItemTerms[] {
  return items.map((item) => {
    const phrases = new Set<string>();

    // `including` values are the syllabus's own list of examinable specifics.
    for (const value of item.including) {
      const cleaned = normalise(value);
      if (cleaned.length >= MIN_PHRASE_LENGTH) phrases.add(cleaned);
      // "static application security testing (SAST)" also yields "sast".
      for (const abbreviation of value.matchAll(/\(([A-Z][A-Za-z0-9]{1,9})\)/g)) {
        phrases.add(normalise(abbreviation[1] ?? ""));
      }
    }
    for (const abbreviation of item.exactText.matchAll(/\(([A-Z][A-Za-z0-9]{1,9})\)/g)) {
      phrases.add(normalise(abbreviation[1] ?? ""));
    }

    const words = new Set<string>();
    for (const raw of normalise(item.exactText).split(/[^a-z0-9+#]+/)) {
      if (raw.length < MIN_WORD_LENGTH) continue;
      if (STOP_WORDS.has(raw)) continue;
      if (raw === "unresolved") continue;
      words.add(raw);
    }

    return {
      id: item.id,
      phrases: [...phrases].filter((p) => p !== ""),
      words: [...words],
    };
  });
}

/**
 * Scores a chunk against every dot point and keeps the strongest matches.
 * Returns at most `maxTags` so a long chunk cannot claim the whole syllabus.
 */
export function tagChunk(
  content: string,
  terms: ItemTerms[],
  { maxTags = 4, minScore = 2 }: { maxTags?: number; minScore?: number } = {},
): SyllabusTag[] {
  const haystack = normalise(content);
  const scored: Array<{ id: string; score: number }> = [];

  for (const item of terms) {
    let score = 0;
    for (const phrase of item.phrases) {
      if (haystack.includes(phrase)) score += 3;
    }
    for (const word of item.words) {
      if (containsWord(haystack, word)) score += 1;
    }
    if (score >= minScore) scored.push({ id: item.id, score });
  }

  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const top = scored.slice(0, maxTags);
  const best = top[0]?.score ?? 1;

  return top.map((entry) => ({
    syllabusItemId: entry.id,
    weight: Math.round((entry.score / best) * 100) / 100,
  }));
}

function containsWord(haystack: string, word: string): boolean {
  let index = haystack.indexOf(word);
  while (index !== -1) {
    const before = index === 0 ? " " : haystack[index - 1]!;
    const after = haystack[index + word.length] ?? " ";
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
    index = haystack.indexOf(word, index + 1);
  }
  return false;
}

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
