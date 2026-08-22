import { z } from "zod";

import { codeLanguageSchema, diagramSpecSchema, tableSpecSchema } from "./stimulus";

/**
 * The renderer system (CLAUDE.md §8).
 *
 * The full discriminated union is declared here so the schema layer, the
 * blueprint planner and the database agree on one vocabulary. Only the
 * renderers listed in `IMPLEMENTED_RENDERERS` have UI components; the blueprint
 * planner is only ever told about those, so the app never generates a question
 * it cannot display (SPEC_ADDENDUM.md §6).
 */

export const RENDERER_TYPES = [
  "single_choice",
  "multi_select",
  "ordering",
  "matching_matrix",
  "dropdown_completion",
  "table_response",
  "short_text",
  "rich_text_response",
  "code_stimulus",
  "pseudocode_editor",
  "python_editor",
  "sql_editor",
  "diagram_viewer",
  "diagram_builder",
] as const;

export type RendererType = (typeof RENDERER_TYPES)[number];

export const rendererTypeSchema = z.enum(RENDERER_TYPES);

/** Renderers with working UI, marking and autosave in this build. */
export const IMPLEMENTED_RENDERERS = [
  "single_choice",
  "multi_select",
  "ordering",
  "matching_matrix",
  "dropdown_completion",
  "table_response",
  "short_text",
  "rich_text_response",
  "code_stimulus",
  "diagram_viewer",
  "pseudocode_editor",
  "python_editor",
  "sql_editor",
] as const satisfies readonly RendererType[];

/** Display-only renderers hold no response and are worth zero marks. */
export const NON_RESPONSIVE_RENDERERS = [
  "code_stimulus",
  "diagram_viewer",
] as const satisfies readonly RendererType[];

export function isResponsive(renderer: RendererType): boolean {
  return !(NON_RESPONSIVE_RENDERERS as readonly string[]).includes(renderer);
}

/** Renderers a deterministic checker marks reliably (CLAUDE.md §18). */
export const DETERMINISTIC_RENDERERS = [
  "single_choice",
  "multi_select",
  "ordering",
  "matching_matrix",
  "dropdown_completion",
  "table_response",
] as const satisfies readonly RendererType[];

export function isDeterministic(renderer: RendererType): boolean {
  return (DETERMINISTIC_RENDERERS as readonly string[]).includes(renderer);
}

/* -------------------------------------------------------------------------
 * Shared pieces
 * ---------------------------------------------------------------------- */

const optionSchema = z.object({
  id: z.string().min(1).max(40),
  text: z.string().min(1),
});

const cellRefSchema = z
  .string()
  .regex(/^[^.]+\.[^.]+$/, "expected `rowId.columnId`");

/* -------------------------------------------------------------------------
 * Configs — what the student sees
 * ---------------------------------------------------------------------- */

export const singleChoiceConfigSchema = z.object({
  options: z.array(optionSchema).min(2).max(8),
});

export const multiSelectConfigSchema = z.object({
  options: z.array(optionSchema).min(3).max(10),
  /** Shown to the student, e.g. "Select TWO". */
  selectionHint: z.string().optional(),
});

export const orderingConfigSchema = z.object({
  items: z.array(optionSchema).min(3).max(10),
  instruction: z.string().optional(),
});

export const matchingMatrixConfigSchema = z.object({
  rows: z.array(optionSchema).min(2).max(8),
  columns: z.array(optionSchema).min(2).max(8),
  /** `single` = one column per row (radio); `multi` = checkboxes. */
  mode: z.enum(["single", "multi"]),
});

export const dropdownCompletionConfigSchema = z.object({
  /** Layout of the surrounding text: prose, a code block or a SQL query. */
  layout: z.enum(["inline", "code", "query"]),
  language: codeLanguageSchema.optional(),
  segments: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("text"), text: z.string() }),
        z.object({
          kind: z.literal("blank"),
          blankId: z.string().min(1).max(40),
          options: z.array(optionSchema).min(2).max(10),
          width: z.enum(["short", "medium", "long"]).optional(),
        }),
      ]),
    )
    .min(1),
});

export const tableResponseConfigSchema = z.object({
  caption: z.string().optional(),
  columns: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        header: z.string(),
        editable: z.boolean(),
        width: z.enum(["narrow", "medium", "wide"]).optional(),
      }),
    )
    .min(1)
    .max(8),
  rows: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        /** Fixed cell values keyed by column id; missing = editable input. */
        fixed: z.record(z.string(), z.string()).optional(),
      }),
    )
    .min(1)
    .max(20),
});

export const shortTextConfigSchema = z.object({
  placeholder: z.string().optional(),
  maxLength: z.number().int().min(10).max(600).optional(),
  multiline: z.boolean().optional(),
});

export const richTextConfigSchema = z.object({
  /** Guide only — never a hard cap unless `hardLimit` is set. */
  wordGuide: z.number().int().min(20).max(1200),
  hardLimit: z.boolean().optional(),
});

export const codeStimulusConfigSchema = z.object({
  language: codeLanguageSchema,
  code: z.string().min(1),
  caption: z.string().optional(),
  showLineNumbers: z.boolean().optional(),
});

