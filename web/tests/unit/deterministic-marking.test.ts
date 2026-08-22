import { describe, expect, it } from "vitest";

import fixture from "@/lib/ai/fixtures/fixture-paper.json";
import { markDeterministically } from "@/lib/marking/deterministic";
import { generatedPaperSchema } from "@/lib/schemas/question";
import type { AnswerKey, ResponsePayload } from "@/lib/schemas/renderers";

const paper = generatedPaperSchema.parse(fixture);
const allParts = paper.groups.flatMap((g) => g.parts);

function partOf(rendererType: string) {
  const part = allParts.find((p) => p.rendererType === rendererType);
  if (!part) throw new Error(`fixture has no ${rendererType} question`);
  return part;
}

function mark(
  rendererType: string,
  config: unknown,
  answerKey: AnswerKey,
  response: ResponsePayload | null,
  marks: number,
) {
  return markDeterministically(rendererType, config, answerKey, response, marks);
}

describe("single_choice", () => {
  const part = partOf("single_choice");
  const key = part.answerKey!;
  if (key.rendererType !== "single_choice") throw new Error("wrong key");

  it("awards full marks for the correct option", () => {
    const result = mark(
      "single_choice",
      part.config,
      key,
      { rendererType: "single_choice", optionId: key.correctOptionId },
      part.marks,
    );
    expect(result).toMatchObject({ awardedMarks: part.marks, correct: true });
  });

  it("awards zero for an incorrect option", () => {
    const wrong = (part.config as { options: Array<{ id: string }> }).options.find(
      (o) => o.id !== key.correctOptionId,
    )!;
    const result = mark(
      "single_choice",
      part.config,
      key,
      { rendererType: "single_choice", optionId: wrong.id },
      part.marks,
    );
    expect(result).toMatchObject({ awardedMarks: 0, correct: false });
  });

  it("awards zero and says so when nothing was selected", () => {
    const result = mark(
      "single_choice",
      part.config,
      key,
      { rendererType: "single_choice", optionId: null },
      part.marks,
    );
    expect(result).toMatchObject({ awardedMarks: 0, detail: "No response given." });
  });

  it("returns null when there is no response row at all", () => {
    const result = mark("single_choice", part.config, key, null, part.marks);
    expect(result?.awardedMarks).toBe(0);
  });
});

describe("multi_select net scoring", () => {
  const part = partOf("multi_select");
  const key = part.answerKey!;
  if (key.rendererType !== "multi_select") throw new Error("wrong key");
  const options = (part.config as { options: Array<{ id: string }> }).options;
  const wrongIds = options
    .map((o) => o.id)
    .filter((id) => !key.correctOptionIds.includes(id));

  const run = (optionIds: string[]) =>
    mark(
      "multi_select",
      part.config,
      key,
      { rendererType: "multi_select", optionIds },
      part.marks,
    );

  it("awards full marks for exactly the correct set", () => {
    expect(run(key.correctOptionIds)).toMatchObject({
      awardedMarks: part.marks,
      correct: true,
    });
  });

  it("awards partial marks for one correct and nothing incorrect", () => {
    const result = run([key.correctOptionIds[0]!]);
    expect(result?.awardedMarks).toBe(1);
    expect(result?.correct).toBe(false);
  });

  it("cancels a correct selection against an incorrect one", () => {
    expect(run([key.correctOptionIds[0]!, wrongIds[0]!])?.awardedMarks).toBe(0);
  });

  it("awards zero when every option is selected", () => {
    expect(run(options.map((o) => o.id))?.awardedMarks).toBe(0);
  });

  it("awards zero for only incorrect selections", () => {
    expect(run([wrongIds[0]!])?.awardedMarks).toBe(0);
  });

  it("awards zero and reports no response for an empty selection", () => {
    expect(run([])).toMatchObject({ awardedMarks: 0, detail: "No response given." });
  });

  it("never exceeds the maximum marks", () => {
    const result = run(key.correctOptionIds);
    expect(result!.awardedMarks).toBeLessThanOrEqual(part.marks);
  });
});

describe("ordering", () => {
  const config = {
    items: [
      { id: "a", text: "Requirements" },
      { id: "b", text: "Design" },
      { id: "c", text: "Development" },
      { id: "d", text: "Testing" },
    ],
  };
  const key: AnswerKey = {
    rendererType: "ordering",
    correctOrder: ["a", "b", "c", "d"],
    explanation: "Standard sequence.",
  };

  it("awards full marks for the exact order", () => {
    const result = mark(
      "ordering",
      config,
      key,
      { rendererType: "ordering", order: ["a", "b", "c", "d"] },
      3,
    );
    expect(result).toMatchObject({ awardedMarks: 3, correct: true });
  });

  it("gives partial credit for a partly correct order, never full", () => {
    const result = mark(
      "ordering",
      config,
      key,
      { rendererType: "ordering", order: ["a", "b", "d", "c"] },
      3,
    );
    expect(result?.awardedMarks).toBe(1);
    expect(result?.awardedMarks).toBeLessThan(3);
  });

  it("awards zero for a completely reversed order", () => {
    const result = mark(
      "ordering",
      config,
      key,
      { rendererType: "ordering", order: ["d", "c", "b", "a"] },
      3,
    );
    expect(result?.awardedMarks).toBe(0);
  });
});

