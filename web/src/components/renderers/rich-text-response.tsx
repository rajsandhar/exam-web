"use client";

import { useEffect, useRef, useState } from "react";
import type { z } from "zod";

import { countWords, htmlToPlainText, sanitiseResponseHtml } from "@/lib/sanitise";
import type { richTextConfigSchema } from "@/lib/schemas/renderers";

type Config = z.infer<typeof richTextConfigSchema>;

/**
 * HSC-style response editor: a small formatting toolbar and a visible
 * word-count guide (CLAUDE.md §8). The guide is advisory — it never truncates
 * unless the question sets `hardLimit`.
 */

const TOOLS = [
  { command: "bold", label: "Bold", glyph: "B", className: "font-bold" },
  { command: "underline", label: "Underline", glyph: "U", className: "underline" },
  { command: "italic", label: "Italic", glyph: "I", className: "italic" },
  { command: "insertUnorderedList", label: "Bulleted list", glyph: "•—" },
  { command: "insertOrderedList", label: "Numbered list", glyph: "1—" },
] as const;

export function RichTextResponse({
  partId,
  config,
  value,
  onChange,
  disabled,
}: {
  partId: string;
  config: Config;
  value: string;
  onChange: (html: string) => void;
  disabled: boolean;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [wordCount, setWordCount] = useState(() => countWords(htmlToPlainText(value)));

  // Only write into the editor when the incoming value differs from what the
  // DOM already holds, otherwise the caret jumps on every keystroke.
  useEffect(() => {
    const node = editorRef.current;
    if (!node) return;
    if (node.innerHTML !== value) node.innerHTML = value;
    setWordCount(countWords(htmlToPlainText(value)));
  }, [value]);

  function handleInput() {
    const node = editorRef.current;
    if (!node) return;
    const html = sanitiseResponseHtml(node.innerHTML);
    setWordCount(countWords(htmlToPlainText(html)));
    onChange(html);
  }

  function applyCommand(command: string) {
    editorRef.current?.focus();
    document.execCommand(command);
    handleInput();
  }

  const overGuide = wordCount > config.wordGuide;

  return (
    <div className="mt-3">
      <div
        role="toolbar"
        aria-label="Response formatting"
        aria-controls={`response-${partId}`}
        className="flex items-center gap-1 border border-b-0 border-[var(--exam-line)] bg-[var(--exam-toolbar-bg)] px-2 py-1.5"
      >
        {TOOLS.map((tool) => (
          <button
            key={tool.command}
            type="button"
            disabled={disabled}
            aria-label={tool.label}
            title={tool.label}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => applyCommand(tool.command)}
            className={`h-7 min-w-7 border border-transparent px-2 text-[0.9em] hover:border-[var(--exam-line)] disabled:opacity-40 ${
              "className" in tool ? tool.className : ""
            }`}
          >
            {tool.glyph}
          </button>
        ))}
      </div>

      <div
        ref={editorRef}
        id={`response-${partId}`}
        role="textbox"
        aria-multiline="true"
        aria-label="Your response"
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleInput}
        spellCheck
        className={`prose-exam min-h-40 w-full resize-y overflow-auto border border-[var(--exam-line)] bg-[var(--exam-input-bg)] px-3 py-2.5 leading-relaxed outline-none ${
          disabled ? "opacity-60" : ""
        }`}
      />

      <p
        className={`mt-1 text-right text-[0.85em] ${
          overGuide ? "text-[var(--exam-accent)]" : "text-[var(--exam-muted)]"
        }`}
        aria-live="polite"
      >
        {wordCount} / {config.wordGuide} words
        {overGuide && !config.hardLimit && " (guide only)"}
      </p>
    </div>
  );
}
