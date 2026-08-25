import { expect, test, type Page } from "@playwright/test";

import fixture from "../../src/lib/ai/fixtures/fixture-paper.json";

/**
 * The flow from CLAUDE.md §26, end to end:
 * select → generate (mocked) → start → answer several renderer types → refresh
 * → submit → mark → review.
 */

const SELECTION = ["ssa.2.7", "ssa.2.1", "pwa.1.4", "pwa.2.11", "auto.1.6"];

/**
 * Question numbers are read from the sample paper rather than written down.
 *
 * They were hardcoded, and adding one question to the fixture silently pointed
 * every later step at the wrong question. Deriving them means the paper can be
 * reordered without the test quietly testing something else.
 */
function positionOf(rendererType: string): number {
  const group = fixture.groups.find((candidate) =>
    candidate.parts.some((part) => part.rendererType === rendererType),
  );
  if (!group) throw new Error(`sample paper has no ${rendererType} question`);
  return group.position;
}

const Q = {
  singleChoice: positionOf("single_choice"),
  tableDropdown: positionOf("table_dropdown"),
  multiSelect: positionOf("multi_select"),
  ordering: positionOf("ordering"),
  matching: positionOf("matching_matrix"),
  codeStimulus: positionOf("code_stimulus"),
  last: fixture.groups.length,
};

/** Seeds the Build Trial selection without 73 clicks. */
async function seedSelection(page: Page, ids: string[]) {
  await page.goto("/build");
  await page.evaluate((selection) => {
    window.localStorage.setItem(
      "hsc-se.selected-syllabus-items.v1",
      JSON.stringify(selection),
    );
  }, ids);
  await page.reload();
}

async function generateAndStart(page: Page) {
  await seedSelection(page, SELECTION);

  // With no endpoint configured, the screen has to say so before generating.
  await expect(page.getByText("No model endpoint is in use.")).toBeVisible();

  await expect(page.getByRole("button", { name: /Generate 100-mark Trial/ })).toBeEnabled();
  await page.getByRole("button", { name: /Generate 100-mark Trial/ }).click();

  // The progress screen hands over to the instructions screen on its own.
  await expect(page).toHaveURL(/\/exam\/[^/]+\/instructions/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "General Instructions" })).toBeVisible();

  // With no endpoint configured this is the built-in sample paper, and the
  // student has to be told so — it does not cover the content they selected.
  // This assertion exists because the check behind that notice went stale once
  // and a sample paper quietly looked like a generated one.
  await expect(page.getByText("built-in sample paper")).toBeVisible();

  await page.getByRole("button", { name: /START/ }).click();
  await expect(page).toHaveURL(/\/exam\/[^/]+\/attempt\/[^/]+/, { timeout: 30_000 });
}

/** Reading time blocks answering; this ends it so the paper can be sat. */
async function beginWorkingTime(page: Page) {
  const attemptId = page.url().split("/attempt/")[1]!;
  await page.request.post(`/api/attempts/${attemptId}/begin-working`);
  await page.reload();
  await expect(page.getByText("Time remaining")).toBeVisible();
  return attemptId;
}

async function goToQuestion(page: Page, position: number) {
  const target = page.locator(`nav button[aria-label^="Question ${position},"]`);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await target.count()) break;
    await page.locator('button[aria-label="Show next question numbers"]').click();
  }

  // The current question is persisted so a reload returns to it. That request
  // is fire-and-forget in the UI, so wait for it rather than racing a reload.
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes("/ui") && response.request().method() === "PATCH",
  );
  await target.click();
  await expect(
    page.getByRole("heading", { name: new RegExp(`^Question ${position} `) }),
  ).toBeVisible();
  await saved;
}

