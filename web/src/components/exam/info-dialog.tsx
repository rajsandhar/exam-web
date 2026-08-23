"use client";

import { READING_MINUTES, TOTAL_MARKS, WORKING_MINUTES } from "@/lib/config";

import { ExamDialog } from "./exam-dialog";

export function InfoDialog({
  onClose,
  phase,
}: {
  onClose: () => void;
  phase: string;
}) {
  return (
    <ExamDialog title="Exam information" onClose={onClose}>
      <dl className="space-y-3 text-[0.95em]">
        <div>
          <dt className="font-semibold">Total marks</dt>
          <dd>{TOTAL_MARKS}</dd>
        </div>
        <div>
          <dt className="font-semibold">Reading time</dt>
          <dd>{READING_MINUTES} minutes</dd>
        </div>
        <div>
          <dt className="font-semibold">Working time</dt>
          <dd>
            {Math.floor(WORKING_MINUTES / 60)} hours {WORKING_MINUTES % 60} minutes
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Current phase</dt>
          <dd>{phase === "reading" ? "Reading time" : "Working time"}</dd>
        </div>
      </dl>

      <h3 className="mt-6 font-semibold">Navigation and tools</h3>
      <ul className="ml-5 mt-2 list-disc space-y-1.5 text-[0.95em]">
        <li>
          Use the numbered buttons, or Previous and Next, to move between
          questions.
        </li>
        <li>
          Flag marks a question so you can find it again. Flagged numbers carry a
          marker in the navigator.
        </li>
        <li>
          Highlight lets you select text in a question or its stimulus. Click a
          highlight to remove it.
        </li>
        <li>
          Font size and Colour change how the paper is displayed and are
          remembered for this attempt.
        </li>
        <li>
          Answers save automatically. Refreshing the page will not lose your work
          or change the time remaining.
        </li>
      </ul>

      <p className="mt-5 text-[0.9em] text-[var(--exam-muted)]">
        The number of words suggested for each extended response indicates the
        expected length of response. It is a guide, not a limit.
      </p>
    </ExamDialog>
  );
}