export const pseudocodeEditorConfigSchema = z.object({
  starterCode: z.string().optional(),
  rows: z.number().int().min(4).max(40).optional(),
});

export const pythonEditorConfigSchema = z.object({
  starterCode: z.string(),
  /** Cases the student may run. Hidden tests live in the answer key. */
  visibleExamples: z
    .array(z.object({ description: z.string(), expected: z.string() }))
    .optional(),
  functionName: z.string().optional(),
});

export const sqlEditorConfigSchema = z.object({
  /** Table definitions used to build the temporary database. */
  tables: z
    .array(z.object({ name: z.string().min(1), table: tableSpecSchema }))
    .min(1)
    .max(5),
  starterQuery: z.string().optional(),
  allowExecution: z.boolean().optional(),
});

export const diagramViewerConfigSchema = z.object({
  diagram: diagramSpecSchema,
});

export const diagramBuilderConfigSchema = z.object({
  paletteHint: z.string().optional(),
  expectedShapes: z.enum(["class_diagram", "structure_chart", "decision_tree", "flowchart"]),
});

/* -------------------------------------------------------------------------
 * Answer keys — hidden from the student until submission
 * ---------------------------------------------------------------------- */

export const answerKeySchema = z.discriminatedUnion("rendererType", [
  z.object({
    rendererType: z.literal("single_choice"),
    correctOptionId: z.string().min(1),
    explanation: z.string().min(1),
    distractorNotes: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    rendererType: z.literal("multi_select"),
    correctOptionIds: z.array(z.string().min(1)).min(1),
    explanation: z.string().min(1),
  }),
  z.object({
    rendererType: z.literal("ordering"),
    correctOrder: z.array(z.string().min(1)).min(3),
    explanation: z.string().min(1),
  }),
  z.object({
    rendererType: z.literal("matching_matrix"),
    /** row id → the column ids that are correct for that row. */
    matches: z.record(z.string(), z.array(z.string().min(1)).min(1)),
    explanation: z.string().min(1),
  }),
  z.object({
    rendererType: z.literal("dropdown_completion"),
    /** blank id → correct option id. */
    blanks: z.record(z.string(), z.string().min(1)),
    explanation: z.string().min(1),
  }),
  z.object({
    rendererType: z.literal("table_response"),
    /** `rowId.columnId` → accepted values. */
    cells: z.record(
      cellRefSchema,
      z.object({
        accepted: z.array(z.string()).min(1),
        caseSensitive: z.boolean().optional(),
      }),
    ),
    explanation: z.string().min(1),
  }),
  z.object({
    rendererType: z.literal("short_text"),
    accepted: z.array(z.string().min(1)).min(1),
    /** When true the response is rubric-marked instead of string-matched. */
    rubricMarked: z.boolean().optional(),
    explanation: z.string().min(1),
  }),
  z.object({
    rendererType: z.literal("rich_text_response"),
    modelAnswer: z.string().min(1),
    expectedConcepts: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    rendererType: z.literal("pseudocode_editor"),
    modelAnswer: z.string().min(1),
    expectedConcepts: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    rendererType: z.literal("python_editor"),
    referenceSolution: z.string().min(1),
    hiddenTests: z
      .array(
        z.object({
          name: z.string().min(1),
          /** Python expression evaluated against the student's module. */
          call: z.string().min(1),
          expected: z.string(),
          marks: z.number().int().min(0).max(6).optional(),
        }),
      )
      .min(1),
    expectedConcepts: z.array(z.string()).optional(),
  }),
  z.object({
    rendererType: z.literal("sql_editor"),
    referenceQuery: z.string().min(1),
    expectedResult: tableSpecSchema,
    orderSensitive: z.boolean().optional(),
    explanation: z.string().min(1),
  }),
  z.object({
    rendererType: z.literal("diagram_builder"),
    expectedNodes: z.array(z.string().min(1)).min(1),
    expectedRelationships: z
      .array(z.object({ from: z.string(), to: z.string(), kind: z.string() }))
      .optional(),
    explanation: z.string().min(1),
  }),
]);

export type AnswerKey = z.infer<typeof answerKeySchema>;

/* -------------------------------------------------------------------------
 * Marking guideline — hidden until submission
 * ---------------------------------------------------------------------- */

export const markingGuidelineSchema = z.object({
  /** NESA-style bands. Criterion marks must sum to the part's marks. */
  criteria: z
    .array(
      z.object({
        marks: z.number().int().min(0).max(20),
        description: z.string().min(1),
        evidence: z.array(z.string()).optional(),
      }),
    )
    .min(1),
  commandVerbNote: z.string().optional(),
  modelAnswer: z.string().optional(),
  expectedConcepts: z.array(z.string()).optional(),
  /** Things markers should NOT award marks for (buzzwords, restatement). */
  doNotCredit: z.array(z.string()).optional(),
});

export type MarkingGuideline = z.infer<typeof markingGuidelineSchema>;

/* -------------------------------------------------------------------------
 * Student responses
 * ---------------------------------------------------------------------- */

