/** The account the end-to-end suite signs in as. Test-only, never seeded elsewhere. */
export const E2E_ADMIN = {
  username: "e2e-admin",
  password: "e2e-password-not-a-secret",
} as const;

/**
 * Where the signed-in cookie jar is written by `auth.setup.ts`. Gitignored.
 *
 * Relative on purpose: Playwright loads the config as CommonJS, so
 * `import.meta` is not available here, and it resolves a relative
 * `storageState` against the working directory the run started from.
 */
export const STORAGE_STATE = "playwright/.auth/admin.json";
