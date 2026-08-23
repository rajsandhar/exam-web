import { describe, expect, it } from "vitest";

import fixture from "@/lib/ai/fixtures/fixture-paper.json";
import { VARIETY_RULES } from "@/lib/config";
import { validatePaper } from "@/lib/schemas/paper-validation";
import { generatedPaperSchema, type GeneratedPaper } from "@/lib/schemas/question";
import { IMPLEMENTED_RENDERERS } from "@/lib/schemas/renderers";

/**
 * How varied the objective section is.
 *
 * Measured from the 2025 HSC paper, whose objective marks are spread across five
 * response types with the largest carrying 36%. A paper that leans on one format
 * is worse than one that does not — but it is still a hundred marks of usable
 * questions, so this must warn and never fail. Turning it into an error would
 * throw a whole paper away over a matter of style.
 */

const paper = generatedPaperSchema.parse(fixture);

function validate(subject: GeneratedPaper) {
  return validatePaper(subject, { availableRenderers: IMPLEMENTED_RENDERERS });
}

/** Rewrites every objective response part to one renderer. */
function withObjectiveRenderer(renderer: "single_choice"): GeneratedPaper {
  const template = paper.groups
    .flatMap((group) => group.parts)
    .find((part) => part.rendererType === renderer)!;

  return {
    ...paper,
    groups: paper.groups.map((group) =>
      group.section !== "objective"
        ? group
        : {
            ...group,
            parts: group.parts.map((part) => ({
              ...part,
              rendererType: template.rendererType,
              config: template.config,
              answerKey: template.answerKey,
            })),
          },
    ),
  };
}

describe("measuring the mix", () => {
  it("reports objective marks by response type", () => {
    const { stats } = validate(paper);

    const measured = Object.values(stats.objectiveRendererMarks).reduce(
      (total, marks) => total + marks,
      0,
    );
    expect(measured).toEqual(stats.objectiveMarks);
    expect(Object.keys(stats.objectiveRendererMarks).length).toBeGreaterThan(1);
  });

  it("counts the table-of-dropdowns question, the format real papers use most", () => {
    const { stats } = validate(paper);
    expect(stats.objectiveRendererMarks.table_dropdown).toBeGreaterThan(0);
  });
});

describe("warnings", () => {
  it("flags a paper whose objective section is one response type", () => {
    const monotonous = validate(withObjectiveRenderer("single_choice"));

    // Still a valid paper — that is the point.
    expect(monotonous.ok).toBe(true);
    expect(monotonous.issues).toEqual([]);

    const text = monotonous.warnings.map((warning) => warning.message).join(" ");
    expect(text).toContain("single_choice");
    expect(text).toContain("response type");
  });

  it("never turns a variety warning into a validation failure", () => {
    const monotonous = validate(withObjectiveRenderer("single_choice"));
    expect(monotonous.warnings.length).toBeGreaterThan(0);
    expect(monotonous.ok).toBe(true);
  });

  it("uses a threshold a real paper would pass", () => {
    // The 2025 paper's largest objective format carries 36% of objective marks,
    // so the threshold has to sit above that or it would flag the real thing.
    expect(VARIETY_RULES.maxObjectiveShare).toBeGreaterThan(0.36);
    expect(VARIETY_RULES.minObjectiveRendererTypes).toBeLessThanOrEqual(5);
  });
});

describe("the sample paper", () => {
  it("is still valid, whatever its mix", () => {
    const result = validate(paper);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("records its warnings rather than hiding them", () => {
    const result = validate(paper);
    // The sample leans on multiple choice more than a real paper does. That is
    // worth seeing, and worth not pretending otherwise.
    for (const warning of result.warnings) {
      expect(warning.message.length).toBeGreaterThan(0);
      expect(warning.path).toEqual("paper");
    }
  });
});
