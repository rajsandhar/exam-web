import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { aiSettings, type AiSettingsRow } from "@/lib/db/schema";

import {
  MODEL_STAGES,
  readEnvEndpointConfig,
  type EndpointConfig,
  type ModelStage,
} from "./endpoint";
import type { GenerationProviderName, MarkingProviderName } from "./provider-names";

/**
 * Where the endpoint configuration actually comes from.
 *
 * An administrator edits it on `/settings`, so a stored row wins over the
 * environment. The environment remains a valid way to configure a container
 * that has no administrator yet, and is what the row falls back to field by
 * field — setting only a model on the screen keeps the base URL from the
 * environment rather than silently blanking it.
 *
 * This module reaches the database, so it must never be imported by anything a
 * client component can reach. `endpoint.ts` holds the pure half.
 */

if (typeof window !== "undefined") {
  throw new Error("src/lib/ai/settings.ts is server-only.");
}

const ROW_ID = "default";

export type StoredSettings = {
  baseUrl: string | null;
  apiKey: string | null;
  model: string | null;
  modelByStage: Partial<Record<ModelStage, string>>;
  generationProvider: GenerationProviderName | null;
  markingProvider: MarkingProviderName | null;
  lastTest: LastTest | null;
  updatedAt: number | null;
  updatedByUserId: string | null;
};

export type LastTest = {
  ok: boolean;
  at: number;
  jsonMode: string | null;
  summary: string;
  problem: string | null;
  byUserId: string | null;
};

async function readRow(): Promise<AiSettingsRow | undefined> {
  const [row] = await db
    .select()
    .from(aiSettings)
    .where(eq(aiSettings.id, ROW_ID))
    .limit(1);
  return row;
}

export async function readStoredSettings(): Promise<StoredSettings> {
  const row = await readRow();

  const modelByStage: Partial<Record<ModelStage, string>> = {};
  for (const stage of MODEL_STAGES) {
    const value = row?.modelByStageJson?.[stage]?.trim();
    if (value) modelByStage[stage] = value;
  }

  return {
    baseUrl: row?.baseUrl?.trim() || null,
    apiKey: row?.apiKey || null,
    model: row?.model?.trim() || null,
    modelByStage,
    generationProvider: row?.generationProvider ?? null,
    markingProvider: row?.markingProvider ?? null,
    lastTest: (row?.lastTestJson as LastTest | null) ?? null,
    updatedAt: row?.updatedAt?.getTime() ?? null,
    updatedByUserId: row?.updatedByUserId ?? null,
  };
}

/**
 * The configuration everything else uses: the stored row laid over the
 * environment, field by field. Null when neither supplies a base URL and model,
 * which is the state the sample paper is designed to work in.
 */
export async function resolveEndpointConfig(): Promise<EndpointConfig | null> {
  const env = readEnvEndpointConfig();
  const stored = await readStoredSettings();

  const baseUrl = stored.baseUrl ?? env?.baseUrl ?? null;
  const model = stored.model ?? env?.model ?? null;
  if (!baseUrl || !model) return null;

  return {
    baseUrl,
    // An endpoint that needs no key is a legitimate configuration, so an empty
    // key is not treated as missing.
    apiKey: stored.apiKey ?? env?.apiKey ?? "",
    model,
    modelByStage: { ...(env?.modelByStage ?? {}), ...stored.modelByStage },
  };
}

export type SettingsPatch = {
  baseUrl?: string | null;
  /** Undefined leaves the stored key alone; null removes it. */
  apiKey?: string | null;
  model?: string | null;
  modelByStage?: Partial<Record<ModelStage, string | null>>;
  generationProvider?: GenerationProviderName | null;
  markingProvider?: MarkingProviderName | null;
};

/** Writes the single row, creating it on first save. */
export async function saveSettings(
  patch: SettingsPatch,
  updatedByUserId: string,
): Promise<void> {
  const existing = await readRow();

  const modelByStage: Record<string, string> = { ...(existing?.modelByStageJson ?? {}) };
  for (const [stage, value] of Object.entries(patch.modelByStage ?? {})) {
    const trimmed = value?.trim();
    if (trimmed) modelByStage[stage] = trimmed;
    else delete modelByStage[stage];
  }

  const values = {
    baseUrl: patch.baseUrl === undefined ? (existing?.baseUrl ?? null) : normalise(patch.baseUrl),
    apiKey: patch.apiKey === undefined ? (existing?.apiKey ?? null) : patch.apiKey,
    model: patch.model === undefined ? (existing?.model ?? null) : normalise(patch.model),
    modelByStageJson: modelByStage,
    generationProvider:
      patch.generationProvider === undefined
        ? (existing?.generationProvider ?? null)
        : patch.generationProvider,
    markingProvider:
      patch.markingProvider === undefined
        ? (existing?.markingProvider ?? null)
        : patch.markingProvider,
    updatedAt: new Date(),
    updatedByUserId,
  };

  if (existing) {
    await db.update(aiSettings).set(values).where(eq(aiSettings.id, ROW_ID));
  } else {
    await db.insert(aiSettings).values({ id: ROW_ID, lastTestJson: null, ...values });
  }
}

export async function recordTestResult(result: LastTest): Promise<void> {
  const existing = await readRow();
  if (existing) {
    await db
      .update(aiSettings)
      .set({ lastTestJson: result })
      .where(eq(aiSettings.id, ROW_ID));
    return;
  }
  await db.insert(aiSettings).values({ id: ROW_ID, lastTestJson: result });
}

function normalise(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Whether a key is set, without revealing it. Never return the key itself. */
export async function hasStoredApiKey(): Promise<boolean> {
  return ((await readStoredSettings()).apiKey ?? "").length > 0;
}
