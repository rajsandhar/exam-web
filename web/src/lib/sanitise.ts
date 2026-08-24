/**
 * Rich-text responses are sanitised on the way in and again before they are
 * rendered back (CLAUDE.md §23). The allowlist matches exactly what the
 * response editor's toolbar can produce.
 *
 * This used to be DOMPurify, through `isomorphic-dompurify`, which supplies a
 * DOM on the server by pulling in jsdom. That crashed every serverless function
 * whose imports reached this file — including paper generation, which reaches it
 * through the marker — because jsdom is externalised rather than bundled and one
 * of its own dependencies is ESM-only, so `require()` of it fails at module
 * evaluation, before any handler runs.
 *
 * A whole DOM implementation was never proportionate to the job. The policy is
 * an allowlist of inert formatting tags and *no attributes at all*, which is
 * small enough to apply directly: with no attributes, no URLs and no foreign
 * content (SVG, MathML) surviving, the mutation attacks that make hand-written
 * sanitisers dangerous have nothing to work with. The same code now runs on both
 * sides, so what the server stores and what the browser renders cannot diverge.
 */

/** Everything the toolbar can produce, and nothing else. */
const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "sub",
  "sup",
  "code",
  "div",
  "span",
]);

/** Emitted self-closing, and never pushed onto the open-element stack. */
const VOID_TAGS = new Set(["br"]);

/**
 * Elements whose *content* is discarded along with their tags.
 *
 * Dropping only the tags would leave a script body as visible text, and worse,
 * would leave `<style>` content that a later parse could re-read as markup.
 */
const DROP_CONTENT = new Set([
  "script",
  "style",
  "noscript",
  "iframe",
  "object",
  "embed",
  "template",
  "textarea",
  "title",
]);

const TAG_NAME = /^<\/?([a-zA-Z][a-zA-Z0-9]*)/;

/** An `&` that does not already begin a character reference. */
const BARE_AMPERSAND = /&(?!#\d+;|#[xX][0-9a-fA-F]+;|[a-zA-Z][a-zA-Z0-9]*;)/g;

function escapeText(text: string): string {
  return text.replace(BARE_AMPERSAND, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Index just past the `>` that closes the tag starting at `start`.
 *
 * Quote-aware, because `<p title="a>b">` closes at the second `>` and not the
 * first. The attributes are thrown away either way, but stopping in the wrong
 * place would spill the rest of them into the text.
 */
function endOfTag(html: string, start: number): number {
  let quote: string | null = null;
  for (let i = start + 1; i < html.length; i += 1) {
    const character = html[i]!;
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return i + 1;
    }
  }
  return html.length;
}

/** Index just past the matching close tag, or the end of the input. */
function endOfElement(html: string, name: string, from: number): number {
  const close = new RegExp(`</${name}[\s>/]`, "i");
  const match = close.exec(html.slice(from));
  if (!match) return html.length;
  return endOfTag(html, from + match.index);
}

export function sanitiseResponseHtml(html: string): string {
  if (typeof html !== "string" || html === "") return "";

  const out: string[] = [];
  const open: string[] = [];
  let index = 0;

  while (index < html.length) {
    const next = html.indexOf("<", index);
    if (next === -1) {
      out.push(escapeText(html.slice(index)));
      break;
    }
    if (next > index) out.push(escapeText(html.slice(index, next)));

    const rest = html.slice(next);

    // Comments, doctypes, CDATA and processing instructions: dropped whole.
    if (rest.startsWith("<!--")) {
      const end = html.indexOf("-->", next + 4);
      index = end === -1 ? html.length : end + 3;
      continue;
    }
    if (rest.startsWith("<!") || rest.startsWith("<?")) {
      index = endOfTag(html, next);
      continue;
    }

    const name = TAG_NAME.exec(rest)?.[1]?.toLowerCase();
    if (!name) {
      // Not a tag at all — `a < b`, or `<3`. Keep it as the text it is.
      out.push("&lt;");
      index = next + 1;
      continue;
    }

    const isClosing = rest.startsWith("</");
    const after = endOfTag(html, next);

    if (!isClosing && DROP_CONTENT.has(name)) {
      index = rest.slice(0, after - next).trimEnd().endsWith("/>")
        ? after
        : endOfElement(html, name, after);
      continue;
    }

    if (!ALLOWED_TAGS.has(name)) {
      index = after;
      continue;
    }

    if (VOID_TAGS.has(name)) {
      if (!isClosing) out.push(`<${name}>`);
    } else if (isClosing) {
      // A close tag with nothing open is noise from a truncated paste.
      const depth = open.lastIndexOf(name);
      if (depth !== -1) {
        while (open.length > depth) out.push(`</${open.pop()!}>`);
      }
    } else {
      out.push(`<${name}>`);
      open.push(name);
    }

    index = after;
  }

  // Anything still open is closed here, so the result is always well formed.
  while (open.length > 0) out.push(`</${open.pop()!}>`);

  return out.join("");
}

/** Plain text of a rich-text response, for word counts and marker prompts. */
export function htmlToPlainText(html: string): string {
  return sanitiseResponseHtml(html)
    .replace(/<\/(p|div|li|ul|ol)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}
