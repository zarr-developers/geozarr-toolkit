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
    outDir: resolve(__dirname, "dist"),
  },
  test: {
    root: resolve(__dirname),
    include: ["test/**/*.test.js"],
  },
});
