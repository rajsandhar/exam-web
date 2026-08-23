import { getResponses } from "@/lib/db/queries/attempts";
import { getMarkingPaper } from "@/lib/db/queries/marking";
import type { HiddenTest } from "@/lib/python/hidden-tests";
import type { TableSpec } from "@/lib/schemas/stimulus";

/**
 * Work that can only be done in the browser (CLAUDE.md §11, §23).
 *
 * Student code is never executed on the server, so the hidden Python tests and
 * the SQL comparison run in the same sandboxed browser environment the student
 * used. That forces submission into two phases:
 *
 *   1. `POST /submit` marks everything deterministic and returns the execution
 *      work. The hidden tests are released here and only here — the attempt is
 *      already submitted, so they are no longer secret.
 *   2. The client runs them and posts the outcomes back, and the server marks
 *      those parts and finishes.
 *
 * The outcomes are client-computed, which is acceptable for a local single-user
 * study tool and is the only design that honours "never execute student code on
 * the server". They are stored labelled as such, and the rubric marker receives
 * them as evidence rather than as a mark it must accept.
 */

export type PythonExecutionRequest = {
  kind: "python";
  questionPartId: string;
  code: string;
  tests: HiddenTest[];
  marks: number;
};

export type SqlExecutionRequest = {
  kind: "sql";
  questionPartId: string;
  query: string;
  tables: Array<{ name: string; table: TableSpec }>;
  expectedResult: TableSpec;
  orderSensitive: boolean;
  marks: number;
};

export type ExecutionRequest = PythonExecutionRequest | SqlExecutionRequest;

export function buildExecutionRequests(
  attemptId: string,
  examId: string,
): ExecutionRequest[] {
  const groups = getMarkingPaper(examId);
  const responses = getResponses(attemptId);
  const requests: ExecutionRequest[] = [];

  for (const group of groups) {
    for (const part of group.parts) {
      const key = part.answerKey;
      const response = responses[part.id];

      if (part.rendererType === "python_editor" && key?.rendererType === "python_editor") {
        requests.push({
          kind: "python",
          questionPartId: part.id,
          code: response?.rendererType === "python_editor" ? response.code : "",
          tests: key.hiddenTests,
          marks: part.marks,
        });
      }

      if (part.rendererType === "sql_editor" && key?.rendererType === "sql_editor") {
        const config = part.config as {
          tables?: Array<{ name: string; table: TableSpec }>;
        };
        requests.push({
          kind: "sql",
          questionPartId: part.id,
          query: response?.rendererType === "sql_editor" ? response.query : "",
          tables: config.tables ?? [],
          expectedResult: key.expectedResult,
          orderSensitive: key.orderSensitive ?? false,
          marks: part.marks,
        });
      }
    }
  }

  return requests;
}

export type ExecutionOutcome = {
  questionPartId: string;
  awardedMarks: number;
  maxMarks: number;
  detail: string;
  passed: number;
  total: number;
  cases: Array<{
    name: string;
    passed: boolean;
    expected: string;
    actual: string | null;
    error: string | null;
  }>;
};
