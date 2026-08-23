import { MAX_RETRIEVED_CHUNKS } from "@/lib/config";
import { rawSqlite } from "@/lib/db/client";

/**
 * Lexical retrieval over the reference corpus (CLAUDE.md §16).
 *
 * SQLite FTS5 with BM25 ranking, filtered by the syllabus tags written at
 * ingestion. No vector database — §16 and §21 rule one out, and with a corpus
 * this small BM25 plus explicit syllabus tagging is both better and simpler.
 *
 * Retrieval returns a handful of chunks, never the corpus: passing more than
 * about six into a generation call inflates every request for no gain
 * (SPEC_ADDENDUM.md §4).
 */

export type RetrievedChunk = {
  id: string;
  sourceId: string;
  sourceTitle: string;
  sourceType: string;
  pageOrSlide: string | null;
  focusArea: string | null;
  content: string;
  score: number;
};

export type RetrievalOptions = {
  /** Restrict to chunks tagged with at least one of these dot points. */
  syllabusItemIds?: string[];
  sourceTypes?: string[];
  limit?: number;
};

export function retrieveChunks(
  query: string,
  options: RetrievalOptions = {},
): RetrievedChunk[] {
  const limit = options.limit ?? MAX_RETRIEVED_CHUNKS;
  const match = toFtsQuery(query);
  if (match === "") return [];

  const sqlite = rawSqlite();
  const params: unknown[] = [match];

  let sql = `
    SELECT c.id            AS id,
           c.source_id     AS sourceId,
           s.title         AS sourceTitle,
           s.type          AS sourceType,
           c.page_or_slide AS pageOrSlide,
           c.focus_area    AS focusArea,
           c.content       AS content,
           bm25(reference_chunks_fts) AS rank
    FROM reference_chunks_fts f
    JOIN reference_chunks c ON c.id = f.chunk_id
    JOIN reference_sources s ON s.id = c.source_id
    WHERE reference_chunks_fts MATCH ?
  `;

  if (options.syllabusItemIds && options.syllabusItemIds.length > 0) {
    sql += ` AND EXISTS (
      SELECT 1 FROM chunk_syllabus_items t
      WHERE t.chunk_id = c.id
        AND t.syllabus_item_id IN (${options.syllabusItemIds.map(() => "?").join(",")})
    )`;
    params.push(...options.syllabusItemIds);
  }

  if (options.sourceTypes && options.sourceTypes.length > 0) {
    sql += ` AND s.type IN (${options.sourceTypes.map(() => "?").join(",")})`;
    params.push(...options.sourceTypes);
  }

  // bm25() returns a negative score where more negative is a better match.
  sql += " ORDER BY rank LIMIT ?";
  params.push(limit);

  const rows = sqlite.prepare(sql).all(...params) as Array<
    Omit<RetrievedChunk, "score"> & { rank: number }
  >;

  return rows.map(({ rank, ...row }) => ({ ...row, score: -rank }));
}

/**
 * Retrieves grounding for a set of dot points.
 *
 * Falls back to tag-only lookup when the wording produces no lexical hits,
 * which happens for short dot points whose distinctive terms the notes phrase
 * differently.
 */
export function retrieveForSyllabusItems(
  items: Array<{ id: string; exactText: string }>,
  options: { limit?: number; sourceTypes?: string[] } = {},
): RetrievedChunk[] {
  const limit = options.limit ?? MAX_RETRIEVED_CHUNKS;
  const ids = items.map((item) => item.id);
  const query = items.map((item) => item.exactText).join(" ");

  const hits = retrieveChunks(query, {
    syllabusItemIds: ids,
    sourceTypes: options.sourceTypes,
    limit,
  });
  if (hits.length >= Math.min(2, limit)) return hits;

  const sqlite = rawSqlite();
  const rows = sqlite
    .prepare(
      `SELECT c.id AS id, c.source_id AS sourceId, s.title AS sourceTitle,
              s.type AS sourceType, c.page_or_slide AS pageOrSlide,
              c.focus_area AS focusArea, c.content AS content,
              MAX(t.weight) AS weight
       FROM chunk_syllabus_items t
       JOIN reference_chunks c ON c.id = t.chunk_id
       JOIN reference_sources s ON s.id = c.source_id
       WHERE t.syllabus_item_id IN (${ids.map(() => "?").join(",")})
       GROUP BY c.id
       ORDER BY weight DESC
       LIMIT ?`,
    )
    .all(...ids, limit) as Array<Omit<RetrievedChunk, "score"> & { weight: number }>;

  const seen = new Set(hits.map((h) => h.id));
  for (const { weight, ...row } of rows) {
    if (seen.has(row.id)) continue;
    hits.push({ ...row, score: weight });
    if (hits.length >= limit) break;
  }
  return hits;
}

/**
 * Turns free text into an FTS5 MATCH expression.
 *
 * Every term is quoted and the whole thing is OR-joined: unquoted input would
 * let corpus text containing `NEAR`, `*` or a bare `-` be read as query syntax,
 * and reference text is untrusted (CLAUDE.md §23).
 */
export function toFtsQuery(query: string): string {
  const terms = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 4 && !FTS_STOP_WORDS.has(term));

  const unique = [...new Set(terms)].slice(0, 24);
  if (unique.length === 0) return "";
  return unique.map((term) => `"${term}"`).join(" OR ");
}

const FTS_STOP_WORDS = new Set([
  "with", "that", "this", "from", "into", "when", "what", "which", "their",
  "there", "these", "those", "have", "been", "were", "will", "would", "should",
  "could", "about", "your", "than", "then", "them", "they", "using", "used",
  "also", "such", "each", "more", "most", "some", "other", "between",
]);
