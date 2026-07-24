import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      external: ["electron"],
      output: {
        // Main 与 Preload 共用 .vite/build，必须固定不同文件名避免互相覆盖。
        entryFileNames: "main.js",
      },
    },
  },
});