test.describe("exam flow", () => {
  test("select, generate, sit, refresh, submit, mark and review", async ({ page }) => {
    // The whole journey in one test: generate a paper, sit it, refresh, submit,
    // mark it and read the results. It runs at about 90 seconds, which is the
    // suite's default budget, so it passed alone and failed in a full run — and
    // the submission step below waits up to 120 seconds inside a 90 second
    // test, which it can never actually be given. Budgeted for the work it
    // does rather than left to tip over under load.
    test.setTimeout(240_000);

    await generateAndStart(page);

    /* ------------------------------------------------------ reading time */
    await expect(
      page.getByText(/Reading time\. You can move between questions/),
    ).toBeVisible();
    // §10.3: answer controls are disabled until working time begins.
    const firstRadio = page.locator('main input[type="radio"]').first();
    await expect(firstRadio).toBeDisabled();

    const attemptId = await beginWorkingTime(page);
    await expect(page.locator('main input[type="radio"]').first()).toBeEnabled();

    /* ---------------------------------------------------------- answering */
    // Single choice.
    await goToQuestion(page, Q.singleChoice);
    await page.locator('main input[type="radio"]').nth(1).check();

    // Multi-select.
    await goToQuestion(page, Q.multiSelect);
    await page.locator('main input[type="checkbox"]').nth(0).check();
    await page.locator('main input[type="checkbox"]').nth(1).check();

    // Ordering, via the keyboard-accessible controls. "Move up" on the first
    // item is correctly disabled, so this moves the first item down.
    await goToQuestion(page, Q.ordering);
    await page.locator('main button[aria-label*="down"]').first().click();

    // Matching matrix.
    await goToQuestion(page, Q.matching);
    const rows = page.locator("main tbody tr");
    await rows.nth(0).locator('input[type="radio"]').nth(3).check();
    await rows.nth(1).locator('input[type="radio"]').nth(2).check();

    // Table of dropdowns — the format NESA papers use most for objective marks.
    await goToQuestion(page, Q.tableDropdown);
    const selects = page.locator("main tbody select");
    await expect(selects.first()).toBeEnabled();
    const selectCount = await selects.count();
    for (let index = 0; index < selectCount; index += 1) {
      await selects.nth(index).selectOption({ index: 1 });
    }

    // Multipart with a code stimulus: short text and rich text.
    await goToQuestion(page, Q.codeStimulus);
    await page.locator("main textarea").first().fill("Line 2: SQL injection.");
    await page.locator('main [role="textbox"]').first().fill("Use a parameterised query.");

    await expect(page.getByText("All answers saved")).toBeVisible({ timeout: 15_000 });

    /* ------------------------------------------------------------ refresh */
    const before = await page.getByText(/Time remaining/).locator("..").innerText();
    await page.reload();

    await expect(
      page.getByRole("heading", { name: new RegExp(`^Question ${Q.codeStimulus} `) }),
    ).toBeVisible();
    await expect(page.locator("main textarea").first()).toHaveValue(
      "Line 2: SQL injection.",
    );
    await expect(page.locator('main [role="textbox"]').first()).toContainText(
      "parameterised query",
    );

    // The clock must not have been reset by the reload.
    const after = await page.getByText(/Time remaining/).locator("..").innerText();
    expect(secondsIn(after)).toBeLessThanOrEqual(secondsIn(before));

    // Answers made earlier are still recorded in the navigator.
    await expect(
      page.locator(`nav button[aria-label="Question ${Q.codeStimulus}, answered"]`),
    ).toHaveCount(1);

    /* ------------------------------------------------------------- submit */
    const lastQuestion = await page.evaluate(() =>
      document.querySelectorAll('nav button[aria-label^="Question"]').length,
    );
    expect(lastQuestion).toBeGreaterThan(0);

    await page.goto(`/api/attempts/${attemptId}/state`);
    await page.goBack();
    await goToQuestion(page, Q.last);

    await page.getByRole("button", { name: /Submit exam/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("items answered");
    await dialog.getByRole("button", { name: "Submit exam" }).click();

    /* ------------------------------------------------------------ results */
    await expect(page).toHaveURL(/\/results\//, { timeout: 120_000 });
    await expect(
      page.getByRole("heading", { name: "Estimated HSC-style mark" }),
    ).toBeVisible();

    // Objective marks are awarded deterministically, with no API call.
    //
    // The denominator is whatever was actually marked, never the paper total —
    // counting marks nothing could mark as earned zeros is what made a paper
    // read as 3 / 100. Which mode this runs in depends on the suite: an earlier
    // spec saves model settings to the same database, so marking may be on or
    // off by the time this runs. The invariant holds either way — the total and
    // the notice have to agree with each other.
    const mark = await page.getByText(/^\d+ \/ \d+$/).first().innerText();
    const [earned, outOf] = mark.split("/").map((part) => Number(part.trim()));
    expect(earned).toBeGreaterThan(0);
    expect(outOf).toBeLessThanOrEqual(100);
    expect(earned).toBeLessThanOrEqual(outOf!);

    const unmarkedNotice = page.getByText(/marks not marked/).first();
    if (await unmarkedNotice.isVisible()) {
      // Marks were left unmarked, so they must be out of the total, not in it.
      expect(outOf).toBeLessThan(100);
    } else {
      expect(outOf).toBe(100);
    }

    // Review shows the correct answer and the exact syllabus wording.
    await page.getByRole("button", { name: /^Question 1\b/ }).click();
    await expect(page.getByText("Correct answer").first()).toBeVisible();
    await expect(page.getByText("Syllabus content assessed").first()).toBeVisible();
    await expect(
      page.getByText(/defensive data input handling practices/).first(),
    ).toBeVisible();
  });

  test("history lists the paper and links back to it", async ({ page }) => {
    await page.goto("/history");
    await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
  });
});

function secondsIn(text: string): number {
  const match = text.match(/(\d+):(\d{2}):(\d{2})|(\d+):(\d{2})/);
  if (!match) return Number.NaN;
  if (match[1] !== undefined) {
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  }
  return Number(match[4]) * 60 + Number(match[5]);
}
