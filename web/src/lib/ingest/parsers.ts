import fs from "node:fs/promises";
import path from "node:path";

/**
 * Deterministic parsing of the reference corpus (CLAUDE.md §16).
 *
 * No model reads the corpus — PDF, DOCX and PPTX are parsed structurally so the
 * same input always produces the same chunks.
 *
 * Everything returned here is untrusted data (CLAUDE.md §23). It is stored and
 * later quoted into prompts inside explicit delimiters; it is never treated as
 * instructions.
 */

export type ParsedSection = {
  /** Page number, slide number or heading position. */
  pageOrSlide: string | null;
  text: string;
};

export type ParsedDocument = {
  sections: ParsedSection[];
};

export async function parseDocument(file: string): Promise<ParsedDocument> {
  const extension = path.extname(file).toLowerCase();
  switch (extension) {
    case ".pdf":
      return parsePdf(file);
    case ".docx":
      return parseDocx(file);
    case ".pptx":
      return parsePptx(file);
    case ".md":
    case ".txt":
      return { sections: [{ pageOrSlide: null, text: await fs.readFile(file, "utf8") }] };
    default:
      return { sections: [] };
  }
}

async function parsePdf(file: string): Promise<ParsedDocument> {
  // The legacy build runs under plain Node without a DOM.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await fs.readFile(file));
  const task = pdfjs.getDocument({ data, useSystemFonts: true });
  const document = await task.promise;

  const sections: ParsedSection[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();

    // pdf.js emits positioned runs; rebuild lines by tracking the y coordinate
    // so tables and code keep their shape instead of collapsing to one line.
    let text = "";
    let lastY: number | null = null;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = Math.round((item.transform[5] ?? 0) * 10) / 10;
      if (lastY !== null && Math.abs(y - lastY) > 2) text += "\n";
      else if (text !== "" && !text.endsWith(" ") && !item.str.startsWith(" ")) {
        text += " ";
      }
      text += item.str;
      lastY = y;
    }
    page.cleanup();

    const cleaned = tidy(text);
    if (cleaned !== "") {
      sections.push({ pageOrSlide: `p${pageNumber}`, text: cleaned });
    }
  }

  await task.destroy();
  return { sections };
}

async function parseDocx(file: string): Promise<ParsedDocument> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ path: file });
  const cleaned = tidy(result.value);
  return cleaned === "" ? { sections: [] } : { sections: [{ pageOrSlide: null, text: cleaned }] };
}

/**
 * PPTX is a zip of `ppt/slides/slideN.xml`. Reading it directly keeps slide
 * boundaries, which `officeparser` flattens, and avoids pulling an OCR
 * dependency into the ingestion path.
 */
async function parsePptx(file: string): Promise<ParsedDocument> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const archive = unzipSync(new Uint8Array(await fs.readFile(file)));

  const slideNames = Object.keys(archive)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const sections: ParsedSection[] = [];
  for (const name of slideNames) {
    const entry = archive[name];
    if (!entry) continue;
    const xml = strFromU8(entry);
    const text = tidy(slideXmlToText(xml));
    if (text !== "") {
      sections.push({ pageOrSlide: `slide${slideNumber(name)}`, text });
    }
  }
  return { sections };
}

function slideNumber(name: string): number {
  return Number(name.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
}

/**
 * Pulls the text runs out of a slide. `<a:p>` is a paragraph and `<a:t>` holds
 * the run text; anything else (positions, styling, relationships) is discarded.
 */
function slideXmlToText(xml: string): string {
  const paragraphs = xml.split(/<a:p[\s>]/).slice(1);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const runs = [...paragraph.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) =>
      decodeXmlEntities(m[1] ?? ""),
    );
    const line = runs.join("").trim();
    if (line !== "") lines.push(line);
  }
  return lines.join("\n");
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
}

function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    // Collapse runs of spaces but keep line structure.
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}
