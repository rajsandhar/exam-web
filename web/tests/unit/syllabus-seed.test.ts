import { describe, expect, it } from "vitest";

import {
  buildSyllabusRows,
  readSyllabusSeed,
  seedLeafItems,
  UNRESOLVED_TOKEN,
  unresolvedItems,
} from "@/lib/syllabus/seed";

const seed = readSyllabusSeed();
const rows = buildSyllabusRows(seed);

/** The file as supplied, before the confirmed wording is applied. */
const rawSeed = readSyllabusSeed(undefined, { applyResolvedTerms: false });

describe("Year 12 syllabus seed", () => {
  it("contains exactly 4 focus areas, 12 subtopics and 73 selectable dot points", () => {
    expect(rows.filter((r) => r.level === "focus_area")).toHaveLength(4);
    expect(rows.filter((r) => r.level === "subtopic")).toHaveLength(12);
    expect(rows.filter((r) => r.selectable === 1)).toHaveLength(73);
    expect(seedLeafItems(seed)).toHaveLength(73);
  });

  it("covers only the four Year 12 focus areas", () => {
    expect(seed.focusAreas.map((f) => f.id).sort()).toEqual([
      "auto",
      "proj",
      "pwa",
      "ssa",
    ]);
  });

  it("never contains UNRESOLVED text on an item claiming to be verified", () => {
    for (const row of rows) {
      if (row.exact_text.includes(UNRESOLVED_TOKEN)) {
        expect(
          row.verified,
          `${row.id} contains ${UNRESOLVED_TOKEN} but is marked verified`,
        ).toBe(0);
      }
    }
  });

  it("records that the supplied file left 15 items unresolved", () => {
    expect(unresolvedItems(rawSeed)).toHaveLength(15);
    expect(rawSeed.counts.unverifiedItems).toBe(15);
  });

  it("resolves all 15 from wording confirmed against the live NESA pages", () => {
    expect(unresolvedItems(seed)).toHaveLength(0);
    for (const row of rows) {
      expect(row.exact_text).not.toContain(UNRESOLVED_TOKEN);
      expect(row.verified).toBe(1);
    }
  });

  it("uses the confirmed term, not the guess, where the two differed", () => {
    // SYLLABUS_VERIFICATION.md guessed "NoSQL"; the live page says otherwise.
    const orm = rows.find((r) => r.id === "pwa.2.14");
    expect(orm?.exact_text).toBe("Compare Object-Relational Mapping (ORM) to SQL");

    // Two glossary terms in one dot point.
    const innovative = rows.find((r) => r.id === "proj.3.8");
    expect(innovative?.exact_text).toBe(
      "Propose an additional innovative solution using a prototype and user interface (UI) design",
    );
  });

  it("uses stable dotted IDs parented to their subtopic and focus area", () => {
    for (const row of rows.filter((r) => r.level === "dot_point")) {
      expect(row.id).toMatch(/^[a-z]+\.\d+\.\d+$/);
      expect(row.parent_id).toBe(row.id.split(".").slice(0, 2).join("."));
      expect(row.focus_area).toBe(row.id.split(".")[0]);
    }
  });

  it("preserves seed wording verbatim, including curly quotes and casing", () => {
    const ssa23 = rows.find((r) => r.id === "ssa.2.3");
    expect(ssa23?.exact_text).toContain("\u2018security by design\u2019");
    for (const row of rows) {
      expect(row.exact_text).toBe(row.exact_text.trim());
      expect(row.exact_text.length).toBeGreaterThan(0);
    }
  });

  it("stores `including` sub-items on the parent rather than as leaves", () => {
    const ssa11 = rows.find((r) => r.id === "ssa.1.1");
    expect(JSON.parse(ssa11?.including_json ?? "[]")).toEqual([
      "data protection",
      "minimising cyber attacks and vulnerabilities",
    ]);
    expect(rows.some((r) => r.id.split(".").length > 3)).toBe(false);
  });
});
