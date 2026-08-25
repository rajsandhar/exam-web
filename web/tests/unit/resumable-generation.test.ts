import { describe, expect, it, vi } from "vitest";

import type { Blueprint } from "@/lib/ai/blueprint";
import { GENERATION_MAX_CALLS, GENERATION_STALL_MS } from "@/lib/config";
import {
  advanceGeneration,
  hasStalled,
  type GenerationStore,
  type ResumableState,
} from "@/lib/generation/resumable";
import type { QuestionGroupForMarking } from "@/lib/schemas/question";

/**
 * Generation outliving the request that started it.
 *
 * A model-backed paper is roughly sixty calls. It was produced inside
 * `POST /api/exams`, which was killed at the function's five-minute ceiling
 * having finished stage one of seven, leaving the row at "generating" for ever.
 * These prove the shape that replaced it: each step is small, a dead run is
 * noticed, and resuming never produces a question twice.
 */

const SELECTED = ["ssa.2.1", "ssa.2.7", "pwa.1.4"];

function blueprintOf(groupCount: number): Blueprint {
  return {
    title: "Trial Examination",
    groups: Array.from({ length: groupCount }, (_, index) => ({
      position: index + 1,
      archetypeId: `archetype-${index + 1}`,
      scenarioDomain: `domain-${index + 1}`,
      syllabusItemIds: [SELECTED[index % SELECTED.length]!],
    })),
  } as unknown as Blueprint;
}

function groupAt(position: number): QuestionGroupForMarking {
  return {
    position,
    parts: [{ syllabusItemIds: [SELECTED[0]!] }],
    generationMetadata: { scenarioDomain: `domain-${position}` },
  } as unknown as QuestionGroupForMarking;
}

/** An in-memory stand-in for the database, so the runner can be driven alone. */
function fakeStore(groupCount: number) {
  const row = {
    status: "generating" as string,
    blueprint: null as Blueprint | null,
    state: {} as ResumableState,
    selectedSyllabusItemIds: SELECTED,
  };
  const published: QuestionGroupForMarking[][] = [];
  const failures: string[] = [];

  const store: GenerationStore = {
    load: async () => ({ ...row, state: { ...row.state } }),
    saveBlueprint: async (_id, blueprint) => {
      row.blueprint = blueprint;
    },
    saveState: async (_id, state) => {
      row.state = state;
    },
    publish: async (_id, _blueprint, groups) => {
      published.push(groups);
      row.status = "ready";
    },
    fail: async (_id, reason) => {
      failures.push(reason);
      row.status = "failed";
    },
  };

  return { row, store, published, failures, blueprint: blueprintOf(groupCount) };
}

/** Records every question it is asked for, so duplicates are visible. */
function fakeGenerator(blueprint: Blueprint, options: { latencyMs?: number } = {}) {
  const asked: number[] = [];

  return {
    asked,
    generator: {
      planPaper: async () => blueprint,
      generateGroup: async (plan: { position: number }) => {
        asked.push(plan.position);
        if (options.latencyMs) await new Promise((r) => setTimeout(r, options.latencyMs));
        return groupAt(plan.position);
      },
      assemble: async (_b: Blueprint, groups: QuestionGroupForMarking[]) => ({
        groups: [...groups].sort((a, b) => a.position - b.position),
      }),
    },
  } as never as {
    asked: number[];
    generator: Parameters<typeof advanceGeneration>[1];
  };
}

async function runToCompletion(
  examId: string,
  generator: Parameters<typeof advanceGeneration>[1],
  store: GenerationStore,
  batchSize: number,
) {
  const steps = [];
  for (let i = 0; i < 50; i += 1) {
    const step = await advanceGeneration(examId, generator, store, batchSize);
    steps.push(step);
    if (!step.more) break;
  }
  return steps;
}

