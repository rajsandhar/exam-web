import type { AnswerKey, ResponsePayload } from "@/lib/schemas/renderers";
import {
  dropdownCompletionConfigSchema,
  matchingMatrixConfigSchema,
  orderingConfigSchema,
  tableResponseConfigSchema,
} from "@/lib/schemas/renderers";

/**
 * Deterministic marking (CLAUDE.md §18).
 *
 * These response types have a single defensible answer, so they are marked in
 * application logic and never cost a model call.
 *
 * Marks are integers throughout (SPEC_ADDENDUM.md §8).
 *
 * ## Partial-credit rule
 *
 * A fully correct response always scores full marks. Otherwise:
 *
 * - **multi_select** — net scoring. `net = max(0, correctSelected −
 *   incorrectSelected)`, then `awarded = round(net ÷ correctTotal × marks)`.
 *   Ticking every option therefore scores zero, which is the point: guessing
 *   broadly must not be rewarded.
 * - **ordering** — the proportion of items in their correct absolute position.
 * - **matching_matrix** — the proportion of rows whose match set is exactly right.
 * - **dropdown_completion** — the proportion of blanks answered correctly.
 * - **table_response** — the proportion of editable cells matching an accepted
 *   value, compared case-insensitively with collapsed whitespace unless the
 *   answer key sets `caseSensitive`.
 *
 * In every partial case the score is floored, not rounded, and capped one below
 * full marks, so full marks require a fully correct response.
 */

export type DeterministicMark = {
  awardedMarks: number;
  maxMarks: number;
  correct: boolean;
  /** Short marker note shown in review. */
  detail: string;
};

