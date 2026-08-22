"use client";

import { useMemo } from "react";

import type { DiagramSpec } from "@/lib/schemas/stimulus";

/**
 * Deterministic diagram rendering (CLAUDE.md §9, §13).
 *
 * Structure charts, decision trees, class diagrams, flowcharts and schema
 * diagrams are drawn from structured node/edge data. Never AI image generation:
 * that produces misspelled labels a student cannot be fairly marked against.
 *
 * Layout is a simple layered algorithm — ranks come from the spec when it
 * supplies them, otherwise from a longest-path assignment — which keeps the
 * result stable for the same input, as an examination stimulus must be.
 */

const NODE_WIDTH = 168;
const LINE_HEIGHT = 17;
const HEADER_HEIGHT = 26;
const RANK_GAP = 74;
const COLUMN_GAP = 26;
const PADDING = 16;

export function DiagramViewer({ diagram }: { diagram: DiagramSpec }) {
  const layout = useMemo(() => computeLayout(diagram), [diagram]);

  return (
    <figure className="my-1 overflow-x-auto">
      {diagram.title && (
        <figcaption className="mb-1.5 font-semibold">{diagram.title}</figcaption>
      )}
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width={layout.width}
        height={layout.height}
        role="img"
        aria-label={describe(diagram)}
        className="max-w-full border border-[var(--exam-line)] bg-[var(--exam-input-bg)]"
      >
        <defs>
          <marker
            id="diagram-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
          <marker
            id="diagram-inherit"
            viewBox="0 0 12 12"
            refX="11"
            refY="6"
            markerWidth="11"
            markerHeight="11"
            orient="auto-start-reverse"
          >
            <path
              d="M 0 0 L 12 6 L 0 12 z"
              fill="var(--exam-input-bg)"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </marker>
        </defs>

        <g className="text-[var(--exam-fg)]" stroke="currentColor" fill="none">
          {layout.edges.map((edge, index) => (
            <g key={index}>
              <path
                d={edge.path}
                strokeWidth={edge.kind === "control-couple" ? 1.8 : 1.3}
                strokeDasharray={edge.kind === "control-couple" ? "5 3" : undefined}
                markerEnd={
                  edge.kind === "inheritance"
                    ? "url(#diagram-inherit)"
                    : edge.kind === "plain"
                      ? undefined
                      : "url(#diagram-arrow)"
                }
              />
              {edge.label && (
                <text
                  x={edge.labelX}
                  y={edge.labelY}
                  textAnchor="middle"
                  className="fill-[var(--exam-muted)]"
                  stroke="none"
                  fontSize="11"
                >
                  {edge.label}
                </text>
              )}
            </g>
          ))}
        </g>

        {layout.nodes.map((node) => (
          <g key={node.id}>
            {node.shape === "diamond" ? (
              <polygon
                points={diamondPoints(node)}
                fill="var(--exam-panel-bg)"
                stroke="var(--exam-fg)"
                strokeWidth="1.3"
              />
            ) : node.shape === "ellipse" ? (
              <ellipse
                cx={node.x + node.width / 2}
                cy={node.y + node.height / 2}
                rx={node.width / 2}
                ry={node.height / 2}
                fill="var(--exam-panel-bg)"
                stroke="var(--exam-fg)"
                strokeWidth="1.3"
              />
            ) : (
              <rect
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rx={node.shape === "rounded" ? 9 : 0}
                fill="var(--exam-panel-bg)"
                stroke="var(--exam-fg)"
                strokeWidth="1.3"
              />
            )}

            <text
              x={node.x + node.width / 2}
              y={node.y + 17}
              textAnchor="middle"
              className="fill-[var(--exam-fg)]"
              fontSize="12.5"
              fontWeight="600"
            >
              {node.label}
            </text>

            {node.lines.length > 0 && (
              <>
                <line
                  x1={node.x}
                  y1={node.y + HEADER_HEIGHT}
                  x2={node.x + node.width}
                  y2={node.y + HEADER_HEIGHT}
                  stroke="var(--exam-fg)"
                  strokeWidth="1.3"
                />
                {node.lines.map((line, index) => (
                  <text
                    key={index}
                    x={node.x + 8}
                    y={node.y + HEADER_HEIGHT + 14 + index * LINE_HEIGHT}
                    className="fill-[var(--exam-fg)]"
                    fontSize="11.5"
                  >
                    {line}
                  </text>
                ))}
              </>
            )}
          </g>
        ))}
      </svg>
    </figure>
  );
}

