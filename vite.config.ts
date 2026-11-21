import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  build: {
    target: ["es2022", "safari16"],
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        authCallback: resolve(import.meta.dirname, "auth/callback/index.html"),
        photoCompressor: resolve(import.meta.dirname, "tools/photo-compressor/index.html"),
        fileConverter: resolve(import.meta.dirname, "tools/file-converter/index.html"),
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup/frontend.ts"],
    include: ["tests/unit/frontend/**/*.test.{ts,tsx}"],
  },
});
