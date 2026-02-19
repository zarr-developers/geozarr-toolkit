import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: "demo",
  resolve: {
    alias: {
      metazarr: resolve(__dirname, "src/index.js"),
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.js"),
      formats: ["es"],
      fileName: "metazarr",
    },
    rollupOptions: {
      external: ["zarrita"],
    },
    outDir: resolve(__dirname, "dist"),
  },
  test: {
    root: resolve(__dirname),
    include: ["test/**/*.test.js"],
  },
});
