import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5002",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  build: { target: ["es2022", "safari16"], chunkSizeWarningLimit: 600 },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup/frontend.ts"],
    include: ["tests/unit/frontend/**/*.test.{ts,tsx}"],
  },
});
