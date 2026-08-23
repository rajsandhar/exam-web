import { describe, expect, it } from "vitest";

import { ARCHETYPES, countArchetypeSignals } from "@/lib/ingest/archetypes";
import { chunkSections } from "@/lib/ingest/chunk";
import { toFtsQuery } from "@/lib/ingest/retrieval";
import { buildItemTerms, tagChunk } from "@/lib/ingest/tag-syllabus";
import { readSyllabusSeed, seedLeafItems } from "@/lib/syllabus/seed";

const leaves = seedLeafItems(readSyllabusSeed());
const terms = buildItemTerms(leaves);

describe("chunking", () => {
  it("keeps a short section as a single chunk", () => {
    const chunks = chunkSections([{ pageOrSlide: "p1", text: "A short note." }]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe("A short note.");
    expect(chunks[0]?.pageOrSlide).toBe("p1");
  });

  it("splits long text and keeps every chunk within the size cap", () => {
    const paragraph = "Defensive input handling validates and sanitises data. ".repeat(20);
    const text = Array.from({ length: 12 }, () => paragraph).join("\n\n");
    const chunks = chunkSections([{ pageOrSlide: null, text }]);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(2400);
      expect(chunk.content.trim()).not.toBe("");
    }
  });

  it("numbers chunks contiguously from zero", () => {
    const text = "Paragraph about secure design.\n\n".repeat(200);
    const chunks = chunkSections([
      { pageOrSlide: "p1", text },
      { pageOrSlide: "p2", text },
    ]);
    expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
  });

  it("skips empty sections without producing empty chunks", () => {
    const chunks = chunkSections([
      { pageOrSlide: "p1", text: "   \n\n  " },
      { pageOrSlide: "p2", text: "Real content." },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.pageOrSlide).toBe("p2");
  });
});

describe("syllabus tagging", () => {
  it("tags a chunk to the dot point whose terminology it uses", () => {
    const tags = tagChunk(
      "Input validation and sanitisation are defensive data input handling practices. " +
        "Error handling should not leak stack traces to the user.",
      terms,
    );
    expect(tags.map((t) => t.syllabusItemId)).toContain("ssa.2.7");
  });

  it("prefers the more specific dot point when several could match", () => {
    const tags = tagChunk(
      "Cross-site scripting (XSS) and cross-site request forgery (CSRF) are user action " +
        "control vulnerabilities, alongside broken authentication and session management.",
      terms,
    );
    expect(tags[0]?.syllabusItemId).toBe("ssa.2.10");
  });

  it("does not tag generic prose to anything", () => {
    expect(tagChunk("This page is intentionally left blank.", terms)).toEqual([]);
  });

  it("never returns more than four tags for one chunk", () => {
    const everything = leaves.map((l) => l.exactText).join(" ");
    expect(tagChunk(everything, terms).length).toBeLessThanOrEqual(4);
  });

  it("weights the strongest match at 1", () => {
    const tags = tagChunk(
      "Machine learning dataset source bias reflects human bias in the training data.",
      terms,
    );
    expect(tags.length).toBeGreaterThan(0);
    expect(tags[0]?.weight).toBe(1);
  });
});

describe("FTS query building", () => {
  it("quotes every term so corpus text cannot inject query syntax", () => {
    expect(toFtsQuery("secure NEAR design")).toBe('"secure" OR "near" OR "design"');
  });

  it("strips operators that would otherwise change the query", () => {
    expect(toFtsQuery('inject" OR chunk_id : *')).toBe('"inject" OR "chunk"');
  });

  it("returns an empty query when nothing is searchable", () => {
    expect(toFtsQuery("a of to")).toBe("");
    expect(toFtsQuery("!!! ***")).toBe("");
  });

  it("drops duplicates and caps the term count", () => {
    const query = toFtsQuery(Array.from({ length: 60 }, (_, i) => `term${i}`).join(" "));
    expect(query.split(" OR ")).toHaveLength(24);
    expect(toFtsQuery("secure secure secure")).toBe('"secure"');
  });
});

describe("archetype library", () => {
  it("stores assessment grammar rather than question wording", () => {
    for (const archetype of ARCHETYPES) {
      expect(archetype.markingStructure.length).toBeGreaterThan(0);
      expect(archetype.commandVerbs.length).toBeGreaterThan(0);
      expect(archetype.typicalMarks.length).toBeGreaterThan(0);
      // A stored field long enough to be a question stem would be a copied item.
      expect(archetype.label.length).toBeLessThan(80);
      expect(archetype.transformationPattern?.length ?? 0).toBeLessThan(80);
    }
  });

  it("counts occurrences of a pattern in the corpus", () => {
    const counts = countArchetypeSignals(
      "Which implementation method was used? Later: which implementation method applies?",
    );
    expect(counts.get("objective-scenario-classify")).toBe(2);
    expect(counts.get("sql-dropdown-reconstruction")).toBe(0);
  });

  it("covers every renderer the specification asks archetypes for", () => {
    const renderers = new Set(ARCHETYPES.map((a) => a.rendererType));
    for (const expected of [
      "single_choice",
      "multi_select",
      "ordering",
      "matching_matrix",
      "dropdown_completion",
      "table_response",
      "rich_text_response",
      "diagram_builder",
    ]) {
      expect(renderers, `no archetype uses ${expected}`).toContain(expected);
    }
  });

  it("uses unique ids", () => {
    const ids = ARCHETYPES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
