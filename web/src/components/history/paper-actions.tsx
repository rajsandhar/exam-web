import Link from "next/link";

import type { ExamHistoryRow } from "@/lib/db/queries/history";

/**
 * What a paper in the history list offers, which depends on how it ended.
 *
 * A failed paper has nothing behind it — generation never wrote one — so the
 * Open link it used to carry led to a bare 404. It lived inline in the page,
 * which is a server component and cannot be rendered in a test, so the state
 * that only appears after a failure went unverified.
 */
export function PaperActions({
  row,
}: {
  row: Pick<
    ExamHistoryRow,
    "id" | "status" | "latestAttemptId" | "latestAttemptMarked"
  >;
}) {
  if (row.status === "failed") {
    return (
      <Link href="/build" className="font-medium text-navy-700 underline">
        Try again
      </Link>
    );
  }

  if (row.status === "generating") {
    // Not a label: the work only advances while the progress screen is open,
    // so this is how a paused paper is picked up again. It resumes from what
    // was already written rather than starting over.
    return (
      <Link href={`/generating/${row.id}`} className="font-medium text-navy-700 underline">
        Resume
      </Link>
    );
  }

  const marked = Boolean(row.latestAttemptId) && row.latestAttemptMarked;

  return (
    <Link
      href={marked ? `/results/${row.latestAttemptId}` : `/exam/${row.id}/instructions`}
      className="font-medium text-navy-700 underline"
    >
      {marked ? "Review" : "Open"}
    </Link>
  );
}
