"use client";

import { useRouter } from "next/navigation";

import type { SyllabusPerformance } from "@/lib/results/build-results";

const STORAGE_KEY = "hsc-se.selected-syllabus-items.v1";

/**
 * Marks aggregated back to exact syllabus dot points (CLAUDE.md §19).
 *
 * Selecting a weak item sets it as the Build Trial selection and navigates
 * there — the platform still generates a full 100-mark paper from it.
 */
export function SyllabusPerformanceTable({
  rows,
  examId,
}: {
  rows: SyllabusPerformance[];
  examId: string;
}) {
  const router = useRouter();

  function retarget(id: string) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([id]));
    } catch {
      // Storage unavailable; the build screen simply starts empty.
    }
    router.push("/build");
  }

  if (rows.length === 0) {
    return (
      <p className="mt-4 text-sm text-ink-muted">
        No syllabus items were assessed in this paper.
      </p>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Marks earned per syllabus dot point for paper {examId}
        </caption>
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
            <th scope="col" className="py-2 pr-4 font-semibold">
              Dot point
            </th>
            <th scope="col" className="py-2 pr-4 font-semibold">
              Marks
            </th>
            <th scope="col" className="py-2 pr-4 font-semibold">
              Result
            </th>
            <th scope="col" className="py-2 pr-4 font-semibold">
              Questions
            </th>
            <th scope="col" className="py-2 font-semibold">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-line/70 align-top">
              <td className="py-3 pr-4">
                <span className="font-mono text-xs text-ink-muted">{row.id}</span>
                <br />
                {row.exactText}
              </td>
              <td className="py-3 pr-4 whitespace-nowrap tabular-nums">
                {row.available === 0 ? "—" : `${row.earned} / ${row.available}`}
                {row.notMarked > 0 && (
                  // Unmarked marks are excluded from the figures rather than
                  // counted as earned zeros, which would drag a dot point the
                  // student may well understand down to 0%.
                  <span className="ml-1 whitespace-nowrap text-xs text-ink-muted">
                    (+{row.notMarked} not marked)
                  </span>
                )}
              </td>
              <td className="py-3 pr-4 whitespace-nowrap">
                {row.available === 0 && row.notMarked > 0 ? (
                  <span className="text-ink-muted" title="No model endpoint configured">
                    not marked
                  </span>
                ) : row.percentage === null ? (
                  <span className="text-ink-muted" title="Too few marks to judge">
                    not enough evidence
                  </span>
                ) : (
                  <span className="tabular-nums">{row.percentage}%</span>
                )}
              </td>
              <td className="py-3 pr-4 tabular-nums">{row.questionCount}</td>
              <td className="py-3">
                <button
                  type="button"
                  onClick={() => retarget(row.id)}
                  className="whitespace-nowrap text-navy-700 underline"
                >
                  Practise this
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
