/**
 * Ingests the reference corpus into SQLite + FTS5.
 *
 *   pnpm ingest:references
 *
 * Reads from `../reference` (read-only) and writes only to the local database.
 * Deterministic: no model reads the corpus (CLAUDE.md §16). All extracted text
 * is treated as untrusted data (CLAUDE.md §23).
 */
import "./load-env";

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { countDistinct, eq } from "drizzle-orm";

import { ARCHETYPES, countArchetypeSignals } from "../src/lib/ingest/archetypes";
import { chunkSections } from "../src/lib/ingest/chunk";
import { parseDocument } from "../src/lib/ingest/parsers";
import { buildItemTerms, tagChunk } from "../src/lib/ingest/tag-syllabus";
import { db } from "../src/lib/db/client";
import {
  archetypes as archetypesTable,
  chunkSyllabusItems,
  referenceChunks,
  referenceSources,
} from "../src/lib/db/schema";
import { REFERENCE_DIR } from "../src/lib/paths";
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

  const files = walk(REFERENCE_DIR);
  process.stdout.write(`Ingesting ${files.length} file(s) from ${REFERENCE_DIR}\n\n`);

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

    const source = {
      id: sourceId,
      type,
      filePath: relative.replace(/\\/g, "/"),
      title: path.basename(relative, path.extname(relative)),
      focusArea,
      ingestedAt: new Date(),
      byteSize: stats.size,
      contentHash: createHash("sha1")
        .update(parsed.sections.map((section) => section.text).join("\n"))
        .digest("hex"),
    };

    await db.transaction(async (tx) => {
      await tx
        .insert(referenceSources)
        .values(source)
        .onConflictDoUpdate({ target: referenceSources.filePath, set: source });

      await tx.delete(referenceChunks).where(eq(referenceChunks.sourceId, sourceId));

      for (const chunk of chunks) {
        const chunkId = `${sourceId}:${chunk.chunkIndex}`;
        await tx.insert(referenceChunks).values({
          id: chunkId,
          sourceId,
          chunkIndex: chunk.chunkIndex,
          pageOrSlide: chunk.pageOrSlide,
          focusArea,
          content: chunk.content,
          metadataJson: { sourceType: type, file: relative },
        });

        // Marking guidelines carry the assessment style, not course content, so
        // they are not tagged to dot points.
        for (const tag of tagChunk(chunk.content, itemTerms)) {
          await tx
            .insert(chunkSyllabusItems)
            .values({
              chunkId,
              syllabusItemId: tag.syllabusItemId,
              weight: tag.weight,
            })
            .onConflictDoNothing();
          totalTags += 1;
        }
      }
    });

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
  await db.transaction(async (tx) => {
    for (const archetype of ARCHETYPES) {
      const row = {
        id: archetype.id,
        label: archetype.label,
        rendererType: archetype.rendererType,
        stimulusType: archetype.stimulusType,
        typicalMarksJson: archetype.typicalMarks,
        commandVerbsJson: archetype.commandVerbs,
        cognitiveDemand: archetype.cognitiveDemand,
        multipart: archetype.multipart ?? false,
        transformationPattern: archetype.transformationPattern ?? null,
        markingStructure: archetype.markingStructure,
        topicSuitabilityJson: archetype.topicSuitability,
        observedCount: counts.get(archetype.id) ?? 0,
      };
      await tx
        .insert(archetypesTable)
        .values(row)
        .onConflictDoUpdate({ target: archetypesTable.id, set: row });
    }
  });

  const [tagged] = await db
    .select({ n: countDistinct(chunkSyllabusItems.syllabusItemId) })
    .from(chunkSyllabusItems);
  const taggedItems = { n: tagged?.n ?? 0 };

  process.stdout.write(
    `\n${totalChunks} chunks, ${totalTags} syllabus tags covering ` +
      `${taggedItems.n} of 73 dot points, ${ARCHETYPES.length} archetypes.\n`,
  );
}

main().catch((cause: unknown) => {
  process.stderr.write(`${cause instanceof Error ? cause.stack : String(cause)}\n`);
  process.exitCode = 1;
});
