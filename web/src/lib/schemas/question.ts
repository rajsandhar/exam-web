import { z } from "zod";

import {
  cognitiveDemandSchema,
  commandVerbSchema,
  generationMetadataSchema,
  idSchema,
  marksSchema,
  sourceReferenceSchema,
  syllabusItemIdSchema,
} from "./common";
import {
  answerKeySchema,
  isResponsive,
  markingGuidelineSchema,
  rendererConfigSchemas,
  rendererTypeSchema,
  type RendererType,
} from "./renderers";
import { stimulusSchema } from "./stimulus";

/**
 * Question specification (CLAUDE.md §14).
 *
 * SPEC_ADDENDUM.md §7: there are two part types, not one type with optional
 * fields. `QuestionPartForStudent` has no answer key and no marking guideline
 * *at all*, and its schema is strict, so an accidental object spread from the
 * marking shape fails loudly instead of silently serialising the key into the
 * RSC payload.
 */

/* -------------------------------------------------------------------------
 * Parts
 * ---------------------------------------------------------------------- */

const partCoreShape = {
  id: idSchema,
  /** `a`, `b`, `c` … Absent when a group has a single unlabelled part. */
  label: z.string().max(4).nullable(),
  marks: marksSchema,
  rendererType: rendererTypeSchema,
  prompt: z.string().min(1),
  /** Renderer-specific configuration. Validated by `parseQuestionPart`. */
  config: z.unknown(),
  syllabusItemIds: z.array(syllabusItemIdSchema).min(1),
  commandVerb: commandVerbSchema.optional(),
} as const;

/**
 * Sent to the exam page. Strict: unknown keys — including `answerKey` and
 * `markingGuideline` — are rejected rather than passed through.
 */
export const questionPartForStudentSchema = z.strictObject(partCoreShape);

export type QuestionPartForStudent = z.infer<typeof questionPartForStudentSchema>;

/** Server-side only. Never crosses the boundary to a client component. */
export const questionPartForMarkingSchema = z.object({
  ...partCoreShape,
  answerKey: answerKeySchema.nullable(),
  markingGuideline: markingGuidelineSchema.nullable(),
});

export type QuestionPartForMarking = z.infer<typeof questionPartForMarkingSchema>;

/** Compile-time proof that the student shape carries no key-bearing field. */
type StudentHasNoKeys = "answerKey" | "markingGuideline" extends keyof QuestionPartForStudent
  ? never
  : true;
const _studentHasNoKeys: StudentHasNoKeys = true;
void _studentHasNoKeys;

/** Strips a marking-shaped part down to the student shape. */
export function toStudentPart(part: QuestionPartForMarking): QuestionPartForStudent {
  return {
    id: part.id,
    label: part.label,
    marks: part.marks,
    rendererType: part.rendererType,
    prompt: part.prompt,
    config: part.config,
    syllabusItemIds: part.syllabusItemIds,
    ...(part.commandVerb ? { commandVerb: part.commandVerb } : {}),
  };
}

/* -------------------------------------------------------------------------
 * Groups
 * ---------------------------------------------------------------------- */

const groupCoreShape = {
  id: idSchema,
  position: z.number().int().min(1),
  totalMarks: marksSchema,
  section: z.enum(["objective", "constructed"]),
  /** `single` for a plain question; `multipart_group` for shared stimulus. */
  kind: z.enum(["single", "multipart_group"]),
  layout: z.enum(["single", "split"]),
  stimulus: stimulusSchema.nullable(),
  cognitiveDemand: cognitiveDemandSchema,
  syllabusItemIds: z.array(syllabusItemIdSchema).min(1),
  sourceReferences: z.array(sourceReferenceSchema),
  generationMetadata: generationMetadataSchema,
} as const;

export const questionGroupForStudentSchema = z.object({
  ...groupCoreShape,
  parts: z.array(questionPartForStudentSchema).min(1),
});

export type QuestionGroupForStudent = z.infer<typeof questionGroupForStudentSchema>;

export const questionGroupForMarkingSchema = z.object({
  ...groupCoreShape,
  parts: z.array(questionPartForMarkingSchema).min(1),
});

export type QuestionGroupForMarking = z.infer<typeof questionGroupForMarkingSchema>;

export function toStudentGroup(
  group: QuestionGroupForMarking,
): QuestionGroupForStudent {
  return { ...group, parts: group.parts.map(toStudentPart) };
}

/* -------------------------------------------------------------------------
 * Papers
 * ---------------------------------------------------------------------- */

