"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  GENERATION_STAGE_LABELS,
  type GenerationStage,
} from "@/lib/ai/provider-names";

/**
 * Stage-based progress (CLAUDE.md §27). No fabricated percentages — a stage is
 * either reached or it is not, and the question counter only appears when the
 * generator genuinely knows both numbers.
 */

const ORDERED_STAGES: GenerationStage[] = [
  "planning",
  "mapping_coverage",
  "building_stimuli",
  "generating_questions",
  "validating",
  "reviewing_difficulty",
  "finalising_marking",
];

type StatusResponse = {
  status: "generating" | "ready" | "failed";
  progress: { stage?: GenerationStage; detail?: string; questionsDone?: number; questionsTotal?: number };
  error: string | null;
};

export function GenerationProgressView({
  examId,
  initialStatus,
}: {
  examId: string;
  initialStatus: string;
}) {
  const router = useRouter();
  // Whether a step is already running. The server holds a lease as well, for
  // the second tab; this stops this tab racing itself.
  const advancing = useRef(false);

  const [state, setState] = useState<StatusResponse>({
    status: initialStatus === "ready" ? "ready" : initialStatus === "failed" ? "failed" : "generating",
    progress: { stage: "planning" },
    error: null,
  });

  // Navigation is its own effect rather than a side effect of polling, so a
  // paper that was already finished when this page rendered still moves on.
  useEffect(() => {
    if (state.status === "ready") router.replace(`/exam/${examId}/instructions`);
  }, [state.status, examId, router]);

  useEffect(() => {
    if (state.status !== "generating") return;
    let cancelled = false;

    const poll = async () => {
      try {
        // Model-backed generation cannot finish inside one request, so the
        // screen advances it as well as reading it. One at a time, though: a
        // step can take a minute, this ticks every 700ms, and firing another
        // advance into a step already running meant dozens of invocations all
        // planning the same paper — duplicated work, duplicated spend, and a
        // rate limit from the provider within seconds.
        if (!advancing.current) {
          advancing.current = true;
          void fetch(`/api/exams/${examId}/advance`, {
            method: "POST",
            cache: "no-store",
          })
            .catch(() => undefined)
            .finally(() => {
              advancing.current = false;
            });
        }

        const response = await fetch(`/api/exams/${examId}/status`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as StatusResponse;
        if (cancelled) return;
        setState(payload);
      } catch {
        // Transient failure while the server is busy generating; keep polling.
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 700);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [examId, state.status, router]);

  if (state.status === "failed") {
    return (
      <div className="rounded-lg border border-danger/40 bg-danger/5 p-6">
        <h2 className="font-semibold text-danger">Generation failed</h2>
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-ink">
          {state.error ?? "No reason was recorded for this failure."}
        </pre>
        {/* Quotable: without it a failure cannot be reported or looked up. */}
        <p className="mt-3 text-xs text-ink-muted">
          Paper <code className="font-mono">{examId}</code>
        </p>
        <button
          type="button"
          onClick={() => router.push("/build")}
          className="mt-5 rounded-md border border-navy-700 px-4 py-2 text-sm font-medium text-navy-700 hover:bg-navy-700 hover:text-white"
        >
          Back to Build Trial
        </button>
      </div>
    );
  }

  const currentIndex = ORDERED_STAGES.indexOf(state.progress.stage ?? "planning");

  return (
    <ol className="space-y-1">
      {ORDERED_STAGES.map((stage, index) => {
        const done = state.status === "ready" || index < currentIndex;
        const active = state.status !== "ready" && index === currentIndex;
        return (
          <li
            key={stage}
            className={`flex items-center gap-3 rounded px-3 py-2.5 text-sm ${
              active ? "bg-surface-2 font-medium text-navy-800" : "text-ink-muted"
            }`}
            aria-current={active ? "step" : undefined}
          >
            <span
              aria-hidden="true"
              className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                done ? "bg-navy-700" : active ? "bg-navy-500" : "bg-line-strong"
              }`}
            />
            <span>{GENERATION_STAGE_LABELS[stage]}</span>
            {active &&
              state.progress.questionsTotal !== undefined &&
              state.progress.questionsDone !== undefined && (
                <span className="ml-auto tabular-nums text-xs">
                  {state.progress.questionsDone} / {state.progress.questionsTotal}
                </span>
              )}
            {done && <span className="ml-auto text-xs">done</span>}
          </li>
        );
      })}
    </ol>
  );
}
