import { z } from "zod";

/**
 * Stimulus is always structured data rendered deterministically by the app
 * (CLAUDE.md §9). The model never emits HTML, and text-bearing diagrams and
 * tables are never AI images — that produces misspelled, unmarkable stimulus.
 */

export const codeLanguageSchema = z.enum([
  "python",
  "pseudocode",
  "sql",
  "html",
  "css",
  "javascript",
  "json",
  "text",
]);

export const tableSpecSchema = z.object({
  caption: z.string().optional(),
  columns: z.array(z.string().min(1)).min(1).max(10),
  rows: z.array(z.array(z.string())).min(1).max(30),
  /** Renders the first column as a row header, as NESA trace tables do. */
  firstColumnIsHeader: z.boolean().optional(),
});

export type TableSpec = z.infer<typeof tableSpecSchema>;

const diagramNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** Extra lines inside the node box — class attributes, module notes. */
  lines: z.array(z.string()).optional(),
  shape: z
    .enum(["box", "rounded", "diamond", "ellipse", "class"])
    .optional(),
});

const diagramEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional(),
  /** Structure-chart couples and decision-tree branch labels. */
  kind: z
    .enum(["plain", "data-couple", "control-couple", "inheritance", "branch"])
    .optional(),
  annotation: z.enum(["iteration", "selection"]).optional(),
});

export const diagramSpecSchema = z.object({
  type: z.enum([
    "structure_chart",
    "decision_tree",
    "class_diagram",
    "flowchart",
    "schema_diagram",
  ]),
  title: z.string().optional(),
  nodes: z.array(diagramNodeSchema).min(1).max(40),
  edges: z.array(diagramEdgeSchema).max(60),
  /** Explicit levels let the renderer lay out without a graph library. */
  ranks: z.array(z.array(z.string())).optional(),
});

export type DiagramSpec = z.infer<typeof diagramSpecSchema>;

export const stimulusSchema: z.ZodType<StimulusSpec> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("text"),
      title: z.string().optional(),
      /** One paragraph per entry. Plain text — never HTML. */
      paragraphs: z.array(z.string().min(1)).min(1).max(12),
    }),
    z.object({
      kind: z.literal("list"),
      title: z.string().optional(),
      ordered: z.boolean().optional(),
      items: z.array(z.string().min(1)).min(1).max(20),
    }),
    z.object({
      kind: z.literal("code"),
      caption: z.string().optional(),
      language: codeLanguageSchema,
      code: z.string().min(1),
      showLineNumbers: z.boolean().optional(),
      /** Line numbers a question refers to, rendered with a subtle marker. */
      highlightLines: z.array(z.number().int().min(1)).optional(),
    }),
    z.object({
      kind: z.literal("table"),
      table: tableSpecSchema,
    }),
    z.object({
      kind: z.literal("table_set"),
      caption: z.string().optional(),
      tables: z
        .array(z.object({ name: z.string().min(1), table: tableSpecSchema }))
        .min(1)
        .max(5),
    }),
    z.object({
      kind: z.literal("diagram"),
      diagram: diagramSpecSchema,
    }),
    z.object({
      kind: z.literal("image"),
      assetId: z.string().min(1).max(64),
      /** Copied from the asset when the paper is built. See below. */
      altText: z.string().min(1).max(400),
      description: z.string().min(1).max(4000),
      caption: z.string().max(300).optional(),
    }),
    z.object({
      kind: z.literal("video"),
      assetId: z.string().min(1).max(64),
      /** The transcript. A marker cannot watch, so this is what it reads. */
      description: z.string().min(1).max(20000),
      /** Snapshot: whether the asset had captions when the paper was built. */
      hasCaptions: z.boolean().optional(),
      caption: z.string().max(300).optional(),
    }),
    z.object({
      kind: z.literal("composite"),
      items: z.array(stimulusSchema).min(1).max(6),
    }),
  ]),
);

/**
 * Media stimulus carries its own description rather than looking one up.
 *
 * The description is what the question was written from and what the marker
 * reads — neither can see the file. Copying it into the paper means editing an
 * asset later cannot silently change what an already-sat paper was marked
 * against, and a paper stays markable even if the file is deleted.
 */
export type StimulusSpec =
  | { kind: "text"; title?: string; paragraphs: string[] }
  | { kind: "list"; title?: string; ordered?: boolean; items: string[] }
  | {
      kind: "code";
      caption?: string;
      language: z.infer<typeof codeLanguageSchema>;
      code: string;
      showLineNumbers?: boolean;
      highlightLines?: number[];
    }
  | { kind: "table"; table: TableSpec }
  | {
      kind: "table_set";
      caption?: string;
      tables: Array<{ name: string; table: TableSpec }>;
    }
  | { kind: "diagram"; diagram: DiagramSpec }
  | {
      kind: "image";
      assetId: string;
      altText: string;
      description: string;
      caption?: string;
    }
  | {
      kind: "video";
      assetId: string;
      description: string;
      hasCaptions?: boolean;
      caption?: string;
    }
  | { kind: "composite"; items: StimulusSpec[] };