describe("matching_matrix", () => {
  const config = {
    rows: [
      { id: "r1", text: "HTTPS" },
      { id: "r2", text: "SMTP" },
    ],
    columns: [
      { id: "c1", text: "443" },
      { id: "c2", text: "25" },
    ],
    mode: "single" as const,
  };
  const key: AnswerKey = {
    rendererType: "matching_matrix",
    matches: { r1: ["c1"], r2: ["c2"] },
    explanation: "Default ports.",
  };

  it("awards full marks when every row is right", () => {
    const result = mark(
      "matching_matrix",
      config,
      key,
      { rendererType: "matching_matrix", matches: { r1: ["c1"], r2: ["c2"] } },
      2,
    );
    expect(result).toMatchObject({ awardedMarks: 2, correct: true });
  });

  it("awards partial marks for one correct row", () => {
    const result = mark(
      "matching_matrix",
      config,
      key,
      { rendererType: "matching_matrix", matches: { r1: ["c1"], r2: ["c1"] } },
      2,
    );
    expect(result?.awardedMarks).toBe(1);
  });

  it("treats an over-selected row as incorrect", () => {
    const result = mark(
      "matching_matrix",
      config,
      key,
      { rendererType: "matching_matrix", matches: { r1: ["c1", "c2"], r2: ["c2"] } },
      2,
    );
    expect(result?.awardedMarks).toBe(1);
    expect(result?.correct).toBe(false);
  });
});

describe("dropdown_completion", () => {
  const config = {
    layout: "code" as const,
    segments: [
      { kind: "text" as const, text: "SELECT " },
      {
        kind: "blank" as const,
        blankId: "b1",
        options: [
          { id: "o1", text: "name" },
          { id: "o2", text: "COUNT(*)" },
        ],
      },
      { kind: "text" as const, text: " FROM members WHERE " },
      {
        kind: "blank" as const,
        blankId: "b2",
        options: [
          { id: "p1", text: "state = 'NSW'" },
          { id: "p2", text: "state == 'NSW'" },
        ],
      },
    ],
  };
  const key: AnswerKey = {
    rendererType: "dropdown_completion",
    blanks: { b1: "o1", b2: "p1" },
    explanation: "SQL uses a single equals sign.",
  };

  it("awards full marks when every blank is right", () => {
    const result = mark(
      "dropdown_completion",
      config,
      key,
      { rendererType: "dropdown_completion", blanks: { b1: "o1", b2: "p1" } },
      2,
    );
    expect(result).toMatchObject({ awardedMarks: 2, correct: true });
  });

  it("gives partial credit for one correct blank", () => {
    const result = mark(
      "dropdown_completion",
      config,
      key,
      { rendererType: "dropdown_completion", blanks: { b1: "o1", b2: "p2" } },
      2,
    );
    expect(result?.awardedMarks).toBe(1);
  });

  it("reports no response when every blank is empty", () => {
    const result = mark(
      "dropdown_completion",
      config,
      key,
      { rendererType: "dropdown_completion", blanks: { b1: null, b2: null } },
      2,
    );
    expect(result).toMatchObject({ awardedMarks: 0, detail: "No response given." });
  });
});

describe("table_response", () => {
  const config = {
    columns: [
      { id: "input", header: "Test data", editable: false },
      { id: "output", header: "Expected output", editable: true },
    ],
    rows: [
      { id: "r1", fixed: { input: "-1" } },
      { id: "r2", fixed: { input: "0" } },
    ],
  };
  const key: AnswerKey = {
    rendererType: "table_response",
    cells: {
      "r1.output": { accepted: ["Invalid"] },
      "r2.output": { accepted: ["Valid", "OK"] },
    },
    explanation: "Boundary cases.",
  };

  it("awards full marks when every editable cell matches", () => {
    const result = mark(
      "table_response",
      config,
      key,
      {
        rendererType: "table_response",
        cells: { "r1.output": "Invalid", "r2.output": "OK" },
      },
      2,
    );
    expect(result).toMatchObject({ awardedMarks: 2, correct: true });
  });

  it("ignores case and surrounding whitespace by default", () => {
    const result = mark(
      "table_response",
      config,
      key,
      {
        rendererType: "table_response",
        cells: { "r1.output": "  invalid ", "r2.output": "valid" },
      },
      2,
    );
    expect(result?.awardedMarks).toBe(2);
  });

  it("gives partial credit for one correct cell", () => {
    const result = mark(
      "table_response",
      config,
      key,
      {
        rendererType: "table_response",
        cells: { "r1.output": "Invalid", "r2.output": "wrong" },
      },
      2,
    );
    expect(result?.awardedMarks).toBe(1);
  });
});

describe("marker boundaries", () => {
  it("refuses to mark a renderer whose key is for something else", () => {
    const part = partOf("single_choice");
    const result = markDeterministically(
      "multi_select",
      part.config,
      part.answerKey,
      { rendererType: "multi_select", optionIds: [] },
      1,
    );
    expect(result).toBeNull();
  });

  it("declines rubric-marked renderers", () => {
    const part = partOf("rich_text_response");
    const result = markDeterministically(
      "rich_text_response",
      part.config,
      part.answerKey,
      { rendererType: "rich_text_response", html: "<p>An answer.</p>" },
      6,
    );
    expect(result).toBeNull();
  });

  it("awards only whole marks", () => {
    const part = partOf("multi_select");
    const key = part.answerKey!;
    if (key.rendererType !== "multi_select") throw new Error("wrong key");
    for (const optionIds of [[], key.correctOptionIds, [key.correctOptionIds[0]!]]) {
      const result = mark(
        "multi_select",
        part.config,
        key,
        { rendererType: "multi_select", optionIds },
        part.marks,
      );
      expect(Number.isInteger(result!.awardedMarks)).toBe(true);
    }
  });
});
