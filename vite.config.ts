import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { target: ["es2022", "safari16"], chunkSizeWarningLimit: 600 },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup/frontend.ts"],
    include: ["tests/unit/frontend/**/*.test.{ts,tsx}"],
  },
});
