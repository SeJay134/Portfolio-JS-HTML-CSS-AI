import { defineConfig, devices } from "@playwright/test";

/**
 * Auth-enabled build smoke tests. Uses a fake public Supabase origin:
 * no Google OAuth credentials or third-party account are required.
 */
export default defineConfig({
  testDir: "./tests/auth",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://127.0.0.1:4173" },
  webServer: {
    command: "npm run preview",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
