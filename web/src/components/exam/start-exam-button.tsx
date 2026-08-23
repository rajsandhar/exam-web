"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function StartExamButton({ examId }: { examId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/exams/${examId}/attempts`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Could not start the exam.");
      const { attemptId } = (await response.json()) as { attemptId: string };
      router.push(`/exam/${examId}/attempt/${attemptId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the exam.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        disabled={busy}
        onClick={() => void start()}
        className="flex h-12 items-center gap-2 bg-[var(--exam-nav-current-bg)] px-7 font-bold tracking-wide text-[var(--exam-nav-current-fg)] disabled:opacity-60"
      >
        {busy ? "STARTING…" : "START"} ›
      </button>
      {error && (
        <p className="mt-3 text-[0.9em] text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
