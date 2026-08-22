import { describe, expect, it } from "vitest";

import { AnthropicAiProvider } from "@/lib/ai/anthropic-provider";
import { loadProviderContext } from "@/lib/ai";
import { validatePaper } from "@/lib/schemas/paper-validation";
import { IMPLEMENTED_RENDERERS } from "@/lib/schemas/renderers";

/**
 * Live generation check (Step 11 acceptance).
 *
 * Skipped unless `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` are set. Requires a
 * seeded, ingested database: `pnpm db:migrate && pnpm db:seed && pnpm ingest:references`.
 *
 *   pnpm test:live
 */

const enabled =
  Boolean(process.env.ANTHROPIC_API_KEY?.trim()) &&
  Boolean(process.env.ANTHROPIC_MODEL?.trim());

/** A focused selection, so full coverage applies and the check is strict. */
const SELECTION = [
  "ssa.1.1",
  "ssa.2.1",
  "ssa.2.3",
  "ssa.2.5",
  "ssa.2.7",
  "ssa.2.10",
  "ssa.3.2",
  "pwa.1.4",
  "pwa.2.4",
  "pwa.2.8",
  "pwa.2.10",
  "pwa.2.11",
  "auto.1.1",
  "auto.1.6",
  "auto.3.1",
  "auto.3.3",
  "proj.1.3",
  "proj.2.2",
  "proj.2.7",
  "proj.4.4",
];

describe.skipIf(!enabled)("live paper generation", () => {
  it(
    "produces a valid 100-mark paper inside three minutes",
    { timeout: 600_000 },
    async () => {
      const provider = new AnthropicAiProvider(loadProviderContext);
      const stages: string[] = [];

      const started = Date.now();
      const paper = await provider.generatePaper({
        selectedSyllabusItemIds: SELECTION,
        onProgress: (progress) => stages.push(progress.stage),
      });
      const elapsedMs = Date.now() - started;

      const result = validatePaper(paper, {
        availableRenderers: IMPLEMENTED_RENDERERS,
      });

      expect(result.issues).toEqual([]);
      expect(result.stats.totalMarks).toBe(100);
      expect(elapsedMs).toBeLessThan(180_000);

      // Every question maps to selected content only.
      const selected = new Set(SELECTION);
      for (const group of paper.groups) {
        for (const id of group.syllabusItemIds) expect(selected.has(id)).toBe(true);
      }

      expect(stages).toContain("generating_questions");
    },
  );

  it(
    "produces materially different scenarios on a second run",
    { timeout: 900_000 },
    async () => {
      const provider = new AnthropicAiProvider(loadProviderContext);
      const [first, second] = await Promise.all([
        provider.generatePaper({ selectedSyllabusItemIds: SELECTION }),
        provider.generatePaper({ selectedSyllabusItemIds: SELECTION }),
      ]);

      const prompts = (paper: typeof first) =>
        new Set(paper.groups.flatMap((g) => g.parts.map((p) => p.prompt.slice(0, 80))));

      const a = prompts(first);
      const b = prompts(second);
      const shared = [...a].filter((prompt) => b.has(prompt)).length;

      expect(shared / a.size).toBeLessThan(0.2);
    },
  );
});
