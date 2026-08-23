"use client";

import { useState } from "react";
import type { z } from "zod";

import { runQuery, type SqlResult } from "@/lib/sql/run-query";
import type { sqlEditorConfigSchema } from "@/lib/schemas/renderers";

import { StimulusTable } from "../exam/stimulus";
import { CodeEditor } from "./code-editor";

type Config = z.infer<typeof sqlEditorConfigSchema>;

/**
 * SQL question with a real temporary dataset (CLAUDE.md §12).
 *
 * Source tables are rendered as proper examination stimulus tables, not
 * markdown. The query runs against an in-browser SQLite database built from the
 * question's own table definitions, so a student can check their work exactly as
 * they would in a database tool.
 */
export function SqlEditor({
  config,
  value,
  onChange,
  disabled,
}: {
  partId: string;
  config: Config;
  value: string;
  onChange: (query: string) => void;
  disabled: boolean;
}) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SqlResult | null>(null);

  const query = value === "" ? (config.starterQuery ?? "") : value;
  const canRun = config.allowExecution !== false;

  async function execute() {
    if (running) return;
    setRunning(true);
    setResult(null);
    setResult(await runQuery(config.tables, query));
    setRunning(false);
  }

  return (
    <div className="mt-3">
      <div className="space-y-4">
        {config.tables.map((entry) => (
          <div key={entry.name}>
            <p className="mb-1.5 font-mono text-[0.85em] font-semibold">{entry.name}</p>
            <StimulusTable table={entry.table} />
          </div>
        ))}
      </div>

      <div className="mt-4">
        <CodeEditor
          value={query}
          language="sql"
          onChange={onChange}
          disabled={disabled}
          height={180}
          ariaLabel="SQL query editor"
        />
      </div>

      {canRun && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void execute()}
            disabled={disabled || running || query.trim() === ""}
            className="flex h-9 items-center gap-2 bg-[var(--exam-nav-current-bg)] px-4 text-[0.85em] font-semibold text-[var(--exam-nav-current-fg)] disabled:opacity-50"
          >
            {running ? "Running…" : "▶ Run query"}
          </button>
          <span className="text-[0.8em] text-[var(--exam-muted)]">
            Runs against a copy of the tables above, in your browser.
          </span>
        </div>
      )}

      {result && (
        <div className="mt-3" aria-live="polite">
          <p className="mb-1 text-[0.8em] font-semibold uppercase tracking-wide text-[var(--exam-muted)]">
            Result
          </p>
          {!result.ok ? (
            <pre className="border border-[var(--danger)] p-3 font-mono text-[0.85em] whitespace-pre-wrap text-[var(--danger)]">
              {result.error}
            </pre>
          ) : result.mutating ? (
            <p className="border border-[var(--exam-line)] p-3 text-[0.9em]">
              The statement ran successfully and returned no rows.
            </p>
          ) : result.rows.length === 0 ? (
            <p className="border border-[var(--exam-line)] p-3 text-[0.9em]">
              The query returned no rows.
            </p>
          ) : (
            <StimulusTable
              table={{ columns: result.columns, rows: result.rows }}
            />
          )}
        </div>
      )}
    </div>
  );
}
