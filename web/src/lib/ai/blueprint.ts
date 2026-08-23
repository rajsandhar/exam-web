import { z } from "zod";

import { BLUEPRINT_RULES, TOTAL_MARKS } from "@/lib/config";
import {
  cognitiveDemandSchema,
  commandVerbSchema,
  syllabusItemIdSchema,
} from "@/lib/schemas/common";
import { rendererTypeSchema } from "@/lib/schemas/renderers";
import type { ValidationIssue } from "@/lib/schemas/question";

import { SCENARIO_DOMAINS } from "./scenario-domains";

/**
 * Stage B — the paper blueprint (CLAUDE.md §6, SPEC_ADDENDUM.md §1).
 *
 * The blueprint is written and validated before a single question is generated,
 * so a paper that cannot possibly satisfy the specification is rejected in one
 * cheap call rather than after forty expensive ones.
 */

export const blueprintPartSchema = z.object({
  label: z.string().max(4).nullable(),
  marks: z.number().int().min(0).max(12),
  rendererType: rendererTypeSchema,
  /** What this part is for, in the setter's words. Not shown to the student. */
  assessmentPurpose: z.string().min(10).max(400),
  commandVerb: commandVerbSchema.optional(),
  syllabusItemIds: z.array(syllabusItemIdSchema).min(1).max(4),
});

export const blueprintGroupSchema = z.object({
  position: z.number().int().min(1),
  totalMarks: z.number().int().min(1).max(12),
  section: z.enum(["objective", "constructed"]),
  kind: z.enum(["single", "multipart_group"]),
  layout: z.enum(["single", "split"]),
  cognitiveDemand: cognitiveDemandSchema,
  archetypeId: z.string().min(1),
  scenarioDomain: z.enum(SCENARIO_DOMAINS),
  stimulusType: z.enum([
    "none",
    "text",
    "list",
    "code",
    "table",
    "table_set",
    "diagram",
  ]),
  /** Two or three sentences describing the intended stimulus and task. */
  designNote: z.string().min(20).max(800),
  integratesMultipleItems: z.boolean(),
  syllabusItemIds: z.array(syllabusItemIdSchema).min(1).max(4),
  parts: z.array(blueprintPartSchema).min(1).max(5),
});

export const blueprintSchema = z.object({
  title: z.string().min(3).max(120),
  groups: z.array(blueprintGroupSchema).min(20).max(60),
});

export type Blueprint = z.infer<typeof blueprintSchema>;
export type BlueprintGroup = z.infer<typeof blueprintGroupSchema>;

/**
 * Hard blueprint rules. A blueprint outside the official item-count ranges is
 * invalid even when the marks sum to 100 (SPEC_ADDENDUM.md §1).
 */
