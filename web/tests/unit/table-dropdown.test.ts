import { describe, expect, it } from "vitest";

import fixture from "@/lib/ai/fixtures/fixture-paper.json";
import { markDeterministically } from "@/lib/marking/deterministic";
import {
  generatedPaperSchema,
  validateAnswerKeyAgainstConfig,
  type QuestionPartForMarking,
} from "@/lib/schemas/question";
import {
  emptyResponse,
  isAnswered,
  tableDropdownConfigSchema,
  type AnswerKey,
  type ResponsePayload,
} from "@/lib/schemas/renderers";

/**
 * The table-of-dropdowns renderer.
 *
 * This is the format NESA papers lean on hardest for objective marks — matching
 * situations to techniques, completing a data dictionary, pairing features with
 * concepts — so both halves matter: resolving which cells are dropdowns at all,
 * and marking only those.
 */

const paper = generatedPaperSchema.parse(fixture);
const part = paper.groups
  .flatMap((group) => group.parts)
  .find((candidate) => candidate.rendererType === "table_dropdown");

if (!part) throw new Error("fixture has no table_dropdown question");
const key = part.answerKey;
if (!key || key.rendererType !== "table_dropdown") throw new Error("wrong key");

const correct: ResponsePayload = {
  rendererType: "table_dropdown",
  cells: { ...key.cells },
};

function mark(response: ResponsePayload | null, marks = part!.marks) {
  return markDeterministically("table_dropdown", part!.config, key as AnswerKey, response, marks);
}

describe("marking", () => {
  it("awards full marks when every dropdown is right", () => {
    expect(mark(correct)).toMatchObject({ awardedMarks: part.marks, correct: true });
  });

  it("gives nothing for no response at all", () => {
    expect(mark({ rendererType: "table_dropdown", cells: {} })).toMatchObject({
      awardedMarks: 0,
      correct: false,
      detail: "No response given.",
    });
    expect(mark(null)).toMatchObject({ awardedMarks: 0 });
  });

  it("gives partial credit, floored and never full marks", () => {
    const refs = Object.keys(key.cells);
    // All but one correct must still fall short of full marks.
    const nearly: ResponsePayload = {
      rendererType: "table_dropdown",
      cells: { ...key.cells, [refs[0]!]: "definitely-not-the-answer" },
    };

    const result = mark(nearly);
    expect(result?.correct).toBe(false);
    expect(result?.awardedMarks).toBeLessThan(part.marks);
    expect(result?.awardedMarks).toBeGreaterThanOrEqual(0);
  });

  it("scores zero when every choice is wrong", () => {
    const allWrong: ResponsePayload = {
      rendererType: "table_dropdown",
      cells: Object.fromEntries(Object.keys(key.cells).map((ref) => [ref, "wrong"])),
    };
    expect(mark(allWrong)).toMatchObject({ awardedMarks: 0, correct: false });
  });

  it("compares by option id, so wording never changes the mark", () => {
    const config = tableDropdownConfigSchema.parse(part.config);
    const firstRef = Object.keys(key.cells)[0]!;
    const [rowId, columnId] = firstRef.split(".");
    const row = config.rows.find((r) => r.id === rowId);
    const column = config.columns.find((c) => c.id === columnId);
    const options = row?.options?.[columnId!] ?? column?.options ?? [];
    const chosen = options.find((option) => option.id === key.cells[firstRef]);

    // Answering with the visible text rather than the id must not score.
    const byText: ResponsePayload = {
      rendererType: "table_dropdown",
      cells: { ...key.cells, [firstRef]: chosen!.text },
    };
    expect(mark(byText)?.correct).toBe(false);
  });

  it("ignores cells the key does not mention, so fixed cells cost nothing", () => {
    const withExtra: ResponsePayload = {
      rendererType: "table_dropdown",
      cells: { ...key.cells, "r1.situation": "something the student cannot even edit" },
    };
    expect(mark(withExtra)).toMatchObject({ awardedMarks: part.marks, correct: true });
  });
});

