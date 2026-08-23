import { expect, test, type Page } from "@playwright/test";

/**
 * Accessibility requirements from CLAUDE.md §24.
 *
 * These are functional requirements, not decoration: the exam tools must work,
 * the paper must be answerable from the keyboard, and the font-size and colour
 * controls must actually change the rendered page.
 */

const SELECTION = ["ssa.2.7", "ssa.2.1", "pwa.1.4"];

async function openAttempt(page: Page) {
  const created = await page.request.post("/api/exams", {
    data: { syllabusItemIds: SELECTION },
  });
  const { examId } = (await created.json()) as { examId: string };

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const status = await page.request.get(`/api/exams/${examId}/status`);
    if (((await status.json()) as { status: string }).status === "ready") break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const started = await page.request.post(`/api/exams/${examId}/attempts`);
  const { attemptId } = (await started.json()) as { attemptId: string };
  await page.request.post(`/api/attempts/${attemptId}/begin-working`);
  await page.goto(`/exam/${examId}/attempt/${attemptId}`);
  await page.getByRole("heading", { name: /^Question 1 / }).waitFor();
  return { examId, attemptId };
}

test.describe("exam accessibility", () => {
  test("the paper can be navigated and answered from the keyboard", async ({ page }) => {
    await openAttempt(page);

    // Tab into the page and reach the first response control without a pointer.
    let reachedRadio = false;
    for (let press = 0; press < 40; press += 1) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => {
        const element = document.activeElement;
        return element
          ? { tag: element.tagName, type: element.getAttribute("type") }
          : null;
      });
      if (focused?.tag === "INPUT" && focused.type === "radio") {
        reachedRadio = true;
        break;
      }
    }
    expect(reachedRadio, "no response control was reachable by Tab").toBe(true);

    // Space selects the focused option.
    await page.keyboard.press("Space");
    await expect(page.locator('main input[type="radio"]:checked')).toHaveCount(1);
  });

  test("every question navigator button announces its state", async ({ page }) => {
    await openAttempt(page);

    const labels = await page
      .locator('nav[aria-label="Question navigation"] button')
      .evaluateAll((buttons) =>
        buttons.map((button) => button.getAttribute("aria-label") ?? ""),
      );

    const questionLabels = labels.filter((label) => label.startsWith("Question "));
    expect(questionLabels.length).toBeGreaterThan(0);
    for (const label of questionLabels) {
      // Colour alone is not sufficient: state must be in the accessible name.
      expect(label).toMatch(/, (answered|not answered)$|, flagged/);
    }
  });

  test("the font size control changes the rendered size", async ({ page }) => {
    await openAttempt(page);

    const sizeOf = () =>
      page.evaluate(() => {
        const root = document.querySelector("[data-exam-theme]");
        return root ? getComputedStyle(root).fontSize : "";
      });

    const before = await sizeOf();
    await page.getByRole("button", { name: /FONT SIZE/ }).click();
    await page.getByRole("option", { name: "Extra large" }).click();
    const after = await sizeOf();

    expect(parseFloat(after)).toBeGreaterThan(parseFloat(before));
  });

  test("the colour control switches to a high-contrast theme", async ({ page }) => {
    await openAttempt(page);

    await page.getByRole("button", { name: /COLOUR/ }).click();
    await page.getByRole("option", { name: "White on black" }).click();

    await expect(page.locator("[data-exam-theme]")).toHaveAttribute(
      "data-exam-theme",
      "high-contrast",
    );

    const canvas = await page.evaluate(() => {
      const root = document.querySelector("[data-exam-theme]");
      return root ? getComputedStyle(root).backgroundColor : "";
    });
    expect(canvas).toBe("rgb(0, 0, 0)");
  });

  test("flagging is available during reading time and persists", async ({ page }) => {
    const created = await page.request.post("/api/exams", {
      data: { syllabusItemIds: SELECTION },
    });
    const { examId } = (await created.json()) as { examId: string };
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const status = await page.request.get(`/api/exams/${examId}/status`);
      if (((await status.json()) as { status: string }).status === "ready") break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const started = await page.request.post(`/api/exams/${examId}/attempts`);
    const { attemptId } = (await started.json()) as { attemptId: string };

    // Deliberately stay in reading time (CLAUDE.md §10.3).
    await page.goto(`/exam/${examId}/attempt/${attemptId}`);
    await page.getByRole("heading", { name: /^Question 1 / }).waitFor();
    await expect(page.getByText(/Reading time\./)).toBeVisible();

    // Wait for the flag to be stored before reloading. The UI updates
    // optimistically, so asserting on the label alone would race the request.
    const flagged = page.waitForResponse(
      (response) =>
        response.url().includes("/flags") && response.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: "Flag this question" }).click();
    await expect(
      page.locator('nav button[aria-label*="Question 1, flagged"]'),
    ).toHaveCount(1);
    expect((await flagged).ok()).toBe(true);

    await page.reload();
    await expect(
      page.locator('nav button[aria-label*="Question 1, flagged"]'),
    ).toHaveCount(1);
  });

  test("the info dialog is focus-trapped and closes on Escape", async ({ page }) => {
    await openAttempt(page);

    await page.getByRole("button", { name: "Exam information and help" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Total marks");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("headings, landmarks and the disclaimer are present outside exam mode", async ({
    page,
  }) => {
    await page.goto("/build");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByLabel("Search syllabus content")).toBeVisible();
    await expect(
      page.getByText(/independent practice tool for NSW HSC Software Engineering/i),
    ).toBeVisible();
    await expect(page.getByText(/Not affiliated with/i)).toBeVisible();
  });
});
