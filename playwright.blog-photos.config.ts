import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/blog-photos", fullyParallel: true, retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://127.0.0.1:4173" },
  webServer: { command: "npm run preview", url: "http://127.0.0.1:4173", reuseExistingServer: false },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 13"] } }],
});
