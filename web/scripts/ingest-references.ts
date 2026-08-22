/**
 * Ingests the reference corpus into SQLite + FTS5.
 *
 *   pnpm ingest:references
 *
 * Reads from `../reference` (read-only) and writes only to the local database.
 * Deterministic: no model reads the corpus (CLAUDE.md §16). All extracted text
 * is treated as untrusted data (CLAUDE.md §23).
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { ARCHETYPES, countArchetypeSignals } from "../src/lib/ingest/archetypes";
import { chunkSections } from "../src/lib/ingest/chunk";
import { parseDocument } from "../src/lib/ingest/parsers";
import { buildItemTerms, tagChunk } from "../src/lib/ingest/tag-syllabus";
import { ensureDataDir, REFERENCE_DIR, resolveDatabaseFile } from "../src/lib/paths";
import { readSyllabusSeed, seedLeafItems } from "../src/lib/syllabus/seed";

type SourceType = "notes" | "past_paper" | "marking_guide" | "syllabus" | "ui_reference";

const PARSEABLE = new Set([".pdf", ".docx", ".pptx", ".md", ".txt"]);

/**
 * Project meta-documentation, not course material. Ingesting it would let build
 * instructions surface as retrieved "notes" during question generation.
 */
const EXCLUDED = new Set([
  "SOURCE_MAP.md",
  "syllabus/SYLLABUS_VERIFICATION.md",
  "ui/README.md",
]);

/** Focus area inferred from the folder the file sits in. */
const FOCUS_AREA_BY_FOLDER: Array<[RegExp, string]> = [
  [/01_SSA/i, "ssa"],
  [/02_PWA/i, "pwa"],
  [/03_Automation/i, "auto"],
  [/04_Project_Theory_Notes/i, "proj"],
];

function classify(relativePath: string): SourceType {
  const p = relativePath.replace(/\\/g, "/").toLowerCase();
  if (p.startsWith("past-papers/")) return "past_paper";
  if (p.startsWith("syllabus/")) return "syllabus";
  if (p.startsWith("ui/")) return "ui_reference";
  return "notes";
}

function focusAreaOf(relativePath: string): string | null {
  for (const [pattern, id] of FOCUS_AREA_BY_FOLDER) {
    if (pattern.test(relativePath)) return id;
  }
  // Files that sit directly under notes/ cover more than one focus area.
  return null;
}

function walk(dir: string, base = dir): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // reference/notes/05_Revision/ is empty; an empty directory is skipped
      // rather than treated as an error.
      files.push(...walk(full, base));
    } else if (PARSEABLE.has(path.extname(entry.name).toLowerCase())) {
      const relative = path.relative(base, full).split(path.sep).join("/");
      if (!EXCLUDED.has(relative)) files.push(relative);
    }
  }
  return files.sort();
}

