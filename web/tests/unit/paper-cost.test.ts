import { describe, expect, it } from "vitest";

import { estimatePaperCost, formatTokens } from "@/lib/ai/paper-cost";
import {
  GENERATION_MAX_CALLS,
  GENERATION_MAX_TOKENS,
  MAX_QUESTION_ATTEMPTS,
  TOKEN_BUDGETS,
} from "@/lib/config";

/**
 * The number that should have been on screen before anyone spent it.
 *
 * A failed generation cost 73 dollars across 788 requests, and the application
 * had never said what a paper cost. These check the estimate is derived from
 * the constants the generator actually uses, so it cannot drift into fiction.
 */

describe("what a paper is estimated to cost", () => {
  const estimate = estimatePaperCost();

  it("counts a question, its retries and its critique", () => {
    expect(estimate.questions.typical).toBeGreaterThan(20);
    expect(estimate.questions.most).toBeGreaterThanOrEqual(estimate.questions.typical);

    // Every question retried to the limit, plus a critique each, plus planning.
    expect(estimate.calls.most).toBeGreaterThanOrEqual(
      estimate.questions.most * MAX_QUESTION_ATTEMPTS,
    );
    expect(estimate.calls.typical).toBeLessThan(estimate.calls.most);
  });

  it("prices calls at the ceilings the calls are actually given", () => {
    // If a budget changes, the estimate has to move with it — that is the whole
    // reason the budgets were pulled into config.
    expect(estimate.outputTokens.typical).toBeGreaterThan(
      estimate.questions.typical * TOKEN_BUDGETS.question,
    );
    expect(estimate.outputTokens.most).toBeGreaterThan(estimate.outputTokens.typical);
  });

  it("reports the ceiling the runner will actually stop at", () => {
    expect(estimate.ceiling).toEqual({
      calls: GENERATION_MAX_CALLS,
      tokens: GENERATION_MAX_TOKENS,
    });
  });

  it("keeps even an unlucky paper under the ceiling, or the ceiling is wrong", () => {
    // Not just a typical paper: aborting one that could legitimately have
    // finished throws away everything already paid for, which is worse than
    // either finishing it or never starting. The guard is for runaways — the
    // run that prompted it made 788 calls.
    expect(estimate.calls.most).toBeLessThan(GENERATION_MAX_CALLS);
    expect(estimate.outputTokens.most).toBeLessThan(GENERATION_MAX_TOKENS);
  });
});

describe("formatting a token count", () => {
  it("keeps large numbers readable", () => {
    expect(formatTokens(1_240_000)).toBe("1.24M");
    expect(formatTokens(24_000)).toBe("24k");
    expect(formatTokens(800)).toBe("800");
  });
});
