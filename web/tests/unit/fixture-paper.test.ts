import { describe, expect, it } from "vitest";

import fixture from "@/lib/ai/fixtures/fixture-paper.json";
import { MockAiProvider } from "@/lib/ai/mock-provider";
import { validatePaper } from "@/lib/schemas/paper-validation";
import { generatedPaperSchema } from "@/lib/schemas/question";
import { IMPLEMENTED_RENDERERS } from "@/lib/schemas/renderers";

const paper = generatedPaperSchema.parse(fixture);
const result = validatePaper(paper, { availableRenderers: IMPLEMENTED_RENDERERS });

describe("fixture paper", () => {
  it("parses against the question schemas", () => {
    expect(paper.groups.length).toBeGreaterThan(20);
  });

  it("passes every Stage D validator with no issues", () => {
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("totals exactly 100 marks", () => {
    const total = paper.groups.reduce((sum, g) => sum + g.totalMarks, 0);
    expect(total).toBe(100);
    expect(result.stats.totalMarks).toBe(100);
  });

  it("splits marks approximately 25 objective / 75 constructed", () => {
    expect(result.stats.objectiveMarks).toBe(25);
    expect(result.stats.constructedMarks).toBe(75);
  });

  it("meets the official item-count ranges", () => {
    expect(result.stats.objectiveItems).toBeGreaterThanOrEqual(18);
    expect(result.stats.objectiveItems).toBeLessThanOrEqual(23);
    expect(result.stats.constructedItems).toBeGreaterThanOrEqual(20);
    expect(result.stats.constructedItems).toBeLessThanOrEqual(23);
    expect(result.stats.extendedItems).toBeGreaterThanOrEqual(4);
  });

  it("uses every renderer implemented in this build", () => {
    const used = new Set(
      paper.groups.flatMap((g) => g.parts.map((p) => p.rendererType)),
    );
    for (const renderer of IMPLEMENTED_RENDERERS) {
      expect(used, `missing a ${renderer} question`).toContain(renderer);
    }
  });

  it("includes a multipart group with a shared stimulus", () => {
    const multipart = paper.groups.filter(
      (g) => g.kind === "multipart_group" && g.stimulus !== null && g.parts.length > 1,
    );
    expect(multipart.length).toBeGreaterThan(0);
  });

  it("includes at least two questions worth 4-8 marks", () => {
    const extended = paper.groups
      .flatMap((g) => g.parts)
      .filter((p) => p.marks >= 4 && p.marks <= 8);
    expect(extended.length).toBeGreaterThanOrEqual(2);
  });

  it("gives every responsive part a real answer key and marking guideline", () => {
    for (const group of paper.groups) {
      for (const part of group.parts) {
        if (part.marks === 0) continue;
        expect(part.answerKey, `${part.id} has no answer key`).not.toBeNull();
        expect(part.markingGuideline, `${part.id} has no guideline`).not.toBeNull();
        expect(part.markingGuideline?.criteria.length ?? 0).toBeGreaterThan(0);
      }
    }
  });
});

describe("mock provider", () => {
  it("returns the fixture paper and reports unassessed selected items", async () => {
    const stages: string[] = [];
    const generated = await new MockAiProvider().generatePaper({
      selectedSyllabusItemIds: ["ssa.2.7", "proj.3.5"],
      onProgress: (p) => stages.push(p.stage),
    });

    expect(generated.totalMarks).toBe(100);
    expect(generated.unassessedSyllabusItemIds).toEqual(["proj.3.5"]);
    expect(stages).toContain("generating_questions");
    expect(stages.at(-1)).toBe("finalising_marking");
  });
});
