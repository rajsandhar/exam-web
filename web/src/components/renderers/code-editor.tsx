"use client";

import { Editor, loader } from "@monaco-editor/react";
import { useEffect, useState } from "react";

import { useExamTools } from "../exam/exam-tools-context";

/**
 * Monaco, served from `public/monaco` rather than a CDN so the examination
 * works offline (CLAUDE.md §11, §22).
 *
 * A plain textarea stands in until Monaco has loaded, and permanently if it
 * fails to load — a student must never be unable to answer a programming
 * question because an editor did not initialise.
 */

loader.config({ paths: { vs: "/monaco/vs" } });

export function CodeEditor({
  value,
  language,
  onChange,
  disabled,
  height = 320,
  ariaLabel,
}: {
  value: string;
  language: "python" | "sql" | "plaintext";
  onChange: (value: string) => void;
  disabled: boolean;
  height?: number;
  ariaLabel: string;
}) {
  const [failed, setFailed] = useState(false);

  // Follow the exam colour theme so the editor is not a bright rectangle in a
  // high-contrast or dark paper.
  const { colourTheme } = useExamTools();
  const dark = colourTheme === "dark" || colourTheme === "high-contrast";

  useEffect(() => {
    // If Monaco cannot be fetched at all, fall back permanently rather than
    // leaving the student staring at "Loading editor…".
    let cancelled = false;
    loader.init().catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <textarea
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        style={{ height }}
        className="w-full border border-[var(--exam-line)] bg-[var(--exam-input-bg)] p-3 font-mono text-[0.9em] text-[var(--exam-fg)] outline-none disabled:opacity-60"
      />
    );
  }

  return (
    <div
      className="border border-[var(--exam-line)]"
      style={{ height }}
      aria-label={ariaLabel}
    >
      <Editor
        height="100%"
        language={language}
        value={value}
        theme={dark ? "vs-dark" : "vs"}
        onChange={(next) => onChange(next ?? "")}
        loading={
          <p className="p-3 text-[0.9em] text-[var(--exam-muted)]">Loading editor…</p>
        }
        onMount={(editor) => {
          editor.updateOptions({ readOnly: disabled });
        }}
        options={{
          readOnly: disabled,
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          renderLineHighlight: "none",
          tabSize: 4,
          insertSpaces: true,
          automaticLayout: true,
          wordWrap: "on",
          // Autocomplete would do part of the assessment for the student.
          quickSuggestions: false,
          suggestOnTriggerCharacters: false,
          parameterHints: { enabled: false },
          wordBasedSuggestions: "off",
          contextmenu: false,
        }}
      />
    </div>
  );
}
