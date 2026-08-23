import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { syllabusItems } from "@/lib/db/schema";
import type {
  SyllabusFocusArea,
  SyllabusLeaf,
  SyllabusSubtopic,
  SyllabusTree,
} from "@/lib/syllabus/tree";

/**
 * Loads the full Year 12 hierarchy in seed order.
 *
 * `exactText` is returned verbatim — the selector renders official wording and
 * must not paraphrase, trim or re-case it.
 */
export function getSyllabusTree(): SyllabusTree {
  const rows = db
    .select()
    .from(syllabusItems)
    .orderBy(asc(syllabusItems.sortOrder))
    .all();

  const focusAreas = new Map<string, SyllabusFocusArea>();
  const subtopics = new Map<string, SyllabusSubtopic>();

  for (const row of rows) {
    if (row.level === "focus_area") {
      focusAreas.set(row.id, { id: row.id, name: row.exactText, subtopics: [] });
    }
  }
  for (const row of rows) {
    if (row.level !== "subtopic") continue;
    const subtopic: SyllabusSubtopic = {
      id: row.id,
      name: row.exactText,
      items: [],
    };
    subtopics.set(row.id, subtopic);
    focusAreas.get(row.focusArea)?.subtopics.push(subtopic);
  }
  for (const row of rows) {
    if (row.level !== "dot_point" || !row.selectable) continue;
    const leaf: SyllabusLeaf = {
      id: row.id,
      exactText: row.exactText,
      including: row.includingJson,
      verified: row.verified,
      note: row.note,
      sourceUrl: row.sourceUrl,
    };
    if (row.parentId) subtopics.get(row.parentId)?.items.push(leaf);
  }

  return [...focusAreas.values()];
}

/** Every selectable dot point id, in seed order. */
export function getSelectableLeafIds(): string[] {
  return db
    .select({ id: syllabusItems.id })
    .from(syllabusItems)
    .where(eq(syllabusItems.selectable, true))
    .orderBy(asc(syllabusItems.sortOrder))
    .all()
    .map((r) => r.id);
}

/** Map of leaf id → exact wording, for results and provenance display. */
export function getSyllabusTextById(): Map<string, string> {
  const rows = db
    .select({ id: syllabusItems.id, exactText: syllabusItems.exactText })
    .from(syllabusItems)
    .all();
  return new Map(rows.map((r) => [r.id, r.exactText]));
}
