"use client";

import { runHiddenTests } from "@/lib/python/hidden-tests";
import { PythonRunner } from "@/lib/python/runner";
import { compareResults, runQuery } from "@/lib/sql/run-query";

import type { ExecutionOutcome, ExecutionRequest } from "./execution-requests";

/**
 * Runs the browser-side half of marking (CLAUDE.md §11, §12).
 *
 * Called once, immediately after submission, with the work the server handed
 * back. Every failure produces an outcome rather than an exception — a student
 * whose code crashes must still get a marked paper.
 */
export async function runExecutionRequests(
  requests: ExecutionRequest[],
): Promise<ExecutionOutcome[]> {
  if (requests.length === 0) return [];

  const runner = new PythonRunner();
  const outcomes: ExecutionOutcome[] = [];

  try {
    // Load the runtime before anything is timed. Without this the first hidden
    // test races Pyodide's own start-up and can be recorded as a timeout even
    // though the student's code is correct.
    if (requests.some((request) => request.kind === "python")) {
      await runner.warmUp();
    }

    for (const request of requests) {
      if (request.kind === "python") {
        if (request.code.trim() === "") {
          outcomes.push({
            questionPartId: request.questionPartId,
            awardedMarks: 0,
            maxMarks: request.marks,
            detail: "No code was written.",
            passed: 0,
            total: request.tests.length,
            cases: [],
          });
          continue;
        }

        const report = await runHiddenTests(
          request.code,
          request.tests,
          request.marks,
          runner,
        );
        outcomes.push({
          questionPartId: request.questionPartId,
          awardedMarks: report.awardedMarks,
          maxMarks: request.marks,
          detail: `${report.passed} of ${report.total} hidden test${
            report.total === 1 ? "" : "s"
          } passed.`,
          passed: report.passed,
          total: report.total,
          cases: report.outcomes,
        });
        continue;
      }

      if (request.query.trim() === "") {
        outcomes.push({
          questionPartId: request.questionPartId,
          awardedMarks: 0,
          maxMarks: request.marks,
          detail: "No query was written.",
          passed: 0,
          total: 1,
          cases: [],
        });
        continue;
      }

      const result = await runQuery(request.tables, request.query);
      if (!result.ok) {
        outcomes.push({
          questionPartId: request.questionPartId,
          awardedMarks: 0,
          maxMarks: request.marks,
          detail: `The query did not run: ${result.error ?? "unknown error"}`,
          passed: 0,
          total: 1,
          cases: [
            {
              name: "Query executes",
              passed: false,
              expected: "a result set",
              actual: null,
              error: result.error,
            },
          ],
        });
        continue;
      }

      const comparison = compareResults(
        result,
        request.expectedResult,
        request.orderSensitive,
      );
      outcomes.push({
        questionPartId: request.questionPartId,
        awardedMarks: comparison.matches ? request.marks : 0,
        maxMarks: request.marks,
        detail: comparison.detail,
        passed: comparison.matches ? 1 : 0,
        total: 1,
        cases: [
          {
            name: "Query result matches the expected output",
            passed: comparison.matches,
            expected: `${request.expectedResult.rows.length} row(s)`,
            actual: `${result.rows.length} row(s)`,
            error: null,
          },
        ],
      });
    }
  } finally {
    runner.terminate();
  }

  return outcomes;
}
