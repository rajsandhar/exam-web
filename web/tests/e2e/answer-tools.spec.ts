import { expect, test, type Page } from "@playwright/test";

import fixtureJson from "../../src/lib/ai/fixtures/fixture-paper.json";

/**
 * The JSON import gives every question its own literal type, so the array is
 * described here once rather than fighting it at each use.
 */
type FixturePart = {
  rendererType: string;
  marks: number;
  config: {
    tables?: Array<{ name: string; table: { columns: string[]; rows: string[][] } }>;
  };
};
const fixture = fixtureJson as unknown as {
  groups: Array<{ position: number; parts: FixturePart[] }>;
};

/**
 * The controls a NESA answer area carries: full screen on every large editor,
 * Reset DB on a SQL question, and a hide/show toggle on each sub-part of a
 * multipart question.
 */

const SELECTION = ["ssa.2.7", "ssa.2.1", "pwa.1.4", "pwa.2.11", "auto.1.6"];

function positionOf(rendererType: string): number {
  const group = fixture.groups.find((candidate) =>
    candidate.parts.some((part) => part.rendererType === rendererType),
  );
  if (!group) throw new Error(`sample paper has no ${rendererType} question`);
  return group.position;
}

/** Generates a paper, starts it and ends reading time. */
async function openAttempt(page: Page) {
  await page.goto("/build");
  await page.evaluate((selection) => {
    window.localStorage.setItem(
      "hsc-se.selected-syllabus-items.v1",
      JSON.stringify(selection),
    );
  }, SELECTION);
  await page.reload();

  await page.getByRole("button", { name: /Generate 100-mark Trial/ }).click();
  await page.waitForURL(/\/exam\/[^/]+\/instructions/, { timeout: 60_000 });
  await page.getByRole("button", { name: /START/ }).click();
  await page.waitForURL(/\/attempt\//, { timeout: 30_000 });

  const attemptId = page.url().split("/attempt/")[1]!;
  await page.request.post(`/api/attempts/${attemptId}/begin-working`);
  await page.reload();
  await expect(page.getByText("Time remaining")).toBeVisible();
}

async function goToQuestion(page: Page, position: number) {
  const target = page.locator(`nav button[aria-label^="Question ${position},"]`);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (await target.count()) break;
    await page.locator('button[aria-label="Show next question numbers"]').click();
  }
  await target.click();
  await expect(
    page.getByRole("heading", { name: new RegExp(`^Question ${position} `) }),
  ).toBeVisible();
}

test.describe("answer tools", () => {
  test("every large answer area can go full screen and come back", async ({ page }) => {
    await openAttempt(page);

    for (const renderer of ["pseudocode_editor", "python_editor", "sql_editor"]) {
      await goToQuestion(page, positionOf(renderer));

      const open = page.getByRole("button", { name: "Full screen" });
      await expect(open, `${renderer} offers full screen`).toBeVisible();
      await open.click();

      const panel = page.getByRole("dialog");
      await expect(panel).toBeVisible();
      await expect(page.getByRole("button", { name: "Exit full screen" })).toBeVisible();

      // Escape is what anyone tries first.
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
      await expect(page.getByRole("button", { name: "Full screen" })).toBeVisible();
    }
  });

  test("a SQL question keeps its data between runs and Reset DB restores it", async ({
    page,
  }) => {
    await openAttempt(page);
    await goToQuestion(page, positionOf("sql_editor"));

    const run = page.getByRole("button", { name: /Run query/ });

    // The SQL editor is Monaco once it loads, so there is no textarea to fill —
    // the visible one is its hidden IME field. `insertText` puts the whole
    // statement in at once; typing key by key raced Monaco's own handling and
    // lost a character ("DLETE FROM …").
    const write = async (sql: string) => {
      const editor = page.locator("main .monaco-editor").first();
      await editor.click();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.insertText(sql);
      await expect(editor).toContainText(sql.slice(0, 12));
    };

    // Read the table to alter from the question itself rather than naming it.
    const sqlPart = fixture.groups
      .flatMap((group) => group.parts)
      .find((part) => part.rendererType === "sql_editor")!;
    const source = sqlPart.config.tables![0]!;
    const table = source.name;
    // A value that only exists in the original data, so its presence in the
    // result is the test of whether the rows are back.
    const knownValue = source.table.rows[0]![0]!;

    // Delete everything, then confirm the deletion persisted into the next run.
    // Before the session existed the database was rebuilt each time, so this
    // returned the original rows and no question could ask for a change at all.
    await write(`DELETE FROM ${table};`);
    await run.click();
    await expect(
      page.getByText("The statement ran successfully and returned no rows."),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/changed the data/)).toBeVisible();

    // sql.js cannot tell an empty SELECT from a statement that returns nothing,
    // so the outcome is read from the data rather than the wording: the row is
    // gone, and it comes back after Reset DB.
    // Scoped to the result region: the source tables are still on the page, so
    // "the last table" would have been the stimulus, not the answer.
    const result = page.locator(`main div[aria-live="polite"]`).first();

    await write(`SELECT * FROM ${table};`);
    await run.click();
    await expect(result).toBeVisible({ timeout: 30_000 });
    await expect(result).not.toContainText(knownValue);

    await page.getByRole("button", { name: "Reset DB" }).click();
    await write(`SELECT * FROM ${table};`);
    await run.click();
    await expect(result).toContainText(knownValue, { timeout: 30_000 });
  });

  test("sub-parts of a multipart question can be hidden, keeping the answer", async ({
    page,
  }) => {
    await openAttempt(page);

    // A group with two response parts, so the toggle is offered.
    const multipart = fixture.groups.find(
      (group) => group.parts.filter((part) => part.marks > 0).length > 1,
    )!;
    await goToQuestion(page, multipart.position);

    // Toggle and answer must come from the same sub-part, or this proves
    // nothing about whether collapsing preserved anything.
    // Filtered on the answer box, not on the toggle's own text: filtering on
    // "hide" would re-resolve to a different sub-part the moment one is
    // collapsed, and the test would silently follow it.
    const block = page
      .locator("main section")
      .filter({ has: page.locator('[role="textbox"]') })
      .last();
    const toggle = block.getByRole("button", { name: /^(hide|show)$/ });
    const answer = block.locator('[role="textbox"]').first();

    await answer.fill("An answer that must survive being collapsed.");

    await toggle.click();
    await expect(toggle).toHaveText("show");
    await expect(answer).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveText("hide");
    await expect(answer).toContainText("must survive being collapsed");
  });
});
