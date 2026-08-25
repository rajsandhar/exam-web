import {
  GENERATION_BATCH_SIZE,
  GENERATION_MAX_CALLS,
  GENERATION_MAX_TOKENS,
  GENERATION_STALL_MS,
} from "@/lib/config";
import type { Blueprint } from "@/lib/ai/blueprint";
import { newGroupState, type ModelPaperGenerator } from "@/lib/ai/model-generator";
import { readSpendMeter, resetSpendMeter } from "@/lib/ai/client";
import type { GenerationStage } from "@/lib/ai/provider-names";
import type { QuestionGroupForMarking } from "@/lib/schemas/question";

/**
 * Generation, one invocation at a time.
 *
 * A paper is roughly sixty model calls. A serverless function is killed at five
 * minutes, and `waitUntil` does not help — it extends work past the response but
 * is bounded by the same limit. So the work is broken into steps that each fit
 * comfortably inside one invocation, and the progress screen, which was already
 * polling, drives them.
 *
 * The state lives in columns the schema already has: the blueprint in
 * `blueprint_json`, and everything else inside `progress_json`. That is not
 * laziness — a migration would have to reach the hosted database before the
 * deploy that needs it, and nothing here is authorised to run one.
 *
 * Every step is idempotent. A step that dies half way is retried by the next
 * poll and produces the same paper, because a group is only ever generated for
 * a position that has no group stored yet.
 */

/** Stored inside `progress_json`, alongside the stage the screen shows. */
export type ResumableState = {
  stage?: GenerationStage | "failed";
  detail?: string;
  questionsDone?: number;
  questionsTotal?: number;
  /** Groups finished so far, keyed by their position in the paper. */
  groups?: Record<string, QuestionGroupForMarking>;
  /** Refreshed on every step, so a run that dies can be spotted. */
  lastProgressAt?: string;
  /** Consecutive failed steps. Reset by any step that gets somewhere. */
  failures?: number;
  /** Why the last step failed, kept while the run is still being retried. */
  lastError?: string;
  /** What this paper has spent so far, across every invocation. */
  spend?: Spend;
  /** When the step now running began, so a second one does not join it. */
  stepStartedAt?: string;
  /** Earliest the next step may start, after a failure. */
  nextAttemptAt?: string;
};

export type Spend = { calls: number; inputTokens: number; outputTokens: number };

/**
 * How many steps in a row may fail before the paper is abandoned.
 *
 * A provider that times out on one question should not destroy a paper that is
 * nearly complete — the work already done is stored, and the next poll retries
 * only what is missing. Failing on the first error threw away twenty-nine
 * finished questions because the thirtieth call was slow.
 */
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * How long a step may run before another invocation assumes it died.
 *
 * A step is one model call deep at worst, and calls are capped at two minutes,
 * so anything past this was killed rather than merely slow.
 */
const STEP_LEASE_MS = 150_000;

/**
 * How long to wait after a failure, by how many have happened in a row.
 *
 * Retrying on the next poll meant three attempts in about two seconds, which
 * is not a retry — it is the same failure three times. A provider saying "try
 * again shortly" needs to be given shortly.
 */
const BACKOFF_MS = [10_000, 45_000, 120_000];

/** A provider refusing on rate needs longer than one refusing on content. */
const RATE_LIMIT_BACKOFF_MS = 60_000;

function backoffFor(failures: number, reason: string): number {
  const base = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length) - 1] ?? BACKOFF_MS[0]!;
  return /rate limit|429|too many requests/i.test(reason)
    ? Math.max(base, RATE_LIMIT_BACKOFF_MS)
    : base;
}

/** Nothing to do right now, but the paper is still alive. */
function waiting(state: ResumableState, stage: GenerationStage | "failed"): StepResult {
  return {
    status: "generating",
    stage,
    questionsDone: storedGroups(state).length,
    questionsTotal: state.questionsTotal ?? 0,
    more: true,
  };
}

export type StepResult = {
  status: "generating" | "ready" | "failed";
  stage: GenerationStage | "failed";
  questionsDone: number;
  questionsTotal: number;
  /** True while there is more to do, so the caller knows to come back. */
  more: boolean;
};

/** What the runner needs from the database, kept injectable for tests. */
export interface GenerationStore {
  load(examId: string): Promise<{
    status: string;
    blueprint: Blueprint | null;
    state: ResumableState;
    selectedSyllabusItemIds: string[];
  } | null>;
  saveBlueprint(examId: string, blueprint: Blueprint): Promise<void>;
  saveState(examId: string, state: ResumableState): Promise<void>;
  publish(
    examId: string,
    blueprint: Blueprint,
    groups: QuestionGroupForMarking[],
    selectedSyllabusItemIds: string[],
  ): Promise<void>;
  fail(examId: string, reason: string): Promise<void>;
}

