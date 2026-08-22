"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  AUTOSAVE_DEBOUNCE_MS,
  type ExamColourTheme,
  type ExamFontSize,
} from "@/lib/config";
import type { StudentQuestionGroup } from "@/lib/db/queries/student";
import type { ExecutionRequest } from "@/lib/marking/execution-requests";
import { isAnswered, isResponsive, type ResponsePayload } from "@/lib/schemas/renderers";

import { ExamToolbar } from "./exam-toolbar";
import { ExamToolsProvider, type StoredHighlight } from "./exam-tools-context";
import { InfoDialog } from "./info-dialog";
import { QuestionNavigator } from "./question-navigator";
import { QuestionView } from "./question-view";
import { SubmitDialog } from "./submit-dialog";
import { TimerBar } from "./timer-bar";

/**
 * The examination environment.
 *
 * Everything the student changes is autosaved (CLAUDE.md §10.7), and the clock
 * is read from the server rather than counted locally, so a refresh restores
 * the attempt exactly and grants no extra time.
 */

export type AttemptState = {
  attemptId: string;
  examId: string;
  status: "reading" | "working" | "submitted" | "marked";
  serverNow: number;
  remainingMs: number | null;
};

export function ExamShell({
  title,
  groups,
  attempt,
  initialResponses,
  initialFlags,
  initialHighlights,
  initialUi,
}: {
  title: string;
  groups: StudentQuestionGroup[];
  attempt: AttemptState;
  initialResponses: Record<string, ResponsePayload | null>;
  initialFlags: string[];
  initialHighlights: StoredHighlight[];
  initialUi: { fontSize?: string; colourTheme?: string; lastQuestion?: number };
}) {
  const router = useRouter();

  const [position, setPosition] = useState(() => {
    const stored = initialUi.lastQuestion ?? 1;
    return Math.min(Math.max(1, stored), groups.length);
  });
  const [responses, setResponses] = useState(initialResponses);
  const [flags, setFlags] = useState(() => new Set(initialFlags));
  const [highlights, setHighlights] = useState(initialHighlights);
  const [fontSize, setFontSizeState] = useState<ExamFontSize>(
    (initialUi.fontSize as ExamFontSize) ?? "m",
  );
  const [colourTheme, setColourThemeState] = useState<ExamColourTheme>(
    (initialUi.colourTheme as ExamColourTheme) ?? "default",
  );
  const [highlightMode, setHighlightMode] = useState(false);
  const [phase, setPhase] = useState(attempt.status);
  const [remainingMs, setRemainingMs] = useState(attempt.remainingMs);
  const [showInfo, setShowInfo] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const answeringEnabled = phase === "working";
  const group = groups[position - 1];

  /* ---------------------------------------------------------------- timers */

  // The server owns the clock. The local tick is display only, and every few
  // seconds the true remaining time is re-read so a paused laptop, a clock
  // change or a refresh cannot buy extra time.
  const syncRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (phase !== "reading" && phase !== "working") return;
    const tick = window.setInterval(() => {
      setRemainingMs((current) => {
        if (current === null) return null;
        const next = Math.max(0, current - 1000);
        // At zero, ask the server what happens next rather than deciding here.
        if (next === 0 && current > 0) syncRef.current();
        return next;
      });
    }, 1000);
    return () => window.clearInterval(tick);
  }, [phase]);

  const syncState = useCallback(async () => {
    try {
      const response = await fetch(`/api/attempts/${attempt.attemptId}/state`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = (await response.json()) as {
        status: AttemptState["status"];
        remainingMs: number | null;
      };
      setRemainingMs(payload.remainingMs);
      if (payload.status !== phase) {
        setPhase(payload.status);
        if (payload.status === "submitted" || payload.status === "marked") {
          router.push(`/results/${attempt.attemptId}`);
        }
      }
    } catch {
      // Offline for a moment; the next sync corrects the display.
    }
  }, [attempt.attemptId, phase, router]);

  useEffect(() => {
    if (phase !== "reading" && phase !== "working") return;
    const timer = window.setInterval(() => void syncState(), 10_000);
    return () => window.clearInterval(timer);
  }, [phase, syncState]);

  useEffect(() => {
    syncRef.current = () => void syncState();
  }, [syncState]);

  /* --------------------------------------------------------------- saving */

  const pending = useRef(new Map<string, ResponsePayload>());
  const saveTimer = useRef<number | null>(null);

  const flushResponses = useCallback(async () => {
    if (pending.current.size === 0) return;
    const batch = [...pending.current.entries()].map(([questionPartId, response]) => ({
      questionPartId,
      response,
    }));
    pending.current.clear();
    setSaveState("saving");
    try {
      const result = await fetch(`/api/attempts/${attempt.attemptId}/responses`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ responses: batch }),
      });
      setSaveState(result.ok ? "saved" : "error");
    } catch {
      setSaveState("error");
    }
  }, [attempt.attemptId]);

  const queueResponse = useCallback(
    (partId: string, value: ResponsePayload) => {
      setResponses((prev) => ({ ...prev, [partId]: value }));
      pending.current.set(partId, value);
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void flushResponses();
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [flushResponses],
  );

  // Never leave an edit unsaved on navigation or close.
  useEffect(() => {
    const onHide = () => {
      if (pending.current.size === 0) return;
      const batch = [...pending.current.entries()].map(([questionPartId, response]) => ({
        questionPartId,
        response,
      }));
      pending.current.clear();
      navigator.sendBeacon(
        `/api/attempts/${attempt.attemptId}/responses`,
        new Blob([JSON.stringify({ responses: batch })], { type: "application/json" }),
      );
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [attempt.attemptId]);

  const saveUi = useCallback(
    (patch: Record<string, unknown>) => {
      void fetch(`/api/attempts/${attempt.attemptId}/ui`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
    },
    [attempt.attemptId],
  );

  function goTo(next: number) {
    const clamped = Math.min(Math.max(1, next), groups.length);
    setPosition(clamped);
    void flushResponses();
    saveUi({ lastQuestion: clamped });
    window.scrollTo({ top: 0 });
  }

  function setFontSize(size: ExamFontSize) {
    setFontSizeState(size);
    saveUi({ fontSize: size });
  }

  function setColourTheme(theme: ExamColourTheme) {
    setColourThemeState(theme);
    saveUi({ colourTheme: theme });
  }

  /* ----------------------------------------------------------- flags etc. */

  function toggleFlag() {
    if (!group) return;
    const on = !flags.has(group.rowId);
    setFlags((prev) => {
      const next = new Set(prev);
      if (on) next.add(group.rowId);
      else next.delete(group.rowId);
      return next;
    });
    void fetch(`/api/attempts/${attempt.attemptId}/flags`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questionGroupId: group.rowId, flagged: on }),
    });
  }

  const addHighlight = useCallback(
    (highlight: Omit<StoredHighlight, "id" | "questionGroupId">) => {
      if (!group) return;
      const optimisticId = `pending-${Date.now()}`;
      const record: StoredHighlight = {
        ...highlight,
        id: optimisticId,
        questionGroupId: group.rowId,
      };
      setHighlights((prev) => [...prev, record]);

      void fetch(`/api/attempts/${attempt.attemptId}/highlights`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...highlight, questionGroupId: group.rowId }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((payload: { id?: string } | null) => {
          if (!payload?.id) return;
          setHighlights((prev) =>
            prev.map((h) => (h.id === optimisticId ? { ...h, id: payload.id! } : h)),
          );
        });
    },
    [attempt.attemptId, group],
  );

  const removeHighlight = useCallback(
    (id: string) => {
      setHighlights((prev) => prev.filter((h) => h.id !== id));
      void fetch(`/api/attempts/${attempt.attemptId}/highlights?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    },
    [attempt.attemptId],
  );

  const highlightsForRegion = useCallback(
    (region: string) => highlights.filter((h) => h.region === region),
    [highlights],
  );

  /* ------------------------------------------------------------- progress */

  const navigatorItems = useMemo(
    () =>
      groups.map((g) => ({
        position: g.position,
        flagged: flags.has(g.rowId),
        answered: g.parts
          .filter((p) => isResponsive(p.rendererType))
          .every((p) => isAnswered(responses[p.id])),
      })),
    [groups, flags, responses],
  );

  const counts = useMemo(() => {
    let answered = 0;
    let unanswered = 0;
    for (const g of groups) {
      for (const part of g.parts) {
        if (!isResponsive(part.rendererType)) continue;
        if (isAnswered(responses[part.id])) answered += 1;
        else unanswered += 1;
      }
    }
    return { answered, unanswered, flagged: flags.size };
  }, [groups, responses, flags]);

  async function submit() {
    await flushResponses();
    const response = await fetch(`/api/attempts/${attempt.attemptId}/submit`, {
      method: "POST",
    });
    if (!response.ok) return;

    // Phase two: any Python or SQL in this paper runs here, in the browser,
    // because student code is never executed on the server.
    const payload = (await response.json()) as {
      executionRequests?: ExecutionRequest[];
    };
    const requests = payload.executionRequests ?? [];

    if (requests.length > 0) {
      const { runExecutionRequests } = await import(
        "@/lib/marking/run-execution-requests"
      );
      const outcomes = await runExecutionRequests(requests);
      await fetch(`/api/attempts/${attempt.attemptId}/execution-results`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outcomes }),
      });
    }

    router.push(`/results/${attempt.attemptId}`);
  }

  const toolsValue = useMemo(
    () => ({
      fontSize,
      setFontSize,
      colourTheme,
      setColourTheme,
      highlightMode,
      setHighlightMode,
      highlightsForRegion,
      addHighlight,
      removeHighlight,
      answeringEnabled,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      fontSize,
      colourTheme,
      highlightMode,
      highlightsForRegion,
      addHighlight,
      removeHighlight,
      answeringEnabled,
    ],
  );

  if (!group) {
    return <p className="p-8">This paper has no questions.</p>;
  }

  const isLast = position === groups.length;

  return (
    <ExamToolsProvider value={toolsValue}>
      <div
        data-exam-theme={colourTheme}
        data-exam-font={fontSize}
        className="flex min-h-screen flex-col"
      >
        <header className="bg-[var(--exam-header-bg)] text-[var(--exam-header-fg)]">
          <div className="flex items-center gap-4 px-6 py-4">
            <h2 className="text-[1.05em] font-bold tracking-tight">{title}</h2>
            <div className="ml-auto flex items-center gap-5 text-[0.85em]">
              <SaveIndicator state={saveState} />
              <TimerBar phase={phase} remainingMs={remainingMs} />
            </div>
          </div>
        </header>

        <div className="border-b border-[var(--exam-line)] bg-[var(--exam-toolbar-bg)]">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-2.5">
            <QuestionNavigator
              items={navigatorItems}
              current={position}
              onSelect={goTo}
            />
            <ExamToolbar
              flagged={flags.has(group.rowId)}
              onToggleFlag={toggleFlag}
              highlightMode={highlightMode}
              onToggleHighlight={() => setHighlightMode((h) => !h)}
              fontSize={fontSize}
              onFontSize={setFontSize}
              colourTheme={colourTheme}
              onColourTheme={setColourTheme}
              onInfo={() => setShowInfo(true)}
            />
          </div>
        </div>

        {phase === "reading" && (
          <div
            role="status"
            className="border-b border-[var(--exam-line)] bg-[var(--exam-nav-answered-bg)] px-6 py-2 text-[0.9em] font-semibold text-[var(--exam-accent)]"
          >
            Reading time. You can move between questions, flag them and highlight
            text. Answer controls are disabled until working time begins.
          </div>
        )}

        <main className="flex-1 px-6 py-7">
          <QuestionView
            group={group}
            responses={responses}
            onRespond={queueResponse}
            disabled={!answeringEnabled}
          />

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => goTo(position - 1)}
              disabled={position === 1}
              className="flex h-11 items-center gap-2 border border-[var(--exam-line)] bg-[var(--exam-canvas-bg)] px-5 font-semibold text-[var(--exam-accent)] disabled:opacity-40"
            >
              ‹ Previous question
            </button>

            {isLast ? (
              <button
                type="button"
                onClick={() => setShowSubmit(true)}
                className="flex h-11 items-center gap-2 bg-[var(--exam-nav-current-bg)] px-5 font-semibold text-[var(--exam-nav-current-fg)]"
              >
                {phase === "reading" ? "Exit reading time" : "Submit exam"} ⇥
              </button>
            ) : (
              <button
                type="button"
                onClick={() => goTo(position + 1)}
                className="flex h-11 items-center gap-2 bg-[var(--exam-nav-current-bg)] px-5 font-semibold text-[var(--exam-nav-current-fg)]"
              >
                Next question ›
              </button>
            )}
          </div>
        </main>

        {showInfo && <InfoDialog onClose={() => setShowInfo(false)} phase={phase} />}

        {showSubmit && (
          <SubmitDialog
            phase={phase}
            counts={counts}
            onClose={() => setShowSubmit(false)}
            onConfirm={async () => {
              if (phase === "reading") {
                await fetch(`/api/attempts/${attempt.attemptId}/begin-working`, {
                  method: "POST",
                });
                setShowSubmit(false);
                await syncState();
                return;
              }
              await submit();
            }}
          />
        )}
      </div>
    </ExamToolsProvider>
  );
}

function SaveIndicator({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  const label =
    state === "saving"
      ? "Saving…"
      : state === "saved"
        ? "All answers saved"
        : state === "error"
          ? "Could not save — check your connection"
          : "";
  if (!label) return null;
  return (
    <span
      aria-live="polite"
      className={state === "error" ? "font-semibold text-[#ff9c8a]" : "opacity-80"}
    >
      {label}
    </span>
  );
}
