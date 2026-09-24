import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration.
 *
 * The E2E server runs on a dedicated port rather than 3000, and never reuses
 * an existing one. With `reuseExistingServer` and the default port, the suite
 * silently attaches to whatever happens to be on :3000 — during this project's
 * own setup that was an unrelated app, and every assertion failed against a
 * stranger's login page rather than against this one.
 */
const PORT = Number(process.env.PLAYWRIGHT_PORT || 3100);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;

/** True when pointing at an already-running deployment, e.g. a preview URL. */
const usingExternalServer = Boolean(process.env.PLAYWRIGHT_BASE_URL);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],

  webServer: usingExternalServer
    ? undefined
    : {
        // A production build, so the suite exercises what ships rather than
        // the dev server's behaviour.
        command: `npx next start --port ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: false,
        timeout: 120_000,
        stdout: "ignore",
        stderr: "pipe",
        env: {
          NEXT_PUBLIC_SUPABASE_URL:
            process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
          NEXT_PUBLIC_SUPABASE_ANON_KEY:
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder",
          SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder",
          OPENAI_API_KEY: process.env.OPENAI_API_KEY || "placeholder",
          NEXT_PUBLIC_APP_URL: BASE_URL,
        },
      },
});