export const responsePayloadSchema = z.discriminatedUnion("rendererType", [
  z.object({
    rendererType: z.literal("single_choice"),
    optionId: z.string().nullable(),
  }),
  z.object({
    rendererType: z.literal("multi_select"),
    optionIds: z.array(z.string()),
  }),
  z.object({
    rendererType: z.literal("ordering"),
    order: z.array(z.string()),
  }),
  z.object({
    rendererType: z.literal("matching_matrix"),
    matches: z.record(z.string(), z.array(z.string())),
  }),
  z.object({
    rendererType: z.literal("dropdown_completion"),
    blanks: z.record(z.string(), z.string().nullable()),
  }),
  z.object({
    rendererType: z.literal("table_response"),
    cells: z.record(z.string(), z.string()),
  }),
  z.object({
    rendererType: z.literal("short_text"),
    text: z.string(),
  }),
  z.object({
    rendererType: z.literal("rich_text_response"),
    html: z.string(),
  }),
  z.object({
    rendererType: z.literal("pseudocode_editor"),
    code: z.string(),
  }),
  z.object({
    rendererType: z.literal("python_editor"),
    code: z.string(),
    lastStdout: z.string().optional(),
  }),
  z.object({
    rendererType: z.literal("sql_editor"),
    query: z.string(),
  }),
  z.object({
    rendererType: z.literal("diagram_builder"),
    scene: z.object({
      nodes: z.array(
        z.object({
          id: z.string(),
          label: z.string(),
          lines: z.array(z.string()).optional(),
          x: z.number(),
          y: z.number(),
        }),
      ),
      edges: z.array(
        z.object({ from: z.string(), to: z.string(), kind: z.string().optional() }),
      ),
    }),
  }),
]);

export type ResponsePayload = z.infer<typeof responsePayloadSchema>;

/**
 * True when a response carries an actual attempt. Drives the answered /
 * unanswered counts in the navigator and the submit confirmation.
 */
export function isAnswered(response: ResponsePayload | null | undefined): boolean {
  if (!response) return false;
  switch (response.rendererType) {
    case "single_choice":
      return response.optionId !== null;
    case "multi_select":
      return response.optionIds.length > 0;
    case "ordering":
      return response.order.length > 0;
    case "matching_matrix":
      return Object.values(response.matches).some((v) => v.length > 0);
    case "dropdown_completion":
      return Object.values(response.blanks).some((v) => v !== null && v !== "");
    case "table_response":
      return Object.values(response.cells).some((v) => v.trim() !== "");
    case "short_text":
      return response.text.trim() !== "";
    case "rich_text_response":
      return response.html.replace(/<[^>]*>/g, "").trim() !== "";
    case "pseudocode_editor":
    case "python_editor":
      return response.code.trim() !== "";
    case "sql_editor":
      return response.query.trim() !== "";
    case "diagram_builder":
      return response.scene.nodes.length > 0;
  }
}

/** Empty response for a renderer, used to initialise inputs. */
export function emptyResponse(renderer: RendererType): ResponsePayload | null {
  switch (renderer) {
    case "single_choice":
      return { rendererType: "single_choice", optionId: null };
    case "multi_select":
      return { rendererType: "multi_select", optionIds: [] };
    case "ordering":
      return { rendererType: "ordering", order: [] };
    case "matching_matrix":
      return { rendererType: "matching_matrix", matches: {} };
    case "dropdown_completion":
      return { rendererType: "dropdown_completion", blanks: {} };
    case "table_response":
      return { rendererType: "table_response", cells: {} };
    case "short_text":
      return { rendererType: "short_text", text: "" };
    case "rich_text_response":
      return { rendererType: "rich_text_response", html: "" };
    case "pseudocode_editor":
      return { rendererType: "pseudocode_editor", code: "" };
    case "python_editor":
      return { rendererType: "python_editor", code: "" };
    case "sql_editor":
      return { rendererType: "sql_editor", query: "" };
    case "diagram_builder":
      return { rendererType: "diagram_builder", scene: { nodes: [], edges: [] } };
    case "code_stimulus":
    case "diagram_viewer":
      return null;
  }
}

/* -------------------------------------------------------------------------
 * Config union, keyed by renderer type
 * ---------------------------------------------------------------------- */

export const rendererConfigSchemas = {
  single_choice: singleChoiceConfigSchema,
  multi_select: multiSelectConfigSchema,
  ordering: orderingConfigSchema,
  matching_matrix: matchingMatrixConfigSchema,
  dropdown_completion: dropdownCompletionConfigSchema,
  table_response: tableResponseConfigSchema,
  short_text: shortTextConfigSchema,
  rich_text_response: richTextConfigSchema,
  code_stimulus: codeStimulusConfigSchema,
  pseudocode_editor: pseudocodeEditorConfigSchema,
  python_editor: pythonEditorConfigSchema,
  sql_editor: sqlEditorConfigSchema,
  diagram_viewer: diagramViewerConfigSchema,
  diagram_builder: diagramBuilderConfigSchema,
} as const satisfies Record<RendererType, z.ZodType>;

export type RendererConfigMap = {
  [K in RendererType]: z.infer<(typeof rendererConfigSchemas)[K]>;
};
