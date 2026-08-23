import { expect, test } from "@playwright/test";

import { E2E_ADMIN } from "./accounts";

/**
 * Sign-in, sign-out and the guards around them.
 *
 * The interesting cases run in a signed-out browser context, so they use
 * `test.use({ storageState: … })` rather than the suite's shared cookie.
 */

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("every page sends an anonymous visitor to sign in", async ({ page }) => {
    for (const target of ["/build", "/history", "/results/anything"]) {
      await page.goto(target);
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test("the sign-in screen keeps where you were going", async ({ page }) => {
    await page.goto("/history");
    await expect(page).toHaveURL(/\/login\?next=%2Fhistory/);

    await page.getByLabel("Username").fill(E2E_ADMIN.username);
    await page.getByLabel("Password").fill(E2E_ADMIN.password);
    await page.getByRole("button", { name: /Sign in/i }).click();

    await expect(page).toHaveURL(/\/history$/);
  });

  test("the API refuses an anonymous request rather than redirecting it", async ({
    request,
  }) => {
    const response = await request.post("/api/exams", {
      data: { selectedSyllabusItemIds: ["ssa.2.7"] },
    });
    expect(response.status()).toBe(401);
  });

  test("a wrong password says the same thing as an unknown username", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill(E2E_ADMIN.username);
    await page.getByLabel("Password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: /Sign in/i }).click();
    const wrongPassword = await page.getByRole("alert").textContent();

    await page.goto("/login");
    await page.getByLabel("Username").fill("nobody-has-this-name");
    await page.getByLabel("Password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: /Sign in/i }).click();
    const unknownUser = await page.getByRole("alert").textContent();

    expect(wrongPassword).toEqual(unknownUser);
  });

  test("setup is closed once an administrator exists", async ({ page }) => {
    await page.goto("/setup");
    await expect(page).toHaveURL(/\/login/);
  });

  // Signs in on its own session rather than the suite's shared cookie, because
  // signing out deletes the session row and would strand every later spec.
  test("signing out ends the session for good", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill(E2E_ADMIN.username);
    await page.getByLabel("Password").fill(E2E_ADMIN.password);
    await page.getByRole("button", { name: /Sign in/i }).click();
    await expect(page).toHaveURL(/\/build/);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);

    // Going back must not resurrect the session.
    await page.goto("/build");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("signed in", () => {
  test("the header names the account and offers sign out", async ({ page }) => {
    await page.goto("/build");
    await expect(page.getByText(E2E_ADMIN.username)).toBeVisible();
    await expect(page.getByText("Admin", { exact: true })).toBeVisible();
  });
});
