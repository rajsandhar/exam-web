import { BLUEPRINT_RULES, COVERAGE_RULES, TOTAL_MARKS } from "@/lib/config";

import type { GeneratedPaper, ValidationIssue } from "./question";
import {
  validateAnswerKeyAgainstConfig,
  validateQuestionGroup,
} from "./question";
import { isResponsive, type RendererType } from "./renderers";

/**
 * Stage D deterministic validation (CLAUDE.md §6) plus the hard item-count
 * rules from SPEC_ADDENDUM.md §1. A paper failing any of these is invalid even
 * if every individual question looks fine.
 */

export type PaperValidationResult = {
  ok: boolean;
  issues: ValidationIssue[];
  stats: {
    totalMarks: number;
    objectiveMarks: number;
    constructedMarks: number;
    objectiveItems: number;
    constructedItems: number;
    extendedItems: number;
    coveredSyllabusItemIds: string[];
    uncoveredSyllabusItemIds: string[];
    coverage: number;
  };
};

export function validatePaper(
  paper: GeneratedPaper,
  options: {
    /** Renderers with working UI. A question using anything else is rejected. */
    availableRenderers: readonly RendererType[];
    /** Skip the item-count ranges (default: enforced). */
    enforceItemCounts?: boolean;
    /**
     * Skip the coverage rules. The sample generator replays a fixed paper and so
     * cannot honour an arbitrary selection; real generation always enforces.
     */
    enforceCoverage?: boolean;
  },
): PaperValidationResult {
  const issues: ValidationIssue[] = [];
  const selected = new Set(paper.selectedSyllabusItemIds);
  const available = new Set<string>(options.availableRenderers);

  let objectiveMarks = 0;
  let constructedMarks = 0;
  let objectiveItems = 0;
  let constructedItems = 0;
  let extendedItems = 0;
  const covered = new Set<string>();

  const seenPrompts = new Map<string, number>();

  for (const group of paper.groups) {
    issues.push(...validateQuestionGroup(group));

    for (const part of group.parts) {
      issues.push(...validateAnswerKeyAgainstConfig(part));
      for (const id of part.syllabusItemIds) covered.add(id);

      if (!available.has(part.rendererType)) {
        issues.push({
          path: `group ${group.position}`,
          message: `renderer ${part.rendererType} is not available in this build`,
        });
      }

      if (isResponsive(part.rendererType)) {
        const normalised = normalisePrompt(part.prompt);
        seenPrompts.set(normalised, (seenPrompts.get(normalised) ?? 0) + 1);
      }
    }

    // Every question is bounded by the selection — CLAUDE.md §2.6.
    for (const id of group.syllabusItemIds) {
      if (!selected.has(id)) {
        issues.push({
          path: `group ${group.position}`,
          message: `assesses ${id}, which was not selected`,
        });
      }
    }

    if (group.section === "objective") {
      objectiveMarks += group.totalMarks;
      objectiveItems += group.parts.filter((p) => isResponsive(p.rendererType)).length;
      for (const part of group.parts) {
        if (!isResponsive(part.rendererType)) continue;
        if (part.marks < BLUEPRINT_RULES.objective.minMarksPerItem ||
            part.marks > BLUEPRINT_RULES.objective.maxMarksPerItem) {
          issues.push({
            path: `group ${group.position}`,
            message: `objective item worth ${part.marks} marks; the specification allows 1–4`,
          });
        }
      }
    } else {
      constructedMarks += group.totalMarks;
      const responsive = group.parts.filter((p) => isResponsive(p.rendererType));
      constructedItems += responsive.length;
      const [lo, hi] = BLUEPRINT_RULES.constructed.extendedMarkRange;
      extendedItems += responsive.filter((p) => p.marks >= lo && p.marks <= hi).length;
    }
  }

  for (const [prompt, count] of seenPrompts) {
    if (count > 1) {
      issues.push({
        path: "paper",
        message: `${count} questions share a near-identical prompt: “${prompt.slice(0, 60)}…”`,
      });
    }
  }

  const totalMarks = objectiveMarks + constructedMarks;
  if (totalMarks !== TOTAL_MARKS) {
    issues.push({
      path: "paper",
      message: `paper totals ${totalMarks} marks; it must be exactly ${TOTAL_MARKS}`,
    });
  }

  const positions = paper.groups.map((g) => g.position);
  const expected = positions.map((_, i) => i + 1);
  if (positions.join(",") !== expected.join(",")) {
    issues.push({ path: "paper", message: "question positions are not 1..n in order" });
  }

  if (options.enforceItemCounts !== false) {
    const { objective, constructed, markSplitTolerance } = BLUEPRINT_RULES;

    if (objectiveItems < objective.minItems || objectiveItems > objective.maxItems) {
      issues.push({
        path: "paper",
        message: `${objectiveItems} objective items; the specification requires ${objective.minItems}–${objective.maxItems}`,
      });
    }
    if (
      constructedItems < constructed.minItems ||
      constructedItems > constructed.maxItems
    ) {
      issues.push({
        path: "paper",
        message: `${constructedItems} short-answer items; the specification requires ${constructed.minItems}–${constructed.maxItems}`,
      });
    }
    if (extendedItems < constructed.minExtendedItems) {
      issues.push({
        path: "paper",
        message: `only ${extendedItems} items worth 4–8 marks; at least ${constructed.minExtendedItems} are required`,
      });
    }
    if (Math.abs(objectiveMarks - objective.targetMarks) > markSplitTolerance) {
      issues.push({
        path: "paper",
        message: `objective section is ${objectiveMarks} marks; target is ${objective.targetMarks} ±${markSplitTolerance}`,
      });
    }
    if (Math.abs(constructedMarks - constructed.targetMarks) > markSplitTolerance) {
      issues.push({
        path: "paper",
        message: `constructed-response section is ${constructedMarks} marks; target is ${constructed.targetMarks} ±${markSplitTolerance}`,
      });
    }
  }

  const uncovered = [...selected].filter((id) => !covered.has(id));
  const coverage = selected.size === 0 ? 1 : covered.size / selected.size;

  if (options.enforceCoverage === false) {
    // Coverage is still reported in `stats` and surfaced on the results screen.
  } else if (selected.size <= COVERAGE_RULES.fullCoverageThreshold) {
    if (uncovered.length > 0) {
      issues.push({
        path: "coverage",
        message:
          `${uncovered.length} of ${selected.size} selected items were not assessed; ` +
          `at or below ${COVERAGE_RULES.fullCoverageThreshold} selected items every one must be`,
      });
    }
  } else if (coverage < COVERAGE_RULES.minSampledCoverage) {
    issues.push({
      path: "coverage",
      message: `coverage is ${(coverage * 100).toFixed(0)}%; at least ${
        COVERAGE_RULES.minSampledCoverage * 100
      }% is required`,
    });
  }

  const declaredUnassessed = new Set(paper.unassessedSyllabusItemIds);
  for (const id of options.enforceCoverage === false ? [] : uncovered) {
    if (!declaredUnassessed.has(id)) {
      issues.push({
        path: "coverage",
        message: `${id} was not assessed but is missing from unassessedSyllabusItemIds`,
      });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    stats: {
      totalMarks,
      objectiveMarks,
      constructedMarks,
      objectiveItems,
      constructedItems,
      extendedItems,
      coveredSyllabusItemIds: [...covered].sort(),
      uncoveredSyllabusItemIds: uncovered.sort(),
      coverage,
    },
  };
}

function normalisePrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
