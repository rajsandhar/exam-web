import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { countWords, htmlToPlainText, sanitiseResponseHtml } from "@/lib/sanitise";

/**
 * The sanitiser is the boundary between a student's typing and
 * `dangerouslySetInnerHTML`, so these are the tests that let it be a hundred
 * lines of this repository's own code rather than a DOM implementation.
 *
 * The policy is narrow on purpose: the tags the response toolbar produces, and
 * no attributes whatsoever.
 */

describe("what a response is allowed to contain", () => {
  it("keeps the formatting the toolbar produces", () => {
    const html = "<p>A <strong>secure</strong> <em>design</em> uses <code>bcrypt</code>.</p>";
    expect(sanitiseResponseHtml(html)).toBe(html);
  });

  it("keeps lists and nesting", () => {
    expect(sanitiseResponseHtml("<ul><li>One</li><li><b>Two</b></li></ul>")).toBe(
      "<ul><li>One</li><li><b>Two</b></li></ul>",
    );
  });

  it("keeps line breaks", () => {
    expect(sanitiseResponseHtml("<p>One<br>Two</p>")).toBe("<p>One<br>Two</p>");
  });

  it("strips every attribute, harmless ones included", () => {
    expect(sanitiseResponseHtml('<p class="lead" dir="rtl">Text</p>')).toBe("<p>Text</p>");
  });

  it("drops tags outside the allowlist but keeps their text", () => {
    expect(sanitiseResponseHtml("<h1>Heading</h1><table><tr><td>Cell</td></tr></table>")).toBe(
      "HeadingCell",
    );
  });
});

describe("what it refuses to pass through", () => {
  const vectors: Array<[string, string]> = [
    ["event handler", '<p onclick="alert(1)">Text</p>'],
    ["inline script", "<script>alert(1)</script>"],
    ["script after text", "<p>Before</p><script>alert(1)</script><p>After</p>"],
    ["image error handler", '<img src=x onerror="alert(1)">'],
    ["javascript: link", '<a href="javascript:alert(1)">Click</a>'],
    ["svg payload", "<svg><script>alert(1)</script></svg>"],
    ["mathml payload", "<math><mtext><script>alert(1)</script></mtext></math>"],
    ["iframe", '<iframe src="https://example.test"></iframe>'],
    ["style block", "<style>body{background:url(javascript:alert(1))}</style>"],
    ["form and input", '<form><input name="password"></form>'],
    ["object", '<object data="x"></object>'],
    ["style break-out", '<div><style><p title="</style><img src=x onerror=alert(1)>"></div>'],
    ["quoted angle bracket", '<p title="a>b" onclick="alert(1)">Text</p>'],
    ["uppercase script", "<SCRIPT>alert(1)</SCRIPT>"],
    ["comment wrapper", "<!--<script>alert(1)</script>-->"],
    ["unclosed script", "<script>alert(1)"],
  ];

  for (const [name, input] of vectors) {
    it(`neutralises a ${name}`, () => {
      const output = sanitiseResponseHtml(input);
      expect(output).not.toMatch(/<script/i);
      expect(output).not.toMatch(/<(img|svg|iframe|object|form|input|a|style|math)\b/i);
      expect(output).not.toMatch(/\son\w+\s*=/i);
      expect(output).not.toMatch(/javascript:/i);
      // A script body must not survive as visible text either.
      expect(output).not.toContain("alert(1)");
    });
  }

  it("reads malformed nesting the way a browser does", () => {
    // `<p<script>` is a `p` tag whose first attribute is named `<script`, so
    // there is no script element here — and the body is left as inert text,
    // which is what a browser does with it too.
    expect(sanitiseResponseHtml("<p<script>alert(1)</script>")).toBe("<p>alert(1)</p>");
  });

  it("escapes a stray angle bracket rather than guessing at a tag", () => {
    expect(sanitiseResponseHtml("<p>if a < b and b > c</p>")).toBe(
      "<p>if a &lt; b and b &gt; c</p>",
    );
  });

  it("drops comments", () => {
    expect(sanitiseResponseHtml("<p>Visible<!-- hidden --></p>")).toBe("<p>Visible</p>");
  });

  it("drops a doctype", () => {
    expect(sanitiseResponseHtml("<!DOCTYPE html><p>Text</p>")).toBe("<p>Text</p>");
  });
});

describe("well-formedness of the result", () => {
  it("closes what the input left open", () => {
    expect(sanitiseResponseHtml("<p>One<p>Two")).toBe("<p>One<p>Two</p></p>");
  });

  it("discards a close tag with nothing open", () => {
    expect(sanitiseResponseHtml("</p>Text")).toBe("Text");
  });

  it("closes inner elements when an outer one closes", () => {
    expect(sanitiseResponseHtml("<div><b>Bold</div>")).toBe("<div><b>Bold</b></div>");
  });

  it("is idempotent", () => {
    const once = sanitiseResponseHtml('<p class="x">A & B <script>alert(1)</script></p>');
    expect(sanitiseResponseHtml(once)).toBe(once);
  });

  it("leaves an existing character reference alone", () => {
    expect(sanitiseResponseHtml("<p>Tom &amp; Jerry &#39;s &lt;tag&gt;</p>")).toBe(
      "<p>Tom &amp; Jerry &#39;s &lt;tag&gt;</p>",
    );
  });

  it("escapes a bare ampersand", () => {
    expect(sanitiseResponseHtml("<p>Tom & Jerry</p>")).toBe("<p>Tom &amp; Jerry</p>");
  });

  it("handles an empty response", () => {
    expect(sanitiseResponseHtml("")).toBe("");
  });
});

describe("plain text, for word counts and marker prompts", () => {
  it("turns block ends into line breaks", () => {
    expect(htmlToPlainText("<p>First point</p><p>Second point</p>")).toBe(
      "First point\nSecond point",
    );
  });

  it("decodes the references the sanitiser leaves behind", () => {
    expect(htmlToPlainText("<p>Tom &amp; Jerry</p>")).toBe("Tom & Jerry");
  });

  it("carries nothing executable through", () => {
    expect(htmlToPlainText('<p>Answer</p><script>alert(1)</script>')).toBe("Answer");
  });

  it("counts words", () => {
    expect(countWords(htmlToPlainText("<p>Three  little   words</p>"))).toBe(3);
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
  });
});

describe("what this file is allowed to depend on", () => {
  /**
   * The invariant, not the symptom. Any DOM implementation reachable from
   * application code is loaded by every serverless function that imports it —
   * paper generation reached this file through the marker — and jsdom fails
   * there at module evaluation, before a handler runs, so the response has no
   * body for the browser to parse.
   */
  const root = path.resolve(import.meta.dirname, "..", "..");

  it("ships no DOM implementation to the server", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };

    expect(Object.keys(manifest.dependencies)).not.toContain("jsdom");
    expect(Object.keys(manifest.dependencies)).not.toContain("isomorphic-dompurify");
  });

  it("imports nothing at all", () => {
    const source = fs.readFileSync(path.join(root, "src", "lib", "sanitise.ts"), "utf8");
    expect(source).not.toMatch(/^\s*import\s/m);
  });
});
