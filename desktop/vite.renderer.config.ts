import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: path.resolve(__dirname, "src/renderer"),
  plugins: [tailwindcss(), vanillaExtractPlugin(), react()],
  // Appearance preferences and one-time legacy project mappings are scoped to
  // the dev-server origin. Keep it stable so preferences and migration input
  // cannot silently disappear when another process occupies the port.
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/renderer"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, ".vite/renderer/main_window"),
    emptyOutDir: true,
  },
});
