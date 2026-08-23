import { afterEach, describe, expect, it } from "vitest";

import { __resetClient } from "@/lib/ai/client";
import { modelFor, readEndpointConfig } from "@/lib/ai/endpoint";
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
  it("defaults to the sample paper so the app runs unconfigured", () => {
    expect(resolveGenerationProvider()).toBe("sample");
  });

  it("stays on the sample paper when only an endpoint is configured", () => {
    configureEndpoint();
    expect(resolveGenerationProvider()).toBe("sample");
  });

  it("uses the model only when explicitly asked", () => {
    process.env.GENERATION_PROVIDER = "model";
    expect(resolveGenerationProvider()).toBe("model");
  });

  it("ignores an unrecognised value rather than failing at request time", () => {
    process.env.GENERATION_PROVIDER = "something-else";
    expect(resolveGenerationProvider()).toBe("sample");
  });
});

describe("marking provider", () => {
  it("is off with no endpoint", () => {
    expect(resolveMarkingProvider()).toBe("none");
  });

  it("turns on as soon as an endpoint is configured", () => {
    configureEndpoint();
    expect(resolveMarkingProvider()).toBe("model");
  });

  it("can be switched off explicitly even with an endpoint present", () => {
    configureEndpoint();
    process.env.MARKING_PROVIDER = "none";
    expect(resolveMarkingProvider()).toBe("none");
  });

  it("stays off when the endpoint is only half configured", () => {
    process.env.AI_BASE_URL = "https://endpoint.example/v1";
    expect(resolveMarkingProvider()).toBe("none");
  });
});

describe("the two settings are independent", () => {
  it("marks with a model while serving the sample paper", () => {
    configureEndpoint();
    expect(resolveGenerationProvider()).toBe("sample");
    expect(resolveMarkingProvider()).toBe("model");
  });

  it("generates with a model while marking is switched off", () => {
    configureEndpoint();
    process.env.GENERATION_PROVIDER = "model";
    process.env.MARKING_PROVIDER = "none";
    expect(resolveGenerationProvider()).toBe("model");
    expect(resolveMarkingProvider()).toBe("none");
  });
});

describe("endpoint configuration", () => {
  it("is absent until both a base URL and a model are set", () => {
    expect(readEndpointConfig()).toBeNull();
    process.env.AI_BASE_URL = "https://endpoint.example/v1";
    expect(readEndpointConfig()).toBeNull();
    process.env.AI_MODEL = "a-model";
    expect(readEndpointConfig()).not.toBeNull();
  });

  it("allows an endpoint that needs no key", () => {
    process.env.AI_BASE_URL = "http://localhost:11434/v1";
    process.env.AI_MODEL = "a-local-model";
    expect(readEndpointConfig()?.apiKey).toBe("");
  });

  it("falls back to the default model for stages with no override", () => {
    configureEndpoint();
    const config = readEndpointConfig()!;
    expect(modelFor(config, "question")).toBe("a-model");
    expect(modelFor(config, "marking")).toBe("a-model");
  });

  it("uses a per-stage override where one is given", () => {
    configureEndpoint();
    process.env.AI_MODEL_QUESTION = "a-cheaper-model";
    const config = readEndpointConfig()!;
    expect(modelFor(config, "question")).toBe("a-cheaper-model");
    // Marking is not dragged down with it.
    expect(modelFor(config, "marking")).toBe("a-model");
  });

  it("lets marking be tiered up independently", () => {
    configureEndpoint();
    process.env.AI_MODEL_QUESTION = "a-cheaper-model";
    process.env.AI_MODEL_MARKING = "a-stronger-model";
    const config = readEndpointConfig()!;
    expect(modelFor(config, "question")).toBe("a-cheaper-model");
    expect(modelFor(config, "marking")).toBe("a-stronger-model");
  });
});
