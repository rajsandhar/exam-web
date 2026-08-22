import { MockAiProvider } from "./mock-provider";
import { type AiProvider, resolveProviderName } from "./provider";

let cached: AiProvider | null = null;

/**
 * Returns the configured provider. Defaults to `mock` — the anthropic provider
 * is only constructed when `AI_PROVIDER=anthropic`, so the app runs with no API
 * key at all.
 */
export function getAiProvider(): AiProvider {
  if (cached) return cached;
  if (resolveProviderName() === "anthropic") {
    throw new Error(
      "AI_PROVIDER=anthropic is not implemented yet (Step 11). Set AI_PROVIDER=mock.",
    );
  }
  cached = new MockAiProvider();
  return cached;
}

/** Test seam. */
export function __setAiProvider(provider: AiProvider | null): void {
  cached = provider;
}

export * from "./provider";
