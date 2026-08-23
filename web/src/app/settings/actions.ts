"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { MODEL_STAGES, type ModelStage } from "@/lib/ai/endpoint";
import type {
  GenerationProviderName,
  MarkingProviderName,
} from "@/lib/ai/provider-names";
import { recordTestResult, saveSettings, type SettingsPatch } from "@/lib/ai/settings";
import { runSmokeTest } from "@/lib/ai/smoke-test";
import { requireAdmin } from "@/lib/auth/current-user";

/**
 * The settings screen writes here.
 *
 * Every action re-checks `requireAdmin` rather than trusting the page that
 * rendered the form: a server action is a public endpoint, and a student who
 * knows its name could otherwise post to it.
 */

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function problem(message: string): never {
  redirect(`/settings?problem=${encodeURIComponent(message)}`);
}

export async function saveSettingsAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin("/settings");

  const baseUrl = field(formData, "baseUrl");
  const model = field(formData, "model");
  const apiKey = field(formData, "apiKey");
  const removeKey = formData.get("removeKey") === "on";

  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) {
    problem("The base URL must start with http:// or https://.");
  }
  if (baseUrl && !model) {
    problem("A base URL needs a model name to go with it.");
  }

  const modelByStage: Partial<Record<ModelStage, string | null>> = {};
  for (const stage of MODEL_STAGES) {
    if (stage === "smoke") continue;
    modelByStage[stage] = field(formData, `model_${stage}`) || null;
  }

  const patch: SettingsPatch = {
    baseUrl: baseUrl || null,
    model: model || null,
    modelByStage,
    generationProvider: readGenerationProvider(field(formData, "generationProvider")),
    markingProvider: readMarkingProvider(field(formData, "markingProvider")),
  };

  // An empty key box means "leave it alone", so a save does not silently wipe a
  // key the administrator cannot see to retype. Removing one is deliberate.
  if (removeKey) patch.apiKey = null;
  else if (apiKey) patch.apiKey = apiKey;

  saveSettings(patch, admin.id);
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

export async function testConnectionAction(): Promise<void> {
  const admin = await requireAdmin("/settings");

  const result = await runSmokeTest();
  recordTestResult({
    ok: result.ok,
    at: Date.now(),
    jsonMode: result.jsonMode,
    summary: result.summary,
    problem: result.problem,
    byUserId: admin.id,
  });

  revalidatePath("/settings");
  redirect("/settings?tested=1");
}

function readGenerationProvider(value: string): GenerationProviderName | null {
  if (value === "sample" || value === "model") return value;
  return null;
}

function readMarkingProvider(value: string): MarkingProviderName | null {
  if (value === "model" || value === "none") return value;
  return null;
}
