import fs from "node:fs";

import { z } from "zod";

import { SYLLABUS_SEED_FILE } from "@/lib/paths";

/**
 * Reads `reference/syllabus/year12_syllabus_seed.json`.
 *
 * The seed is authoritative: `exactText` is copied verbatim into the database
 * and into the selector. It is never trimmed, sentence-cased or "tidied", and
 * IDs (`ssa.2.5`, `pwa.1.3`) are permanent — generated questions reference them
 * forever.
 */

export const UNRESOLVED_TOKEN = "UNRESOLVED";

const seedItemSchema = z.object({
  id: z.string().min(1),
  exactText: z.string().min(1),
  including: z.array(z.string()).default([]),
  selectable: z.boolean(),
  verified: z.boolean(),
  sourceUrl: z.string().optional(),
  note: z.string().optional(),
});

const seedSubtopicSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().optional(),
  selectable: z.boolean().optional(),
  items: z.array(seedItemSchema).min(1),
});

const seedFocusAreaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().optional(),
  selectable: z.boolean().optional(),
  sourceUrl: z.string().optional(),
  subtopics: z.array(seedSubtopicSchema).min(1),
});

export const syllabusSeedSchema = z.object({
  course: z.string(),
  stage: z.string(),
  jurisdiction: z.string(),
  sourceUrl: z.string(),
  extractedOn: z.string(),
  status: z.string(),
  statusReason: z.string().optional(),
  counts: z.object({
    focusAreas: z.number().int(),
    subtopics: z.number().int(),
    selectableLeafItems: z.number().int(),
    unverifiedItems: z.number().int(),
  }),
  focusAreas: z.array(seedFocusAreaSchema).min(1),
});

export type SyllabusSeed = z.infer<typeof syllabusSeedSchema>;
export type SyllabusSeedItem = z.infer<typeof seedItemSchema>;

export function readSyllabusSeed(file: string = SYLLABUS_SEED_FILE): SyllabusSeed {
  const raw: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  return syllabusSeedSchema.parse(raw);
}

export function seedLeafItems(seed: SyllabusSeed): SyllabusSeedItem[] {
  return seed.focusAreas
    .flatMap((f) => f.subtopics)
    .flatMap((s) => s.items)
    .filter((i) => i.selectable);
}

export function unresolvedItems(seed: SyllabusSeed): SyllabusSeedItem[] {
  return seed.focusAreas
    .flatMap((f) => f.subtopics)
    .flatMap((s) => s.items)
    .filter((i) => !i.verified || i.exactText.includes(UNRESOLVED_TOKEN));
}

/**
 * Guard from the end of reference/syllabus/SYLLABUS_VERIFICATION.md.
 *
 * A provisional seed must never ship silently. In production this throws; in
 * development the unverified items are rendered with a visible marker in the
 * selector instead.
 */
export function assertSeedIsShippable(seed: SyllabusSeed): void {
  const unresolved = unresolvedItems(seed);
  if (unresolved.length > 0 && process.env.NODE_ENV === "production") {
    throw new Error(
      `Syllabus seed is provisional: ${unresolved.length} unverified item(s) ` +
        `(${unresolved.map((i) => i.id).join(", ")}). ` +
        `See reference/syllabus/SYLLABUS_VERIFICATION.md`,
    );
  }
}

export type SyllabusRow = {
  id: string;
  parent_id: string | null;
  level: "focus_area" | "subtopic" | "dot_point";
  focus_area: string;
  exact_text: string;
  including_json: string;
  sort_order: number;
  selectable: 0 | 1;
  verified: 0 | 1;
  note: string | null;
  source_url: string | null;
};

/** Flattens the seed into the rows written to `syllabus_items`. */
export function buildSyllabusRows(seed: SyllabusSeed): SyllabusRow[] {
  const rows: SyllabusRow[] = [];
  let order = 0;

  for (const focusArea of seed.focusAreas) {
    rows.push({
      id: focusArea.id,
      parent_id: null,
      level: "focus_area",
      focus_area: focusArea.id,
      exact_text: focusArea.name,
      including_json: "[]",
      sort_order: order++,
      selectable: 0,
      verified: 1,
      note: null,
      source_url: focusArea.sourceUrl ?? null,
    });

    for (const subtopic of focusArea.subtopics) {
      rows.push({
        id: subtopic.id,
        parent_id: focusArea.id,
        level: "subtopic",
        focus_area: focusArea.id,
        exact_text: subtopic.name,
        including_json: "[]",
        sort_order: order++,
        selectable: 0,
        verified: 1,
        note: null,
        source_url: focusArea.sourceUrl ?? null,
      });

      for (const item of subtopic.items) {
        rows.push({
          id: item.id,
          parent_id: subtopic.id,
          level: "dot_point",
          focus_area: focusArea.id,
          // Verbatim. Never normalise.
          exact_text: item.exactText,
          including_json: JSON.stringify(item.including),
          sort_order: order++,
          selectable: item.selectable ? 1 : 0,
          verified: item.verified ? 1 : 0,
          note: item.note ?? null,
          source_url: item.sourceUrl ?? focusArea.sourceUrl ?? null,
        });
      }
    }
  }

  return rows;
}
