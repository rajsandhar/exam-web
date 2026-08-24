import Link from "next/link";

import { PlatformShell } from "@/components/platform/shell";
import { requireUser } from "@/lib/auth/current-user";
import { listExamHistory } from "@/lib/db/queries/history";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const user = await requireUser("/history");
  const rows = await listExamHistory(user.id);

  return (
    <PlatformShell active="history">
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-800">
          History
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Papers you have generated, and the attempts you have made on them.
        </p>

        {rows.length === 0 ? (
          <p className="mt-10 rounded-lg border border-dashed border-line bg-white p-10 text-center text-sm text-ink-muted">
            No papers yet.{" "}
            <Link href="/build" className="font-medium text-navy-700 underline">
              Build a trial
            </Link>{" "}
            to get started.
          </p>
        ) : (
          <table className="mt-6 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="py-2 pr-4 font-semibold">Paper</th>
                <th className="py-2 pr-4 font-semibold">Generated</th>
                <th className="py-2 pr-4 font-semibold">Status</th>
                <th className="py-2 pr-4 font-semibold">Attempts</th>
                <th className="py-2 pr-4 font-semibold">Best mark</th>
                <th className="py-2 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line/70">
                  <td className="py-3 pr-4 font-medium">{row.title}</td>
                  <td className="py-3 pr-4 text-ink-muted">
                    {new Date(row.createdAt).toLocaleString("en-AU")}
                  </td>
                  <td className="py-3 pr-4">{row.status}</td>
                  <td className="py-3 pr-4">{row.attemptCount}</td>
                  <td className="py-3 pr-4">
                    {row.bestScore === null ? "—" : `${row.bestScore}/${row.totalMarks}`}
                  </td>
                  <td className="py-3">
                    {row.status === "failed" ? (
                      // There is no paper behind a failed row, so Open led to a
                      // bare 404. Offer the only thing that can be done with it.
                      <Link href="/build" className="font-medium text-navy-700 underline">
                        Try again
                      </Link>
                    ) : row.status === "generating" ? (
                      <span className="text-ink-muted">Generating…</span>
                    ) : (
                      <Link
                        href={
                          row.latestAttemptId && row.latestAttemptMarked
                            ? `/results/${row.latestAttemptId}`
                            : `/exam/${row.id}/instructions`
                        }
                        className="font-medium text-navy-700 underline"
                      >
                        {row.latestAttemptId && row.latestAttemptMarked ? "Review" : "Open"}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </PlatformShell>
  );
}