async function main(): Promise<void> {
  if (!fs.existsSync(REFERENCE_DIR)) {
    throw new Error(`Reference corpus not found at ${REFERENCE_DIR}`);
  }

  const seed = readSyllabusSeed();
  const itemTerms = buildItemTerms(seedLeafItems(seed));

  ensureDataDir();
  const sqlite = new Database(resolveDatabaseFile());
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const files = walk(REFERENCE_DIR);
  process.stdout.write(`Ingesting ${files.length} file(s) from ${REFERENCE_DIR}\n\n`);

  const insertSource = sqlite.prepare(`
    INSERT INTO reference_sources
      (id, type, file_path, title, focus_area, ingested_at, byte_size, content_hash)
    VALUES (@id, @type, @file_path, @title, @focus_area, @ingested_at, @byte_size, @content_hash)
    ON CONFLICT(file_path) DO UPDATE SET
      type = excluded.type, title = excluded.title, focus_area = excluded.focus_area,
      ingested_at = excluded.ingested_at, byte_size = excluded.byte_size,
      content_hash = excluded.content_hash
  `);
  const deleteChunks = sqlite.prepare("DELETE FROM reference_chunks WHERE source_id = ?");
  const insertChunk = sqlite.prepare(`
    INSERT INTO reference_chunks
      (id, source_id, chunk_index, page_or_slide, focus_area, content, metadata_json)
    VALUES (@id, @source_id, @chunk_index, @page_or_slide, @focus_area, @content, @metadata_json)
  `);
  const insertTag = sqlite.prepare(`
    INSERT OR REPLACE INTO chunk_syllabus_items (chunk_id, syllabus_item_id, weight)
    VALUES (?, ?, ?)
  `);

  let totalChunks = 0;
  let totalTags = 0;
  let binderCorpus = "";

  for (const relative of files) {
    const absolute = path.join(REFERENCE_DIR, relative);
    const type = classify(relative);
    const stats = fs.statSync(absolute);

    let parsed;
    try {
      parsed = await parseDocument(absolute);
    } catch (cause) {
      process.stdout.write(
        `  ! ${relative}: could not be parsed (${
          cause instanceof Error ? cause.message : String(cause)
        })\n`,
      );
      continue;
    }

    if (parsed.sections.length === 0) {
      process.stdout.write(`  - ${relative}: no extractable text, skipped\n`);
      continue;
    }

    const chunks = chunkSections(parsed.sections);
    const sourceId = createHash("sha1").update(relative).digest("hex").slice(0, 16);
    const focusArea = focusAreaOf(relative);

    if (type === "past_paper") {
      binderCorpus += parsed.sections.map((s) => s.text).join("\n");
    }

    sqlite.transaction(() => {
      insertSource.run({
        id: sourceId,
        type,
        file_path: relative.replace(/\\/g, "/"),
        title: path.basename(relative, path.extname(relative)),
        focus_area: focusArea,
        ingested_at: Date.now(),
        byte_size: stats.size,
        content_hash: createHash("sha1")
          .update(parsed.sections.map((s) => s.text).join("\n"))
          .digest("hex"),
      });

      deleteChunks.run(sourceId);

      for (const chunk of chunks) {
        const chunkId = `${sourceId}:${chunk.chunkIndex}`;
        insertChunk.run({
          id: chunkId,
          source_id: sourceId,
          chunk_index: chunk.chunkIndex,
          page_or_slide: chunk.pageOrSlide,
          focus_area: focusArea,
          content: chunk.content,
          metadata_json: JSON.stringify({ sourceType: type, file: relative }),
        });

        // Marking guidelines carry the assessment style, not course content, so
        // they are not tagged to dot points.
        const tags = tagChunk(chunk.content, itemTerms);
        for (const tag of tags) {
          insertTag.run(chunkId, tag.syllabusItemId, tag.weight);
          totalTags += 1;
        }
      }
    })();

    totalChunks += chunks.length;
    process.stdout.write(
      `  ${type.padEnd(11)} ${relative.replace(/\\/g, "/").padEnd(70)} ${String(
        chunks.length,
      ).padStart(4)} chunks\n`,
    );
  }

  // Archetype library (CLAUDE.md §17). Assessment grammar only — the signal
  // strings are used to count occurrences and are never persisted.
  const counts = countArchetypeSignals(binderCorpus);
  const insertArchetype = sqlite.prepare(`
    INSERT INTO archetypes
      (id, label, renderer_type, stimulus_type, typical_marks_json, command_verbs_json,
       cognitive_demand, multipart, transformation_pattern, marking_structure,
       topic_suitability_json, observed_count)
    VALUES (@id, @label, @renderer_type, @stimulus_type, @typical_marks_json,
            @command_verbs_json, @cognitive_demand, @multipart, @transformation_pattern,
            @marking_structure, @topic_suitability_json, @observed_count)
    ON CONFLICT(id) DO UPDATE SET
      label = excluded.label, renderer_type = excluded.renderer_type,
      stimulus_type = excluded.stimulus_type, typical_marks_json = excluded.typical_marks_json,
      command_verbs_json = excluded.command_verbs_json,
      cognitive_demand = excluded.cognitive_demand, multipart = excluded.multipart,
      transformation_pattern = excluded.transformation_pattern,
      marking_structure = excluded.marking_structure,
      topic_suitability_json = excluded.topic_suitability_json,
      observed_count = excluded.observed_count
  `);

  sqlite.transaction(() => {
    for (const archetype of ARCHETYPES) {
      insertArchetype.run({
        id: archetype.id,
        label: archetype.label,
        renderer_type: archetype.rendererType,
        stimulus_type: archetype.stimulusType,
        typical_marks_json: JSON.stringify(archetype.typicalMarks),
        command_verbs_json: JSON.stringify(archetype.commandVerbs),
        cognitive_demand: archetype.cognitiveDemand,
        multipart: archetype.multipart ? 1 : 0,
        transformation_pattern: archetype.transformationPattern,
        marking_structure: archetype.markingStructure,
        topic_suitability_json: JSON.stringify(archetype.topicSuitability),
        observed_count: counts.get(archetype.id) ?? 0,
      });
    }
  })();

  const taggedItems = sqlite
    .prepare("SELECT COUNT(DISTINCT syllabus_item_id) AS n FROM chunk_syllabus_items")
    .get() as { n: number };

  sqlite.close();

  process.stdout.write(
    `\n${totalChunks} chunks, ${totalTags} syllabus tags covering ` +
      `${taggedItems.n} of 73 dot points, ${ARCHETYPES.length} archetypes.\n`,
  );
}

main().catch((cause: unknown) => {
  process.stderr.write(`${cause instanceof Error ? cause.stack : String(cause)}\n`);
  process.exitCode = 1;
});
