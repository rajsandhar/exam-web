"use client";

import { useEffect, useRef, useState } from "react";
import type { z } from "zod";

import { PythonRunner, type PythonResult } from "@/lib/python/runner";
import type { pythonEditorConfigSchema } from "@/lib/schemas/renderers";

import { CodeEditor } from "./code-editor";

type Config = z.infer<typeof pythonEditorConfigSchema>;

/**
 * Executable Python question (CLAUDE.md §11).
 *
 * The student may run their code and read stdout and stderr while sitting the
 * paper. Hidden assessment tests are never sent to the browser — they live in
 * the answer key and run at marking time.
 */
export function PythonEditor({
  partId,
  config,
  value,
  lastStdout,
  onChange,
  disabled,
}: {
  partId: string;
  config: Config;
  value: string;
  lastStdout?: string;
  onChange: (code: string, stdout?: string) => void;
  disabled: boolean;
}) {
  const runnerRef = useRef<PythonRunner | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PythonResult | null>(null);
  const [showReset, setShowReset] = useState(false);

  // The student's saved code takes precedence; starter code seeds an empty answer.
  const code = value === "" ? config.starterCode : value;

  useEffect(() => {
    const runner = new PythonRunner();
    runnerRef.current = runner;
    // Load the runtime in the background so the first Run is not a 40s wait.
    if (!disabled) void runner.warmUp();
    return () => runner.terminate();
  }, [disabled]);

  async function run() {
    const runner = runnerRef.current;
    if (!runner || running) return;
    setRunning(true);
    setResult(null);
    const next = await runner.run(code);
    setResult(next);
    setRunning(false);
    // Persist the last output alongside the code so review shows what the
    // student actually saw.
    onChange(code, next.stdout);
  }

  return (
    <div className="mt-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void run()}
          disabled={disabled || running}
          className="flex h-9 items-center gap-2 bg-[var(--exam-nav-current-bg)] px-4 text-[0.85em] font-semibold text-[var(--exam-nav-current-fg)] disabled:opacity-50"
        >
          {running ? "Running…" : "▶ Run"}
        </button>

        {showReset ? (
          <span className="flex items-center gap-2 text-[0.85em]">
            Discard your code and start again?
            <button
              type="button"
              onClick={() => {
                onChange(config.starterCode);
                setResult(null);
                setShowReset(false);
              }}
              className="h-8 border border-[var(--danger)] px-3 font-semibold text-[var(--danger)]"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => setShowReset(false)}
              className="h-8 border border-[var(--exam-line)] px-3"
            >
              Keep
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setShowReset(true)}
            disabled={disabled}
            className="h-9 border border-[var(--exam-line)] px-3 text-[0.85em] disabled:opacity-50"
          >
            Reset to starter code
          </button>
        )}

        <span className="text-[0.8em] text-[var(--exam-muted)]">
          Runs in your browser. Your code is not sent anywhere.
        </span>
      </div>

      <CodeEditor
        value={code}
        language="python"
        onChange={(next) => onChange(next)}
        disabled={disabled}
        ariaLabel="Python code editor"
      />

      {config.visibleExamples && config.visibleExamples.length > 0 && (
        <div className="mt-3 border border-[var(--exam-line)] p-3 text-[0.9em]">
          <p className="font-semibold">Examples you can check against</p>
          <ul className="ml-5 mt-1 list-disc">
            {config.visibleExamples.map((example, index) => (
              <li key={index}>
                {example.description} → <code className="font-mono">{example.expected}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3">
        <p className="mb-1 text-[0.8em] font-semibold uppercase tracking-wide text-[var(--exam-muted)]">
          Output
        </p>
        <pre
          id={`output-${partId}`}
          aria-live="polite"
          className="max-h-56 overflow-auto border border-[var(--exam-line)] bg-[var(--exam-input-bg)] p-3 font-mono text-[0.85em] whitespace-pre-wrap"
        >
          {running
            ? "Running…"
            : result
              ? formatOutput(result)
              : (lastStdout ?? "Select Run to execute your code.")}
        </pre>
      </div>
    </div>
  );
}

function formatOutput(result: PythonResult): string {
  const parts: string[] = [];
  if (result.stdout) parts.push(result.stdout);
  if (result.stderr) parts.push(result.stderr);
  if (result.error) parts.push(result.error);
  if (parts.length === 0) {
    parts.push("Your code ran without printing anything.");
  }
  return parts.join("\n");
}
