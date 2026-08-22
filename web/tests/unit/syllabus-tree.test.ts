import { describe, expect, it } from "vitest";

import {
  highlightSegments,
  leafMatchesQuery,
  parentCheckState,
  type SyllabusLeaf,
} from "@/lib/syllabus/tree";

const leaf = (id: string, exactText: string, including: string[] = []): SyllabusLeaf => ({
  id,
  exactText,
  including,
  verified: true,
  note: null,
  sourceUrl: null,
});

describe("parentCheckState", () => {
  it("is unchecked when nothing under it is selected", () => {
    expect(parentCheckState(["a", "b"], new Set())).toBe("unchecked");
  });
  it("is checked only when every descendant is selected", () => {
    expect(parentCheckState(["a", "b"], new Set(["a", "b"]))).toBe("checked");
  });
  it("is indeterminate on a partial selection", () => {
    expect(parentCheckState(["a", "b"], new Set(["a"]))).toBe("indeterminate");
  });
  it("treats an empty branch as unchecked rather than checked", () => {
    expect(parentCheckState([], new Set(["a"]))).toBe("unchecked");
  });
});

describe("leafMatchesQuery", () => {
  const item = leaf("ssa.2.7", "input validation, sanitisation and error handling", [
    "cross-site scripting (XSS)",
  ]);

  it("matches case-insensitively on exact wording", () => {
    expect(leafMatchesQuery(item, "SANITISATION")).toBe(true);
  });
  it("matches on `including` values", () => {
    expect(leafMatchesQuery(item, "xss")).toBe(true);
  });
  it("matches everything on an empty query", () => {
    expect(leafMatchesQuery(item, "   ")).toBe(true);
  });
  it("does not match unrelated text", () => {
    expect(leafMatchesQuery(item, "regression")).toBe(false);
  });
  it("folds curly quotes so a typed apostrophe finds the syllabus wording", () => {
    const quoted = leaf("ssa.2.4", "the \u2018privacy by design\u2019 approach");
    expect(leafMatchesQuery(quoted, "'privacy by design'")).toBe(true);
  });
});

describe("highlightSegments", () => {
  it("returns one plain segment when the query is empty", () => {
    expect(highlightSegments("Describe the benefits", "")).toEqual([
      { text: "Describe the benefits", match: false },
    ]);
  });

  it("splits around every occurrence and preserves the original text exactly", () => {
    const source = "Test and evaluate the test data";
    const segments = highlightSegments(source, "test");
    expect(segments.map((s) => s.text).join("")).toBe(source);
    expect(segments.filter((s) => s.match).map((s) => s.text)).toEqual([
      "Test",
      "test",
    ]);
  });

  it("keeps original casing and curly quotes inside matched segments", () => {
    const source = "the \u2018security by design\u2019 approach";
    const segments = highlightSegments(source, "'SECURITY BY DESIGN'");
    expect(segments.map((s) => s.text).join("")).toBe(source);
    expect(segments.find((s) => s.match)?.text).toBe(
      "\u2018security by design\u2019",
    );
  });
});
