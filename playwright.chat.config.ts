import { defineConfig, devices } from "@playwright/test";

// Only the PR16 one-click runner supplies a temporary port. The ordinary
// developer command and CI continue to use the existing port 5001.
const chatPort = Number.parseInt(process.env.PR16_CHAT_DEV_PORT ?? "5001", 10);
if (!Number.isInteger(chatPort) || chatPort < 1024 || chatPort > 65535) {
  throw new Error("Invalid local chat test port");
}
const chatOrigin = `http://127.0.0.1:${chatPort}`;

export default defineConfig({
  testDir: "./tests",
  testMatch: ["integration/frontend/chat-dev.spec.ts"],
  reporter: "list",
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: chatOrigin, trace: "retain-on-failure" },
  webServer: {
    command: chatPort === 5001
      ? "npm run dev"
      : `npm exec -- vite --host 127.0.0.1 --port ${chatPort} --strictPort`,
    url: chatOrigin,
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