export function validateBlueprint(
  blueprint: Blueprint,
  options: {
    assessableItemIds: readonly string[];
    availableRenderers: readonly string[];
    /** Archetype ids the library actually contains. */
    knownArchetypeIds: readonly string[];
    /** Coverage mode from `planCoverage`. */
    coverageMode: "full" | "sampled";
  },
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const assessable = new Set(options.assessableItemIds);
  const renderers = new Set(options.availableRenderers);
  const archetypes = new Set(options.knownArchetypeIds);

  let objectiveMarks = 0;
  let constructedMarks = 0;
  let objectiveItems = 0;
  let constructedItems = 0;
  let extendedItems = 0;
  const covered = new Set<string>();
  const archetypePairs = new Set<string>();

  for (const group of blueprint.groups) {
    const where = `blueprint question ${group.position}`;

    const partMarks = group.parts.reduce((sum, part) => sum + part.marks, 0);
    if (partMarks !== group.totalMarks) {
      issues.push({
        path: where,
        message: `part marks total ${partMarks} but the question is worth ${group.totalMarks}`,
      });
    }

    if (!archetypes.has(group.archetypeId)) {
      issues.push({ path: where, message: `unknown archetype ${group.archetypeId}` });
    }

    for (const id of group.syllabusItemIds) {
      if (!assessable.has(id)) {
        issues.push({
          path: where,
          message: `plans to assess ${id}, which is not in the coverage plan`,
        });
      }
      covered.add(id);
      archetypePairs.add(`${group.archetypeId}::${id}`);
    }

    const responsiveParts = group.parts.filter(
      (part) => part.rendererType !== "code_stimulus" && part.rendererType !== "diagram_viewer",
    );

    if (responsiveParts.length === 0) {
      issues.push({ path: where, message: "has no part the student can answer" });
    }

    if (group.kind === "single" && responsiveParts.length > 1) {
      issues.push({
        path: where,
        message: "is marked `single` but plans more than one answerable part",
      });
    }
    if (group.kind === "multipart_group" && group.parts.length < 2) {
      issues.push({
        path: where,
        message: "is marked `multipart_group` but has only one part",
      });
    }

    for (const part of group.parts) {
      if (!renderers.has(part.rendererType)) {
        issues.push({
          path: where,
          message: `plans a ${part.rendererType} response, which this build cannot display`,
        });
      }
      for (const id of part.syllabusItemIds) {
        if (!group.syllabusItemIds.includes(id)) {
          issues.push({
            path: where,
            message: `part maps to ${id}, which the question does not declare`,
          });
        }
      }
    }

    if (group.section === "objective") {
      objectiveMarks += group.totalMarks;
      objectiveItems += responsiveParts.length;
      for (const part of responsiveParts) {
        if (
          part.marks < BLUEPRINT_RULES.objective.minMarksPerItem ||
          part.marks > BLUEPRINT_RULES.objective.maxMarksPerItem
        ) {
          issues.push({
            path: where,
            message: `objective item worth ${part.marks} marks; the specification allows 1–4`,
          });
        }
      }
    } else {
      constructedMarks += group.totalMarks;
      constructedItems += responsiveParts.length;
      const [lo, hi] = BLUEPRINT_RULES.constructed.extendedMarkRange;
      extendedItems += responsiveParts.filter(
        (part) => part.marks >= lo && part.marks <= hi,
      ).length;
    }
  }

  const total = objectiveMarks + constructedMarks;
  if (total !== TOTAL_MARKS) {
    issues.push({
      path: "blueprint",
      message: `totals ${total} marks; it must be exactly ${TOTAL_MARKS}`,
    });
  }

  const positions = blueprint.groups.map((g) => g.position);
  if (positions.join(",") !== positions.map((_, i) => i + 1).join(",")) {
    issues.push({ path: "blueprint", message: "question positions are not 1..n in order" });
  }

  const { objective, constructed, markSplitTolerance } = BLUEPRINT_RULES;
  if (objectiveItems < objective.minItems || objectiveItems > objective.maxItems) {
    issues.push({
      path: "blueprint",
      message: `${objectiveItems} objective items; the specification requires ${objective.minItems}–${objective.maxItems}`,
    });
  }
  if (constructedItems < constructed.minItems || constructedItems > constructed.maxItems) {
    issues.push({
      path: "blueprint",
      message: `${constructedItems} short-answer items; the specification requires ${constructed.minItems}–${constructed.maxItems}`,
    });
  }
  if (extendedItems < constructed.minExtendedItems) {
    issues.push({
      path: "blueprint",
      message: `only ${extendedItems} items worth 4–8 marks; at least ${constructed.minExtendedItems} are required`,
    });
  }
  if (Math.abs(objectiveMarks - objective.targetMarks) > markSplitTolerance) {
    issues.push({
      path: "blueprint",
      message: `objective section is ${objectiveMarks} marks; target is ${objective.targetMarks} ±${markSplitTolerance}`,
    });
  }
  if (Math.abs(constructedMarks - constructed.targetMarks) > markSplitTolerance) {
    issues.push({
      path: "blueprint",
      message: `constructed-response section is ${constructedMarks} marks; target is ${constructed.targetMarks} ±${markSplitTolerance}`,
    });
  }

  // In full-coverage mode every planned item must appear somewhere.
  if (options.coverageMode === "full") {
    for (const id of assessable) {
      if (!covered.has(id)) {
        issues.push({
          path: "coverage",
          message: `${id} is in the coverage plan but no question assesses it`,
        });
      }
    }
  }

  return issues;
}

/** (archetype, syllabus item) pairs, for the novelty overlap check. */
export function archetypeItemPairs(blueprint: Blueprint): Set<string> {
  const pairs = new Set<string>();
  for (const group of blueprint.groups) {
    for (const id of group.syllabusItemIds) {
      pairs.add(`${group.archetypeId}::${id}`);
    }
  }
  return pairs;
}

/**
 * Overlap with the immediately preceding paper. Above ~30% the paper is
 * rejected and regenerated (SPEC_ADDENDUM.md §3).
 */
export function overlapWithPrevious(
  current: Set<string>,
  previous: Set<string>,
): number {
  if (current.size === 0 || previous.size === 0) return 0;
  let shared = 0;
  for (const pair of current) if (previous.has(pair)) shared += 1;
  return shared / current.size;
}
