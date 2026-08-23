import DOMPurify from "isomorphic-dompurify";

/**
 * Rich-text responses are sanitised on the way in and again before they are
 * rendered back (CLAUDE.md §23). The allowlist matches exactly what the
 * response editor's toolbar can produce.
 */
const ALLOWED_TAGS = [
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
];

export function sanitiseResponseHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });
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
