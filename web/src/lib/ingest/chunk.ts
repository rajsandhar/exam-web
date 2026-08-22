import type { ParsedSection } from "./parsers";

/**
 * Splits parsed sections into retrieval-sized chunks.
 *
 * Boundaries follow blank lines first and sentence ends second, so a chunk is
 * readable on its own — a mid-sentence cut produces a chunk the generator has
 * to guess at.
 */

export type Chunk = {
  chunkIndex: number;
  pageOrSlide: string | null;
  content: string;
};

const TARGET_CHARS = 1400;
const MAX_CHARS = 2200;
const MIN_CHARS = 200;
/** Carried into the next chunk so a concept split across a boundary survives. */
const OVERLAP_CHARS = 180;

export function chunkSections(sections: ParsedSection[]): Chunk[] {
  const chunks: Chunk[] = [];
  let index = 0;

  for (const section of sections) {
    for (const body of splitText(section.text)) {
      chunks.push({
        chunkIndex: index++,
        pageOrSlide: section.pageOrSlide,
        content: body,
      });
    }
  }

  // Very short trailing fragments (slide titles, page headers) are folded into
  // the previous chunk from the same page rather than stored alone.
  const merged: Chunk[] = [];
  for (const chunk of chunks) {
    const previous = merged.at(-1);
    if (
      previous &&
      chunk.content.length < MIN_CHARS &&
      previous.pageOrSlide === chunk.pageOrSlide &&
      previous.content.length + chunk.content.length <= MAX_CHARS
    ) {
      previous.content = `${previous.content}\n${chunk.content}`;
      continue;
    }
    merged.push({ ...chunk, chunkIndex: merged.length });
  }

  return merged;
}

function splitText(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed === "") return [];
  if (trimmed.length <= MAX_CHARS) return [trimmed];

  const paragraphs = trimmed.split(/\n{2,}/);
  const out: string[] = [];
  let current = "";

  const push = () => {
    const value = current.trim();
    if (value !== "") out.push(value);
    current = value.length > OVERLAP_CHARS ? `${tailOf(value)}\n` : "";
  };

  for (const paragraph of paragraphs) {
    for (const piece of paragraph.length > MAX_CHARS
      ? splitLongParagraph(paragraph)
      : [paragraph]) {
      if (current !== "" && current.length + piece.length > TARGET_CHARS) push();
      current += (current === "" ? "" : "\n\n") + piece;
      if (current.length >= MAX_CHARS) push();
    }
  }

  const last = current.trim();
  if (last !== "") out.push(last);
  return out;
}

function splitLongParagraph(paragraph: string): string[] {
  const sentences = paragraph.split(/(?<=[.!?])\s+/);
  const pieces: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current !== "" && current.length + sentence.length > TARGET_CHARS) {
      pieces.push(current.trim());
      current = "";
    }
    current += (current === "" ? "" : " ") + sentence;
    // A single sentence longer than the cap (a code block, a wide table row)
    // is cut on width as a last resort.
    while (current.length > MAX_CHARS) {
      pieces.push(current.slice(0, MAX_CHARS));
      current = current.slice(MAX_CHARS);
    }
  }
  if (current.trim() !== "") pieces.push(current.trim());
  return pieces;
}

function tailOf(value: string): string {
  const tail = value.slice(-OVERLAP_CHARS);
  const boundary = tail.search(/[.!?]\s/);
  return boundary === -1 ? tail : tail.slice(boundary + 2);
}
