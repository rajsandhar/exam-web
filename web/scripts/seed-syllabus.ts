/**
 * Seeds the Year 12 syllabus hierarchy from the supplied JSON.
 *
 *   pnpm db:seed
 *
 * Never fetches curriculum.nsw.edu.au — that page lazy-loads glossary terms and
 * a server-side fetch receives the literal string "Loading" in place of real
 * syllabus words. See reference/syllabus/SYLLABUS_VERIFICATION.md.
 */
import "./load-env";

import { count, eq, notInArray } from "drizzle-orm";

import { db } from "../src/lib/db/client";
import { syllabusItems } from "../src/lib/db/schema";
import {
  assertSeedIsShippable,
  readSyllabusSeed,
  syllabusInsertRows,
  unresolvedItems,
} from "../src/lib/syllabus/seed";

async function main(): Promise<void> {
  const seed = readSyllabusSeed();
  assertSeedIsShippable(seed);
  const values = syllabusInsertRows(seed);

  await db.transaction(async (tx) => {
    for (const value of values) {
      await tx
        .insert(syllabusItems)
        .values(value)
        .onConflictDoUpdate({ target: syllabusItems.id, set: value });
    }

    // Keep a re-seed authoritative: drop anything the seed no longer contains.
    await tx
      .delete(syllabusItems)
      .where(notInArray(syllabusItems.id, values.map((v) => v.id)));
  });

  const [focusAreas] = await db
    .select({ n: count() })
    .from(syllabusItems)
    .where(eq(syllabusItems.level, "focus_area"));
  const [subtopics] = await db
    .select({ n: count() })
    .from(syllabusItems)
    .where(eq(syllabusItems.level, "subtopic"));
  const [dotPoints] = await db
    .select({ n: count() })
    .from(syllabusItems)
    .where(eq(syllabusItems.selectable, true));

  const counts = {
    focusAreas: focusAreas?.n ?? 0,
    subtopics: subtopics?.n ?? 0,
    dotPoints: dotPoints?.n ?? 0,
  };

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

main().catch((cause) => {
  process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}
`);
  process.exit(1);
});
