/**
 * Seeds the Year 12 syllabus hierarchy from the supplied JSON.
 *
 *   pnpm db:seed
 *
 * Never fetches curriculum.nsw.edu.au — that page lazy-loads glossary terms and
 * a server-side fetch receives the literal string "Loading" in place of real
 * syllabus words. See reference/syllabus/SYLLABUS_VERIFICATION.md.
 */
import Database from "better-sqlite3";

import { ensureDataDir, resolveDatabaseFile } from "../src/lib/paths";
import {
  assertSeedIsShippable,
  buildSyllabusRows,
  readSyllabusSeed,
  unresolvedItems,
} from "../src/lib/syllabus/seed";

function main(): void {
  const seed = readSyllabusSeed();
  assertSeedIsShippable(seed);
  const rows = buildSyllabusRows(seed);

  ensureDataDir();
  const sqlite = new Database(resolveDatabaseFile());
  sqlite.pragma("foreign_keys = ON");

  const insert = sqlite.prepare(`
    INSERT INTO syllabus_items
      (id, parent_id, level, focus_area, exact_text, including_json,
       sort_order, selectable, verified, note, source_url)
    VALUES
      (@id, @parent_id, @level, @focus_area, @exact_text, @including_json,
       @sort_order, @selectable, @verified, @note, @source_url)
    ON CONFLICT(id) DO UPDATE SET
      parent_id      = excluded.parent_id,
      level          = excluded.level,
      focus_area     = excluded.focus_area,
      exact_text     = excluded.exact_text,
      including_json = excluded.including_json,
      sort_order     = excluded.sort_order,
      selectable     = excluded.selectable,
      verified       = excluded.verified,
      note           = excluded.note,
      source_url     = excluded.source_url
  `);

  const seedIds = new Set(rows.map((r) => r.id));
  sqlite.transaction(() => {
    for (const row of rows) insert.run(row);
    // Keep a re-seed authoritative: drop anything the seed no longer contains.
    const existing = sqlite
      .prepare("SELECT id FROM syllabus_items")
      .all() as Array<{ id: string }>;
    const remove = sqlite.prepare("DELETE FROM syllabus_items WHERE id = ?");
    for (const { id } of existing) if (!seedIds.has(id)) remove.run(id);
  })();

  const counts = sqlite
    .prepare(
      `SELECT
         SUM(level = 'focus_area') AS focusAreas,
         SUM(level = 'subtopic')   AS subtopics,
         SUM(selectable = 1)       AS dotPoints
       FROM syllabus_items`,
    )
    .get() as { focusAreas: number; subtopics: number; dotPoints: number };

  sqlite.close();

  process.stdout.write(
    `Seeded syllabus: ${counts.focusAreas} focus areas, ` +
      `${counts.subtopics} subtopics, ${counts.dotPoints} selectable dot points.\n`,
  );

  const unresolved = unresolvedItems(seed);
  if (unresolved.length > 0) {
    process.stdout.write(
      `\n  PROVISIONAL SEED: ${unresolved.length} item(s) are unverified and are\n` +
        `  marked in the selector. Resolve them per\n` +
        `  reference/syllabus/SYLLABUS_VERIFICATION.md before this ships.\n` +
        `  ${unresolved.map((i) => i.id).join(", ")}\n`,
    );
  }
}

main();
