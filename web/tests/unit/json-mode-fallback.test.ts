import OpenAI from "openai";
import { describe, expect, it } from "vitest";

import { looksLikeUnsupportedFormat } from "@/lib/ai/client";

/**
 * When to stop asking an endpoint for schema-constrained output.
 *
 * Every stage sends its Zod schema as `response_format: json_schema`, and
 * services differ wildly on what they accept. The ladder drops to plain JSON
 * when the request is refused — but it used to require the refusal to *say* so,
 * matching words like "schema" or "unsupported" in the message.
 *
 * One endpoint refuses with nothing but "Request contains an invalid argument".
 * That matched nothing, the ladder never stepped down, and four papers in a row
 * died on a request whose very next rung would have worked.
 */

function apiError(status: number, message: string) {
  return new OpenAI.APIError(status, { error: { message } }, message, undefined);
}

describe("dropping to plain JSON output", () => {
  it("steps down on a refusal that explains nothing", () => {
    // Verbatim, from the endpoint that broke this.
    const cause = apiError(400, "Request contains an invalid argument.");
    expect(looksLikeUnsupportedFormat(cause)).toBe(true);
  });

  it("still steps down on refusals that do explain themselves", () => {
    for (const message of [
      "response_format is not supported for this model",
      "Invalid parameter: json_schema",
      "Unsupported value: 'response_format'",
    ]) {
      expect(looksLikeUnsupportedFormat(apiError(400, message))).toBe(true);
    }
  });

  it("steps down for the other ways a request is refused outright", () => {
    expect(looksLikeUnsupportedFormat(apiError(404, "model not found"))).toBe(true);
    expect(looksLikeUnsupportedFormat(apiError(422, "unprocessable"))).toBe(true);
  });

  it("does not step down for anything dropping the schema cannot fix", () => {
    // A rate limit is not a schema problem, and neither is a bad key. Retrying
    // without the schema would spend another call to learn the same thing.
    expect(looksLikeUnsupportedFormat(apiError(429, "rate limit exceeded"))).toBe(false);
    expect(looksLikeUnsupportedFormat(apiError(401, "invalid api key"))).toBe(false);
    expect(looksLikeUnsupportedFormat(apiError(500, "internal error"))).toBe(false);
    expect(looksLikeUnsupportedFormat(new Error("socket hang up"))).toBe(false);
  });
});
