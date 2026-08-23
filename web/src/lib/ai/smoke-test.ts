import { z } from "zod";

import { callStructured, isEndpointConfigured, type JsonMode } from "./client";
import { describeEndpoint } from "./endpoint";
import { resolveEndpointConfig } from "./settings";

/**
 * Checks a configured endpoint before anything expensive depends on it.
 *
 * Generating a paper is around a hundred calls. Finding out on call seventy that
 * the endpoint cannot return structured output is an expensive way to learn it,
 * so this asks one small question and reports exactly what came back — whether
 * it is reachable, which JSON mode it supports, whether the output validated,
 * and how slow it was.
 *
 * Used by `pnpm ai:smoke` and by the Test connection button on `/settings`.
 */

/** Deliberately exercises the shapes that weak endpoints get wrong. */
const probeSchema = z.object({
  verdict: z.enum(["ok", "not_ok"]),
  count: z.number().int().min(1).max(5),
  items: z.array(z.string().min(1)).min(2).max(4),
  detail: z.object({
    note: z.string().min(1),
    optional: z.string().optional(),
  }),
});

export type SmokeResult = {
  ok: boolean;
  endpoint: string;
  /** Which rung of the ladder the endpoint managed. */
  jsonMode: JsonMode | null;
  /** True when the first attempt failed validation and a repair was needed. */
  repaired: boolean;
  latencyMs: number;
  usage: { inputTokens: number; outputTokens: number } | null;
  problem: string | null;
  /** Plain-language summary, safe to show in the UI. */
  summary: string;
};

export async function runSmokeTest(): Promise<SmokeResult> {
  if (!await isEndpointConfigured()) {
    return {
      ok: false,
      endpoint: "(not configured)",
      jsonMode: null,
      repaired: false,
      latencyMs: 0,
      usage: null,
      problem:
        "No endpoint is configured. Set a base URL and a model on this screen, " +
        "or through AI_BASE_URL and AI_MODEL in the environment.",
      summary: "Not configured.",
    };
  }

  const config = (await resolveEndpointConfig())!;
  const endpoint = describeEndpoint(config);
  const started = Date.now();

  try {
    const result = await callStructured({
      schema: probeSchema,
      stage: "smoke",
      schemaName: "connection_probe",
      maxTokens: 800,
      system:
        "You are checking whether this endpoint can return structured JSON. " +
        "Answer exactly as the schema requires and add nothing else.",
      user: [
        "Return a test object with:",
        '- verdict: "ok"',
        "- count: 3",
        '- items: exactly the three strings "alpha", "beta", "gamma"',
        '- detail.note: "connection verified"',
        "Leave detail.optional out entirely.",
      ].join("\n"),
    });

    const latencyMs = Date.now() - started;
    const correct =
      result.value.verdict === "ok" &&
      result.value.count === 3 &&
      result.value.items.length === 3;

    return {
      ok: true,
      endpoint,
      jsonMode: result.jsonMode,
      repaired: result.repaired,
      latencyMs,
      usage: result.usage,
      problem: null,
      summary: summarise(result.jsonMode, result.repaired, correct, latencyMs),
    };
  } catch (cause) {
    return {
      ok: false,
      endpoint,
      jsonMode: null,
      repaired: false,
      latencyMs: Date.now() - started,
      usage: null,
      problem: cause instanceof Error ? cause.message : String(cause),
      summary: "The endpoint could not complete a structured request.",
    };
  }
}

function summarise(
  mode: JsonMode,
  repaired: boolean,
  followedInstructions: boolean,
  latencyMs: number,
): string {
  const parts: string[] = [];

  parts.push(
    mode === "json_schema"
      ? "Supports schema-constrained output, which is the reliable path."
      : "Only supports plain JSON output, so the schema is sent in the prompt and " +
          "occasional correction retries are expected.",
  );

  if (repaired) {
    parts.push(
      "The first response did not match the schema and had to be corrected — " +
        "expect extra calls on complex requests.",
    );
  }

  if (!followedInstructions) {
    parts.push(
      "The response was valid but did not follow the instructions exactly, which " +
        "suggests a weaker model. Marking quality will suffer.",
    );
  }

  parts.push(`Round trip ${(latencyMs / 1000).toFixed(1)}s.`);
  return parts.join(" ");
}
