/**
 * Examination parameters.
 *
 * Confirmed against the official NESA Software Engineering examination
 * specification and scaled to a 100-mark trial in SPEC_ADDENDUM.md §1:
 *
 *                     official HSC        this app
 *   total marks       80                  100
 *   reading time      10 min              10 min
 *   working time      2 h 20 m            2 h 30 m (pro-rata, 1.5 min/mark)
 *   objective         ~20 marks, 14–18    ~25 marks, 18–23 items, 1–4 marks each
 *   short answer      ~60 marks, 16–18    ~75 marks, 20–23 items, ≥4 worth 4–8
 *
 * Everything here is a constant so the timing scales correctly if the paper
 * total ever changes.
 */

export const TOTAL_MARKS = 100;

export const READING_MINUTES = 10;
export const MINUTES_PER_MARK = 1.5;

/** 150 minutes (2 h 30 m) for a 100-mark paper. */
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

/**
 * How varied the objective section should be.
 *
 * Measured from the 2025 HSC paper: its objective marks are spread across five
 * response types, and the largest single one — classifying table rows with
 * dropdowns — carries 36%. Plain multiple choice carries 32%.
 *
 * These are warnings, not failures. A paper that leans on one format is worse,
 * not invalid, and turning it into a hard error would throw away 100 marks of
 * otherwise sound questions over a matter of style.
 */
export const VARIETY_RULES = {
  /** Share of objective marks one response type may carry before it is flagged. */
  maxObjectiveShare: 0.45,
  /** Distinct objective response types expected in a paper. */
  minObjectiveRendererTypes: 4,
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

/**
 * Questions per resumable step.
 *
 * Separate from the concurrency above, which was written for an endpoint with
 * room to breathe. Seven calls arriving together is what a rate-limited key
 * refuses, and four papers in a row failed on it having planned successfully
 * and then written nothing. Three at a time is slower per step and finishes
 * more papers, which is the trade worth making.
 */
export const GENERATION_BATCH_SIZE = 3;

/**
 * How long one model call may take before it is abandoned.
 *
 * The SDK defaults to ten minutes, on a function whose ceiling is five, so a
 * slow call could never time out before the invocation was killed — and with
 * retries on top, a single blueprint call became four hanging requests and the
 * whole budget.
 *
 * A minute was too mean: a real run then failed with "Request timed out", which
 * is the timeout working but the budget being wrong. Questions on a reasoning
 * model genuinely take longer than that. Two minutes with one retry is 240
 * seconds in the worst case, which still fits inside the 300-second function
 * this runs in — the constraint that has to hold, whatever the numbers are.
 */
export const MODEL_CALL_TIMEOUT_MS = 120_000;

/** Attempts per call, including the first. Bounded, with the SDK's backoff. */
export const MODEL_CALL_MAX_RETRIES = 1;

/**
 * How long a paper may go without reporting progress before it is abandoned.
 *
 * Generous enough that a slow batch is not mistaken for a dead one — a step is
 * a handful of concurrent questions — but short enough that a killed
 * invocation does not leave the screen spinning indefinitely, which is what it
 * used to do.
 */
export const GENERATION_STALL_MS = 4 * 60_000;

/**
 * What one paper may spend before it is abandoned.
 *
 * A single failed generation cost 73 dollars across 788 requests — roughly ten
 * times what 31 questions should need, because per-question attempts, the
 * structured-output repair path, the critic pass and the SDK's own retries all
 * multiply together. None of those is individually unreasonable and the product
 * of them is.
 *
 * A ceiling turns that from an open-ended bill into a known worst case. It has
 * to sit above what a paper could legitimately need — every question retried to
 * the attempt limit, each critiqued, is about 186 calls — because aborting at
 * that point wastes everything already paid for, which is worse than either
 * finishing or never starting. `estimatePaperCost` computes both, and a test
 * holds the ceiling above the worst legitimate case.
 *
 * The run that prompted this made 788 requests, so this still catches the
 * behaviour it is meant to catch by a wide margin.
 */
export const GENERATION_MAX_CALLS = 200;

/**
 * Output ceiling per call, by stage.
 *
 * These were literals scattered across the call sites, which made the cost of a
 * paper impossible to state without reading five files — and impossible to show
 * anyone before they spent it. One place, so the estimate on the settings screen
 * and the calls themselves cannot drift apart.
 *
 * They are ceilings, not expectations: a reasoning model bills what it actually
 * generates, including reasoning it does not show.
 */
export const TOKEN_BUDGETS = {
  blueprint: 24_000,
  question: 16_000,
  critic: 8_000,
  marking: 8_000,
  moderation: 4_000,
  smoke: 800,
} as const;

/** Attempts at one question before the paper gives up (SPEC_ADDENDUM.md §4). */
export const MAX_QUESTION_ATTEMPTS = 3;

/** How often a 1–2 mark objective item is sent to the critic. */
export const OBJECTIVE_CRITIQUE_SAMPLE_RATE = 0.25;
export const GENERATION_MAX_TOKENS = 3_000_000;

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
