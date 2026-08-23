import pLimit from "p-limit";

import { GENERATION_CONCURRENCY, MAX_RETRIEVED_CHUNKS, NOVELTY_RULES } from "@/lib/config";
import { ARCHETYPES, archetypesForRenderers } from "@/lib/ingest/archetypes";
import { retrieveForSyllabusItems } from "@/lib/ingest/retrieval";
import type { GeneratedPaper, QuestionGroupForMarking } from "@/lib/schemas/question";
import { IMPLEMENTED_RENDERERS, type RendererType } from "@/lib/schemas/renderers";

import { archetypeItemPairs, overlapWithPrevious } from "./blueprint";
import { getModel } from "./client";
import { critiqueQuestion, critiqueToFeedback, shouldCritique } from "./critic";
import { planCoverage, type CoverageHistoryEntry } from "./coverage";
import { generateQuestionGroup } from "./generate-question";
import { planBlueprint, planCoverageMarks } from "./planner";
import { PROMPT_VERSION } from "./prompts";
import type { GeneratePaperRequest, PaperGenerator } from "./provider";

/**
 * The live generation pipeline (CLAUDE.md §6, §15).
 *
 * Stage A  deterministic coverage sampling, then a model call for mark depth
 * Stage B  blueprint, validated against the official item-count ranges
 * Stage C  question groups, generated concurrently (bounded)
 * Stage D  deterministic validation
 * Stage E  critic on everything that matters, sampled on 1–2 mark objectives
 *
 * Concurrency is the single biggest wall-clock win: serial generation of ~43
 * question groups is around eight minutes, bounded-concurrent is around ninety
 * seconds (SPEC_ADDENDUM.md §4).
 */

export type SyllabusLookup = {
  text: Map<string, string>;
  including: Map<string, string[]>;
};

export type ProviderContext = {
  syllabus: SyllabusLookup;
  coverageHistory: CoverageHistoryEntry[];
  recentDomains: string[];
  previousPaperPairs: Set<string>;
  availableRenderers: readonly RendererType[];
  /**
   * Media an administrator has uploaded and tagged to syllabus content, with
   * the description that stands in for the file everywhere it cannot be seen.
   * Usually empty: media is the exception, not the rule.
   */
  availableAssets: AvailableAsset[];
};

export type AvailableAsset = {
  id: string;
  kind: "image" | "video";
  title: string;
  description: string;
  altText: string;
  hasCaptions: boolean;
  syllabusItemIds: string[];
};

/** How often a 1–2 mark objective item is sent to the critic. */
const OBJECTIVE_CRITIQUE_SAMPLE_RATE = 0.25;
const MAX_QUESTION_ATTEMPTS = 3;

export class ModelPaperGenerator implements PaperGenerator {
  readonly name = "model" as const;

  constructor(private readonly loadContext: () => Promise<ProviderContext>) {}

