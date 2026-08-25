import { eq } from "drizzle-orm";

import type { Blueprint } from "@/lib/ai/blueprint";
import { db } from "@/lib/db/client";
import { failExam, getExam, getExamSelectedItemIds, persistPaper } from "@/lib/db/queries/exams";
import { exams } from "@/lib/db/schema";
import { validatePaper } from "@/lib/schemas/paper-validation";
import { generatedPaperSchema, type QuestionGroupForMarking } from "@/lib/schemas/question";
import { IMPLEMENTED_RENDERERS } from "@/lib/schemas/renderers";
import { validAssetIds } from "@/lib/assets/queries";

import type { GenerationStore, ResumableState } from "./resumable";

/**
 * The resumable runner's state, in the columns the schema already has.
 *
 * `blueprint_json` was declared and never written to; the rest lives in
 * `progress_json`, which the progress screen already reads. No migration, which
 * matters: a migration would have to reach the hosted database before the
 * deploy that needs it, and nothing here may run one.
 */
export const databaseStore: GenerationStore = {
  async load(examId) {
    const exam = await getExam(examId);
    if (!exam) return null;

    return {
      status: exam.status,
      blueprint: (exam.blueprintJson as Blueprint | null) ?? null,
      state: (exam.progressJson ?? {}) as ResumableState,
      selectedSyllabusItemIds: await getExamSelectedItemIds(examId),
    };
  },

  async saveBlueprint(examId, blueprint) {
    await db
      .update(exams)
      .set({ blueprintJson: blueprint as unknown as Record<string, unknown> })
      .where(eq(exams.id, examId));
  },

  async saveState(examId, state) {
    await db
      .update(exams)
      .set({ progressJson: state as unknown as Record<string, unknown> })
      .where(eq(exams.id, examId));
  },

  async publish(examId, _blueprint, groups, selectedSyllabusItemIds) {
    const assessed = new Set(
      groups.flatMap((group: QuestionGroupForMarking) =>
        group.parts.flatMap((part) => part.syllabusItemIds),
      ),
    );

    const paper = generatedPaperSchema.parse({
      title: _blueprint.title,
      totalMarks: 100,
      selectedSyllabusItemIds,
      unassessedSyllabusItemIds: selectedSyllabusItemIds.filter((id) => !assessed.has(id)),
      groups,
      generationMetadata: {
        provider: "model",
        generatedAt: new Date().toISOString(),
      },
    });

    // The same gate a single-pass run goes through. A paper assembled across
    // several invocations is not trusted any further than one built in a
    // single pass.
    const result = validatePaper(paper, {
      availableRenderers: IMPLEMENTED_RENDERERS,
      availableAssetIds: await validAssetIds(),
      enforceCoverage: true,
    });
    if (!result.ok) {
      throw new Error(
        "Generated paper failed validation:\n" +
          result.issues.map((issue) => `  • ${issue.path}: ${issue.message}`).join("\n"),
      );
    }

    await persistPaper(examId, paper);
  },

  async fail(examId, reason) {
    await failExam(examId, reason);
  },
};