export const generatedPaperSchema = z.object({
  title: z.string().min(1),
  totalMarks: z.literal(100),
  selectedSyllabusItemIds: z.array(syllabusItemIdSchema).min(1),
  unassessedSyllabusItemIds: z.array(syllabusItemIdSchema),
  groups: z.array(questionGroupForMarkingSchema).min(1),
  generationMetadata: generationMetadataSchema,
});

export type GeneratedPaper = z.infer<typeof generatedPaperSchema>;

/* -------------------------------------------------------------------------
 * Validation beyond shape
 * ---------------------------------------------------------------------- */

export type ValidationIssue = { path: string; message: string };

/** Validates a part's `config` against its renderer's schema. */
export function validatePartConfig(
  rendererType: RendererType,
  config: unknown,
): ValidationIssue[] {
  const schema = rendererConfigSchemas[rendererType];
  const result = schema.safeParse(config);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    path: `config.${issue.path.join(".")}`,
    message: issue.message,
  }));
}

/**
 * Structural rules that Zod cannot express (CLAUDE.md §6 Stage D). Applied to
 * one question group; `validatePaper` in `paper-validation.ts` applies the
 * paper-wide rules.
 */
export function validateQuestionGroup(
  group: QuestionGroupForMarking,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const where = `group ${group.position}`;

  const partMarks = group.parts.reduce((sum, p) => sum + p.marks, 0);
  if (partMarks !== group.totalMarks) {
    issues.push({
      path: where,
      message: `part marks total ${partMarks} but the group is worth ${group.totalMarks}`,
    });
  }

  if (group.kind === "single" && group.parts.filter((p) => isResponsive(p.rendererType)).length > 1) {
    issues.push({
      path: where,
      message: "a `single` group must have exactly one responsive part",
    });
  }

  const labels = group.parts.map((p) => p.label).filter((l): l is string => l !== null);
  if (new Set(labels).size !== labels.length) {
    issues.push({ path: where, message: "duplicate part labels" });
  }

  for (const part of group.parts) {
    const at = `${where} part ${part.label ?? part.id}`;

    for (const issue of validatePartConfig(part.rendererType, part.config)) {
      issues.push({ path: `${at} ${issue.path}`, message: issue.message });
    }

    if (!isResponsive(part.rendererType)) {
      if (part.marks !== 0) {
        issues.push({
          path: at,
          message: `${part.rendererType} is display-only and must be worth 0 marks`,
        });
      }
      continue;
    }

    if (part.marks < 1) {
      issues.push({ path: at, message: "a responsive part must be worth at least 1 mark" });
    }

    if (part.answerKey && part.answerKey.rendererType !== part.rendererType) {
      issues.push({
        path: at,
        message: `answer key is for ${part.answerKey.rendererType} but the part is ${part.rendererType}`,
      });
    }

    if (part.markingGuideline) {
      const criteriaTotal = part.markingGuideline.criteria.reduce(
        (sum, c) => sum + c.marks,
        0,
      );
      const top = Math.max(...part.markingGuideline.criteria.map((c) => c.marks));
      // A guideline is either a set of bands (top band = full marks) or a set
      // of additive criteria (criteria sum = full marks). Both are used by NESA.
      if (top !== part.marks && criteriaTotal !== part.marks) {
        issues.push({
          path: at,
          message:
            `marking guideline does not resolve to ${part.marks} marks ` +
            `(top band ${top}, criteria total ${criteriaTotal})`,
        });
      }
    }

    // Every question must map to selected syllabus content — the group's own
    // list is the boundary and part lists must sit inside it.
    for (const id of part.syllabusItemIds) {
      if (!group.syllabusItemIds.includes(id)) {
        issues.push({
          path: at,
          message: `part maps to ${id}, which the group does not declare`,
        });
      }
    }
  }

  return issues;
}

