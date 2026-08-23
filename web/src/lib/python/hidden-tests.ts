import {
  buildHiddenTestProgram,
  parseHiddenTestOutput,
  PythonRunner,
} from "./runner";

/**
 * Runs a question's hidden tests against a student's submission (CLAUDE.md §11).
 *
 * Hidden tests are never sent to the browser during the attempt — they live in
 * the answer key, which the exam page cannot read. They run here, after
 * submission, in the same sandboxed worker the student used.
 *
 * Marks combine the deterministic test outcome with any rubric marks the
 * question allocates for algorithm choice, structure or explanation. Passing a
 * couple of visible examples never earns full marks on its own.
 */

export type HiddenTest = {
  name: string;
  call: string;
  expected: string;
  marks?: number;
};

export type HiddenTestOutcome = {
  name: string;
  passed: boolean;
  expected: string;
  actual: string | null;
  error: string | null;
};

export type HiddenTestReport = {
  outcomes: HiddenTestOutcome[];
  passed: number;
  total: number;
  /** Marks earned from the tests alone, before any rubric marks. */
  awardedMarks: number;
  maxTestMarks: number;
};

export async function runHiddenTests(
  studentCode: string,
  tests: HiddenTest[],
  availableMarks: number,
  runner: PythonRunner = new PythonRunner(),
): Promise<HiddenTestReport> {
  const outcomes: HiddenTestOutcome[] = [];

  for (const test of tests) {
    let result = await runner.run(buildHiddenTestProgram(studentCode, test.call));

    // A timeout terminates the worker, so the next test would start cold. Warm
    // it and retry once: a genuine infinite loop times out again, but a test
    // that only lost a race to start-up is not marked wrong.
    if (result.timedOut) {
      await runner.warmUp();
      result = await runner.run(buildHiddenTestProgram(studentCode, test.call));
    }

    if (!result.ok && result.stdout === "") {
      outcomes.push({
        name: test.name,
        passed: false,
        expected: test.expected,
        actual: null,
        error: result.timedOut
          ? "The code did not finish in time."
          : (result.error ?? "The code did not run."),
      });
      continue;
    }

    const parsed = parseHiddenTestOutput(result.stdout);
    outcomes.push({
      name: test.name,
      passed: parsed.error === null && normalise(parsed.value) === normalise(test.expected),
      expected: test.expected,
      actual: parsed.value,
      error: parsed.error,
    });
  }

  const weighted = tests.some((test) => typeof test.marks === "number");
  const maxTestMarks = weighted
    ? tests.reduce((sum, test) => sum + (test.marks ?? 0), 0)
    : availableMarks;

  const earned = weighted
    ? outcomes.reduce(
        (sum, outcome, index) => sum + (outcome.passed ? (tests[index]?.marks ?? 0) : 0),
        0,
      )
    : maxTestMarks === 0
      ? 0
      : Math.round((outcomes.filter((o) => o.passed).length / tests.length) * maxTestMarks);

  return {
    outcomes,
    passed: outcomes.filter((outcome) => outcome.passed).length,
    total: tests.length,
    awardedMarks: Math.max(0, Math.min(maxTestMarks, earned)),
    maxTestMarks,
  };
}

/**
 * Confirms the question's own reference solution passes its hidden tests.
 * A question whose model answer fails its own tests is rejected at generation
 * (CLAUDE.md §11, §25).
 */
export async function referenceSolutionPasses(
  referenceSolution: string,
  tests: HiddenTest[],
  runner?: PythonRunner,
): Promise<{ ok: boolean; report: HiddenTestReport }> {
  const report = await runHiddenTests(referenceSolution, tests, tests.length, runner);
  return { ok: report.passed === report.total, report };
}

/** JSON output is compared structurally, so `1.0` and `1` agree. */
function normalise(value: string | null): string {
  if (value === null) return "";
  const trimmed = value.trim();
  try {
    return JSON.stringify(JSON.parse(trimmed));
  } catch {
    return trimmed.replace(/\s+/g, " ");
  }
}
