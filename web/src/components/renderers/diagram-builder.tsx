"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import type { z } from "zod";

import type { diagramBuilderConfigSchema } from "@/lib/schemas/renderers";

type Config = z.infer<typeof diagramBuilderConfigSchema>;

export type BuilderNode = {
  id: string;
  label: string;
  lines?: string[];
  x: number;
  y: number;
};

export type BuilderEdge = { from: string; to: string; kind?: string };
export type BuilderScene = { nodes: BuilderNode[]; edges: BuilderEdge[] };

/**
 * Diagram construction (CLAUDE.md §13).
 *
 * Deliberately not a freehand canvas. The marker needs *semantic* data — which
 * classes exist, what each contains, what inherits from what — and a drawing
 * library would hand it pixels. So the scene is a node/edge graph the student
 * builds and positions, serialised as structured data, and marked against the
 * expected structure rather than visual neatness.
 *
 * Everything is reachable from the keyboard: nodes are created and edited in
 * form fields, relationships are chosen from selects, and positioning is done
 * with arrow-key nudges as well as dragging.
 */

const NODE_WIDTH = 170;
const HEADER = 26;
const LINE = 17;
const NUDGE = 12;

const RELATIONSHIP_LABELS: Record<string, string> = {
  inheritance: "inherits from",
  plain: "is connected to",
  "data-couple": "passes data to",
  "control-couple": "passes control to",
};