type LaidOutNode = {
  id: string;
  label: string;
  lines: string[];
  shape: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type LaidOutEdge = {
  path: string;
  kind: string;
  label?: string;
  labelX: number;
  labelY: number;
};

function computeLayout(diagram: DiagramSpec) {
  const ranks = diagram.ranks ?? deriveRanks(diagram);
  const byId = new Map(diagram.nodes.map((node) => [node.id, node]));

  const nodes: LaidOutNode[] = [];
  let widest = 0;
  let y = PADDING;

  for (const rank of ranks) {
    const present = rank.filter((id) => byId.has(id));
    if (present.length === 0) continue;

    const heights = present.map((id) => nodeHeight(byId.get(id)!));
    const rowHeight = Math.max(...heights);
    const rowWidth =
      present.length * NODE_WIDTH + (present.length - 1) * COLUMN_GAP;
    widest = Math.max(widest, rowWidth);

    present.forEach((id, index) => {
      const node = byId.get(id)!;
      nodes.push({
        id,
        label: node.label,
        lines: node.lines ?? [],
        shape: node.shape ?? "box",
        x: PADDING + index * (NODE_WIDTH + COLUMN_GAP),
        y,
        width: NODE_WIDTH,
        height: nodeHeight(node),
      });
    });

    y += rowHeight + RANK_GAP;
  }

  const width = widest + PADDING * 2;

  // Centre each rank within the widest rank, so the diagram reads as a tree.
  const rows = new Map<number, LaidOutNode[]>();
  for (const node of nodes) {
    const row = rows.get(node.y) ?? [];
    row.push(node);
    rows.set(node.y, row);
  }
  for (const row of rows.values()) {
    const rowWidth = row.length * NODE_WIDTH + (row.length - 1) * COLUMN_GAP;
    const offset = (width - rowWidth) / 2 - PADDING;
    for (const node of row) node.x += offset;
  }

  const positions = new Map(nodes.map((node) => [node.id, node]));
  const edges: LaidOutEdge[] = [];

  for (const edge of diagram.edges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) continue;

    const x1 = from.x + from.width / 2;
    const y1 = from.y + from.height;
    const x2 = to.x + to.width / 2;
    const y2 = to.y;
    const midY = (y1 + y2) / 2;

    edges.push({
      // Orthogonal routing: down, across, down. Reads like a structure chart.
      path: `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`,
      kind: edge.kind ?? "plain",
      label: edge.label ?? (edge.annotation ? `[${edge.annotation}]` : undefined),
      labelX: (x1 + x2) / 2,
      labelY: midY - 4,
    });
  }

  return { nodes, edges, width, height: Math.max(y - RANK_GAP + PADDING, 80) };
}

function nodeHeight(node: DiagramSpec["nodes"][number]): number {
  const lines = node.lines?.length ?? 0;
  return lines === 0 ? 38 : HEADER_HEIGHT + 10 + lines * LINE_HEIGHT;
}

function diamondPoints(node: LaidOutNode): string {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  return [
    `${cx},${node.y}`,
    `${node.x + node.width},${cy}`,
    `${cx},${node.y + node.height}`,
    `${node.x},${cy}`,
  ].join(" ");
}

/**
 * Longest-path layering: a node sits one rank below its deepest parent. Cycles
 * cannot deepen a node indefinitely because each node is visited once.
 */
function deriveRanks(diagram: DiagramSpec): string[][] {
  const depth = new Map<string, number>();
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();

  for (const edge of diagram.edges) {
    children.set(edge.from, [...(children.get(edge.from) ?? []), edge.to]);
    hasParent.add(edge.to);
  }

  const roots = diagram.nodes.filter((node) => !hasParent.has(node.id));
  const queue: Array<{ id: string; depth: number }> = (
    roots.length > 0 ? roots : diagram.nodes.slice(0, 1)
  ).map((node) => ({ id: node.id, depth: 0 }));

  const visited = new Set<string>();
  while (queue.length > 0) {
    const next = queue.shift()!;
    const known = depth.get(next.id);
    if (known !== undefined && known >= next.depth) continue;
    depth.set(next.id, next.depth);
    if (visited.has(`${next.id}:${next.depth}`)) continue;
    visited.add(`${next.id}:${next.depth}`);
    for (const child of children.get(next.id) ?? []) {
      queue.push({ id: child, depth: next.depth + 1 });
    }
  }

  // Anything unreachable (a disconnected node) goes on the last rank.
  const maxDepth = Math.max(0, ...depth.values());
  for (const node of diagram.nodes) {
    if (!depth.has(node.id)) depth.set(node.id, maxDepth);
  }

  const ranks: string[][] = [];
  for (const node of diagram.nodes) {
    const level = depth.get(node.id) ?? 0;
    ranks[level] = [...(ranks[level] ?? []), node.id];
  }
  return ranks.filter(Boolean);
}

/** Accessible description, since the diagram itself carries the information. */
function describe(diagram: DiagramSpec): string {
  const type = diagram.type.replace(/_/g, " ");
  const nodes = diagram.nodes.map((node) => node.label).join(", ");
  const edges = diagram.edges
    .map((edge) => {
      const from = diagram.nodes.find((n) => n.id === edge.from)?.label ?? edge.from;
      const to = diagram.nodes.find((n) => n.id === edge.to)?.label ?? edge.to;
      return `${from} to ${to}${edge.label ? ` labelled ${edge.label}` : ""}`;
    })
    .join("; ");
  return `${type}${diagram.title ? `: ${diagram.title}` : ""}. Nodes: ${nodes}. Connections: ${edges}.`;
}
