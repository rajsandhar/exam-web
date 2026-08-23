import { afterEach, describe, expect, it } from "vitest";

import {
  resolveGenerationProvider,
  resolveMarkingProvider,
} from "@/lib/ai/provider";

/**
 * Generation and marking are independent choices (see `provider.ts`).
 *
 * The behaviour that matters commercially: adding an API key must turn on
 * marking without also turning on paid generation, because generation is ~100
 * model calls per paper and marking is ~30 small ones.
 */

const KEYS = [
  "GENERATION_PROVIDER",
  "MARKING_PROVIDER",
  "AI_PROVIDER",
  "ANTHROPIC_API_KEY",
] as const;

afterEach(() => {
  for (const key of KEYS) delete process.env[key];
});

describe("generation provider", () => {
  it("defaults to mock so the app runs with no key", () => {
    expect(resolveGenerationProvider()).toBe("mock");
  });

  it("stays mock when only an API key is present", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    expect(resolveGenerationProvider()).toBe("mock");
  });

  it("uses the model only when explicitly asked", () => {
    process.env.GENERATION_PROVIDER = "anthropic";
    expect(resolveGenerationProvider()).toBe("anthropic");
  });

  it("still honours the deprecated single switch", () => {
    process.env.AI_PROVIDER = "anthropic";
    expect(resolveGenerationProvider()).toBe("anthropic");
  });

  it("lets the specific setting override the deprecated one", () => {
    process.env.AI_PROVIDER = "anthropic";
    process.env.GENERATION_PROVIDER = "mock";
    expect(resolveGenerationProvider()).toBe("mock");
  });

  it("ignores an unrecognised value rather than failing at request time", () => {
    process.env.GENERATION_PROVIDER = "gpt-9";
    expect(resolveGenerationProvider()).toBe("mock");
  });
});

describe("marking provider", () => {
  it("is off when there is no key", () => {
    expect(resolveMarkingProvider()).toBe("none");
  });

  it("turns on as soon as a key is present", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    expect(resolveMarkingProvider()).toBe("anthropic");
  });

  it("can be switched off explicitly even with a key present", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    process.env.MARKING_PROVIDER = "none";
    expect(resolveMarkingProvider()).toBe("none");
  });

  it("does not start spending on an explicitly mocked build", () => {
    process.env.AI_PROVIDER = "mock";
    process.env.ANTHROPIC_API_KEY = "sk-test";
    expect(resolveMarkingProvider()).toBe("none");
  });

  it("treats a blank key as absent", () => {
    process.env.ANTHROPIC_API_KEY = "   ";
    expect(resolveMarkingProvider()).toBe("none");
  });
});

describe("the two settings are independent", () => {
  it("marks with a model while generating from the sample paper", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    expect(resolveGenerationProvider()).toBe("mock");
    expect(resolveMarkingProvider()).toBe("anthropic");
  });

  it("generates with a model while marking is switched off", () => {
    process.env.GENERATION_PROVIDER = "anthropic";
    process.env.MARKING_PROVIDER = "none";
    expect(resolveGenerationProvider()).toBe("anthropic");
    expect(resolveMarkingProvider()).toBe("none");
  });
});
