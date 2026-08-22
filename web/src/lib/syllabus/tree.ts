/**
 * Client-safe syllabus tree types and pure helpers.
 *
 * No node imports here — this module is used by the selector, which is a client
 * component.
 */

export type SyllabusLeaf = {
  id: string;
  /** Verbatim seed wording. Never paraphrase this in the UI. */
  exactText: string;
  including: string[];
  verified: boolean;
  note: string | null;
  sourceUrl: string | null;
};

export type SyllabusSubtopic = {
  id: string;
  name: string;
  items: SyllabusLeaf[];
};

export type SyllabusFocusArea = {
  id: string;
  name: string;
  subtopics: SyllabusSubtopic[];
};

export type SyllabusTree = SyllabusFocusArea[];

export function leavesOf(tree: SyllabusTree): SyllabusLeaf[] {
  return tree.flatMap((f) => f.subtopics).flatMap((s) => s.items);
}

export function leafIdsOf(tree: SyllabusTree): string[] {
  return leavesOf(tree).map((l) => l.id);
}

export function subtopicLeafIds(subtopic: SyllabusSubtopic): string[] {
  return subtopic.items.map((i) => i.id);
}

export function focusAreaLeafIds(focusArea: SyllabusFocusArea): string[] {
  return focusArea.subtopics.flatMap(subtopicLeafIds);
}

export type CheckState = "checked" | "unchecked" | "indeterminate";

/** Tri-state for a parent node given its descendant leaf ids. */
export function parentCheckState(
  leafIds: readonly string[],
  selected: ReadonlySet<string>,
): CheckState {
  if (leafIds.length === 0) return "unchecked";
  let hit = 0;
  for (const id of leafIds) if (selected.has(id)) hit += 1;
  if (hit === 0) return "unchecked";
  if (hit === leafIds.length) return "checked";
  return "indeterminate";
}

/**
 * Case-insensitive fold for search. Deliberately length-preserving — the
 * highlighter maps indices from the folded string back onto the original, so a
 * transformation that changed length (NFKD, whitespace collapsing) would
 * misplace every highlight.
 */
export function normaliseForSearch(value: string): string {
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–/g, "-")
    .toLowerCase();
}

export function leafMatchesQuery(leaf: SyllabusLeaf, query: string): boolean {
  if (query.trim() === "") return true;
  const needle = normaliseForSearch(query.trim());
  if (normaliseForSearch(leaf.exactText).includes(needle)) return true;
  return leaf.including.some((inc) => normaliseForSearch(inc).includes(needle));
}

/**
 * Splits `text` into alternating non-match / match segments for highlighting.
 * Returns a single non-match segment when the query is empty.
 */
export function highlightSegments(
  text: string,
  query: string,
): Array<{ text: string; match: boolean }> {
  const needle = normaliseForSearch(query.trim());
  if (needle === "") return [{ text, match: false }];

  const haystack = normaliseForSearch(text);
  // normaliseForSearch preserves length for the transformations used above,
  // so indices map back to the original string one-for-one.
  const segments: Array<{ text: string; match: boolean }> = [];
  let cursor = 0;
  for (;;) {
    const at = haystack.indexOf(needle, cursor);
    if (at === -1) break;
    if (at > cursor) segments.push({ text: text.slice(cursor, at), match: false });
    segments.push({ text: text.slice(at, at + needle.length), match: true });
    cursor = at + needle.length;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), match: false });
  }
  return segments.length > 0 ? segments : [{ text, match: false }];
}
