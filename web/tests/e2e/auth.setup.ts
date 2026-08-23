import { expect, test as setup } from "@playwright/test";

import { E2E_ADMIN, STORAGE_STATE } from "./accounts";

/**
 * Signs in once and saves the cookie for every other spec.
 *
 * The e2e database is re-created by the web server command, so on a clean run
 * no account exists and `/` lands on the first-run setup screen. On a re-run
 * against an existing database the account is already there and this signs in
 * instead — both paths end with a usable session.
 */
setup("authenticate", async ({ page }) => {
  await page.goto("/build");

  if (page.url().includes("/setup")) {
    await page.getByLabel("Username").fill(E2E_ADMIN.username);
    await page.getByLabel("Password", { exact: true }).fill(E2E_ADMIN.password);
    await page.getByLabel("Confirm password").fill(E2E_ADMIN.password);
    await page.getByRole("button", { name: /Create account/i }).click();
  } else {
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("Username").fill(E2E_ADMIN.username);
    await page.getByLabel("Password").fill(E2E_ADMIN.password);
    await page.getByRole("button", { name: /Sign in/i }).click();
  }

  await expect(page).toHaveURL(/\/build/, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.context().storageState({ path: STORAGE_STATE });
});