export function DiagramBuilder({
  partId,
  config,
  value,
  onChange,
  disabled,
}: {
  partId: string;
  config: Config;
  value: BuilderScene;
  onChange: (scene: BuilderScene) => void;
  disabled: boolean;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [history, setHistory] = useState<BuilderScene[]>([]);
  const [future, setFuture] = useState<BuilderScene[]>([]);
  const [draftLabel, setDraftLabel] = useState("");
  const headingId = useId();

  // Memoised so `commit` is not rebuilt on every render when `value` is absent.
  const scene: BuilderScene = useMemo(
    () => value ?? { nodes: [], edges: [] },
    [value],
  );

  const commit = useCallback(
    (next: BuilderScene) => {
      setHistory((past) => [...past.slice(-40), scene]);
      setFuture([]);
      onChange(next);
    },
    [onChange, scene],
  );

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((past) => past.slice(0, -1));
    setFuture((ahead) => [scene, ...ahead]);
    onChange(previous);
  }

  function redo() {
    const next = future[0];
    if (!next) return;
    setFuture((ahead) => ahead.slice(1));
    setHistory((past) => [...past, scene]);
    onChange(next);
  }

  function addNode() {
    const label = draftLabel.trim();
    if (label === "") return;
    const id = `n${Date.now().toString(36)}`;
    // New nodes are laid out in a grid rather than stacked on the origin.
    const column = scene.nodes.length % 3;
    const row = Math.floor(scene.nodes.length / 3);
    commit({
      ...scene,
      nodes: [
        ...scene.nodes,
        { id, label, lines: [], x: 24 + column * (NODE_WIDTH + 30), y: 24 + row * 130 },
      ],
    });
    setDraftLabel("");
    setSelected(id);
  }

  function updateNode(id: string, patch: Partial<BuilderNode>) {
    commit({
      ...scene,
      nodes: scene.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)),
    });
  }

  function removeNode(id: string) {
    commit({
      nodes: scene.nodes.filter((node) => node.id !== id),
      edges: scene.edges.filter((edge) => edge.from !== id && edge.to !== id),
    });
    if (selected === id) setSelected(null);
  }

  function addEdge(from: string, to: string, kind: string) {
    if (from === to) return;
    if (scene.edges.some((edge) => edge.from === from && edge.to === to)) return;
    commit({ ...scene, edges: [...scene.edges, { from, to, kind }] });
  }

  function removeEdge(index: number) {
    commit({ ...scene, edges: scene.edges.filter((_, i) => i !== index) });
  }

  const nodeById = new Map(scene.nodes.map((node) => [node.id, node]));
  const heightOf = (node: BuilderNode) =>
    node.lines && node.lines.length > 0 ? HEADER + 10 + node.lines.length * LINE : 40;

  const surface = (
    <div
      ref={surfaceRef}
      className={`relative overflow-auto border border-[var(--exam-line)] bg-[var(--exam-input-bg)] ${
        fullScreen ? "h-[calc(100vh-8rem)]" : "h-[26rem]"
      }`}
      onMouseMove={(event) => {
        const drag = dragState.current;
        if (!drag || disabled) return;
        const bounds = surfaceRef.current?.getBoundingClientRect();
        if (!bounds) return;
        const node = nodeById.get(drag.id);
        if (!node) return;
        node.x = Math.max(0, event.clientX - bounds.left - drag.dx);
        node.y = Math.max(0, event.clientY - bounds.top - drag.dy);
        onChange({ ...scene });
      }}
      onMouseUp={() => {
        if (dragState.current) {
          dragState.current = null;
          commit({ ...scene });
        }
      }}
      onMouseLeave={() => {
        dragState.current = null;
      }}
    >
      {/* Relationships are drawn behind the boxes. */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        {scene.edges.map((edge, index) => {
          const from = nodeById.get(edge.from);
          const to = nodeById.get(edge.to);
          if (!from || !to) return null;
          const x1 = from.x + NODE_WIDTH / 2;
          const y1 = from.y + heightOf(from);
          const x2 = to.x + NODE_WIDTH / 2;
          const y2 = to.y;
          return (
            <path
              key={index}
              d={`M ${x1} ${y1} L ${x1} ${(y1 + y2) / 2} L ${x2} ${(y1 + y2) / 2} L ${x2} ${y2}`}
              fill="none"
              stroke="var(--exam-fg)"
              strokeWidth={edge.kind === "control-couple" ? 1.8 : 1.3}
              strokeDasharray={edge.kind === "control-couple" ? "5 3" : undefined}
            />
          );
        })}
      </svg>

      {scene.nodes.map((node) => (
        <div
          key={node.id}
          role="button"
          tabIndex={0}
          aria-label={`${node.label}. Use the arrow keys to move it.`}
          aria-pressed={selected === node.id}
          onMouseDown={(event) => {
            if (disabled) return;
            const bounds = surfaceRef.current?.getBoundingClientRect();
            if (!bounds) return;
            dragState.current = {
              id: node.id,
              dx: event.clientX - bounds.left - node.x,
              dy: event.clientY - bounds.top - node.y,
            };
            setSelected(node.id);
          }}
          onFocus={() => setSelected(node.id)}
          onKeyDown={(event) => {
            if (disabled) return;
            const moves: Record<string, [number, number]> = {
              ArrowUp: [0, -NUDGE],
              ArrowDown: [0, NUDGE],
              ArrowLeft: [-NUDGE, 0],
              ArrowRight: [NUDGE, 0],
            };
            const move = moves[event.key];
            if (!move) return;
            event.preventDefault();
            updateNode(node.id, {
              x: Math.max(0, node.x + move[0]),
              y: Math.max(0, node.y + move[1]),
            });
          }}
          style={{ left: node.x, top: node.y, width: NODE_WIDTH }}
          className={`absolute cursor-move border bg-[var(--exam-panel-bg)] ${
            selected === node.id
              ? "border-[var(--exam-accent)] border-2"
              : "border-[var(--exam-fg)]"
          }`}
        >
          <p className="border-b border-[var(--exam-fg)] px-2 py-1 text-center text-[0.9em] font-semibold">
            {node.label}
          </p>
          {node.lines && node.lines.length > 0 && (
            <ul className="px-2 py-1 text-[0.82em]">
              {node.lines.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {scene.nodes.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center text-[0.9em] text-[var(--exam-muted)]">
          Add a box below to begin.
        </p>
      )}
    </div>
  );

  const selectedNode = selected ? nodeById.get(selected) : undefined;

  const controls = (
    <div className="mt-3 space-y-4">
      {/* ------------------------------------------------------- add a box */}
      <div className="flex flex-wrap items-end gap-2">
        <span className="flex flex-col">
          <label htmlFor={`${partId}-new-node`} className="text-[0.8em] font-semibold">
            New box
          </label>
          <input
            id={`${partId}-new-node`}
            type="text"
            value={draftLabel}
            disabled={disabled}
            placeholder={config.paletteHint ?? "Name"}
            onChange={(event) => setDraftLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addNode();
              }
            }}
            className="w-56 border border-[var(--exam-line)] bg-[var(--exam-input-bg)] px-2 py-1.5 text-[var(--exam-fg)]"
          />
        </span>
        <button
          type="button"
          onClick={addNode}
          disabled={disabled || draftLabel.trim() === ""}
          className="h-9 bg-[var(--exam-nav-current-bg)] px-4 text-[0.85em] font-semibold text-[var(--exam-nav-current-fg)] disabled:opacity-50"
        >
          Add box
        </button>
      </div>

      {/* ------------------------------------------------ edit the selection */}
      {selectedNode && (
        <div className="border border-[var(--exam-line)] p-3">
          <p className="text-[0.8em] font-semibold uppercase tracking-wide text-[var(--exam-muted)]">
            {selectedNode.label}
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <span className="flex flex-col">
              <label
                htmlFor={`${partId}-lines`}
                className="text-[0.8em] font-semibold"
              >
                Contents, one per line
              </label>
              <textarea
                id={`${partId}-lines`}
                rows={4}
                disabled={disabled}
                value={(selectedNode.lines ?? []).join("\n")}
                onChange={(event) =>
                  updateNode(selectedNode.id, {
                    lines: event.target.value
                      .split("\n")
                      .map((line) => line.trim())
                      .filter((line) => line !== ""),
                  })
                }
                className="w-72 border border-[var(--exam-line)] bg-[var(--exam-input-bg)] px-2 py-1.5 font-mono text-[0.85em] text-[var(--exam-fg)]"
              />
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => removeNode(selectedNode.id)}
              className="h-9 border border-[var(--danger)] px-3 text-[0.85em] font-semibold text-[var(--danger)] disabled:opacity-50"
            >
              Delete box
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------- relationships */}
      <fieldset disabled={disabled || scene.nodes.length < 2} className="border border-[var(--exam-line)] p-3">
        <legend className="px-1 text-[0.8em] font-semibold uppercase tracking-wide text-[var(--exam-muted)]">
          Relationships
        </legend>
        <RelationshipForm
          partId={partId}
          nodes={scene.nodes}
          expectedShapes={config.expectedShapes}
          onAdd={addEdge}
        />
        {scene.edges.length > 0 && (
          <ul className="mt-3 space-y-1 text-[0.9em]">
            {scene.edges.map((edge, index) => (
              <li key={index} className="flex items-center gap-2">
                <span>
                  {nodeById.get(edge.from)?.label ?? edge.from}{" "}
                  {RELATIONSHIP_LABELS[edge.kind ?? "plain"] ?? "is connected to"}{" "}
                  {nodeById.get(edge.to)?.label ?? edge.to}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => removeEdge(index)}
                  aria-label={`Remove relationship ${index + 1}`}
                  className="h-6 border border-[var(--exam-line)] px-2 text-[0.8em]"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
    </div>
  );

  return (
    <div className={fullScreen ? "fixed inset-0 z-50 overflow-auto bg-[var(--exam-canvas-bg)] p-6" : "mt-3"}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h4 id={headingId} className="sr-only">
          Diagram construction area
        </h4>
        <button
          type="button"
          onClick={() => setFullScreen((open) => !open)}
          className="h-9 bg-[var(--exam-nav-current-bg)] px-4 text-[0.85em] font-semibold text-[var(--exam-nav-current-fg)]"
        >
          {fullScreen ? "Exit full screen" : "Full screen"}
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={disabled || history.length === 0}
          className="h-9 border border-[var(--exam-line)] px-3 text-[0.85em] disabled:opacity-40"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={disabled || future.length === 0}
          className="h-9 border border-[var(--exam-line)] px-3 text-[0.85em] disabled:opacity-40"
        >
          Redo
        </button>

        {confirmReset ? (
          <span className="flex items-center gap-2 text-[0.85em]">
            Clear the whole diagram?
            <button
              type="button"
              onClick={() => {
                commit({ nodes: [], edges: [] });
                setSelected(null);
                setConfirmReset(false);
              }}
              className="h-8 border border-[var(--danger)] px-3 font-semibold text-[var(--danger)]"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="h-8 border border-[var(--exam-line)] px-3"
            >
              Keep
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            disabled={disabled || scene.nodes.length === 0}
            className="h-9 border border-[var(--exam-line)] px-3 text-[0.85em] disabled:opacity-40"
          >
            Reset
          </button>
        )}

        <span className="text-[0.8em] text-[var(--exam-muted)]">
          Drag a box, or select it and use the arrow keys.
        </span>
      </div>

      {surface}
      {controls}

      {/* The marker reads this, and it is also the screen-reader summary. */}
      <p className="sr-only" aria-live="polite">
        {scene.nodes.length === 0
          ? "The diagram is empty."
          : `${scene.nodes.length} boxes: ${scene.nodes
              .map((node) => node.label)
              .join(", ")}. ${
              scene.edges.length === 0
                ? "No relationships."
                : `Relationships: ${scene.edges
                    .map(
                      (edge) =>
                        `${nodeById.get(edge.from)?.label ?? edge.from} ${
                          RELATIONSHIP_LABELS[edge.kind ?? "plain"]
                        } ${nodeById.get(edge.to)?.label ?? edge.to}`,
                    )
                    .join("; ")}.`
            }`}
      </p>
    </div>
  );
}

function RelationshipForm({
  partId,
  nodes,
  expectedShapes,
  onAdd,
}: {
  partId: string;
  nodes: BuilderNode[];
  expectedShapes: Config["expectedShapes"];
  onAdd: (from: string, to: string, kind: string) => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [kind, setKind] = useState(
    expectedShapes === "class_diagram" ? "inheritance" : "data-couple",
  );

  const kinds =
    expectedShapes === "class_diagram"
      ? ["inheritance", "plain"]
      : expectedShapes === "structure_chart"
        ? ["data-couple", "control-couple"]
        : ["plain"];

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Select
        id={`${partId}-edge-from`}
        label="From"
        value={from}
        onChange={setFrom}
        options={nodes.map((node) => ({ value: node.id, text: node.label }))}
      />
      <Select
        id={`${partId}-edge-kind`}
        label="Relationship"
        value={kind}
        onChange={setKind}
        options={kinds.map((value) => ({
          value,
          text: RELATIONSHIP_LABELS[value] ?? value,
        }))}
      />
      <Select
        id={`${partId}-edge-to`}
        label="To"
        value={to}
        onChange={setTo}
        options={nodes.map((node) => ({ value: node.id, text: node.label }))}
      />
      <button
        type="button"
        disabled={from === "" || to === "" || from === to}
        onClick={() => {
          onAdd(from, to, kind);
          setFrom("");
          setTo("");
        }}
        className="h-9 bg-[var(--exam-nav-current-bg)] px-4 text-[0.85em] font-semibold text-[var(--exam-nav-current-fg)] disabled:opacity-50"
      >
        Add
      </button>
    </div>
  );
}

function Select({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; text: string }>;
}) {
  return (
    <span className="flex flex-col">
      <label htmlFor={id} className="text-[0.8em] font-semibold">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 min-w-40 border border-[var(--exam-line)] bg-[var(--exam-input-bg)] px-2 text-[var(--exam-fg)]"
      >
        <option value="">— select —</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.text}
          </option>
        ))}
      </select>
    </span>
  );
}
