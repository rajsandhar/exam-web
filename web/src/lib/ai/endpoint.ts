/**
 * Where the model lives, and which model to use for each stage.
 *
 * The application is deliberately vendor-neutral: it speaks one wire format —
 * the widely implemented chat-completions shape — and knows nothing beyond a
 * base URL, a key and a model name. Any service exposing that format works, and
 * no provider is named anywhere in the code or in configuration.
 *
 * Configuration comes from the environment today. The admin screen will write
 * the same shape to the database later and take precedence over it.
 */

/** Stages that may use a different model. */
export const MODEL_STAGES = [
  "blueprint",
  "question",
  "critic",
  "marking",
  "moderation",
  "smoke",
] as const;

export type ModelStage = (typeof MODEL_STAGES)[number];

export type EndpointConfig = {
  baseUrl: string;
  apiKey: string;
  /** Used for any stage without its own override. */
  model: string;
  modelByStage: Partial<Record<ModelStage, string>>;
};

const STAGE_ENV: Record<ModelStage, string> = {
  blueprint: "AI_MODEL_BLUEPRINT",
  question: "AI_MODEL_QUESTION",
  critic: "AI_MODEL_CRITIC",
  marking: "AI_MODEL_MARKING",
  moderation: "AI_MODEL_MODERATION",
  smoke: "AI_MODEL",
};

/**
 * Marking is the stage a cheaper model hurts most: an unfair mark on a correct
 * answer is the failure SPEC_ADDENDUM.md §10 says loses a user for good. So it
 * never inherits a downgrade — tiering marking down has to be deliberate.
 */
export const NEVER_SILENTLY_DOWNGRADED: ReadonlyArray<ModelStage> = [
  "marking",
  "moderation",
];

export function readEndpointConfig(): EndpointConfig | null {
  const baseUrl = process.env.AI_BASE_URL?.trim();
  const model = process.env.AI_MODEL?.trim();
  if (!baseUrl || !model) return null;

  const modelByStage: Partial<Record<ModelStage, string>> = {};
  for (const stage of MODEL_STAGES) {
    const value = process.env[STAGE_ENV[stage]]?.trim();
    if (value && stage !== "smoke") modelByStage[stage] = value;
  }

  return {
    baseUrl,
    // Some endpoints (a local server, for instance) need no key at all.
    apiKey: process.env.AI_API_KEY?.trim() ?? "",
    model,
    modelByStage,
  };
}

export function modelFor(config: EndpointConfig, stage: ModelStage): string {
  return config.modelByStage[stage] ?? config.model;
}

/**
 * Human-readable summary of the configuration, safe to log or show in the UI.
 * The key is never included — only whether one is set.
 */
export function describeEndpoint(config: EndpointConfig): string {
  const overrides = MODEL_STAGES.filter(
    (stage) => config.modelByStage[stage] && config.modelByStage[stage] !== config.model,
  ).map((stage) => `${stage}=${config.modelByStage[stage]}`);

  return [
    `endpoint ${config.baseUrl}`,
    `model ${config.model}`,
    config.apiKey ? "key set" : "no key",
    ...(overrides.length > 0 ? [`overrides: ${overrides.join(", ")}`] : []),
  ].join(", ");
}
