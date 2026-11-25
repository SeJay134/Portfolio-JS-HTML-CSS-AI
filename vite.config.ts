import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { loadEnv } from "vite";
import { assertPublicEnvironment } from "./scripts/public-env";

export default defineConfig(({ command, mode }) => {
  if (command === "build") assertPublicEnvironment(loadEnv(mode, process.cwd(), "VITE_"));
  return {
  plugins: [react()],
  build: {
    target: ["es2022", "safari16"],
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        blog: resolve(import.meta.dirname, "blog/index.html"),
        blogArticle: resolve(import.meta.dirname, "blog-article/index.html"),
        blogAdmin: resolve(import.meta.dirname, "admin/blog/index.html"),
        authCallback: resolve(import.meta.dirname, "auth/callback/index.html"),
        photoCompressor: resolve(import.meta.dirname, "tools/photo-compressor/index.html"),
        fileConverter: resolve(import.meta.dirname, "tools/file-converter/index.html"),
        lightUpCollaboration: resolve(import.meta.dirname, "collaborations/light-up-media-signs/index.html"),
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup/frontend.ts"],
    include: ["tests/unit/frontend/**/*.test.{ts,tsx}"],
  },
  };
});