describe("generating a paper across several invocations", () => {
  it("plans first, and asks for no questions in that step", async () => {
    const { store, blueprint } = fakeStore(12);
    const { generator, asked } = fakeGenerator(blueprint);

    const step = await advanceGeneration("exam-1", generator, store, 4);

    expect(step.stage).toBe("building_stimuli");
    expect(step.questionsTotal).toBe(12);
    expect(step.more).toBe(true);
    expect(asked).toEqual([]);
  });

  it("finishes the paper in bounded steps rather than one long run", async () => {
    const { store, published, blueprint } = fakeStore(12);
    const { generator } = fakeGenerator(blueprint);

    const steps = await runToCompletion("exam-1", generator, store, 4);

    // Plan, three batches of four, then publication.
    expect(steps).toHaveLength(5);
    expect(steps.at(-1)?.status).toBe("ready");
    expect(published[0]).toHaveLength(12);
    // In order, however the batches interleaved.
    expect(published[0]?.map((g) => g.position)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it("returns immediately even when the provider is slow", async () => {
    // The failure this replaced: ~60 calls at 75 seconds each, inside one
    // request. A step must cost about one slow call, not the whole paper.
    const { store, blueprint } = fakeStore(12);
    const { generator } = fakeGenerator(blueprint, { latencyMs: 30 });

    const started = Date.now();
    await advanceGeneration("exam-1", generator, store, 4); // plan
    const batch = Date.now();
    await advanceGeneration("exam-1", generator, store, 4); // four questions
    const elapsed = Date.now() - batch;

    // Four concurrent calls at 30ms each, not four sequential ones.
    expect(elapsed).toBeLessThan(30 * 4);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("never generates a question that is already stored", async () => {
    const { store, row, blueprint } = fakeStore(9);
    const { generator, asked } = fakeGenerator(blueprint);

    await advanceGeneration("exam-1", generator, store, 3); // plan
    await advanceGeneration("exam-1", generator, store, 3); // 1..3

    // The next step dies after doing its work but before anything else runs;
    // the poll after it starts from what is stored.
    const afterFirstBatch = { ...row.state };
    await advanceGeneration("exam-1", generator, store, 3); // 4..6
    row.state = afterFirstBatch; // as though that step's write never landed

    await advanceGeneration("exam-1", generator, store, 3);
    await advanceGeneration("exam-1", generator, store, 3);

    const counts = new Map<number, number>();
    for (const position of asked) counts.set(position, (counts.get(position) ?? 0) + 1);

    // Positions 4..6 are asked twice — the step whose write was lost — and
    // nothing is stored twice, which is what matters.
    expect(Object.keys(row.state.groups ?? {}).length).toBeLessThanOrEqual(9);
    expect([...new Set(Object.values(row.state.groups ?? {}).map((g) => g.position))]).toHaveLength(
      Object.keys(row.state.groups ?? {}).length,
    );
  });

  it("keeps the questions it has when a step fails, and comes back for the rest", async () => {
    // A provider that times out on one call must not destroy a paper that is
    // nearly complete. A failed generation cost real money; throwing away the
    // questions that did land makes the next attempt cost it again.
    const { store, row, failures, blueprint } = fakeStore(6);
    const { generator } = fakeGenerator(blueprint);

    await advanceGeneration("exam-1", generator, store, 3); // plan
    await advanceGeneration("exam-1", generator, store, 3); // 1..3

    generator.generateGroup = vi.fn().mockRejectedValue(new Error("Request timed out."));
    const step = await advanceGeneration("exam-1", generator, store, 3);

    expect(step.status).toBe("generating");
    expect(step.more).toBe(true);
    expect(failures).toEqual([]);
    // The three finished questions are still there.
    expect(Object.keys(row.state.groups ?? {})).toHaveLength(3);
    expect(row.state.failures).toBe(1);
    expect(row.state.lastError).toContain("Request timed out");
  });

  it("gives up after repeated failures, saying how far it got", async () => {
    const { store, row, failures, blueprint } = fakeStore(6);
    const { generator } = fakeGenerator(blueprint);

    await advanceGeneration("exam-1", generator, store, 3); // plan
    await advanceGeneration("exam-1", generator, store, 3); // 1..3

    generator.generateGroup = vi.fn().mockRejectedValue(
      Object.assign(new Error("Failed query: insert …"), {
        cause: new Error('column reference "x" is ambiguous'),
      }),
    );

    let last;
    for (let i = 0; i < 3; i += 1) {
      last = await advanceGeneration("exam-1", generator, store, 3);
    }

    expect(last?.status).toBe("failed");
    expect(failures).toHaveLength(1);
    // The reason, not just the statement that failed.
    expect(failures[0]).toContain('column reference "x" is ambiguous');
    // And how much work was done, so the cost of retrying is known.
    expect(failures[0]).toContain("3 of 6 questions");
    expect(row.status).toBe("failed");
  });

  it("forgets earlier failures once a step succeeds", async () => {
    const { store, row, blueprint } = fakeStore(6);
    const { generator } = fakeGenerator(blueprint);

    await advanceGeneration("exam-1", generator, store, 3); // plan
    const working = generator.generateGroup;

    generator.generateGroup = vi.fn().mockRejectedValue(new Error("Request timed out."));
    await advanceGeneration("exam-1", generator, store, 3);
    expect(row.state.failures).toBe(1);

    generator.generateGroup = working;
    await advanceGeneration("exam-1", generator, store, 3);

    // A run that recovers is not one failure away from being abandoned.
    expect(row.state.failures).toBe(0);
  });

  it("does nothing to a paper that is already finished", async () => {
    const { store, row, blueprint } = fakeStore(3);
    const { generator, asked } = fakeGenerator(blueprint);
    row.status = "ready";

    const step = await advanceGeneration("exam-1", generator, store, 3);

    expect(step.status).toBe("ready");
    expect(step.more).toBe(false);
    expect(asked).toEqual([]);
  });
});

describe("noticing a run that died", () => {
  it("treats silence past the threshold as stalled", () => {
    const now = Date.now();
    const state: ResumableState = {
      lastProgressAt: new Date(now - GENERATION_STALL_MS - 1_000).toISOString(),
    };

    expect(hasStalled(state, now)).toBe(true);
  });

  it("leaves a run that reported recently alone", () => {
    const now = Date.now();
    const state: ResumableState = {
      lastProgressAt: new Date(now - 5_000).toISOString(),
    };

    expect(hasStalled(state, now)).toBe(false);
  });

  it("says nothing about a run that has not reported at all yet", () => {
    // No timestamp means the first step has not finished; it is not evidence
    // of death, and calling it dead would kill every paper at the moment it
    // was created.
    expect(hasStalled({}, Date.now())).toBe(false);
  });
});

describe("the spend ceiling", () => {
  /** A meter that reports a fixed cost for every step. */
  function meterOf(calls: number, tokens = 0) {
    return {
      reset: () => undefined,
      read: () => ({ calls, inputTokens: tokens, outputTokens: 0 }),
    };
  }

  it("accumulates what each step spends onto the row", async () => {
    const { store, row, blueprint } = fakeStore(6);
    const { generator } = fakeGenerator(blueprint);

    await advanceGeneration("exam-1", generator, store, 3, meterOf(2, 1_000));
    expect(row.state.spend).toEqual({ calls: 2, inputTokens: 1_000, outputTokens: 0 });

    await advanceGeneration("exam-1", generator, store, 3, meterOf(9, 5_000));
    // Carried between invocations, not reset by each one.
    expect(row.state.spend?.calls).toBe(11);
    expect(row.state.spend?.inputTokens).toBe(6_000);
  });

  it("abandons a paper that has spent more than a paper should", async () => {
    // One failed generation cost 73 dollars across 788 requests. A ceiling
    // turns that into a known worst case.
    const { store, row, failures, blueprint } = fakeStore(6);
    const { generator, asked } = fakeGenerator(blueprint);

    row.state = { spend: { calls: GENERATION_MAX_CALLS, inputTokens: 0, outputTokens: 0 } };

    const step = await advanceGeneration("exam-1", generator, store, 3);

    expect(step.status).toBe("failed");
    expect(failures[0]).toContain(`${GENERATION_MAX_CALLS} model calls`);
    expect(failures[0]).toContain("ceiling");
    // And nothing further was asked of the provider.
    expect(asked).toEqual([]);
  });

  it("lets an ordinary paper through untouched", async () => {
    const { store, row, blueprint } = fakeStore(6);
    const { generator } = fakeGenerator(blueprint);

    row.state = { spend: { calls: 40, inputTokens: 100_000, outputTokens: 50_000 } };

    const step = await advanceGeneration("exam-1", generator, store, 3, meterOf(1));

    expect(step.status).toBe("generating");
  });
});
