import { z } from "zod";

import { stimulusToText } from "@/lib/marking/stimulus-text";
import type { QuestionGroupForMarking } from "@/lib/schemas/question";
import { isResponsive } from "@/lib/schemas/renderers";

import { callStructured } from "./client";
import { CRITIC_SYSTEM } from "./prompts";

/**
 * Stage E — the AI critic (CLAUDE.md §6).
 *
 * Not every question is worth a full-strength critique. Constructed-response
 * items worth 3+ marks and anything with executable content are always
 * reviewed; low-value objective items are sampled, because Stage D's
 * deterministic validators already cover what matters on those
 * (SPEC_ADDENDUM.md §4).
 */

export const critiqueSchema = z.object({
  verdict: z.enum(["accept", "revise", "reject"]),
  problems: z
    .array(
      z.object({
        criterion: z.enum([
          "syllabus_alignment",
          "difficulty",
          "command_verb",
          "stimulus",
          "answerability",
          "distractors",
          "marking_guideline",
          "originality",
        ]),
        detail: z.string().min(10).max(600),
      }),
    )
    .default([]),
  /** What the writer should change. Empty when the verdict is accept. */
  requiredChanges: z.array(z.string().min(5).max(600)).default([]),
});

export type Critique = z.infer<typeof critiqueSchema>;

/** Executable content gets reviewed regardless of marks. */
const EXECUTABLE_RENDERERS = new Set(["python_editor", "sql_editor", "pseudocode_editor"]);

export function shouldCritique(
  group: QuestionGroupForMarking,
  sampleRate: number,
  random: () => number,
): boolean {
  const responsive = group.parts.filter((part) => isResponsive(part.rendererType));

  const hasExecutable = group.parts.some((part) =>
    EXECUTABLE_RENDERERS.has(part.rendererType),
  );
  if (hasExecutable) return true;

  if (group.section === "constructed" && responsive.some((part) => part.marks >= 3)) {
    return true;
  }

  return random() < sampleRate;
}

export async function critiqueQuestion(
  group: QuestionGroupForMarking,
  syllabusItems: Array<{ id: string; exactText: string }>,
  signal?: AbortSignal,
): Promise<Critique> {
  const stimulus = stimulusToText(group.stimulus);

  const parts = group.parts
    .map((part) =>
      [
        `Part ${part.label ?? "(single)"} — ${part.marks} mark(s), ${part.rendererType}`,
        `Prompt: ${part.prompt}`,
        `Response configuration: ${JSON.stringify(part.config)}`,
        part.answerKey ? `Answer key: ${JSON.stringify(part.answerKey)}` : "Answer key: none",
        part.markingGuideline
          ? `Marking guideline: ${JSON.stringify(part.markingGuideline)}`
          : "Marking guideline: none",
      ].join("\n"),
    )
    .join("\n\n");

  const { value } = await callStructured({
    schema: critiqueSchema,
    system: CRITIC_SYSTEM,
    effort: "high",
    maxTokens: 8000,
    signal,
    user: [
      `Question ${group.position} — ${group.totalMarks} marks, ${group.section} section.`,
      `Cognitive demand claimed: ${group.cognitiveDemand}.`,
      "",
      "Syllabus dot points this question is permitted to assess:",
      ...syllabusItems.map((item) => `- ${item.id}: ${item.exactText}`),
      "",
      stimulus ? `Stimulus:\n${stimulus}` : "Stimulus: none",
      "",
      parts,
      "",
      "Moderate this question.",
    ].join("\n"),
  });

  return value;
}

export function critiqueToFeedback(critique: Critique): string {
  return [
    ...critique.problems.map((problem) => `- ${problem.criterion}: ${problem.detail}`),
    ...critique.requiredChanges.map((change) => `- required change: ${change}`),
  ].join("\n");
}
