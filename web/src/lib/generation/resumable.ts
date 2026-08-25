import { GENERATION_CONCURRENCY, GENERATION_STALL_MS } from "@/lib/config";
import type { Blueprint } from "@/lib/ai/blueprint";
import { newGroupState, type ModelPaperGenerator } from "@/lib/ai/model-generator";
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
};

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
  batchSize: number = GENERATION_CONCURRENCY,
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

      // Generated together, but each stored as it lands: a step that dies part
      // way keeps what it finished, and the next one picks up the rest.
      const generated = await Promise.all(
        batch.map(async (plan) => generator.generateGroup(plan, blueprint, request, state)),
      );

      const groups = { ...done };
      for (const group of generated) groups[String(group.position)] = group;

      const questionsDone = Object.keys(groups).length;
      await store.saveState(examId, {
        ...loaded.state,
        stage: "generating_questions",
        questionsDone,
        questionsTotal: blueprint.groups.length,
        groups,
        lastProgressAt: new Date().toISOString(),
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
    await store.fail(examId, reason);
    return {
      status: "failed",
      stage: "failed",
      questionsDone: storedGroups(loaded.state).length,
      questionsTotal: loaded.state.questionsTotal ?? 0,
      more: false,
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
