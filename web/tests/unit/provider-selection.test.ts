import { afterEach, describe, expect, it } from "vitest";

import { __resetClient } from "@/lib/ai/client";
import { modelFor, readEnvEndpointConfig } from "@/lib/ai/endpoint";
import {
  resolveGenerationProvider,
  resolveMarkingProvider,
} from "@/lib/ai/provider";

/**
 * Generation and marking are independent choices, and neither names a vendor.
 *
 * The behaviour that matters commercially: configuring an endpoint must turn on
 * marking without also turning on generation, because generating a paper is
 * ~100 model calls and marking one is ~30 small ones.
 */

const KEYS = [
  "GENERATION_PROVIDER",
  "MARKING_PROVIDER",
  "AI_BASE_URL",
  "AI_API_KEY",
  "AI_MODEL",
  "AI_MODEL_QUESTION",
  "AI_MODEL_MARKING",
] as const;

function configureEndpoint() {
  process.env.AI_BASE_URL = "https://endpoint.example/v1";
  process.env.AI_MODEL = "a-model";
  process.env.AI_API_KEY = "a-key";
}

afterEach(() => {
  for (const key of KEYS) delete process.env[key];
  __resetClient();
});

describe("generation provider", () => {
  it("defaults to the sample paper so the app runs unconfigured", async () => {
    expect(await resolveGenerationProvider()).toBe("sample");
  });

  it("stays on the sample paper when only an endpoint is configured", async () => {
    configureEndpoint();
    expect(await resolveGenerationProvider()).toBe("sample");
  });

  it("uses the model only when explicitly asked", async () => {
    process.env.GENERATION_PROVIDER = "model";
    expect(await resolveGenerationProvider()).toBe("model");
  });

  it("ignores an unrecognised value rather than failing at request time", async () => {
    process.env.GENERATION_PROVIDER = "something-else";
    expect(await resolveGenerationProvider()).toBe("sample");
  });
});

describe("marking provider", () => {
  it("is off with no endpoint", async () => {
    expect(await resolveMarkingProvider()).toBe("none");
  });

  it("turns on as soon as an endpoint is configured", async () => {
    configureEndpoint();
    expect(await resolveMarkingProvider()).toBe("model");
  });

  it("can be switched off explicitly even with an endpoint present", async () => {
    configureEndpoint();
    process.env.MARKING_PROVIDER = "none";
    expect(await resolveMarkingProvider()).toBe("none");
  });

  it("stays off when the endpoint is only half configured", async () => {
    process.env.AI_BASE_URL = "https://endpoint.example/v1";
    expect(await resolveMarkingProvider()).toBe("none");
  });
});

describe("the two settings are independent", () => {
  it("marks with a model while serving the sample paper", async () => {
    configureEndpoint();
    expect(await resolveGenerationProvider()).toBe("sample");
    expect(await resolveMarkingProvider()).toBe("model");
  });

  it("generates with a model while marking is switched off", async () => {
    configureEndpoint();
    process.env.GENERATION_PROVIDER = "model";
    process.env.MARKING_PROVIDER = "none";
    expect(await resolveGenerationProvider()).toBe("model");
    expect(await resolveMarkingProvider()).toBe("none");
  });
});

describe("endpoint configuration", () => {
  it("is absent until both a base URL and a model are set", () => {
    expect(readEnvEndpointConfig()).toBeNull();
    process.env.AI_BASE_URL = "https://endpoint.example/v1";
    expect(readEnvEndpointConfig()).toBeNull();
    process.env.AI_MODEL = "a-model";
    expect(readEnvEndpointConfig()).not.toBeNull();
  });

  it("allows an endpoint that needs no key", () => {
    process.env.AI_BASE_URL = "http://localhost:11434/v1";
    process.env.AI_MODEL = "a-local-model";
    expect(readEnvEndpointConfig()?.apiKey).toBe("");
  });

  it("falls back to the default model for stages with no override", () => {
    configureEndpoint();
    const config = readEnvEndpointConfig()!;
    expect(modelFor(config, "question")).toBe("a-model");
    expect(modelFor(config, "marking")).toBe("a-model");
  });

  it("uses a per-stage override where one is given", () => {
    configureEndpoint();
    process.env.AI_MODEL_QUESTION = "a-cheaper-model";
    const config = readEnvEndpointConfig()!;
    expect(modelFor(config, "question")).toBe("a-cheaper-model");
    // Marking is not dragged down with it.
    expect(modelFor(config, "marking")).toBe("a-model");
  });

  it("lets marking be tiered up independently", () => {
    configureEndpoint();
    process.env.AI_MODEL_QUESTION = "a-cheaper-model";
    process.env.AI_MODEL_MARKING = "a-stronger-model";
    const config = readEnvEndpointConfig()!;
    expect(modelFor(config, "question")).toBe("a-cheaper-model");
    expect(modelFor(config, "marking")).toBe("a-stronger-model");
  });
});
