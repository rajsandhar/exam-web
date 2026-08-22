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
import { retrieveForSyllabusItems } from "@/lib/ingest/retrieval";
import { isDeterministic, isResponsive } from "@/lib/schemas/renderers";

import { markDeterministically } from "./deterministic";
import { sumAwardedMarks } from "@/lib/db/queries/marking";

/**
 * Marks a submitted attempt.
 *
 * Deterministic checkers handle everything they can mark reliably; only what is
 * left goes to the rubric marker (CLAUDE.md §18). With `AI_PROVIDER=mock` the
 * rubric marker returns an explicit "not assessed" result rather than inventing
 * a score.
 */

export type MarkingRecord = {
  method: "deterministic" | "rubric" | "not_marked" | "executed_in_browser";
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
  hiddenTests?: {
    passed: number;
    total: number;
    cases: Array<{
      name: string;
      passed: boolean;
      expected: string;
      actual: string | null;
      error: string | null;
    }>;
  };
};

/** Renderers whose marks come from the browser, after submission. */
const BROWSER_EXECUTED = new Set(["python_editor", "sql_editor"]);

/**
 * Phase one of marking: everything that does not need the browser.
 *
 * Python and SQL responses are skipped here — their marks arrive from the
 * client once it has executed the code (see `execution-requests.ts`), and
 * `finaliseMarking` totals the paper afterwards.
 */
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
        // Marked by the browser in phase two; leave it untouched here.
        if (BROWSER_EXECUTED.has(part.rendererType)) continue;

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
          const wording = part.syllabusItemIds.map((id) => ({
            id,
            exactText: syllabusText.get(id) ?? id,
          }));

          // Ground the marker in the same notes the question was written from,
          // so it marks against the depth the course actually teaches.
          const noteChunks = retrieveForSyllabusItems(wording, {
            limit: 3,
            sourceTypes: ["notes"],
          }).map((chunk) => ({ id: chunk.id, content: chunk.content }));

          const result = await provider.markResponse({
            part: toProviderPart(part),
            stimulusText,
            response,
            syllabusWording: wording,
            noteChunks,
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

    void total;
    finaliseMarking(attemptId, false);
  } catch (cause) {
    setAttemptScore(
      attemptId,
      0,
      "failed",
      cause instanceof Error ? cause.message : String(cause),
    );
  }
}

/**
 * Totals the paper from the marks already stored, and closes the attempt.
 *
 * Called once after phase one when a paper has no executable questions, and
 * again after the browser reports execution results when it does. Summing the
 * stored rows rather than an in-memory running total means the two phases
 * cannot disagree about the score.
 */
export async function finaliseMarking(
  attemptId: string,
  complete = true,
): Promise<void> {
  const attempt = getAttempt(attemptId);
  if (!attempt) return;

  const groups = getMarkingPaper(attempt.examId);
  const outstanding = groups
    .flatMap((group) => group.parts)
    .some((part) => BROWSER_EXECUTED.has(part.rendererType));

  const total = sumAwardedMarks(attemptId);

  // Stay "running" while the browser still owes us execution results.
  setAttemptScore(attemptId, total, complete || !outstanding ? "complete" : "running");
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
