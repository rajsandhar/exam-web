import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  questionGroups,
  questionPartSyllabusItems,
  questionParts,
} from "@/lib/db/schema";
import type {
  QuestionGroupForStudent,
  QuestionPartForStudent,
} from "@/lib/schemas/question";
import { rendererTypeSchema } from "@/lib/schemas/renderers";
import type { StimulusSpec } from "@/lib/schemas/stimulus";

/**
 * The only query the exam page is allowed to use.
 *
 * `answer_key_json` and `marking_guideline_json` are never named in the select
 * list, so there is no object in scope that could be spread into a client
 * component and serialised into the RSC payload (SPEC_ADDENDUM.md §7).
 */

export type StudentQuestionGroup = QuestionGroupForStudent & {
  /** Database id, used for flags and highlights. */
  rowId: string;
};

export function getStudentPaper(examId: string): StudentQuestionGroup[] {
  const groupRows = db
    .select({
      id: questionGroups.id,
      position: questionGroups.position,
      totalMarks: questionGroups.totalMarks,
      section: questionGroups.section,
      layout: questionGroups.layout,
      stimulusJson: questionGroups.stimulusJson,
      cognitiveDemand: questionGroups.cognitiveDemand,
      metadataJson: questionGroups.metadataJson,
    })
    .from(questionGroups)
    .where(eq(questionGroups.examId, examId))
    .orderBy(asc(questionGroups.position))
    .all();

  if (groupRows.length === 0) return [];

  // Explicit column list: the key-bearing columns are not readable from here.
  const partRows = db
    .select({
      id: questionParts.id,
      questionGroupId: questionParts.questionGroupId,
      position: questionParts.position,
      label: questionParts.label,
      rendererType: questionParts.rendererType,
      marks: questionParts.marks,
      prompt: questionParts.prompt,
      configJson: questionParts.configJson,
    })
    .from(questionParts)
    .orderBy(asc(questionParts.position))
    .all();

  const partSyllabus = db
    .select({
      questionPartId: questionPartSyllabusItems.questionPartId,
      syllabusItemId: questionPartSyllabusItems.syllabusItemId,
    })
    .from(questionPartSyllabusItems)
    .all();

  const syllabusByPart = new Map<string, string[]>();
  for (const row of partSyllabus) {
    const list = syllabusByPart.get(row.questionPartId) ?? [];
    list.push(row.syllabusItemId);
    syllabusByPart.set(row.questionPartId, list);
  }

  return groupRows.map((group) => {
    const metadata = group.metadataJson as {
      kind?: "single" | "multipart_group";
      syllabusItemIds?: string[];
      sourceReferences?: unknown[];
      generationMetadata?: Record<string, unknown>;
    };

    const parts: QuestionPartForStudent[] = partRows
      .filter((p) => p.questionGroupId === group.id)
      .map((p) => {
        const config = { ...(p.configJson as Record<string, unknown>) };
        const commandVerb = config.__commandVerb;
        delete config.__commandVerb;
        return {
          id: p.id,
          label: p.label,
          marks: p.marks,
          rendererType: rendererTypeSchema.parse(p.rendererType),
          prompt: p.prompt,
          config,
          syllabusItemIds: syllabusByPart.get(p.id) ?? [],
          ...(typeof commandVerb === "string"
            ? { commandVerb: commandVerb as QuestionPartForStudent["commandVerb"] }
            : {}),
        };
      });

    return {
      rowId: group.id,
      id: group.id,
      position: group.position,
      totalMarks: group.totalMarks,
      section: group.section,
      kind: metadata.kind ?? (parts.length > 1 ? "multipart_group" : "single"),
      layout: group.layout,
      stimulus: (group.stimulusJson as StimulusSpec | null) ?? null,
      cognitiveDemand:
        (group.cognitiveDemand as QuestionGroupForStudent["cognitiveDemand"]) ??
        "application",
      syllabusItemIds: metadata.syllabusItemIds ?? [],
      sourceReferences: [],
      generationMetadata: {
        provider: "mock",
        promptVersion: "hidden",
      },
      parts,
    };
  });
}

/** Summary shown on the instructions screen (CLAUDE.md §10.2). */
export function getPaperSummary(examId: string) {
  const groups = db
    .select({
      id: questionGroups.id,
      section: questionGroups.section,
      totalMarks: questionGroups.totalMarks,
    })
    .from(questionGroups)
    .where(eq(questionGroups.examId, examId))
    .all();

  const parts = db
    .select({
      questionGroupId: questionParts.questionGroupId,
      marks: questionParts.marks,
      rendererType: questionParts.rendererType,
    })
    .from(questionParts)
    .all();

  const groupIds = new Set(groups.map((g) => g.id));
  const ownParts = parts.filter((p) => groupIds.has(p.questionGroupId));
  const multipart = groups.filter(
    (g) => ownParts.filter((p) => p.questionGroupId === g.id && p.marks > 0).length > 1,
  ).length;

  return {
    questionCount: groups.length,
    totalMarks: groups.reduce((sum, g) => sum + g.totalMarks, 0),
    objectiveMarks: groups
      .filter((g) => g.section === "objective")
      .reduce((sum, g) => sum + g.totalMarks, 0),
    constructedMarks: groups
      .filter((g) => g.section === "constructed")
      .reduce((sum, g) => sum + g.totalMarks, 0),
    multipartCount: multipart,
  };
}
