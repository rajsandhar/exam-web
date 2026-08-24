import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  readStoredSettings,
  recordTestResult,
  resolveEndpointConfig,
  saveSettings,
} from "@/lib/ai/settings";
import { resolveGenerationProvider, resolveMarkingProvider } from "@/lib/ai/provider";
import { insertUser, truncate } from "../support/db";

/**
 * What the settings screen writes, and how it combines with the environment.
 *
 * The rule that matters: an administrator's stored value wins, but only field by
 * field — setting a model must not blank a base URL that is coming from the
 * environment, and saving must never silently discard a key nobody can see to
 * retype.
 */

const ENV_KEYS = [
  "AI_BASE_URL",
  "AI_API_KEY",
  "AI_MODEL",
  "AI_MODEL_MARKING",
  "GENERATION_PROVIDER",
  "MARKING_PROVIDER",
] as const;

const ADMIN = "settings-test-admin";

beforeEach(async () => {
  await truncate("ai_settings");
  // The row records who changed it, and that is a real foreign key.
  await insertUser({ id: ADMIN, role: "admin" });
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(async () => {
  await truncate("ai_settings", "users");
  for (const key of ENV_KEYS) delete process.env[key];
});

async function configureEnv() {
  process.env.AI_BASE_URL = "https://from-env.example/v1";
  process.env.AI_MODEL = "env-model";
  process.env.AI_API_KEY = "env-key";
}

describe("resolving the endpoint", () => {
  it("is unconfigured when neither source supplies one", async () => {
    expect(await resolveEndpointConfig()).toBeNull();
  });

  it("falls back to the environment when nothing is stored", async () => {
    configureEnv();
    expect(await resolveEndpointConfig()).toMatchObject({
      baseUrl: "https://from-env.example/v1",
      model: "env-model",
      apiKey: "env-key",
    });
  });

  it("prefers what an administrator stored", async () => {
    configureEnv();
    await saveSettings(
      { baseUrl: "https://stored.example/v1", model: "stored-model", apiKey: "stored-key" },
      ADMIN,
    );

    expect(await resolveEndpointConfig()).toMatchObject({
      baseUrl: "https://stored.example/v1",
      model: "stored-model",
      apiKey: "stored-key",
    });
  });

  it("overlays field by field rather than all or nothing", async () => {
    configureEnv();
    // Only a model is stored; the base URL must still come from the environment.
    await saveSettings({ model: "stored-model" }, ADMIN);

    expect(await resolveEndpointConfig()).toMatchObject({
      baseUrl: "https://from-env.example/v1",
      model: "stored-model",
    });
  });

  it("treats an endpoint that needs no key as configured", async () => {
    await saveSettings(
      { baseUrl: "http://localhost:11434/v1", model: "local-model", apiKey: null },
      ADMIN,
    );
    expect(await resolveEndpointConfig()).toMatchObject({ apiKey: "" });
  });
});

describe("saving", () => {
  it("keeps the stored key when the field is left blank", async () => {
    await saveSettings({ baseUrl: "https://a.example/v1", model: "m", apiKey: "secret" }, ADMIN);
    // A later save that does not mention the key at all.
    await saveSettings({ baseUrl: "https://a.example/v1", model: "m2" }, ADMIN);

    expect((await readStoredSettings()).apiKey).toEqual("secret");
    expect((await readStoredSettings()).model).toEqual("m2");
  });

  it("removes the key only when asked explicitly", async () => {
    await saveSettings({ baseUrl: "https://a.example/v1", model: "m", apiKey: "secret" }, ADMIN);
    await saveSettings({ apiKey: null }, ADMIN);

    expect((await readStoredSettings()).apiKey).toBeNull();
  });

  it("records per-stage models, and clears one when it is blanked", async () => {
    await saveSettings({ modelByStage: { marking: "careful-model" } }, ADMIN);
    expect((await readStoredSettings()).modelByStage.marking).toEqual("careful-model");

    await saveSettings({ modelByStage: { marking: null } }, ADMIN);
    expect((await readStoredSettings()).modelByStage.marking).toBeUndefined();
  });

  it("lets a stored stage override beat one from the environment", async () => {
    configureEnv();
    process.env.AI_MODEL_MARKING = "env-marking-model";
    await saveSettings({ modelByStage: { marking: "stored-marking-model" } }, ADMIN);

    expect((await resolveEndpointConfig())?.modelByStage.marking).toEqual("stored-marking-model");
  });

  it("remembers who changed it and when", async () => {
    const before = Date.now();
    await saveSettings({ model: "m" }, ADMIN);

    const stored = await readStoredSettings();
    expect(stored.updatedByUserId).toEqual(ADMIN);
    expect(stored.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("keeps the last test result across an unrelated save", async () => {
    await recordTestResult({
      ok: true,
      at: 123,
      jsonMode: "json_schema",
      summary: "fine",
      problem: null,
      byUserId: ADMIN,
    });
    await saveSettings({ model: "m" }, ADMIN);

    expect((await readStoredSettings()).lastTest).toMatchObject({ ok: true, jsonMode: "json_schema" });
  });
});

describe("what uses the model", () => {
  it("still defaults to the sample paper with an endpoint configured", async () => {
    await saveSettings({ baseUrl: "https://a.example/v1", model: "m" }, ADMIN);
    expect(await resolveGenerationProvider()).toBe("sample");
    // Marking is the cheap half, so it turns on by itself.
    expect(await resolveMarkingProvider()).toBe("model");
  });

  it("lets a stored choice override the environment", async () => {
    process.env.GENERATION_PROVIDER = "sample";
    process.env.MARKING_PROVIDER = "model";
    await saveSettings({ generationProvider: "model", markingProvider: "none" }, ADMIN);

    expect(await resolveGenerationProvider()).toBe("model");
    expect(await resolveMarkingProvider()).toBe("none");
  });

  it("returns to the environment when the stored choice is cleared", async () => {
    process.env.GENERATION_PROVIDER = "model";
    await saveSettings({ generationProvider: "model" }, ADMIN);
    await saveSettings({ generationProvider: null }, ADMIN);

    expect(await resolveGenerationProvider()).toBe("model");
  });
});

describe("marking with no endpoint behind the setting", () => {
  /**
   * A deployment stored `markingProvider: "model"` with no endpoint configured.
   * The setting was honoured, a model marker was built with no model, and every
   * written response came back 0 out of its marks — a paper reporting 3 / 100
   * with nothing on the page to say 75 of those marks were never markable.
   */
  it("refuses the model marker when nothing can reach a model", async () => {
    await saveSettings({ markingProvider: "model" }, ADMIN);

    expect(await resolveEndpointConfig()).toBeNull();
    expect(await resolveMarkingProvider()).toBe("none");
  });

  it("honours the stored preference once an endpoint exists", async () => {
    await saveSettings(
      {
        markingProvider: "model",
        baseUrl: "https://stored.example/v1",
        model: "stored-model",
        apiKey: "stored-key",
      },
      ADMIN,
    );

    expect(await resolveMarkingProvider()).toBe("model");
  });
});
