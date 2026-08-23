"use client";

import { useEffect, useId, useRef, useState } from "react";

import {
  EXAM_COLOUR_THEMES,
  EXAM_FONT_SIZES,
  type ExamColourTheme,
  type ExamFontSize,
} from "@/lib/config";

/**
 * The exam tools (CLAUDE.md §10.5, §24). These are functional requirements:
 * flag, highlight, font size, colour theme and info all do real work and all
 * persist for the duration of the attempt.
 */

export function ExamToolbar({
  flagged,
  onToggleFlag,
  highlightMode,
  onToggleHighlight,
  fontSize,
  onFontSize,
  colourTheme,
  onColourTheme,
  onInfo,
}: {
  flagged: boolean;
  onToggleFlag: () => void;
  highlightMode: boolean;
  onToggleHighlight: () => void;
  fontSize: ExamFontSize;
  onFontSize: (size: ExamFontSize) => void;
  colourTheme: ExamColourTheme;
  onColourTheme: (theme: ExamColourTheme) => void;
  onInfo: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ToolButton
        onClick={onToggleFlag}
        pressed={flagged}
        label={flagged ? "Remove flag from this question" : "Flag this question"}
      >
        <FlagGlyph filled={flagged} />
        FLAG
      </ToolButton>

      <ToolButton
        onClick={onToggleHighlight}
        pressed={highlightMode}
        label={highlightMode ? "Turn off highlighting" : "Turn on highlighting"}
      >
        <HighlightGlyph />
        HIGHLIGHT
      </ToolButton>

      <SelectTool
        label="FONT SIZE"
        glyph={<span className="font-serif text-[1.1em] font-bold">A</span>}
        value={fontSize}
        options={EXAM_FONT_SIZES}
        onChange={(value) => onFontSize(value as ExamFontSize)}
      />

      <SelectTool
        label="COLOUR"
        glyph={<ContrastGlyph />}
        value={colourTheme}
        options={EXAM_COLOUR_THEMES}
        onChange={(value) => onColourTheme(value as ExamColourTheme)}
      />

      <ToolButton onClick={onInfo} label="Exam information and help" accent>
        <InfoGlyph />
        INFO
      </ToolButton>
    </div>
  );
}

function ToolButton({
  children,
  onClick,
  pressed,
  label,
  accent,
}: {
  children: React.ReactNode;
  onClick: () => void;
  pressed?: boolean;
  label: string;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={label}
      className={[
        "flex h-9 items-center gap-2 border px-3 text-[0.8em] font-semibold tracking-wide",
        accent
          ? "border-[var(--danger)] text-[var(--danger)]"
          : "border-[var(--exam-line)] text-[var(--exam-fg)]",
        pressed ? "bg-[var(--exam-nav-answered-bg)]" : "bg-[var(--exam-canvas-bg)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SelectTool({
  label,
  glyph,
  value,
  options,
  onChange,
}: {
  label: string;
  glyph: React.ReactNode;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onDocumentClick(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocumentClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocumentClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={menuId}
        className="flex h-9 items-center gap-2 border border-[var(--exam-line)] bg-[var(--exam-canvas-bg)] px-3 text-[0.8em] font-semibold tracking-wide"
      >
        {glyph}
        {label}
        <span aria-hidden="true" className="text-[0.9em]">
          ▾
        </span>
      </button>

      {open && (
        <ul
          id={menuId}
          role="listbox"
          aria-label={label}
          className="absolute right-0 z-20 mt-1 min-w-52 border border-[var(--exam-line)] bg-[var(--exam-canvas-bg)] py-1 shadow-lg"
        >
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[0.9em] ${
                  option.value === value ? "font-semibold" : ""
                }`}
              >
                <span aria-hidden="true" className="w-3">
                  {option.value === value ? "✓" : ""}
                </span>
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FlagGlyph({ filled }: { filled: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3 1v14"
        stroke="var(--flag)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M4 2h9l-2.2 3L13 8H4z"
        fill={filled ? "var(--flag)" : "none"}
        stroke="var(--flag)"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function HighlightGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 14h12" stroke="currentColor" strokeWidth="2" />
      <path
        d="M11 1.8 14 4.8 6.5 12.3 3 12.7 3.4 9.2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function ContrastGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 1.5a6.5 6.5 0 010 13z" fill="currentColor" />
    </svg>
  );
}

function InfoGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7v4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="4.6" r="0.9" fill="currentColor" />
    </svg>
  );
}
