import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

/**
 * Server-side Anthropic client (CLAUDE.md §15).
 *
 * The API key is never exposed to the browser — every caller of this module is
 * a route handler or a server-side service. The model is read from
 * `ANTHROPIC_MODEL`; no model name appears anywhere in the source.
 *
 * Sampling controls (`temperature`, `top_p`) were removed from the current
 * model family, so "low randomness for marking and validation" is expressed
 * through reasoning effort and through prompts that state exactly one
 * acceptable output shape, rather than through a temperature setting.
 */

if (typeof window !== "undefined") {
  throw new Error("src/lib/ai must never be imported by a client component.");
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

let cachedClient: Anthropic | null = null;

export function getModel(): string {
  const model = process.env.ANTHROPIC_MODEL?.trim();
  if (!model) {
    throw new Error(
      "ANTHROPIC_MODEL is not set. Copy .env.example to .env.local and set it " +
        "(see the file for the recommended value).",
    );
  }
  return model;
}

export function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Set it in .env.local, or set AI_PROVIDER=mock " +
        "to run without an API key.",
    );
  }
  cachedClient = new Anthropic();
  return cachedClient;
}

export type StructuredCallOptions<T extends z.ZodType> = {
  schema: T;
  /** Stable across calls of the same kind so the prefix stays cacheable. */
  system: string;
  user: string;
  effort?: Effort;
  maxTokens?: number;
  signal?: AbortSignal;
};

export type StructuredCallResult<T> = {
  value: T;
  usage: { inputTokens: number; outputTokens: number };
};

/**
 * One structured request. The response is constrained to the Zod schema by the
 * API and then re-parsed locally, so no unvalidated model JSON can reach the
 * database or the UI (CLAUDE.md §14, §23).
 */
export async function callStructured<T extends z.ZodType>(
  options: StructuredCallOptions<T>,
): Promise<StructuredCallResult<z.infer<T>>> {
  const client = getClient();

  const response = await client.messages.parse(
    {
      model: getModel(),
      max_tokens: options.maxTokens ?? 16000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: options.effort ?? "high",
        format: zodOutputFormat(options.schema),
      },
      // The system prompt is byte-stable per call type, so the prefix caches.
      system: [
        { type: "text", text: options.system, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: options.user }],
    },
    { signal: options.signal },
  );

  if (response.stop_reason === "refusal") {
    throw new Error(
      `The model declined this request (${response.stop_details?.category ?? "unknown"}).`,
    );
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("The model's response was cut off. Retry with a larger max_tokens.");
  }

  const parsed: unknown = response.parsed_output;
  if (parsed === null || parsed === undefined) {
    throw new Error("The model returned no structured output.");
  }

  // Belt and braces: validate again locally against the same schema.
  const result = options.schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Model output failed local validation: ${result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }

  return {
    value: result.data as z.infer<T>,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}

/** Test seam. */
export function __resetClient(): void {
  cachedClient = null;
}