describe("response state", () => {
  it("starts empty and counts as unanswered", () => {
    const blank = emptyResponse("table_dropdown");
    expect(blank).toEqual({ rendererType: "table_dropdown", cells: {} });
    expect(isAnswered(blank!)).toBe(false);
  });

  it("counts as answered once one dropdown is set", () => {
    expect(
      isAnswered({ rendererType: "table_dropdown", cells: { "r1.technique": "x" } }),
    ).toBe(true);
  });

  it("treats a cleared dropdown as unanswered", () => {
    expect(
      isAnswered({ rendererType: "table_dropdown", cells: { "r1.technique": null } }),
    ).toBe(false);
  });
});

/** Builds a part carrying just enough for the config/key validator. */
function partWith(config: unknown, cells: Record<string, string>): QuestionPartForMarking {
  return {
    ...(part as QuestionPartForMarking),
    config: config as QuestionPartForMarking["config"],
    answerKey: { rendererType: "table_dropdown", cells, explanation: "because" },
  };
}

describe("answer key must match the table it belongs to", () => {
  const config = {
    columns: [
      { id: "situation", header: "Situation" },
      {
        id: "technique",
        header: "Technique",
        options: [
          { id: "a", text: "Alpha" },
          { id: "b", text: "Beta" },
        ],
      },
    ],
    rows: [
      { id: "r1", fixed: { situation: "First" } },
      // Its own option list, and no shared column list to fall back on.
      {
        id: "r2",
        fixed: { situation: "Second" },
        options: {
          technique: [
            { id: "c", text: "Gamma" },
            { id: "d", text: "Delta" },
          ],
        },
      },
    ],
  };

  it("accepts a key covering every dropdown with a valid option", () => {
    const issues = validateAnswerKeyAgainstConfig(
      partWith(config, { "r1.technique": "a", "r2.technique": "d" }),
    );
    expect(issues).toEqual([]);
  });

  it("rejects a per-row option list being answered from the column list", () => {
    // "a" belongs to the column's shared list, which row 2 overrides.
    const issues = validateAnswerKeyAgainstConfig(
      partWith(config, { "r1.technique": "a", "r2.technique": "a" }),
    );
    expect(issues.map((issue) => issue.message).join(" ")).toContain("not one of its options");
  });

  it("rejects a key that leaves a dropdown unanswered", () => {
    const issues = validateAnswerKeyAgainstConfig(partWith(config, { "r1.technique": "a" }));
    expect(issues.map((issue) => issue.message).join(" ")).toContain("has no answer");
  });

  it("rejects a key pointing at a fixed cell", () => {
    const issues = validateAnswerKeyAgainstConfig(
      partWith(config, {
        "r1.technique": "a",
        "r2.technique": "d",
        "r1.situation": "a",
      }),
    );
    expect(issues.map((issue) => issue.message).join(" ")).toContain("non-dropdown cell");
  });

  it("rejects a table with nothing to answer", () => {
    const inert = {
      columns: [
        { id: "situation", header: "Situation" },
        { id: "note", header: "Note" },
      ],
      rows: [{ id: "r1", fixed: { situation: "First", note: "Fixed" } }],
    };
    const issues = validateAnswerKeyAgainstConfig(partWith(inert, {}));
    expect(issues.map((issue) => issue.message).join(" ")).toContain("no dropdown cells");
  });
});

describe("the fixture question itself", () => {
  it("is internally consistent", () => {
    expect(validateAnswerKeyAgainstConfig(part as QuestionPartForMarking)).toEqual([]);
  });

  it("resolves a dropdown for every answered cell", () => {
    const config = tableDropdownConfigSchema.parse(part.config);
    for (const ref of Object.keys(key.cells)) {
      const [rowId, columnId] = ref.split(".");
      const row = config.rows.find((r) => r.id === rowId);
      const column = config.columns.find((c) => c.id === columnId);
      expect(row, `row ${rowId} exists`).toBeDefined();
      expect(row?.options?.[columnId!] ?? column?.options).toBeDefined();
    }
  });
});
