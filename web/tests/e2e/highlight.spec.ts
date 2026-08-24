import { expect, test, type Page } from "@playwright/test";


/**
 * The highlight tool (CLAUDE.md §10.5, §24).
 *
 * A QA pass reported the tool as doing nothing, from a probe that set a `Range`
 * with script and clicked the button. That is not the interaction: the button
 * turns a mode on, and a highlight is made by selecting text while it is on.
 * These drive the real thing — a mouse drag across rendered text — because that
 * is the only way to find out whether it works.
 */

const SELECTION = ["ssa.2.7", "ssa.2.1", "pwa.1.4", "pwa.2.11", "auto.1.6"];

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
  await page.getByRole("button", { name: /Generate 100-mark Trial/ }).click();
  await expect(page).toHaveURL(/\/exam\/[^/]+\/instructions/, { timeout: 60_000 });
  await page.getByRole("button", { name: /START/ }).click();
  await expect(page).toHaveURL(/\/exam\/[^/]+\/attempt\/[^/]+/, { timeout: 30_000 });
  return page.url().split("/attempt/")[1]!;
}

/** Drags across the element, as a student does. */
async function selectByDragging(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
}

const REGION = "[data-highlight-region]";

test.describe("the highlight tool", () => {
  test("marks selected question text, and keeps it across a reload", async ({ page }) => {
    const attemptId = await generateAndStart(page);

    // Reading time: the banner says highlighting is allowed, so it must be.
    await expect(page.locator(REGION).first()).toBeVisible();
    await page.getByRole("button", { name: /highlighting/i }).click();

    // The POST is fire-and-forget in the UI, so wait for it rather than racing
    // the reload below — the same treatment `exam-flow` gives the /ui PATCH.
    const stored = page.waitForResponse(
      (r) => r.url().includes("/highlights") && r.request().method() === "POST",
    );
    await selectByDragging(page, REGION);
    await expect(page.locator("mark.exam-highlight")).toHaveCount(1);
    expect((await stored).status()).toBe(201);
    const highlighted = await page.locator("mark.exam-highlight").first().textContent();
    expect(highlighted?.trim().length).toBeGreaterThan(1);

    // Persisted, not just held in the component.
    await page.reload();
    await expect(page.locator("mark.exam-highlight")).toHaveCount(1);
    expect(await page.locator("mark.exam-highlight").first().textContent()).toBe(highlighted);

    // And clicking one removes it, as the INFO panel promises.
    const deleted = page.waitForResponse(
      (r) => r.url().includes("/highlights") && r.request().method() === "DELETE",
    );
    await page.locator("mark.exam-highlight").first().click();
    await expect(page.locator("mark.exam-highlight")).toHaveCount(0);
    expect((await deleted).ok()).toBe(true);

    await page.reload();
    await expect(page.locator("mark.exam-highlight")).toHaveCount(0);
    expect(attemptId).toBeTruthy();
  });

  test("does nothing while the tool is off", async ({ page }) => {
    await generateAndStart(page);
    await expect(page.locator(REGION).first()).toBeVisible();

    await selectByDragging(page, REGION);
    await expect(page.locator("mark.exam-highlight")).toHaveCount(0);
  });
});
