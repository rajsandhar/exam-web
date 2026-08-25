// @vitest-environment happy-dom
import type { ReactNode } from "react";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GenerationProgressView } from "@/components/build/generation-progress";
import { PaperActions } from "@/components/history/paper-actions";

/**
 * What the application shows when generating a paper fails.
 *
 * A QA pass could not confirm either of these, because nothing failed while it
 * was looking — the state only appears after a real failure, which is not
 * something a browser pass can arrange. So they are rendered directly here.
 *
 * `happy-dom` for this file only; the suite is otherwise a node environment,
 * and as a devDependency none of this reaches a deployed bundle.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const EXAM_ID = "6f1c0f3a-0000-4000-8000-000000000001";

describe("the generation failure screen", () => {
  it("names the paper, so a failure can be reported", () => {
    render(<GenerationProgressView examId={EXAM_ID} initialStatus="failed" />);

    expect(screen.getByText("Generation failed")).toBeTruthy();
    // The identifier is the whole point: without it a student cannot say which
    // paper failed and nobody can look it up.
    expect(screen.getByText(EXAM_ID)).toBeTruthy();
  });

  it("says plainly when no reason was recorded, rather than 'Unknown error.'", () => {
    render(<GenerationProgressView examId={EXAM_ID} initialStatus="failed" />);

    expect(screen.getByText("No reason was recorded for this failure.")).toBeTruthy();
  });

  it("shows the reason the server recorded", async () => {
    // Generation fails while the screen is polling, which is how a student
    // meets it. The reason travels the whole way to the page.
    const reason =
      'Failed query: insert into "coverage_history" …\n' +
      '  caused by: column reference "times_assessed" is ambiguous [42702]';

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "failed", progress: { stage: "validating" }, error: reason }),
      }),
    );

    render(<GenerationProgressView examId={EXAM_ID} initialStatus="generating" />);

    await waitFor(() => expect(screen.getByText("Generation failed")).toBeTruthy());

    // Matched on the node rather than the string: the reason is several lines,
    // and the whole chain has to survive, not just the wrapper message.
    const shown = screen.getByText(/Failed query/);
    expect(shown.textContent).toContain('column reference "times_assessed" is ambiguous');
    expect(shown.textContent).toContain("caused by:");
    expect(screen.getByText(EXAM_ID)).toBeTruthy();
  });
});

describe("a paper in the history list", () => {
  const base = { id: EXAM_ID, latestAttemptId: null, latestAttemptMarked: false };

  it("offers a retry when generation failed, and no link into a paper that was never written", () => {
    render(<PaperActions row={{ ...base, status: "failed" }} />);

    const link = screen.getByRole("link", { name: "Try again" });
    expect(link.getAttribute("href")).toBe("/build");
    // The Open link used to sit here and led to a bare 404.
    expect(screen.queryByRole("link", { name: "Open" })).toBeNull();
  });

  it("offers to resume a paper that is part-generated", () => {
    // Generation advances while the progress screen is open, so a paper left
    // half-built needs a way back to it — otherwise it sits at "generating"
    // for ever, which is exactly what the history list filled up with.
    render(<PaperActions row={{ ...base, status: "generating" }} />);

    expect(screen.getByRole("link", { name: "Resume" }).getAttribute("href")).toBe(
      `/generating/${EXAM_ID}`,
    );
  });

  it("opens a ready paper at its instructions", () => {
    render(<PaperActions row={{ ...base, status: "ready" }} />);

    expect(screen.getByRole("link", { name: "Open" }).getAttribute("href")).toBe(
      `/exam/${EXAM_ID}/instructions`,
    );
  });

  it("reviews a paper that has been marked", () => {
    render(
      <PaperActions
        row={{ ...base, status: "ready", latestAttemptId: "attempt-1", latestAttemptMarked: true }}
      />,
    );

    expect(screen.getByRole("link", { name: "Review" }).getAttribute("href")).toBe(
      "/results/attempt-1",
    );
  });
});
