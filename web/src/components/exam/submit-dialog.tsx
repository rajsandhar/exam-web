"use client";

import { useState } from "react";

import { ExamDialog } from "./exam-dialog";

export function SubmitDialog({
  phase,
  counts,
  onClose,
  onConfirm,
}: {
  phase: string;
  counts: { answered: number; unanswered: number; flagged: number };
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const readingPhase = phase === "reading";

  return (
    <ExamDialog
      title={readingPhase ? "End reading time?" : "Submit your exam?"}
      onClose={onClose}
    >
      {readingPhase ? (
        <p className="text-[0.95em] leading-relaxed">
          Reading time has not finished. If you continue, working time begins now
          and you will be able to answer questions. Time not used for reading is
          not added to your working time.
        </p>
      ) : (
        <>
          <p className="text-[0.95em] leading-relaxed">
            Once you submit you cannot return to the paper. Check the summary
            below before continuing.
          </p>
          <ul className="mt-4 space-y-1.5 text-[0.95em]">
            <li>
              <strong className="tabular-nums">{counts.answered}</strong> item
              {counts.answered === 1 ? "" : "s"} answered
            </li>
            <li>
              <strong className="tabular-nums">{counts.unanswered}</strong> item
              {counts.unanswered === 1 ? "" : "s"} not answered
            </li>
            <li>
              <strong className="tabular-nums">{counts.flagged}</strong> question
              {counts.flagged === 1 ? "" : "s"} flagged
            </li>
          </ul>
          {counts.unanswered > 0 && (
            <p className="mt-4 border-l-4 border-[var(--flag)] bg-[var(--exam-panel-bg)] px-4 py-2.5 text-[0.9em]">
              You have unanswered items. Submitting now means they score zero.
            </p>
          )}
        </>
      )}

      <div className="mt-7 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onClose}
          className="h-11 border border-[var(--exam-line)] px-5 font-semibold text-[var(--exam-accent)]"
        >
          {readingPhase ? "Keep reading" : "Return to the paper"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onConfirm().finally(() => setBusy(false));
          }}
          className="h-11 bg-[var(--exam-nav-current-bg)] px-5 font-semibold text-[var(--exam-nav-current-fg)] disabled:opacity-60"
        >
          {busy
            ? readingPhase
              ? "Working…"
              : "Submitting and marking…"
            : readingPhase
              ? "Start working time"
              : "Submit exam"}
        </button>
      </div>
    </ExamDialog>
  );
}
