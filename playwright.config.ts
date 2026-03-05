import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for KINGA end-to-end tests.
 *
 * The dev server must be running on port 3000 before running these tests.
 * Start it with `pnpm dev` or `pnpm start` in a separate terminal.
 *
 * Run with:
 *   npx playwright test
 *   npx playwright test tests/e2e/post-login-redirect.spec.ts
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  /* Maximum time one test can run */
  timeout: 30_000,
  /* Retry once on CI to absorb flakiness */
  retries: process.env.CI ? 1 : 0,
  /* Reporter */
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    /* Base URL for all page.goto() calls */
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    /* Collect trace on first retry */
    trace: "on-first-retry",
    /* Headless in CI, headed locally when PWDEBUG=1 */
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
