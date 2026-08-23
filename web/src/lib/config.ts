/**
 * Examination parameters.
 *
 * Confirmed against the official NESA Software Engineering examination
 * specification and scaled to a 100-mark trial in SPEC_ADDENDUM.md §1:
 *
 *                     official HSC        this app
 *   total marks       80                  100
 *   reading time      10 min              10 min
 *   working time      2 h 20 m            2 h 55 m (pro-rata, 1.75 min/mark)
 *   objective         ~20 marks, 14–18    ~25 marks, 18–23 items, 1–4 marks each
 *   short answer      ~60 marks, 16–18    ~75 marks, 20–23 items, ≥4 worth 4–8
 *
 * Everything here is a constant so the timing scales correctly if the paper
 * total ever changes.
 */

export const TOTAL_MARKS = 100;

export const READING_MINUTES = 10;
export const MINUTES_PER_MARK = 1.75;

/** 175 minutes (2 h 55 m) for a 100-mark paper. */
export const WORKING_MINUTES = Math.round(TOTAL_MARKS * MINUTES_PER_MARK);

export function workingMinutesFor(totalMarks: number): number {
  return Math.round(totalMarks * MINUTES_PER_MARK);
}

/** Hard blueprint validation ranges (SPEC_ADDENDUM.md §1). */
export const BLUEPRINT_RULES = {
  totalMarks: TOTAL_MARKS,
  objective: {
    targetMarks: 25,
    minItems: 18,
    maxItems: 23,
    minMarksPerItem: 1,
    maxMarksPerItem: 4,
  },
  constructed: {
    targetMarks: 75,
    minItems: 20,
    maxItems: 23,
    minExtendedItems: 4,
    extendedMarkRange: [4, 8] as const,
  },
  /** How far the objective/constructed split may drift from target. */
  markSplitTolerance: 6,
} as const;

/** Coverage policy (SPEC_ADDENDUM.md §2). */
export const COVERAGE_RULES = {
  /** At or below this many selected leaves, every leaf must be assessed. */
  fullCoverageThreshold: 25,
  /** Above the threshold, this proportion of selected leaves must be assessed. */
  minSampledCoverage: 0.8,
} as const;

/** Novelty policy (SPEC_ADDENDUM.md §3). */
export const NOVELTY_RULES = {
  /** How many recent question fingerprints to exclude from generation. */
  exclusionWindow: 40,
  /** Max share of (archetype, syllabus item) pairs shared with the previous paper. */
  maxOverlapWithPreviousPaper: 0.3,
} as const;

/** Generation concurrency (SPEC_ADDENDUM.md §4). */
export const GENERATION_CONCURRENCY = 7;

/** Chunks passed into a single question-generation call. */
export const MAX_RETRIEVED_CHUNKS = 6;

/** Warning threshold on the build screen for a very narrow selection. */
export const NARROW_SELECTION_THRESHOLD = 6;

export const AUTOSAVE_DEBOUNCE_MS = 700;

export type ExamColourTheme = "default" | "high-contrast" | "cream" | "dark";
export type ExamFontSize = "s" | "m" | "l" | "xl";

export const EXAM_COLOUR_THEMES: ReadonlyArray<{
  value: ExamColourTheme;
  label: string;
}> = [
  { value: "default", label: "Black on white" },
  { value: "high-contrast", label: "White on black" },
  { value: "cream", label: "Black on cream" },
  { value: "dark", label: "Light on dark navy" },
];

export const EXAM_FONT_SIZES: ReadonlyArray<{
  value: ExamFontSize;
  label: string;
}> = [
  { value: "s", label: "Small" },
  { value: "m", label: "Medium" },
  { value: "l", label: "Large" },
  { value: "xl", label: "Extra large" },
];

/**
 * Word-count guide shown beside an extended response. NESA shows roughly
 * 30 words per mark (a 6-mark item is guided at 185 words).
 */
export function wordGuideFor(marks: number): number {
  return Math.max(40, marks * 30 + 5);
}
