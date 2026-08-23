import { z } from "zod";

import { TOTAL_MARKS } from "@/lib/config";
import type { ArchetypeDefinition } from "@/lib/ingest/archetypes";
import { syllabusItemIdSchema } from "@/lib/schemas/common";
import type { ValidationIssue } from "@/lib/schemas/question";

import { blueprintSchema, validateBlueprint, type Blueprint } from "./blueprint";
import { callStructured } from "./client";
import type { CoverageSelection } from "./coverage";
import { BLUEPRINT_SYSTEM, COVERAGE_PLAN_SYSTEM } from "./prompts";
import { freshDomains } from "./scenario-domains";

/**
 * Stage A (mark allocation) and Stage B (blueprint) of CLAUDE.md §6.
 *
 * Which items are assessed is decided deterministically in `coverage.ts` — the
 * model has no access to coverage history and its sampling could not be
 * validated. The model decides how much each item is worth and what shape the
 * paper takes, which is genuine assessment judgement.
 */

export const coveragePlanSchema = z.object({
  allocations: z
    .array(
      z.object({
        syllabusItemId: syllabusItemIdSchema,
        marks: z.number().int().min(1).max(12),
        depthRationale: z.string().min(5).max(300),
      }),
    )
    .min(1),
});

export type CoveragePlan = z.infer<typeof coveragePlanSchema>;

export type PlanningInputs = {
  coverage: CoverageSelection;
  syllabusText: Map<string, string>;
  syllabusIncluding: Map<string, string[]>;
  archetypes: ArchetypeDefinition[];
  availableRenderers: readonly string[];
  /** Scenario domains used by recent papers, most recent first. */
  recentDomains: string[];
  /** (archetype, syllabus item) pairs from the previous paper. */
  previousPairs: Set<string>;
  signal?: AbortSignal;
};

export async function planCoverageMarks(
  inputs: PlanningInputs,
): Promise<CoveragePlan> {
  const lines = inputs.coverage.assess.map((id) => {
    const including = inputs.syllabusIncluding.get(id) ?? [];
    const weight = inputs.coverage.weights[id] ?? 1;
    return (
      `- ${id} (emphasis hint ${weight.toFixed(1)}): ${inputs.syllabusText.get(id) ?? id}` +
      (including.length > 0 ? `\n    Including: ${including.join("; ")}` : "")
    );
  });

  const { value } = await callStructured({
    schema: coveragePlanSchema,
    system: COVERAGE_PLAN_SYSTEM,
    stage: "blueprint",
    effort: "high",
    signal: inputs.signal,
    user: [
      `Allocate exactly ${TOTAL_MARKS} marks across these ${inputs.coverage.assess.length} Year 12 syllabus dot points.`,
      "",
      "Syllabus dot points (exact NESA wording):",
      ...lines,
      "",
      `Return one allocation per dot point. The marks must total exactly ${TOTAL_MARKS}.`,
    ].join("\n"),
  });

  return value;
}

export type BlueprintResult = {
  blueprint: Blueprint;
  issues: ValidationIssue[];
  attempts: number;
};

export async function planBlueprint(
  inputs: PlanningInputs,
  coveragePlan: CoveragePlan,
  maxAttempts = 3,
): Promise<BlueprintResult> {
  const archetypeLines = inputs.archetypes.map((archetype) =>
    [
      `- ${archetype.id}: ${archetype.label}`,
      `    response type: ${archetype.rendererType}; stimulus: ${archetype.stimulusType}`,
      `    typical marks: ${archetype.typicalMarks.join(", ")}; verbs: ${archetype.commandVerbs.join(", ")}`,
      `    demand: ${archetype.cognitiveDemand}; marking: ${archetype.markingStructure}`,
      archetype.transformationPattern
        ? `    pattern: ${archetype.transformationPattern}`
        : "",
      `    suits: ${archetype.topicSuitability.join(", ")}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  const allocationLines = coveragePlan.allocations.map(
    (allocation) =>
      `- ${allocation.syllabusItemId} — ${allocation.marks} mark(s): ${
        inputs.syllabusText.get(allocation.syllabusItemId) ?? allocation.syllabusItemId
      }`,
  );

  const suggested = freshDomains(inputs.recentDomains);

  const baseUser = [
    `Plan a ${TOTAL_MARKS}-mark trial examination.`,
    "",
    "Mark allocation agreed in the previous stage:",
    ...allocationLines,
    "",
    "Response types available in this build — plan nothing else:",
    inputs.availableRenderers.join(", "),
    "",
    "Archetype library derived from past NSW HSC Software Engineering papers:",
    ...archetypeLines,
    "",
    "Scenario domains — choose from this vocabulary only:",
    suggested.join(", "),
    "",
    inputs.recentDomains.length > 0
      ? `Recent papers already used these domains, so avoid them where you can: ${[
          ...new Set(inputs.recentDomains),
        ]
          .slice(0, 12)
          .join(", ")}.`
      : "",
    "",
    "Produce the blueprint.",
  ]
    .filter((line) => line !== "")
    .join("\n");

  let lastIssues: ValidationIssue[] = [];
  let user = baseUser;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { value } = await callStructured({
      schema: blueprintSchema,
      system: BLUEPRINT_SYSTEM,
      stage: "blueprint",
      effort: "high",
      maxTokens: 24000,
      signal: inputs.signal,
      user,
    });

    lastIssues = validateBlueprint(value, {
      assessableItemIds: inputs.coverage.assess,
      availableRenderers: inputs.availableRenderers,
      knownArchetypeIds: inputs.archetypes.map((a) => a.id),
      coverageMode: inputs.coverage.mode,
    });

    if (lastIssues.length === 0) {
      return { blueprint: value, issues: [], attempts: attempt };
    }

    // Feed the specific failures back rather than simply retrying — a blind
    // retry reproduces the same arithmetic mistake.
    user = [
      baseUser,
      "",
      "Your previous blueprint was rejected for these reasons. Fix every one of them:",
      ...lastIssues.map((issue) => `- ${issue.path}: ${issue.message}`),
    ].join("\n");
  }

  throw new Error(
    `Blueprint failed validation after ${maxAttempts} attempts:\n` +
      lastIssues.map((issue) => `  • ${issue.path}: ${issue.message}`).join("\n"),
  );
}
