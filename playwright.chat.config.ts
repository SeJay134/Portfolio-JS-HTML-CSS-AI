import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["integration/frontend/chat-dev.spec.ts"],
  reporter: "list",
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: "http://127.0.0.1:5001", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5001",
    reuseExistingServer: false,
    env: { VITE_ENABLE_CHAT_UI: "true" },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
