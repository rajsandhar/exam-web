import {
  BLUEPRINT_RULES,
  GENERATION_MAX_CALLS,
  GENERATION_MAX_TOKENS,
  MAX_QUESTION_ATTEMPTS,
  OBJECTIVE_CRITIQUE_SAMPLE_RATE,
  TOKEN_BUDGETS,
} from "@/lib/config";

/**
 * What one paper costs, before anyone spends it.
 *
 * A generation that failed cost 73 dollars across 788 requests, and nothing in
 * the application had ever said what a paper was going to cost — the first
 * anyone knew was the provider's billing page the next day. This is the number
 * that should have been on screen when the model was chosen.
 *
 * It is derived from the same constants the generator uses — the blueprint item
 * ranges, the attempt limit, the critic sample rate and the per-stage token
 * ceilings — so it cannot quietly drift away from what actually happens.
 *
 * Two figures, because the gap between them is the point: a paper where every
 * question is accepted first time, and one where every question is retried to
 * the limit. Real papers land between, and the ceiling stops the tail.
 */

export type PaperCostEstimate = {
  /** Question groups a blueprint typically plans. */
  questions: { typical: number; most: number };
  /** Model calls, not counting the SDK's own retries. */
  calls: { typical: number; most: number };
  /** Output tokens at the configured ceilings. Input is extra and smaller. */
  outputTokens: { typical: number; most: number };
  /** Where the runner gives up, whatever the estimate says. */
  ceiling: { calls: number; tokens: number };
};

export function estimatePaperCost(): PaperCostEstimate {
  const { objective, constructed } = BLUEPRINT_RULES;

  // One call generates one *group*, and a group can carry several parts, so the
  // item ranges are an upper bound on calls rather than a count of them. The
  // shipped reference paper plans 31 groups for 40 items, and that ratio is the
  // only evidence available for how much grouping a real blueprint does.
  const items = {
    typical: (objective.minItems + objective.maxItems + constructed.minItems + constructed.maxItems) / 2,
    most: objective.maxItems + constructed.maxItems,
  };
  const GROUPS_PER_ITEM = 31 / 40;

  const typicalQuestions = Math.round(items.typical * GROUPS_PER_ITEM);
  // The worst case assumes no grouping at all: one question per item.
  const mostQuestions = items.most;

  // One blueprint call, plus a second when the paper is too close to the last.
  const planCalls = { typical: 1, most: 2 };

  // Critic: every extended question, and a sample of the short ones.
  const criticShare = (1 + OBJECTIVE_CRITIQUE_SAMPLE_RATE) / 2;

  const typicalCalls =
    planCalls.typical + typicalQuestions + Math.round(typicalQuestions * criticShare);
  const mostCalls =
    planCalls.most + mostQuestions * MAX_QUESTION_ATTEMPTS + mostQuestions;

  const typicalTokens =
    planCalls.typical * TOKEN_BUDGETS.blueprint +
    typicalQuestions * TOKEN_BUDGETS.question +
    Math.round(typicalQuestions * criticShare) * TOKEN_BUDGETS.critic;
  const mostTokens =
    planCalls.most * TOKEN_BUDGETS.blueprint +
    mostQuestions * MAX_QUESTION_ATTEMPTS * TOKEN_BUDGETS.question +
    mostQuestions * TOKEN_BUDGETS.critic;

  return {
    questions: { typical: typicalQuestions, most: mostQuestions },
    calls: { typical: typicalCalls, most: mostCalls },
    outputTokens: { typical: typicalTokens, most: mostTokens },
    ceiling: { calls: GENERATION_MAX_CALLS, tokens: GENERATION_MAX_TOKENS },
  };
}

/** `1,240,000` → `1.24M`, so a table of these stays readable. */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
}
