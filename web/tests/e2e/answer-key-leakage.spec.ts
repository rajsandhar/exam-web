import { expect, test } from "@playwright/test";

/**
 * Answer keys and marking guidelines must not reach the client before
 * submission (CLAUDE.md §20, §23; SPEC_ADDENDUM.md §7).
 *
 * This asserts against the **raw response body**, not the rendered DOM. In the
 * App Router the classic failure is a server component passing a full row to a
 * client component: the key is then serialised into the RSC payload inside the
 * page source, invisible in the UI, where a DOM-based test would never see it.
 */

const SELECTION = ["ssa.2.7", "ssa.2.1", "pwa.1.4"];

/** Strings that exist only in an answer key or a marking guideline. */
const KEY_FIELD_NAMES = [
  "answerKey",
  "answer_key_json",
  "markingGuideline",
  "marking_guideline_json",
  "correctOptionId",
  "correctOptionIds",
  "correctOrder",
  "modelAnswer",
  "expectedConcepts",
  "referenceSolution",
  "hiddenTests",
  "referenceQuery",
  "expectedResult",
  "doNotCredit",
  "distractorNotes",
  "rubricMarked",
];

/** Verbatim content from the fixture's keys — the strongest possible signal. */
const KEY_CONTENT = [
  "A parameterised query binds the surname as a value",
  "An immutable record attributing an action to an identified user",
  "The query should be parameterised so the surname is bound as a value",
  "Sustained judgement with correct remediation",
  "counts a single absence",
  "orders from most absences to fewest",
  "Bundanoon and Wombeyan fall out",
];

test("no answer key or marking guideline reaches the exam page", async ({
  page,
  request,
}) => {
  await page.goto("/build");
  await page.evaluate((selection) => {
    window.localStorage.setItem(
      "hsc-se.selected-syllabus-items.v1",
      JSON.stringify(selection),
    );
  }, SELECTION);

  const created = await request.post("/api/exams", {
    data: { syllabusItemIds: SELECTION },
  });
  expect(created.ok()).toBeTruthy();
  const { examId } = (await created.json()) as { examId: string };

  // Wait for generation to finish.
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const status = await request.get(`/api/exams/${examId}/status`);
    const body = (await status.json()) as { status: string };
    if (body.status === "ready") break;
    if (body.status === "failed") throw new Error("Generation failed.");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const attemptResponse = await request.post(`/api/exams/${examId}/attempts`);
  const { attemptId } = (await attemptResponse.json()) as { attemptId: string };

  /* --------------------------------------------------- the attempt page */
  const attemptPage = await request.get(`/exam/${examId}/attempt/${attemptId}`);
  expect(attemptPage.ok()).toBeTruthy();
  const html = await attemptPage.text();

  // The page must actually contain the paper, or this test proves nothing.
  expect(html).toContain("Question");
  expect(html.length).toBeGreaterThan(10_000);

  for (const field of KEY_FIELD_NAMES) {
    expect(html, `raw attempt page contains "${field}"`).not.toContain(field);
  }
  for (const content of KEY_CONTENT) {
    expect(
      html,
      `raw attempt page contains answer-key text: "${content.slice(0, 40)}…"`,
    ).not.toContain(content);
  }

  /* --------------------------------- every request the page itself makes */
  const bodies: string[] = [];
  page.on("response", async (response) => {
    const type = response.headers()["content-type"] ?? "";
    if (!/text|json|javascript/.test(type)) return;
    try {
      bodies.push(await response.text());
    } catch {
      // Redirects and aborted responses have no body.
    }
  });

  await page.goto(`/exam/${examId}/attempt/${attemptId}`);
  await page.getByRole("heading", { name: /^Question 1 / }).waitFor();
  await page.waitForTimeout(1500);

  const combined = bodies.join("\n");
  for (const content of KEY_CONTENT) {
    expect(
      combined,
      `a response fetched by the exam page contains: "${content.slice(0, 40)}…"`,
    ).not.toContain(content);
  }

  /* ------------------------------------ and the same after a navigation */
  await page.locator('nav button[aria-label^="Question 2,"]').click();
  await page.waitForTimeout(500);
  for (const content of KEY_CONTENT) {
    expect(bodies.join("\n")).not.toContain(content);
  }
});

test("hidden Python tests are not served during the attempt", async ({ request }) => {
  const created = await request.post("/api/exams", {
    data: { syllabusItemIds: ["proj.4.2", "pwa.2.13"] },
  });
  const { examId } = (await created.json()) as { examId: string };

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const status = await request.get(`/api/exams/${examId}/status`);
    if (((await status.json()) as { status: string }).status === "ready") break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const attemptResponse = await request.post(`/api/exams/${examId}/attempts`);
  const { attemptId } = (await attemptResponse.json()) as { attemptId: string };

  const html = await (
    await request.get(`/exam/${examId}/attempt/${attemptId}`)
  ).text();

  // The starter code is meant to be visible; the reference solution is not.
  expect(html).toContain("students_with_absences");
  expect(html).not.toContain("from collections import Counter");
  expect(html).not.toContain("hiddenTests");
  expect(html).not.toContain("counts a single absence");
});
