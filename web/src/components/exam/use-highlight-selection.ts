"use client";

import { useEffect } from "react";

/**
 * Turns a finished text selection into a highlight, wherever it ends.
 *
 * This listened on each `Highlightable` span's own `mouseup`, which meant the
 * release had to land on the text itself. Letting go a few pixels past the end
 * of a line — the ordinary way to select to the end of a sentence — delivered
 * the event to the paragraph instead and nothing happened at all. The tool read
 * as completely broken while every other part of it worked.
 *
 * Listening on the document instead means the release can land anywhere. The
 * region is taken from where the selection *started*, and a selection running
 * past that region is clamped to it, so dragging into the next paragraph marks
 * the part that was actually inside the first one rather than giving up.
 */

export type CapturedHighlight = { region: string; text: string; occurrence: number };

const REGION_ATTRIBUTE = "data-highlight-region";

/** The smallest selection worth storing. */
const MINIMUM_CHARACTERS = 2;

export function useHighlightSelection(
  enabled: boolean,
  onCapture: (highlight: CapturedHighlight) => void,
): void {
  useEffect(() => {
    if (!enabled) return;

    const capture = () => {
      const found = captureSelection();
      if (!found) return;
      onCapture(found);
      window.getSelection()?.removeAllRanges();
    };

    // `keyup` as well, so shift+arrow selection works for anyone not using a
    // mouse (CLAUDE.md §24).
    document.addEventListener("mouseup", capture);
    document.addEventListener("keyup", capture);
    return () => {
      document.removeEventListener("mouseup", capture);
      document.removeEventListener("keyup", capture);
    };
  }, [enabled, onCapture]);
}

export function captureSelection(): CapturedHighlight | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  // Never annotate something the student is typing into.
  if (isEditable(document.activeElement)) return null;

  const range = selection.getRangeAt(0);
  const container = regionOf(range.startContainer);
  if (!container) return null;

  const region = container.getAttribute(REGION_ATTRIBUTE);
  if (!region) return null;

  // Clamp to the region the selection began in, so a drag that runs past it
  // still marks the part that was inside.
  const clamped = range.cloneRange();
  if (!container.contains(range.endContainer)) {
    clamped.setEnd(container, container.childNodes.length);
  }

  const text = clamped.toString();
  if (text.trim().length < MINIMUM_CHARACTERS) return null;

  const source = container.textContent ?? "";
  if (!source.includes(text)) return null;

  // Which occurrence of this text it is, counted from the start of the region.
  const before = source.slice(0, offsetWithin(container, clamped));
  return { region, text, occurrence: countOccurrences(before, text) };
}

function regionOf(node: Node): Element | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return element?.closest(`[${REGION_ATTRIBUTE}]`) ?? null;
}

function isEditable(element: Element | null): boolean {
  if (!element) return false;
  const tag = element.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (element as HTMLElement).isContentEditable
  );
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle === "") return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + 1);
  }
  return count;
}

function offsetWithin(container: Element, range: Range): number {
  const probe = range.cloneRange();
  probe.selectNodeContents(container);
  probe.setEnd(range.startContainer, range.startOffset);
  return probe.toString().length;
}
