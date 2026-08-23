import { expect, test, type Page } from "@playwright/test";

/**
 * The administrator screens: model settings, and the account lifecycle from
 * "created with a temporary password" to "signed in with their own".
 *
 * The suite's shared session is the administrator. The student half runs in
 * fresh browser contexts so it carries no cookie of its own.
 *
 * The lifecycle is one test rather than several: it creates an account, and
 * splitting it would leave later tests depending on state an earlier one
 * happened to leave behind.
 */

async function signIn(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /Sign in/i }).click();
}

test.describe("model settings", () => {
  test("saves an endpoint and keeps the key out of the page", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Model settings" })).toBeVisible();

    await page.getByLabel("Base URL").fill("https://endpoint.example/v1");
    await page.getByLabel("Model", { exact: true }).fill("a-test-model");
    await page.getByLabel("API key").fill("super-secret-key");
    await page.getByRole("button", { name: "Save settings" }).click();

    await expect(page.getByText("Settings saved.")).toBeVisible();
    await expect(page.getByLabel("Base URL")).toHaveValue("https://endpoint.example/v1");
    await expect(page.getByText("A key is saved.", { exact: false })).toBeVisible();

    // The key must not come back to the browser in any form.
    expect(await page.content()).not.toContain("super-secret-key");
  });

  test("a saved key survives a save that leaves the field blank", async ({ page }) => {
    await page.goto("/settings");
    await page.getByLabel("Model", { exact: true }).fill("a-second-model");
    await page.getByRole("button", { name: "Save settings" }).click();

    await expect(page.getByText("A key is saved.", { exact: false })).toBeVisible();
    await expect(page.getByLabel("Model", { exact: true })).toHaveValue("a-second-model");
  });

  test("rejects a base URL that is not one", async ({ page }) => {
    await page.goto("/settings");
    await page.getByLabel("Base URL").fill("not-a-url");
    await page.getByRole("button", { name: "Save settings" }).click();

    await expect(
      page.getByText("The base URL must start with http:// or https://."),
    ).toBeVisible();
  });
});

test.describe("accounts", () => {
  test("the only administrator cannot be demoted, and has no disable control", async ({
    page,
  }) => {
    await page.goto("/admin/users");

    const self = page.locator("article", { hasText: "(you)" });
    await expect(self.getByRole("button", { name: "Disable" })).toHaveCount(0);

    await self.getByLabel("Role").selectOption("student");
    await self.getByRole("button", { name: "Change" }).click();
    await expect(page.getByText("This is the only administrator account.")).toBeVisible();
  });

  test("an account is created, forced to choose a password, and kept out of the admin screens", async ({
    page,
    browser,
  }) => {
    const username = `e2e-student-${Date.now()}`;
    const temporary = "temporary-password-123";
    const chosen = "the-student-own-password";

    // --- an administrator creates it
    await page.goto("/admin/users");
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Temporary password").fill(temporary);
    await page.getByRole("button", { name: "Add account" }).click();

    await expect(page.getByRole("heading", { name: username })).toBeVisible();

    // --- it signs in and is allowed exactly one page
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const student = await context.newPage();

    await signIn(student, username, temporary);
    await expect(student).toHaveURL(/\/account\/password/);

    await student.goto("/build");
    await expect(student).toHaveURL(/\/account\/password/);

    // --- it chooses its own password
    await student.getByLabel("Current password").fill(temporary);
    await student.getByLabel("New password", { exact: true }).fill(chosen);
    await student.getByLabel("Confirm new password").fill(chosen);
    await student.getByRole("button", { name: "Change password" }).click();

    await expect(student).toHaveURL(/\/build/);
    await expect(
      student.getByRole("button", { name: /Generate 100-mark Trial/ }),
    ).toBeVisible();

    // --- the administrator screens are neither linked nor reachable
    await expect(student.getByRole("link", { name: "Model settings" })).toHaveCount(0);
    await expect(student.getByRole("link", { name: "Accounts" })).toHaveCount(0);

    await student.goto("/settings");
    await expect(student).not.toHaveURL(/\/settings/);
    await student.goto("/admin/users");
    await expect(student).not.toHaveURL(/\/admin\/users/);

    // --- and the temporary password no longer works
    await context.close();
    const second = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const retry = await second.newPage();
    await signIn(retry, username, temporary);
    await expect(retry.getByText("That username and password do not match.")).toBeVisible();
    await second.close();
  });
});
