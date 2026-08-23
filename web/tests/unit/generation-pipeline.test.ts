import { describe, expect, it } from "vitest";

import {
  archetypeItemPairs,
  blueprintSchema,
  overlapWithPrevious,
  validateBlueprint,
  type Blueprint,
} from "@/lib/ai/blueprint";
import { planCoverage, type CoverageHistoryEntry } from "@/lib/ai/coverage";
import { shouldCritique } from "@/lib/ai/critic";
import { freshDomains, isScenarioDomain, SCENARIO_DOMAINS } from "@/lib/ai/scenario-domains";
import { ARCHETYPES } from "@/lib/ingest/archetypes";
import { IMPLEMENTED_RENDERERS } from "@/lib/schemas/renderers";
import type { QuestionGroupForMarking } from "@/lib/schemas/question";

/* --------------------------------------------------------------- coverage */

const leaves = (n: number, prefix = "ssa") =>
  Array.from({ length: n }, (_, i) => `${prefix}.1.${i + 1}`);

describe("coverage sampling (SPEC_ADDENDUM §2)", () => {
  it("assesses every leaf at or below the full-coverage threshold", () => {
    const selected = leaves(25);
    const plan = planCoverage(selected, [], 1);
    expect(plan.mode).toBe("full");
    expect(plan.assess).toEqual([...selected].sort());
    expect(plan.skip).toEqual([]);
  });

  it("samples above the threshold and keeps at least 80% coverage", () => {
    const selected = leaves(73);
    const plan = planCoverage(selected, [], 1);
    expect(plan.mode).toBe("sampled");
    expect(plan.assess.length / selected.length).toBeGreaterThanOrEqual(0.8);
    expect(plan.assess.length + plan.skip.length).toBe(selected.length);
  });

  it("records what it skipped so the results screen can show it", () => {
    const plan = planCoverage(leaves(73), [], 7);
    expect(plan.skip.length).toBeGreaterThan(0);
    for (const id of plan.skip) expect(plan.assess).not.toContain(id);
  });

  it("weights never-assessed items above frequently-assessed ones", () => {
    const history: CoverageHistoryEntry[] = [
      { syllabusItemId: "ssa.1.1", timesAssessed: 9, timesSelected: 9, lastAssessedAt: Date.now() },
      { syllabusItemId: "ssa.1.2", timesAssessed: 0, timesSelected: 3, lastAssessedAt: null },
    ];
    const plan = planCoverage(["ssa.1.1", "ssa.1.2"], history, 1);
    expect(plan.weights["ssa.1.2"]!).toBeGreaterThan(plan.weights["ssa.1.1"]!);
  });

  it("is reproducible for a given seed and varies across seeds", () => {
    const a = planCoverage(leaves(73), [], 42).assess;
    const b = planCoverage(leaves(73), [], 42).assess;
    const c = planCoverage(leaves(73), [], 43).assess;
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("de-duplicates a selection containing repeats", () => {
    const plan = planCoverage(["ssa.1.1", "ssa.1.1", "ssa.1.2"], [], 1);
    expect(plan.assess).toEqual(["ssa.1.1", "ssa.1.2"]);
  });
});

/* -------------------------------------------------------------- blueprint */

const ITEMS = ["ssa.1.1", "ssa.1.2", "ssa.2.1", "proj.1.3"];

function objectiveGroup(position: number, marks = 1): Blueprint["groups"][number] {
  return {
    position,
    totalMarks: marks,
    section: "objective",
    kind: "single",
    layout: "single",
    cognitiveDemand: "application",
    archetypeId: "objective-scenario-classify",
    scenarioDomain: "retail-inventory",
    stimulusType: "none",
    designNote: "A short scenario followed by a classification against a taxonomy.",
    integratesMultipleItems: false,
    syllabusItemIds: ["ssa.1.1"],
    parts: [
      {
        label: null,
        marks,
        rendererType: "single_choice",
        assessmentPurpose: "Classify the described approach against the taxonomy.",
        syllabusItemIds: ["ssa.1.1"],
      },
    ],
  };
}

function constructedGroup(
  position: number,
  marks: number,
  itemId = "ssa.1.2",
): Blueprint["groups"][number] {
  return {
    position,
    totalMarks: marks,
    section: "constructed",
    kind: "single",
    layout: "split",
    cognitiveDemand: "evaluation",
    archetypeId: "scenario-extended-response",
    scenarioDomain: "healthcare-records",
    stimulusType: "text",
    designNote: "A realistic scenario the student must analyse and reach a judgement on.",
    integratesMultipleItems: false,
    syllabusItemIds: [itemId],
    parts: [
      {
        label: null,
        marks,
        rendererType: "rich_text_response",
        assessmentPurpose: "Reach a supported judgement about the described approach.",
        commandVerb: "evaluate",
        syllabusItemIds: [itemId],
      },
    ],
  };
}

/** A blueprint that satisfies every hard rule. */
function validBlueprint(): Blueprint {
  const groups: Blueprint["groups"] = [];
  let position = 1;

  // 21 objective items totalling 25 marks: 17 × 1 + 4 × 2.
  for (let i = 0; i < 17; i += 1) groups.push(objectiveGroup(position++, 1));
  for (let i = 0; i < 4; i += 1) groups.push(objectiveGroup(position++, 2));

  // 21 constructed items totalling 75 marks, 9 of them worth 4–8.
  const marks = [6, 6, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 1, 1];
  marks.forEach((m, index) => {
    groups.push(constructedGroup(position++, m, ITEMS[index % ITEMS.length]!));
  });

  return { title: "Software Engineering — Trial Examination", groups };
}

const options = {
  assessableItemIds: ITEMS,
  availableRenderers: IMPLEMENTED_RENDERERS,
  knownArchetypeIds: ARCHETYPES.map((a) => a.id),
  coverageMode: "sampled" as const,
};

describe("blueprint validation (SPEC_ADDENDUM §1)", () => {
  it("accepts a blueprint that meets every rule", () => {
    const blueprint = blueprintSchema.parse(validBlueprint());
    expect(validateBlueprint(blueprint, options)).toEqual([]);
  });

  it("rejects a paper that does not total exactly 100 marks", () => {
    const blueprint = validBlueprint();
    blueprint.groups[0]!.totalMarks = 2;
    blueprint.groups[0]!.parts[0]!.marks = 2;
    const messages = validateBlueprint(blueprint, options).map((i) => i.message);
    expect(messages.join(" ")).toContain("totals 101 marks");
  });

  it("rejects too few objective items even when the marks are right", () => {
    const blueprint = validBlueprint();
    // Collapse ten 1-mark items into five 2-mark items: the objective section
    // still totals 25 marks, but only 16 items carry it.
    blueprint.groups.splice(
      0,
      10,
      ...Array.from({ length: 5 }, (_, i) => objectiveGroup(i + 1, 2)),
    );
    blueprint.groups.forEach((group, index) => {
      group.position = index + 1;
    });
    const messages = validateBlueprint(blueprint, options).map((i) => i.message);
    expect(messages.join(" ")).toContain("objective items; the specification requires");
  });

  it("rejects a paper with fewer than four items worth 4-8 marks", () => {
    const blueprint = validBlueprint();
    for (const group of blueprint.groups) {
      if (group.section !== "constructed") continue;
      if (group.totalMarks >= 4) {
        group.totalMarks = 3;
        group.parts[0]!.marks = 3;
      }
    }
    const messages = validateBlueprint(blueprint, options).map((i) => i.message);
    expect(messages.join(" ")).toContain("worth 4–8 marks");
  });

  it("rejects an objective item worth more than four marks", () => {
    const blueprint = validBlueprint();
    blueprint.groups[0]!.totalMarks = 5;
    blueprint.groups[0]!.parts[0]!.marks = 5;
    const messages = validateBlueprint(blueprint, options).map((i) => i.message);
    expect(messages.join(" ")).toContain("the specification allows 1–4");
  });

  it("rejects a question assessing content outside the coverage plan", () => {
    const blueprint = validBlueprint();
    blueprint.groups[0]!.syllabusItemIds = ["auto.3.1"];
    blueprint.groups[0]!.parts[0]!.syllabusItemIds = ["auto.3.1"];
    const messages = validateBlueprint(blueprint, options).map((i) => i.message);
    expect(messages.join(" ")).toContain("not in the coverage plan");
  });

  it("rejects a response type the planner was not told about", () => {
    const blueprint = validBlueprint();
    blueprint.groups[21]!.parts[0]!.rendererType = "diagram_builder";
    // Every renderer ships, so availability is exercised by narrowing the list
    // the planner is given — which is exactly how a partial build behaves.
    const messages = validateBlueprint(blueprint, {
      ...options,
      availableRenderers: ["single_choice", "rich_text_response"],
    }).map((i) => i.message);
    expect(messages.join(" ")).toContain("this build cannot display");
  });

  it("rejects an unknown archetype", () => {
    const blueprint = validBlueprint();
    blueprint.groups[0]!.archetypeId = "made-up-archetype";
    const messages = validateBlueprint(blueprint, options).map((i) => i.message);
    expect(messages.join(" ")).toContain("unknown archetype");
  });

  it("requires every planned item to be assessed in full-coverage mode", () => {
    const blueprint = validBlueprint();
    const messages = validateBlueprint(blueprint, {
      ...options,
      assessableItemIds: [...ITEMS, "auto.1.1"],
      coverageMode: "full",
    }).map((i) => i.message);
    expect(messages.join(" ")).toContain("auto.1.1 is in the coverage plan");
  });

  it("rejects a group whose part marks do not sum to its total", () => {
    const blueprint = validBlueprint();
    blueprint.groups[21]!.parts[0]!.marks = 1;
    const messages = validateBlueprint(blueprint, options).map((i) => i.message);
    expect(messages.join(" ")).toContain("part marks total 1");
  });
});

/* ---------------------------------------------------------------- novelty */

describe("novelty (SPEC_ADDENDUM §3)", () => {
  it("uses a fixed scenario-domain vocabulary the model cannot extend", () => {
    expect(SCENARIO_DOMAINS.length).toBeGreaterThanOrEqual(18);
    expect(isScenarioDomain("healthcare-records")).toBe(true);
    expect(isScenarioDomain("something-the-model-invented")).toBe(false);
  });

  it("suggests domains the recent papers did not use", () => {
    const recent = ["healthcare-records", "school-timetabling", "retail-inventory"];
    const fresh = freshDomains(recent, 5);
    expect(fresh).not.toContain("healthcare-records");
    expect(fresh.every((domain) => isScenarioDomain(domain))).toBe(true);
  });

  it("measures overlap of archetype and syllabus-item pairs", () => {
    const blueprint = blueprintSchema.parse(validBlueprint());
    const pairs = archetypeItemPairs(blueprint);
    expect(overlapWithPrevious(pairs, pairs)).toBe(1);
    expect(overlapWithPrevious(pairs, new Set())).toBe(0);

    const half = new Set([...pairs].slice(0, Math.floor(pairs.size / 2)));
    const overlap = overlapWithPrevious(pairs, half);
    expect(overlap).toBeGreaterThan(0.3);
    expect(overlap).toBeLessThan(0.6);
  });
});

/* ----------------------------------------------------------------- critic */

function group(
  section: "objective" | "constructed",
  marks: number,
  rendererType = "rich_text_response",
): QuestionGroupForMarking {
  return {
    id: "g1",
    position: 1,
    totalMarks: marks,
    section,
    kind: "single",
    layout: "single",
    stimulus: null,
    cognitiveDemand: "application",
    syllabusItemIds: ["ssa.1.1"],
    sourceReferences: [],
    generationMetadata: { provider: "anthropic", promptVersion: "test" },
    parts: [
      {
        id: "p1",
        label: null,
        marks,
        rendererType: rendererType as QuestionGroupForMarking["parts"][number]["rendererType"],
        prompt: "Prompt",
        config: {},
        syllabusItemIds: ["ssa.1.1"],
        answerKey: null,
        markingGuideline: null,
      },
    ],
  };
}

describe("critic sampling (SPEC_ADDENDUM §4)", () => {
  it("always critiques constructed responses worth 3 or more marks", () => {
    expect(shouldCritique(group("constructed", 6), 0, () => 1)).toBe(true);
    expect(shouldCritique(group("constructed", 3), 0, () => 1)).toBe(true);
  });

  it("always critiques anything with executable content", () => {
    expect(shouldCritique(group("objective", 1, "python_editor"), 0, () => 1)).toBe(true);
    expect(shouldCritique(group("constructed", 2, "sql_editor"), 0, () => 1)).toBe(true);
  });

  it("samples low-value objective items rather than critiquing all of them", () => {
    expect(shouldCritique(group("objective", 1), 0.25, () => 0.9)).toBe(false);
    expect(shouldCritique(group("objective", 1), 0.25, () => 0.1)).toBe(true);
  });
});
