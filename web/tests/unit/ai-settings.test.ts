import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  readStoredSettings,
  recordTestResult,
  resolveEndpointConfig,
  saveSettings,
} from "@/lib/ai/settings";
import { resolveGenerationProvider, resolveMarkingProvider } from "@/lib/ai/provider";
import { rawSqlite } from "@/lib/db/client";

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

beforeEach(() => {
  rawSqlite().exec("DELETE FROM ai_settings");
  // The row records who changed it, and that is a real foreign key.
  rawSqlite()
    .prepare(
      "INSERT INTO users (id, username, username_lower, password_hash, role, disabled, must_change_password, created_at) " +
        "VALUES (?, ?, ?, 'x', 'admin', 0, 0, ?)",
    )
    .run(ADMIN, ADMIN, ADMIN, Date.now());
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  rawSqlite().exec("DELETE FROM ai_settings; DELETE FROM users;");
  for (const key of ENV_KEYS) delete process.env[key];
});

function configureEnv() {
  process.env.AI_BASE_URL = "https://from-env.example/v1";
  process.env.AI_MODEL = "env-model";
  process.env.AI_API_KEY = "env-key";
}

describe("resolving the endpoint", () => {
  it("is unconfigured when neither source supplies one", () => {
    expect(resolveEndpointConfig()).toBeNull();
  });

  it("falls back to the environment when nothing is stored", () => {
    configureEnv();
    expect(resolveEndpointConfig()).toMatchObject({
      baseUrl: "https://from-env.example/v1",
      model: "env-model",
      apiKey: "env-key",
    });
  });

  it("prefers what an administrator stored", () => {
    configureEnv();
    saveSettings(
      { baseUrl: "https://stored.example/v1", model: "stored-model", apiKey: "stored-key" },
      ADMIN,
    );

    expect(resolveEndpointConfig()).toMatchObject({
      baseUrl: "https://stored.example/v1",
      model: "stored-model",
      apiKey: "stored-key",
    });
  });

  it("overlays field by field rather than all or nothing", () => {
    configureEnv();
    // Only a model is stored; the base URL must still come from the environment.
    saveSettings({ model: "stored-model" }, ADMIN);

    expect(resolveEndpointConfig()).toMatchObject({
      baseUrl: "https://from-env.example/v1",
      model: "stored-model",
    });
  });

  it("treats an endpoint that needs no key as configured", () => {
    saveSettings(
      { baseUrl: "http://localhost:11434/v1", model: "local-model", apiKey: null },
      ADMIN,
    );
    expect(resolveEndpointConfig()).toMatchObject({ apiKey: "" });
  });
});

describe("saving", () => {
  it("keeps the stored key when the field is left blank", () => {
    saveSettings({ baseUrl: "https://a.example/v1", model: "m", apiKey: "secret" }, ADMIN);
    // A later save that does not mention the key at all.
    saveSettings({ baseUrl: "https://a.example/v1", model: "m2" }, ADMIN);

    expect(readStoredSettings().apiKey).toEqual("secret");
    expect(readStoredSettings().model).toEqual("m2");
  });

  it("removes the key only when asked explicitly", () => {
    saveSettings({ baseUrl: "https://a.example/v1", model: "m", apiKey: "secret" }, ADMIN);
    saveSettings({ apiKey: null }, ADMIN);

    expect(readStoredSettings().apiKey).toBeNull();
  });

  it("records per-stage models, and clears one when it is blanked", () => {
    saveSettings({ modelByStage: { marking: "careful-model" } }, ADMIN);
    expect(readStoredSettings().modelByStage.marking).toEqual("careful-model");

    saveSettings({ modelByStage: { marking: null } }, ADMIN);
    expect(readStoredSettings().modelByStage.marking).toBeUndefined();
  });

  it("lets a stored stage override beat one from the environment", () => {
    configureEnv();
    process.env.AI_MODEL_MARKING = "env-marking-model";
    saveSettings({ modelByStage: { marking: "stored-marking-model" } }, ADMIN);

    expect(resolveEndpointConfig()?.modelByStage.marking).toEqual("stored-marking-model");
  });

  it("remembers who changed it and when", () => {
    const before = Date.now();
    saveSettings({ model: "m" }, ADMIN);

    const stored = readStoredSettings();
    expect(stored.updatedByUserId).toEqual(ADMIN);
    expect(stored.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("keeps the last test result across an unrelated save", () => {
    recordTestResult({
      ok: true,
      at: 123,
      jsonMode: "json_schema",
      summary: "fine",
      problem: null,
      byUserId: ADMIN,
    });
    saveSettings({ model: "m" }, ADMIN);

    expect(readStoredSettings().lastTest).toMatchObject({ ok: true, jsonMode: "json_schema" });
  });
});

describe("what uses the model", () => {
  it("still defaults to the sample paper with an endpoint configured", () => {
    saveSettings({ baseUrl: "https://a.example/v1", model: "m" }, ADMIN);
    expect(resolveGenerationProvider()).toBe("sample");
    // Marking is the cheap half, so it turns on by itself.
    expect(resolveMarkingProvider()).toBe("model");
  });

  it("lets a stored choice override the environment", () => {
    process.env.GENERATION_PROVIDER = "sample";
    process.env.MARKING_PROVIDER = "model";
    saveSettings({ generationProvider: "model", markingProvider: "none" }, ADMIN);

    expect(resolveGenerationProvider()).toBe("model");
    expect(resolveMarkingProvider()).toBe("none");
  });

  it("returns to the environment when the stored choice is cleared", () => {
    process.env.GENERATION_PROVIDER = "model";
    saveSettings({ generationProvider: "model" }, ADMIN);
    saveSettings({ generationProvider: null }, ADMIN);

    expect(resolveGenerationProvider()).toBe("model");
  });
});
