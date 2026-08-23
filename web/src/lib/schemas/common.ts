import { z } from "zod";

/** Integer marks only — SPEC_ADDENDUM.md §8. Never half marks. */
export const marksSchema = z.number().int().min(0).max(20);

export const idSchema = z.string().min(1).max(120);

/** Stable dotted syllabus id, e.g. `ssa.2.5`. */
export const syllabusItemIdSchema = z
  .string()
  .regex(/^[a-z]+\.\d+\.\d+$/, "expected a syllabus dot point id such as ssa.2.5");

export const commandVerbSchema = z.enum([
  "account for",
  "analyse",
  "apply",
  "assess",
  "compare",
  "construct",
  "contrast",
  "describe",
  "demonstrate",
  "design",
  "discuss",
  "distinguish",
  "evaluate",
  "explain",
  "identify",
  "interpret",
  "investigate",
  "justify",
  "outline",
  "predict",
  "propose",
  "recommend",
  "state",
]);

export const cognitiveDemandSchema = z.enum([
  "recall",
  "comprehension",
  "application",
  "analysis",
  "synthesis",
  "evaluation",
]);

/**
 * Provenance kept on every generated question (CLAUDE.md §3).
 * Chunk and archetype ids are empty for the hand-written fixture paper.
 */
export const sourceReferenceSchema = z.object({
  kind: z.enum(["syllabus", "note_chunk", "archetype", "marking_guide"]),
  id: z.string().min(1),
  detail: z.string().optional(),
});

export type SourceReference = z.infer<typeof sourceReferenceSchema>;

export const generationMetadataSchema = z.object({
  provider: z.enum(["sample", "model"]),
  model: z.string().optional(),
  promptVersion: z.string(),
  archetypeId: z.string().optional(),
  scenarioDomain: z.string().optional(),
  generatedAt: z.string().optional(),
  criticPasses: z.number().int().min(0).optional(),
  regenerations: z.number().int().min(0).optional(),
});

export type GenerationMetadata = z.infer<typeof generationMetadataSchema>;
