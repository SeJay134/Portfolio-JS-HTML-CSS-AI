import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/experimental",
  testMatch: ["**/*.spec.ts"],
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5181",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx vite --host 127.0.0.1 --port 5181 --strictPort",
    url: "http://127.0.0.1:5181/",
    reuseExistingServer: !process.env.CI,
  },
  projects: [{
    name: "chromium",
    use: { ...devices["Desktop Chrome"] },
  }],
});
