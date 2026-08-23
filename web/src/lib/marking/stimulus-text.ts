import type { StimulusSpec, TableSpec } from "@/lib/schemas/stimulus";

/**
 * Plain-text rendering of a stimulus.
 *
 * Kept out of the renderer components so server-side marking can use it without
 * pulling client code into the server bundle.
 */
export function stimulusToText(spec: StimulusSpec | null): string | null {
  if (!spec) return null;
  switch (spec.kind) {
    case "text":
      return [spec.title, ...spec.paragraphs].filter(Boolean).join("\n\n");
    case "list":
      return [spec.title, ...spec.items.map((item) => `- ${item}`)]
        .filter(Boolean)
        .join("\n");
    case "code":
      return [spec.caption, spec.code].filter(Boolean).join("\n");
    case "table":
      return tableToText(spec.table);
    case "table_set":
      return spec.tables
        .map((entry) => `${entry.name}\n${tableToText(entry.table)}`)
        .join("\n\n");
    case "diagram":
      return `${spec.diagram.title ?? spec.diagram.type}: ${spec.diagram.nodes
        .map((node) => node.label)
        .join(", ")}`;
    case "image":
      // The marker cannot see the picture; this is the whole of what it knows.
      return [spec.caption, `[Image] ${spec.description}`].filter(Boolean).join("\n");
    case "video":
      return [spec.caption, `[Video transcript] ${spec.description}`]
        .filter(Boolean)
        .join("\n");
    case "composite":
      return spec.items
        .map((item) => stimulusToText(item))
        .filter(Boolean)
        .join("\n\n");
  }
}

function tableToText(table: TableSpec): string {
  const header = table.columns.join(" | ");
  const rows = table.rows.map((row) => row.join(" | "));
  return [table.caption, header, ...rows].filter(Boolean).join("\n");
}
