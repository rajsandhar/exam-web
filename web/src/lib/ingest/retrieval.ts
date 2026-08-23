import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { MAX_RETRIEVED_CHUNKS } from "@/lib/config";
import { db, rawQuery } from "@/lib/db/client";
import {
  chunkSyllabusItems,
  referenceChunks,
  referenceSources,
} from "@/lib/db/schema";

/**
 * Lexical retrieval over the reference corpus (CLAUDE.md §16).
 *
 * Postgres full-text search, filtered by the syllabus tags written at
 * ingestion. No vector database — §16 and §21 rule one out, and with a corpus
 * this small, ranked lexical search plus explicit syllabus tagging is both
 * better and simpler.
 *
 * `reference_chunks.search` is a generated `tsvector`, so it cannot fall out of
 * step with the content the way the trigger-maintained FTS5 index it replaced
 * could. Ranking is `ts_rank_cd`, where a higher score is a better match —
 * the opposite sign convention to the `bm25()` this used to call.
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

export async function retrieveChunks(
  query: string,
  options: RetrievalOptions = {},
): Promise<RetrievedChunk[]> {
  const limit = options.limit ?? MAX_RETRIEVED_CHUNKS;
  const match = toSearchQuery(query);
  if (match === "") return [];

  // Every value is bound, never interpolated: the corpus and the syllabus
  // wording that reach this are untrusted text (CLAUDE.md §23).
  const tsquery = sql`to_tsquery('english', ${match})`;

  const filters = [sql`c.search @@ ${tsquery}`];

  if (options.syllabusItemIds && options.syllabusItemIds.length > 0) {
    filters.push(sql`EXISTS (
      SELECT 1 FROM chunk_syllabus_items t
      WHERE t.chunk_id = c.id
        AND t.syllabus_item_id IN ${sql`(${sql.join(
          options.syllabusItemIds.map((id) => sql`${id}`),
          sql`, `,
        )})`}
    )`);
  }

  if (options.sourceTypes && options.sourceTypes.length > 0) {
    filters.push(sql`s.type IN ${sql`(${sql.join(
      options.sourceTypes.map((type) => sql`${type}`),
      sql`, `,
    )})`}`);
  }

  const rows = await rawQuery<Omit<RetrievedChunk, "score"> & { rank: number }>(sql`
    SELECT c.id            AS "id",
           c.source_id     AS "sourceId",
           s.title         AS "sourceTitle",
           s.type          AS "sourceType",
           c.page_or_slide AS "pageOrSlide",
           c.focus_area    AS "focusArea",
           c.content       AS "content",
           ts_rank_cd(c.search, ${tsquery}) AS "rank"
    FROM reference_chunks c
    JOIN reference_sources s ON s.id = c.source_id
    WHERE ${sql.join(filters, sql` AND `)}
    ORDER BY "rank" DESC
    LIMIT ${limit}
  `);

  return rows.map(({ rank, ...row }) => ({ ...row, score: Number(rank) }));
}

/**
 * Retrieves grounding for a set of dot points.
 *
 * Falls back to tag-only lookup when the wording produces no lexical hits,
 * which happens for short dot points whose distinctive terms the notes phrase
 * differently.
 */
export async function retrieveForSyllabusItems(
  items: Array<{ id: string; exactText: string }>,
  options: { limit?: number; sourceTypes?: string[] } = {},
): Promise<RetrievedChunk[]> {
  const limit = options.limit ?? MAX_RETRIEVED_CHUNKS;
  const ids = items.map((item) => item.id);
  const query = items.map((item) => item.exactText).join(" ");

  const hits = await retrieveChunks(query, {
    syllabusItemIds: ids,
    sourceTypes: options.sourceTypes,
    limit,
  });
  if (hits.length >= Math.min(2, limit)) return hits;

  const rows = await db
    .select({
      id: referenceChunks.id,
      sourceId: referenceChunks.sourceId,
      sourceTitle: referenceSources.title,
      sourceType: referenceSources.type,
      pageOrSlide: referenceChunks.pageOrSlide,
      focusArea: referenceChunks.focusArea,
      content: referenceChunks.content,
      weight: sql<number>`max(${chunkSyllabusItems.weight})`.as("weight"),
    })
    .from(chunkSyllabusItems)
    .innerJoin(referenceChunks, eq(referenceChunks.id, chunkSyllabusItems.chunkId))
    .innerJoin(referenceSources, eq(referenceSources.id, referenceChunks.sourceId))
    .where(and(inArray(chunkSyllabusItems.syllabusItemId, ids)))
    .groupBy(
      referenceChunks.id,
      referenceChunks.sourceId,
      referenceSources.title,
      referenceSources.type,
      referenceChunks.pageOrSlide,
      referenceChunks.focusArea,
      referenceChunks.content,
    )
    .orderBy(desc(sql`weight`))
    .limit(limit);

  const seen = new Set(hits.map((h) => h.id));
  for (const { weight, ...row } of rows) {
    if (seen.has(row.id)) continue;
    hits.push({ ...row, score: Number(weight) });
    if (hits.length >= limit) break;
  }
  return hits;
}

/**
 * Turns free text into a `to_tsquery` expression.
 *
 * Every term is normalised to letters and digits and the whole thing is
 * OR-joined. Unquoted input would let corpus text containing `&`, `|`, `!` or
 * `:*` be read as query syntax, and reference text is untrusted
 * (CLAUDE.md §23). The result is still passed as a bound parameter.
 */
export function toSearchQuery(query: string): string {
  const terms = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 4 && !FTS_STOP_WORDS.has(term));

  const unique = [...new Set(terms)].slice(0, 24);
  if (unique.length === 0) return "";
  return unique.join(" | ");
}

/** Common words carry no signal in a corpus this uniform. */
const FTS_STOP_WORDS = new Set([
  "with", "that", "this", "from", "into", "when", "what", "which", "their",
  "there", "these", "those", "have", "been", "were", "will", "would", "should",
  "could", "about", "your", "than", "then", "them", "they", "using", "used",
  "also", "such", "each", "more", "most", "some", "other", "between",
]);
