"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import { NARROW_SELECTION_THRESHOLD, TOTAL_MARKS } from "@/lib/config";
import {
  parseSelection,
  selectionServerSnapshot,
  selectionSnapshot,
  subscribeToSelection,
  writeSelection,
} from "@/lib/syllabus/selection-store";
import {
  focusAreaLeafIds,
  highlightSegments,
  leafMatchesQuery,
  leavesOf,
  parentCheckState,
  subtopicLeafIds,
  type CheckState,
  type SyllabusLeaf,
  type SyllabusTree,
} from "@/lib/syllabus/tree";

type Props = {
  tree: SyllabusTree;
  /** True in development, where unverified seed items get a visible marker. */
  showUnverifiedMarkers: boolean;
};

export function SyllabusSelector({ tree, showUnverifiedMarkers }: Props) {
  const router = useRouter();
  const allLeaves = useMemo(() => leavesOf(tree), [tree]);
  const allLeafIds = useMemo(() => allLeaves.map((l) => l.id), [allLeaves]);
  const validIds = useMemo(() => new Set(allLeafIds), [allLeafIds]);

  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // localStorage is the source of truth for the selection, so it survives a
  // reload without a rehydrate-then-setState effect. Unknown ids are dropped:
  // a changed seed must never resurrect an item that no longer exists.
  const storedSelection = useSyncExternalStore(
    subscribeToSelection,
    selectionSnapshot,
    selectionServerSnapshot,
  );

  const selected = useMemo(
    () => new Set(parseSelection(storedSelection, validIds)),
    [storedSelection, validIds],
  );

  const matching = useMemo(() => {
    if (query.trim() === "") return null;
    return new Set(
      allLeaves.filter((l) => leafMatchesQuery(l, query)).map((l) => l.id),
    );
  }, [allLeaves, query]);

  function toggleLeaves(ids: readonly string[], on: boolean) {
    const next = new Set(selected);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    // Written in the tree's own order so the stored list stays readable.
    writeSelection(allLeafIds.filter((id) => next.has(id)));
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function generate() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/exams", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ syllabusItemIds: [...selected] }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : "Generation could not be started.";
        throw new Error(message);
      }
      const examId = (payload as { examId?: unknown }).examId;
      if (typeof examId !== "string") throw new Error("Malformed response.");
      router.push(`/generating/${examId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Generation failed.");
      setSubmitting(false);
    }
  }

  const selectedCount = selected.size;
  const narrow = selectedCount > 0 && selectedCount < NARROW_SELECTION_THRESHOLD;
  const visibleFocusAreas = tree.filter((focusArea) =>
    matching === null
      ? true
      : focusAreaLeafIds(focusArea).some((id) => matching.has(id)),
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[16rem]">
            <label htmlFor="syllabus-search" className="sr-only">
              Search syllabus content
            </label>
            <input
              id="syllabus-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search syllabus wording…"
              className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none placeholder:text-ink-muted focus:border-navy-600"
            />
          </div>
          <button
            type="button"
            onClick={() => toggleLeaves(allLeafIds, true)}
            className="rounded-md border border-navy-700 px-3 py-2 text-sm font-medium text-navy-700 hover:bg-navy-700 hover:text-white"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => toggleLeaves(allLeafIds, false)}
            className="rounded-md border border-line-strong px-3 py-2 text-sm font-medium text-ink hover:bg-surface-3"
          >
            Clear all
          </button>
        </div>

        {matching !== null && (
          <p className="mb-3 text-sm text-ink-muted" role="status">
            {matching.size} dot point{matching.size === 1 ? "" : "s"} match
            {matching.size === 1 ? "es" : ""} “{query.trim()}”.
          </p>
        )}

        <div className="divide-y divide-line rounded-lg border border-line bg-white">
          {visibleFocusAreas.map((focusArea) => {
            const faLeafIds = focusAreaLeafIds(focusArea);
            const faState = parentCheckState(faLeafIds, selected);
            const isCollapsed = collapsed.has(focusArea.id) && matching === null;

            return (
              <section key={focusArea.id}>
                <header className="flex flex-wrap items-center gap-2 px-3 py-3">
                  <button
                    type="button"
                    onClick={() => toggleCollapse(focusArea.id)}
                    aria-expanded={!isCollapsed}
                    aria-controls={`fa-${focusArea.id}`}
                    className="flex items-center gap-2 text-left"
                  >
                    <Chevron open={!isCollapsed} />
                    <span className="text-base font-semibold text-navy-800">
                      {focusArea.name}
                    </span>
                  </button>
                  <span className="text-xs text-ink-muted">
                    {faLeafIds.filter((id) => selected.has(id)).length}/
                    {faLeafIds.length} selected
                  </span>
                  <span className="ml-auto flex gap-2">
                    <button
                      type="button"
                      onClick={() => toggleLeaves(faLeafIds, true)}
                      className="rounded border border-line px-2 py-1 text-xs font-medium text-navy-700 hover:bg-surface-2"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleLeaves(faLeafIds, false)}
                      className="rounded border border-line px-2 py-1 text-xs font-medium text-ink-muted hover:bg-surface-2"
                    >
                      Clear
                    </button>
                    <TriStateBox
                      state={faState}
                      label={`Select all of ${focusArea.name}`}
                      onChange={(on) => toggleLeaves(faLeafIds, on)}
                    />
                  </span>
                </header>

                {!isCollapsed && (
                  <div id={`fa-${focusArea.id}`} className="pb-2">
                    {focusArea.subtopics
                      .filter((subtopic) =>
                        matching === null
                          ? true
                          : subtopicLeafIds(subtopic).some((id) => matching.has(id)),
                      )
                      .map((subtopic) => {
                        const stLeafIds = subtopicLeafIds(subtopic);
                        const stState = parentCheckState(stLeafIds, selected);
                        const stCollapsed =
                          collapsed.has(subtopic.id) && matching === null;
                        return (
                          <div key={subtopic.id} className="px-3">
                            <div className="flex items-center gap-2 border-t border-line/70 py-2">
                              <TriStateBox
                                state={stState}
                                label={`Select all of ${subtopic.name}`}
                                onChange={(on) => toggleLeaves(stLeafIds, on)}
                              />
                              <button
                                type="button"
                                onClick={() => toggleCollapse(subtopic.id)}
                                aria-expanded={!stCollapsed}
                                aria-controls={`st-${subtopic.id}`}
                                className="flex items-center gap-2 text-left"
                              >
                                <Chevron open={!stCollapsed} small />
                                <span className="text-sm font-semibold text-ink">
                                  {subtopic.name}
                                </span>
                              </button>
                              <span className="text-xs text-ink-muted">
                                {stLeafIds.filter((id) => selected.has(id)).length}/
                                {stLeafIds.length}
                              </span>
                            </div>

                            {!stCollapsed && (
                              <ul id={`st-${subtopic.id}`} className="pb-2">
                                {subtopic.items
                                  .filter((leaf) =>
                                    matching === null ? true : matching.has(leaf.id),
                                  )
                                  .map((leaf) => (
                                    <LeafRow
                                      key={leaf.id}
                                      leaf={leaf}
                                      query={query}
                                      checked={selected.has(leaf.id)}
                                      showUnverifiedMarker={
                                        showUnverifiedMarkers && !leaf.verified
                                      }
                                      onChange={(on) => toggleLeaves([leaf.id], on)}
                                    />
                                  ))}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </section>
            );
          })}

          {visibleFocusAreas.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-ink-muted">
              No syllabus content matches “{query.trim()}”.
            </p>
          )}
        </div>
      </div>

      <aside className="lg:sticky lg:top-6">
        <div className="rounded-lg border border-line bg-white p-5">
          <p className="text-sm text-ink-muted">Selected content</p>
          <p className="mt-1 text-3xl font-semibold text-navy-800">
            {selectedCount}
            <span className="ml-1 text-base font-normal text-ink-muted">
              / {allLeafIds.length} dot points
            </span>
          </p>

          <button
            type="button"
            disabled={selectedCount === 0 || submitting}
            onClick={() => void generate()}
            className="mt-5 w-full rounded-md bg-navy-800 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-navy-700 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-ink-muted"
          >
            {submitting ? "Starting…" : `Generate ${TOTAL_MARKS}-mark Trial`}
          </button>

          {selectedCount === 0 && (
            <p className="mt-3 text-xs text-ink-muted">
              Select at least one dot point to generate a paper.
            </p>
          )}

          {narrow && (
            <p className="mt-3 rounded border border-flag/40 bg-flag/5 p-3 text-xs text-ink">
              A {TOTAL_MARKS}-mark paper built from only {selectedCount} dot point
              {selectedCount === 1 ? "" : "s"} will necessarily revisit the same
              concepts from different angles.
            </p>
          )}

          {error && (
            <p className="mt-3 rounded border border-danger/40 bg-danger/5 p-3 text-xs text-danger">
              {error}
            </p>
          )}

          <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-ink-muted">
            Every paper is exactly {TOTAL_MARKS} marks at trial/HSC standard. The
            platform chooses the question mix — there is no difficulty or
            question-count control.
          </p>
        </div>
      </aside>
    </div>
  );
}

function LeafRow({
  leaf,
  query,
  checked,
  showUnverifiedMarker,
  onChange,
}: {
  leaf: SyllabusLeaf;
  query: string;
  checked: boolean;
  showUnverifiedMarker: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <li className="flex gap-3 py-1.5 pl-6">
      <input
        id={`leaf-${leaf.id}`}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-[var(--navy-700)]"
      />
      <label htmlFor={`leaf-${leaf.id}`} className="text-sm leading-snug">
        <span>
          <Highlighted text={leaf.exactText} query={query} />
        </span>
        {showUnverifiedMarker && (
          <span
            title={leaf.note ?? "Wording not yet confirmed against the live NESA page."}
            className="ml-2 rounded border border-flag/50 bg-flag/10 px-1 text-[0.65rem] font-semibold tracking-wide text-flag uppercase"
          >
            unverified
          </span>
        )}
        {leaf.including.length > 0 && (
          <span className="mt-0.5 block text-xs text-ink-muted">
            Including:{" "}
            {leaf.including.map((inc, index) => (
              <span key={inc}>
                {index > 0 && ", "}
                <Highlighted text={inc} query={query} />
              </span>
            ))}
          </span>
        )}
      </label>
    </li>
  );
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const segments = highlightSegments(text, query);
  return (
    <>
      {segments.map((segment, index) =>
        segment.match ? (
          <mark key={index} className="bg-[#ffe97a] text-ink">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

/**
 * A real tri-state checkbox. `indeterminate` is a DOM property with no HTML
 * attribute and React does not reflect it from props, so it is set via ref.
 */
function TriStateBox({
  state,
  label,
  onChange,
}: {
  state: CheckState;
  label: string;
  onChange: (on: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "indeterminate";
  }, [state]);

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={state === "checked"}
      onChange={() => onChange(state !== "checked")}
      className="h-4 w-4 shrink-0 accent-[var(--navy-700)]"
    />
  );
}

function Chevron({ open, small }: { open: boolean; small?: boolean }) {
  const size = small ? 12 : 14;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
