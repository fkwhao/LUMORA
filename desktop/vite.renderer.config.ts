import path from "node:path";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: path.resolve(__dirname, "src/renderer"),
  plugins: [vanillaExtractPlugin(), react()],
  build: {
    outDir: path.resolve(__dirname, ".vite/renderer/main_window"),
    emptyOutDir: true,
  },
});