export function markDeterministically(
  rendererType: string,
  config: unknown,
  answerKey: AnswerKey | null,
  response: ResponsePayload | null,
  marks: number,
): DeterministicMark | null {
  if (!answerKey || answerKey.rendererType !== rendererType) return null;

  switch (answerKey.rendererType) {
    case "single_choice": {
      const chosen = response?.rendererType === "single_choice" ? response.optionId : null;
      if (chosen === null) return unanswered(marks);
      const correct = chosen === answerKey.correctOptionId;
      return {
        awardedMarks: correct ? marks : 0,
        maxMarks: marks,
        correct,
        detail: correct ? "Correct response selected." : "Incorrect response selected.",
      };
    }

    case "multi_select": {
      const chosen =
        response?.rendererType === "multi_select" ? new Set(response.optionIds) : new Set<string>();
      if (chosen.size === 0) return unanswered(marks);

      const correctSet = new Set(answerKey.correctOptionIds);
      const hits = [...chosen].filter((id) => correctSet.has(id)).length;
      const misses = chosen.size - hits;
      const net = Math.max(0, hits - misses);
      const fullyCorrect = hits === correctSet.size && misses === 0;

      const awarded = fullyCorrect
        ? marks
        : clampPartial(Math.round((net / correctSet.size) * marks), marks);

      return {
        awardedMarks: awarded,
        maxMarks: marks,
        correct: fullyCorrect,
        detail: fullyCorrect
          ? "All correct responses selected, with no incorrect responses."
          : `${hits} of ${correctSet.size} correct response${
              correctSet.size === 1 ? "" : "s"
            } selected, with ${misses} incorrect selection${misses === 1 ? "" : "s"}.`,
      };
    }

    case "ordering": {
      const order = response?.rendererType === "ordering" ? response.order : [];
      if (order.length === 0) return unanswered(marks);

      const parsed = orderingConfigSchema.safeParse(config);
      const total = parsed.success ? parsed.data.items.length : answerKey.correctOrder.length;
      const inPlace = answerKey.correctOrder.filter((id, index) => order[index] === id).length;
      const fullyCorrect = inPlace === total;

      return {
        awardedMarks: fullyCorrect
          ? marks
          : clampPartial(Math.floor((inPlace / total) * marks), marks),
        maxMarks: marks,
        correct: fullyCorrect,
        detail: `${inPlace} of ${total} items placed in the correct position.`,
      };
    }

    case "matching_matrix": {
      const matches =
        response?.rendererType === "matching_matrix" ? response.matches : {};
      if (Object.keys(matches).length === 0) return unanswered(marks);

      const parsed = matchingMatrixConfigSchema.safeParse(config);
      const rowIds = parsed.success
        ? parsed.data.rows.map((r) => r.id)
        : Object.keys(answerKey.matches);

      let correctRows = 0;
      for (const rowId of rowIds) {
        const expected = new Set(answerKey.matches[rowId] ?? []);
        const given = new Set(matches[rowId] ?? []);
        if (
          expected.size === given.size &&
          [...expected].every((value) => given.has(value))
        ) {
          correctRows += 1;
        }
      }
      const fullyCorrect = correctRows === rowIds.length;

      return {
        awardedMarks: fullyCorrect
          ? marks
          : clampPartial(Math.floor((correctRows / rowIds.length) * marks), marks),
        maxMarks: marks,
        correct: fullyCorrect,
        detail: `${correctRows} of ${rowIds.length} rows matched correctly.`,
      };
    }

    case "dropdown_completion": {
      const blanks =
        response?.rendererType === "dropdown_completion" ? response.blanks : {};
      const answeredCount = Object.values(blanks).filter(
        (v) => v !== null && v !== "",
      ).length;
      if (answeredCount === 0) return unanswered(marks);

      const parsed = dropdownCompletionConfigSchema.safeParse(config);
      const blankIds = parsed.success
        ? parsed.data.segments.flatMap((s) => (s.kind === "blank" ? [s.blankId] : []))
        : Object.keys(answerKey.blanks);

      const correctCount = blankIds.filter(
        (id) => blanks[id] === answerKey.blanks[id],
      ).length;
      const fullyCorrect = correctCount === blankIds.length;

      return {
        awardedMarks: fullyCorrect
          ? marks
          : clampPartial(Math.floor((correctCount / blankIds.length) * marks), marks),
        maxMarks: marks,
        correct: fullyCorrect,
        detail: `${correctCount} of ${blankIds.length} selections correct.`,
      };
    }

    case "table_response": {
      const cells = response?.rendererType === "table_response" ? response.cells : {};
      const filled = Object.values(cells).filter((v) => v.trim() !== "").length;
      if (filled === 0) return unanswered(marks);

      const parsed = tableResponseConfigSchema.safeParse(config);
      const refs = parsed.success
        ? parsed.data.rows.flatMap((row) =>
            parsed.data.columns
              .filter((column) => column.editable)
              .map((column) => `${row.id}.${column.id}`),
          )
        : Object.keys(answerKey.cells);

      let correctCells = 0;
      for (const ref of refs) {
        const expected = answerKey.cells[ref];
        if (!expected) continue;
        const given = cells[ref] ?? "";
        const matched = expected.accepted.some((value) =>
          expected.caseSensitive
            ? normaliseCell(value, true) === normaliseCell(given, true)
            : normaliseCell(value, false) === normaliseCell(given, false),
        );
        if (matched) correctCells += 1;
      }
      const fullyCorrect = correctCells === refs.length;

      return {
        awardedMarks: fullyCorrect
          ? marks
          : clampPartial(Math.floor((correctCells / refs.length) * marks), marks),
        maxMarks: marks,
        correct: fullyCorrect,
        detail: `${correctCells} of ${refs.length} cells correct.`,
      };
    }

    default:
      // short_text, rich_text_response and the code/diagram renderers are
      // rubric-marked; they are not the deterministic marker's business.
      return null;
  }
}

function unanswered(marks: number): DeterministicMark {
  return {
    awardedMarks: 0,
    maxMarks: marks,
    correct: false,
    detail: "No response given.",
  };
}

/** Partial credit is floored and can never reach full marks. */
function clampPartial(value: number, marks: number): number {
  return Math.max(0, Math.min(Math.max(0, marks - 1), value));
}

function normaliseCell(value: string, caseSensitive: boolean): string {
  const collapsed = value.trim().replace(/\s+/g, " ");
  return caseSensitive ? collapsed : collapsed.toLowerCase();
}