/** Answer-key consistency checks that need the config alongside the key. */
export function validateAnswerKeyAgainstConfig(
  part: QuestionPartForMarking,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const key = part.answerKey;
  if (!key) return issues;
  const at = `part ${part.label ?? part.id}`;

  if (key.rendererType === "single_choice") {
    const config = rendererConfigSchemas.single_choice.safeParse(part.config);
    if (config.success) {
      const ids = config.data.options.map((o) => o.id);
      if (!ids.includes(key.correctOptionId)) {
        issues.push({ path: at, message: "correct option id is not one of the options" });
      }
      if (new Set(ids).size !== ids.length) {
        issues.push({ path: at, message: "duplicate option ids" });
      }
    }
  }

  if (key.rendererType === "multi_select") {
    const config = rendererConfigSchemas.multi_select.safeParse(part.config);
    if (config.success) {
      const ids = new Set(config.data.options.map((o) => o.id));
      for (const id of key.correctOptionIds) {
        if (!ids.has(id)) {
          issues.push({ path: at, message: `correct option ${id} is not one of the options` });
        }
      }
      if (key.correctOptionIds.length >= config.data.options.length) {
        issues.push({ path: at, message: "every option is marked correct" });
      }
    }
  }

  if (key.rendererType === "ordering") {
    const config = rendererConfigSchemas.ordering.safeParse(part.config);
    if (config.success) {
      const ids = config.data.items.map((i) => i.id).sort();
      const ordered = [...key.correctOrder].sort();
      if (ids.length !== ordered.length || ids.some((id, i) => id !== ordered[i])) {
        issues.push({ path: at, message: "correct order does not permute the items exactly" });
      }
    }
  }

  if (key.rendererType === "matching_matrix") {
    const config = rendererConfigSchemas.matching_matrix.safeParse(part.config);
    if (config.success) {
      const rowIds = new Set(config.data.rows.map((r) => r.id));
      const colIds = new Set(config.data.columns.map((c) => c.id));
      for (const [rowId, cols] of Object.entries(key.matches)) {
        if (!rowIds.has(rowId)) {
          issues.push({ path: at, message: `answer key references unknown row ${rowId}` });
        }
        if (config.data.mode === "single" && cols.length !== 1) {
          issues.push({ path: at, message: `row ${rowId} must have exactly one match` });
        }
        for (const col of cols) {
          if (!colIds.has(col)) {
            issues.push({ path: at, message: `answer key references unknown column ${col}` });
          }
        }
      }
      for (const rowId of rowIds) {
        if (!(rowId in key.matches)) {
          issues.push({ path: at, message: `row ${rowId} has no answer` });
        }
      }
    }
  }

  if (key.rendererType === "dropdown_completion") {
    const config = rendererConfigSchemas.dropdown_completion.safeParse(part.config);
    if (config.success) {
      const blanks = config.data.segments.filter((s) => s.kind === "blank");
      for (const blank of blanks) {
        const answer = key.blanks[blank.blankId];
        if (answer === undefined) {
          issues.push({ path: at, message: `blank ${blank.blankId} has no answer` });
        } else if (!blank.options.some((o) => o.id === answer)) {
          issues.push({
            path: at,
            message: `blank ${blank.blankId} answer is not one of its options`,
          });
        }
      }
      const blankIds = new Set(blanks.map((b) => b.blankId));
      for (const id of Object.keys(key.blanks)) {
        if (!blankIds.has(id)) {
          issues.push({ path: at, message: `answer key references unknown blank ${id}` });
        }
      }
    }
  }

  if (key.rendererType === "table_response") {
    const config = rendererConfigSchemas.table_response.safeParse(part.config);
    if (config.success) {
      const editable = new Set(
        config.data.columns.filter((c) => c.editable).map((c) => c.id),
      );
      const rowIds = new Set(config.data.rows.map((r) => r.id));
      for (const ref of Object.keys(key.cells)) {
        const [rowId, colId] = ref.split(".");
        if (!rowId || !colId || !rowIds.has(rowId) || !editable.has(colId)) {
          issues.push({ path: at, message: `answer key references non-editable cell ${ref}` });
        }
      }
      const expected = config.data.rows.length * editable.size;
      if (Object.keys(key.cells).length !== expected) {
        issues.push({
          path: at,
          message: `answer key covers ${Object.keys(key.cells).length} of ${expected} editable cells`,
        });
      }
    }
  }

  if (key.rendererType === "table_dropdown") {
    const config = rendererConfigSchemas.table_dropdown.safeParse(part.config);
    if (config.success) {
      // Resolve every cell exactly as the renderer does, so validation cannot
      // disagree with what the student is shown.
      const dropdowns = new Map<string, ReadonlyArray<{ id: string }>>();
      for (const row of config.data.rows) {
        for (const column of config.data.columns) {
          if (row.fixed?.[column.id] !== undefined) continue;
          const options = row.options?.[column.id] ?? column.options;
          if (options) dropdowns.set(`${row.id}.${column.id}`, options);
        }
      }

      if (dropdowns.size === 0) {
        issues.push({ path: at, message: "table has no dropdown cells to answer" });
      }

      for (const [ref, answer] of Object.entries(key.cells)) {
        const options = dropdowns.get(ref);
        if (!options) {
          issues.push({ path: at, message: `answer key references non-dropdown cell ${ref}` });
        } else if (!options.some((o) => o.id === answer)) {
          issues.push({
            path: at,
            message: `cell ${ref} answer is not one of its options`,
          });
        }
      }

      for (const ref of dropdowns.keys()) {
        if (!(ref in key.cells)) {
          issues.push({ path: at, message: `dropdown cell ${ref} has no answer` });
        }
      }
    }
  }

  return issues;
}
