import { describe, expect, it } from "vitest";

import fixture from "@/lib/ai/fixtures/fixture-paper.json";
import {
  generatedPaperSchema,
  questionPartForMarkingSchema,
  questionPartForStudentSchema,
  toStudentGroup,
  toStudentPart,
  validateQuestionGroup,
  type QuestionPartForMarking,
} from "@/lib/schemas/question";
import {
  emptyResponse,
  isAnswered,
  IMPLEMENTED_RENDERERS,
  isDeterministic,
  isResponsive,
  rendererConfigSchemas,
} from "@/lib/schemas/renderers";

const paper = generatedPaperSchema.parse(fixture);

describe("renderer fixtures parse", () => {
  it("parses a valid config for every implemented renderer type", () => {
    for (const renderer of IMPLEMENTED_RENDERERS) {
      const part = paper.groups
        .flatMap((g) => g.parts)
        .find((p) => p.rendererType === renderer);
      expect(part, `no fixture question uses ${renderer}`).toBeDefined();
      const parsed = rendererConfigSchemas[renderer].safeParse(part?.config);
      expect(parsed.success, `${renderer} config invalid: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });

  it("parses a valid answer key for every renderer that has one", () => {
    for (const group of paper.groups) {
      for (const part of group.parts) {
        const reparsed = questionPartForMarkingSchema.safeParse(part);
        expect(reparsed.success, `${part.id} failed to reparse`).toBe(true);
      }
    }
  });
});

describe("answer-key containment (SPEC_ADDENDUM §7)", () => {
  const markingPart: QuestionPartForMarking = paper.groups[21]!.parts[1]!;

  it("the student schema rejects an object carrying an answer key", () => {
    const result = questionPartForStudentSchema.safeParse(markingPart);
    expect(result.success).toBe(false);
    const rejected = result.error?.issues.flatMap((issue) =>
      issue.code === "unrecognized_keys" ? issue.keys : [],
    );
    expect(rejected).toContain("answerKey");
    expect(rejected).toContain("markingGuideline");
  });

  it("toStudentPart produces an object with no key-bearing field", () => {
    const student = toStudentPart(markingPart);
    expect(questionPartForStudentSchema.safeParse(student).success).toBe(true);
    expect(Object.keys(student)).not.toContain("answerKey");
    expect(Object.keys(student)).not.toContain("markingGuideline");
    expect(JSON.stringify(student)).not.toContain("markingGuideline");
  });

  it("toStudentGroup strips keys from every part, including display-only parts", () => {
    for (const group of paper.groups) {
      const serialised = JSON.stringify(toStudentGroup(group));
      expect(serialised).not.toContain("answerKey");
      expect(serialised).not.toContain("markingGuideline");
      expect(serialised).not.toContain("modelAnswer");
      expect(serialised).not.toContain("correctOptionId");
    }
  });
});

describe("group validation", () => {
  const base = paper.groups[0]!;

  it("accepts the fixture groups", () => {
    for (const group of paper.groups) {
      expect(validateQuestionGroup(group), `group ${group.position}`).toEqual([]);
    }
  });

  it("rejects a group whose part marks do not sum to its total", () => {
    const broken = { ...base, totalMarks: 5 };
    expect(validateQuestionGroup(broken).map((i) => i.message)).toContain(
      "part marks total 1 but the group is worth 5",
    );
  });

  it("rejects a part that maps to a syllabus item the group does not declare", () => {
    const part = base.parts[0]!;
    const broken = {
      ...base,
      parts: [{ ...part, syllabusItemIds: ["proj.4.4"] }],
    };
    expect(validateQuestionGroup(broken).map((i) => i.message).join(" ")).toContain(
      "part maps to proj.4.4",
    );
  });

  it("rejects a display-only part worth more than zero marks", () => {
    const stimulusGroup = paper.groups.find((g) =>
      g.parts.some((p) => p.rendererType === "code_stimulus"),
    )!;
    const part = stimulusGroup.parts.find((p) => p.rendererType === "code_stimulus")!;
    const broken = {
      ...stimulusGroup,
      parts: stimulusGroup.parts.map((p) => (p.id === part.id ? { ...p, marks: 2 } : p)),
    };
    expect(validateQuestionGroup(broken).map((i) => i.message).join(" ")).toContain(
      "display-only and must be worth 0 marks",
    );
  });
});

describe("renderer helpers", () => {
  it("classifies display-only renderers", () => {
    expect(isResponsive("code_stimulus")).toBe(false);
    expect(isResponsive("single_choice")).toBe(true);
  });

  it("classifies deterministically markable renderers", () => {
    expect(isDeterministic("single_choice")).toBe(true);
    expect(isDeterministic("rich_text_response")).toBe(false);
  });

  it("treats an empty response as unanswered for every renderer", () => {
    for (const renderer of IMPLEMENTED_RENDERERS) {
      expect(isAnswered(emptyResponse(renderer)), renderer).toBe(false);
    }
  });

  it("treats whitespace-only and empty-markup responses as unanswered", () => {
    expect(isAnswered({ rendererType: "short_text", text: "   " })).toBe(false);
    expect(isAnswered({ rendererType: "rich_text_response", html: "<p></p>" })).toBe(false);
    expect(isAnswered({ rendererType: "rich_text_response", html: "<p>a</p>" })).toBe(true);
  });
});
