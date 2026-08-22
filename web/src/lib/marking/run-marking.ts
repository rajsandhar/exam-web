import { getAiProvider } from "@/lib/ai";
import { stimulusToText } from "@/lib/marking/stimulus-text";
import { getAttempt, getResponses } from "@/lib/db/queries/attempts";
import {
  getMarkingPaper,
  saveMark,
  setAttemptScore,
  type MarkingPart,
} from "@/lib/db/queries/marking";
import { getSyllabusTextById } from "@/lib/db/queries/syllabus";
import { isDeterministic, isResponsive } from "@/lib/schemas/renderers";

import { markDeterministically } from "./deterministic";

/**
 * Marks a submitted attempt.
 *
 * Deterministic checkers handle everything they can mark reliably; only what is
 * left goes to the rubric marker (CLAUDE.md §18). With `AI_PROVIDER=mock` the
 * rubric marker returns an explicit "not assessed" result rather than inventing
 * a score.
 */

export type MarkingRecord = {
  method: "deterministic" | "rubric" | "not_marked";
  awardedMarks: number;
  maxMarks: number;
  detail?: string;
  correct?: boolean;
  reasoning?: string;
  evidence?: string[];
  missingElements?: string[];
  criterionJudgements?: Array<{ description: string; met: string; comment: string }>;
  confidence?: string;
  fullMarkExemplar?: string;
  moderated?: Record<string, unknown>;
};

export async function markAttempt(attemptId: string): Promise<void> {
  const attempt = getAttempt(attemptId);
  if (!attempt) return;

  setAttemptScore(attemptId, 0, "running");

  try {
    const groups = getMarkingPaper(attempt.examId);
    const responses = getResponses(attemptId);
    const syllabusText = getSyllabusTextById();
    const provider = getAiProvider();

    let total = 0;

    for (const group of groups) {
      const stimulusText = stimulusToText(group.stimulus);

      for (const part of group.parts) {
        if (!isResponsive(part.rendererType)) continue;

        const response = responses[part.id] ?? null;
        let record: MarkingRecord;

        if (isDeterministic(part.rendererType)) {
          const marked = markDeterministically(
            part.rendererType,
            part.config,
            part.answerKey,
            response,
            part.marks,
          );
          record = marked
            ? {
                method: "deterministic",
                awardedMarks: marked.awardedMarks,
                maxMarks: marked.maxMarks,
                correct: marked.correct,
                detail: marked.detail,
              }
            : { method: "not_marked", awardedMarks: 0, maxMarks: part.marks };
        } else if (provider.name === "mock") {
          record = {
            method: "not_marked",
            awardedMarks: 0,
            maxMarks: part.marks,
            detail:
              "Written responses are marked by the rubric marker, which is not enabled.",
            fullMarkExemplar: exemplarFor(part),
          };
        } else {
          const result = await provider.markResponse({
            part: toProviderPart(part),
            stimulusText,
            response,
            syllabusWording: part.syllabusItemIds.map((id) => ({
              id,
              exactText: syllabusText.get(id) ?? id,
            })),
            noteChunks: [],
          });
          record = {
            method: "rubric",
            awardedMarks: result.awardedMarks,
            maxMarks: result.maxMarks,
            reasoning: result.reasoning,
            evidence: result.evidence,
            missingElements: result.missingElements,
            criterionJudgements: result.criterionJudgements,
            confidence: result.confidence,
            fullMarkExemplar: result.fullMarkExemplar,
            ...(result.moderated
              ? { moderated: result.moderated as unknown as Record<string, unknown> }
              : {}),
          };
        }

        total += record.awardedMarks;
        saveMark(attemptId, part.id, record.awardedMarks, record as unknown as Record<string, unknown>);
      }
    }

    setAttemptScore(attemptId, total, "complete");
  } catch (cause) {
    setAttemptScore(
      attemptId,
      0,
      "failed",
      cause instanceof Error ? cause.message : String(cause),
    );
  }
}

function exemplarFor(part: MarkingPart): string {
  if (part.answerKey && "modelAnswer" in part.answerKey) return part.answerKey.modelAnswer;
  if (part.answerKey && "accepted" in part.answerKey) {
    return part.answerKey.accepted.join("\n");
  }
  return part.markingGuideline?.modelAnswer ?? "";
}

/** Shapes a marking row as the provider's `QuestionPartForMarking`. */
function toProviderPart(part: MarkingPart) {
  return {
    id: part.id,
    label: part.label,
    marks: part.marks,
    rendererType: part.rendererType,
    prompt: part.prompt,
    config: part.config,
    syllabusItemIds: part.syllabusItemIds,
    answerKey: part.answerKey,
    markingGuideline: part.markingGuideline,
  };
}
