import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        // Explicitly externalize native modules
        include: ["better-sqlite3"],
      }),
    ],
    build: {
      outDir: "dist/main",
      lib: {
        entry: resolve(__dirname, "src/main/index.ts"),
        formats: ["cjs"],
        fileName: () => "index",
      },
      rollupOptions: {
        external: ["better-sqlite3"],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist/preload",
      lib: {
        entry: resolve(__dirname, "src/preload/index.ts"),
        formats: ["cjs"],
        fileName: () => "index",
      },
    },
  },
  renderer: {
    root: "src/renderer",
    base: "./",
    plugins: [react()],
    resolve: {
      alias: {
        "@renderer": resolve(__dirname, "src/renderer"),
        "@snapko/shared": resolve(__dirname, "../../packages/shared/src"),
      },
    },
    build: {
      outDir: "dist/renderer",
      emptyOutDir: true,
    },
  },
});