  async generatePaper(request: GeneratePaperRequest): Promise<GeneratedPaper> {
    const context = await this.loadContext();
    const model = await getModel();
    const report = request.onProgress ?? (() => undefined);

    /* ---------------------------------------------------------- Stage A */
    report({ stage: "mapping_coverage" });
    const coverage = planCoverage(
      request.selectedSyllabusItemIds,
      context.coverageHistory,
    );

    const availableRenderers = context.availableRenderers.length
      ? context.availableRenderers
      : IMPLEMENTED_RENDERERS;

    const archetypes = archetypesForRenderers(availableRenderers).filter((archetype) =>
      archetype.rendererType === "multipart_group"
        ? true
        : (availableRenderers as readonly string[]).includes(archetype.rendererType),
    );

    const planningInputs = {
      coverage,
      syllabusText: context.syllabus.text,
      syllabusIncluding: context.syllabus.including,
      archetypes: archetypes.length > 0 ? archetypes : ARCHETYPES,
      availableRenderers,
      // Only media tagged to content this paper covers, so a photograph
      // belonging to one dot point is never pressed into another question.
      availableAssets: context.availableAssets.filter((asset) =>
        asset.syllabusItemIds.some((id) =>
          request.selectedSyllabusItemIds.includes(id),
        ),
      ),
      recentDomains: context.recentDomains,
      previousPairs: context.previousPaperPairs,
      signal: request.signal,
    };

    report({ stage: "planning" });
    const coveragePlan = await planCoverageMarks(planningInputs);

    /* ---------------------------------------------------------- Stage B */
    const { blueprint } = await planBlueprint(planningInputs, coveragePlan);

    // Novelty: a paper too similar to the previous one is not worth sitting.
    const pairs = archetypeItemPairs(blueprint);
    const overlap = overlapWithPrevious(pairs, context.previousPaperPairs);
    if (overlap > NOVELTY_RULES.maxOverlapWithPreviousPaper) {
      const retry = await planBlueprint(
        {
          ...planningInputs,
          recentDomains: [
            ...context.recentDomains,
            ...blueprint.groups.map((group) => group.scenarioDomain),
          ],
        },
        coveragePlan,
      );
      blueprint.groups = retry.blueprint.groups;
      blueprint.title = retry.blueprint.title;
    }

    /* ---------------------------------------------------------- Stage C */
    report({
      stage: "building_stimuli",
      questionsDone: 0,
      questionsTotal: blueprint.groups.length,
    });

    const limit = pLimit(GENERATION_CONCURRENCY);
    const usedDomains: string[] = [];
    const usedPairs: string[] = [];
    let done = 0;

    const random = createRandom(blueprint.groups.length);

    const results = await Promise.all(
      blueprint.groups.map((plan) =>
        limit(async () => {
          const syllabusItems = plan.syllabusItemIds.map((id) => ({
            id,
            exactText: context.syllabus.text.get(id) ?? id,
            including: context.syllabus.including.get(id) ?? [],
          }));

          const chunks = await retrieveForSyllabusItems(syllabusItems, {
            limit: MAX_RETRIEVED_CHUNKS,
            sourceTypes: ["notes"],
          });

          let feedback: string | undefined;
          let last: QuestionGroupForMarking | null = null;
          let lastProblem = "";

          for (let attempt = 1; attempt <= MAX_QUESTION_ATTEMPTS; attempt += 1) {
            request.signal?.throwIfAborted();

            const generated = await generateQuestionGroup(
              {
                plan,
                syllabusItems,
                chunks,
                avoid: { domains: [...usedDomains], archetypePairs: [...usedPairs] },
                model,
                signal: request.signal,
              },
              feedback,
            );
            last = generated.group;

            // Stage D — deterministic validation of this question.
            if (generated.issues.length > 0) {
              lastProblem = generated.issues
                .map((issue) => `${issue.path}: ${issue.message}`)
                .join("; ");
              feedback = generated.issues
                .map((issue) => `- ${issue.path}: ${issue.message}`)
                .join("\n");
              continue;
            }

            // Stage E — critic.
            if (shouldCritique(generated.group, OBJECTIVE_CRITIQUE_SAMPLE_RATE, random)) {
              const critique = await critiqueQuestion(
                generated.group,
                syllabusItems,
                request.signal,
              );
              generated.group.generationMetadata.criticPasses = attempt;
              if (critique.verdict !== "accept") {
                lastProblem = critiqueToFeedback(critique);
                feedback = lastProblem;
                continue;
              }
            }

            generated.group.generationMetadata.regenerations = attempt - 1;
            usedDomains.push(plan.scenarioDomain);
            for (const id of plan.syllabusItemIds) {
              usedPairs.push(`${plan.archetypeId}::${id}`);
            }

            done += 1;
            report({
              stage: "generating_questions",
              questionsDone: done,
              questionsTotal: blueprint.groups.length,
            });
            return generated.group;
          }

          throw new Error(
            `Question ${plan.position} could not be generated to standard after ` +
              `${MAX_QUESTION_ATTEMPTS} attempts. Last problem: ${lastProblem}` +
              (last ? "" : " (no draft was produced)"),
          );
        }),
      ),
    );

    report({ stage: "validating" });
    const groups = results.sort((a, b) => a.position - b.position);

    report({ stage: "reviewing_difficulty" });
    report({ stage: "finalising_marking" });

    const assessed = new Set(
      groups.flatMap((group) => group.parts.flatMap((part) => part.syllabusItemIds)),
    );

    return {
      title: blueprint.title,
      totalMarks: 100,
      selectedSyllabusItemIds: request.selectedSyllabusItemIds,
      unassessedSyllabusItemIds: request.selectedSyllabusItemIds.filter(
        (id) => !assessed.has(id),
      ),
      groups,
      generationMetadata: {
        provider: "model",
        model,
        promptVersion: PROMPT_VERSION,
        generatedAt: new Date().toISOString(),
      },
    };
  }
}

/** Deterministic per-paper sampling for the critic. */
function createRandom(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