function storedGroups(state: ResumableState): QuestionGroupForMarking[] {
  return Object.values(state.groups ?? {});
}

/**
 * Advances one paper by one step, and says whether there is more to do.
 *
 * Steps are deliberately small: the blueprint, then one batch of questions,
 * then publication. A batch is the same width as the in-process concurrency,
 * so a step is about as long as its slowest single question rather than the
 * whole paper.
 */
export async function advanceGeneration(
  examId: string,
  generator: Pick<ModelPaperGenerator, "planPaper" | "generateGroup" | "assemble">,
  store: GenerationStore,
  batchSize: number = GENERATION_BATCH_SIZE,
  meter: { reset: () => void; read: () => Spend } = {
    reset: resetSpendMeter,
    read: readSpendMeter,
  },
): Promise<StepResult> {
  const loaded = await store.load(examId);
  if (!loaded) throw new Error(`Unknown paper ${examId}.`);

  if (loaded.status !== "generating") {
    const groups = storedGroups(loaded.state);
    return {
      status: loaded.status === "ready" ? "ready" : "failed",
      stage: loaded.status === "ready" ? "finalising_marking" : "failed",
      questionsDone: groups.length,
      questionsTotal: loaded.state.questionsTotal ?? groups.length,
      more: false,
    };
  }

  const request = { selectedSyllabusItemIds: loaded.selectedSyllabusItemIds };

  const spent = loaded.state.spend ?? { calls: 0, inputTokens: 0, outputTokens: 0 };
  const tokens = spent.inputTokens + spent.outputTokens;
  if (spent.calls >= GENERATION_MAX_CALLS || tokens >= GENERATION_MAX_TOKENS) {
    await store.fail(
      examId,
      `Generation was stopped after ${spent.calls} model calls and ` +
        `${tokens.toLocaleString("en-AU")} tokens, which is the ceiling for one ` +
        `paper. Something is retrying far more than it should — the paper was ` +
        `abandoned rather than kept spending.`,
    );
    return {
      status: "failed",
      stage: "failed",
      questionsDone: storedGroups(loaded.state).length,
      questionsTotal: loaded.state.questionsTotal ?? 0,
      more: false,
    };
  }

  const now = Date.now();

  // Backing off after a failure. The provider asked for shortly; this is
  // shortly.
  const nextAttempt = loaded.state.nextAttemptAt
    ? Date.parse(loaded.state.nextAttemptAt)
    : 0;
  if (nextAttempt > now) {
    return waiting(loaded.state, loaded.state.stage ?? "planning");
  }

  // Another invocation is already inside a step. Two of them planning the same
  // paper is duplicated work, duplicated spend, and a rate limit — which is
  // exactly what a progress screen polling every 700ms produced.
  const startedAt = loaded.state.stepStartedAt
    ? Date.parse(loaded.state.stepStartedAt)
    : 0;
  if (startedAt > 0 && now - startedAt < STEP_LEASE_MS) {
    return waiting(loaded.state, loaded.state.stage ?? "planning");
  }

  // Claimed before any work begins, so a step that overlaps sees it.
  await store.saveState(examId, {
    ...loaded.state,
    stepStartedAt: new Date(now).toISOString(),
  });

  // Counted per invocation, carried between them on the row.
  meter.reset();
  const total = (): Spend => {
    const used = meter.read();
    return {
      calls: spent.calls + used.calls,
      inputTokens: spent.inputTokens + used.inputTokens,
      outputTokens: spent.outputTokens + used.outputTokens,
    };
  };

  try {
    /* -------------------------------------------------- step 1: the plan */
    if (!loaded.blueprint) {
      const blueprint = await generator.planPaper(request);
      await store.saveBlueprint(examId, blueprint);
      await store.saveState(examId, {
        ...loaded.state,
        stage: "building_stimuli",
        questionsDone: 0,
        questionsTotal: blueprint.groups.length,
        lastProgressAt: new Date().toISOString(),
        failures: 0,
        spend: total(),
        stepStartedAt: undefined,
        nextAttemptAt: undefined,
      });
      return {
        status: "generating",
        stage: "building_stimuli",
        questionsDone: 0,
        questionsTotal: blueprint.groups.length,
        more: true,
      };
    }

    const blueprint = loaded.blueprint;
    const done = loaded.state.groups ?? {};
    const outstanding = blueprint.groups.filter(
      (plan) => done[String(plan.position)] === undefined,
    );

    /* ------------------------------------------- step 2: some questions */
    if (outstanding.length > 0) {
      const batch = outstanding.slice(0, batchSize);
      const state = newGroupState(blueprint, storedGroups(loaded.state));

      // Settled, not all: one refusal must not discard the questions that were
      // written alongside it. A rate-limited provider fails some of a batch and
      // answers the rest, and paying for those and throwing them away is how a
      // paper made no progress at all across four attempts.
      const outcomes = await Promise.allSettled(
        batch.map(async (plan) => generator.generateGroup(plan, blueprint, request, state)),
      );

      const groups = { ...done };
      for (const outcome of outcomes) {
        if (outcome.status === "fulfilled") {
          groups[String(outcome.value.position)] = outcome.value;
        }
      }

      const written = Object.keys(groups).length - Object.keys(done).length;
      if (written === 0) {
        // Nothing at all got through: treat it as the step failing, so the
        // backoff and the give-up count apply.
        const rejected = outcomes.find((o) => o.status === "rejected");
        throw rejected && rejected.status === "rejected"
          ? (rejected.reason as Error)
          : new Error("No question could be generated in this batch.");
      }

      const questionsDone = Object.keys(groups).length;
      await store.saveState(examId, {
        ...loaded.state,
        stage: "generating_questions",
        questionsDone,
        questionsTotal: blueprint.groups.length,
        groups,
        lastProgressAt: new Date().toISOString(),
        failures: 0,
        spend: total(),
        stepStartedAt: undefined,
        nextAttemptAt: undefined,
      });

      // Always more: even once the last question lands, the paper still has to
      // be validated and published. Reporting otherwise stopped the run with
      // every question generated and nothing written.
      return {
        status: "generating",
        stage: "generating_questions",
        questionsDone,
        questionsTotal: blueprint.groups.length,
        more: true,
      };
    }

    /* --------------------------------------------- step 3: publish it */
    const paper = await generator.assemble(blueprint, storedGroups(loaded.state), request);
    await store.publish(examId, blueprint, paper.groups, loaded.selectedSyllabusItemIds);

    return {
      status: "ready",
      stage: "finalising_marking",
      questionsDone: paper.groups.length,
      questionsTotal: blueprint.groups.length,
      more: false,
    };
  } catch (cause) {
    const reason = describe(cause);
    const failures = (loaded.state.failures ?? 0) + 1;
    const questionsDone = storedGroups(loaded.state).length;
    const questionsTotal = loaded.state.questionsTotal ?? 0;

    if (failures >= MAX_CONSECUTIVE_FAILURES) {
      await store.fail(
        examId,
        `${reason}

Given up after ${failures} attempts. ` +
          `${questionsDone} of ${questionsTotal} questions had been written.`,
      );
      return {
        status: "failed",
        stage: "failed",
        questionsDone,
        questionsTotal,
        more: false,
      };
    }

    // Keep what is written and come back for the rest. A slow call is not a
    // reason to throw away the questions that did land.
    await store.saveState(examId, {
      ...loaded.state,
      failures,
      lastError: reason,
      lastProgressAt: new Date().toISOString(),
      // A failed step still spent money; it counts against the ceiling.
      spend: total(),
      stepStartedAt: undefined,
      nextAttemptAt: new Date(Date.now() + backoffFor(failures, reason)).toISOString(),
    });

    return {
      status: "generating",
      stage: loaded.state.stage ?? "generating_questions",
      questionsDone,
      questionsTotal,
      more: true,
    };
  }
}

/**
 * True when a run has not reported progress for long enough to be dead.
 *
 * A run whose invocation was killed leaves the row at `generating` for ever,
 * which is what turned a five-minute failure into a permanent spinner.
 */
export function hasStalled(state: ResumableState, now: number = Date.now()): boolean {
  const last = state.lastProgressAt ? Date.parse(state.lastProgressAt) : NaN;
  if (Number.isNaN(last)) return false;
  return now - last > GENERATION_STALL_MS;
}

export const STALLED_MESSAGE =
  "Generation stopped responding and was abandoned. Nothing was lost — start it " +
  "again from Build Trial.";

/** The whole chain, so a failure says why rather than which statement failed. */
function describe(cause: unknown): string {
  if (!(cause instanceof Error)) return String(cause);
  const messages: string[] = [];
  const seen = new Set<unknown>();
  for (let error: unknown = cause; error instanceof Error && !seen.has(error); ) {
    seen.add(error);
    messages.push(error.message);
    error = (error as { cause?: unknown }).cause;
  }
  return messages.join("\n  caused by: ");
}
