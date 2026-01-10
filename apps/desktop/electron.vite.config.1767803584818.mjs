// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
var __electron_vite_injected_dirname = "D:\\MyProject\\SecondProject\\SnapKO\\apps\\desktop";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        // Explicitly externalize native modules
        include: ["better-sqlite3"]
      })
    ],
    build: {
      outDir: "dist/main",
      lib: {
        entry: resolve(__electron_vite_injected_dirname, "src/main/index.ts"),
        formats: ["cjs"],
        fileName: () => "index"
      },
      rollupOptions: {
        external: ["better-sqlite3"]
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist/preload",
      lib: {
        entry: resolve(__electron_vite_injected_dirname, "src/preload/index.ts"),
        formats: ["cjs"],
        fileName: () => "index"
      }
    }
  },
  renderer: {
    root: "src/renderer",
    base: "./",
    plugins: [react()],
    resolve: {
      alias: {
        "@renderer": resolve(__electron_vite_injected_dirname, "src/renderer"),
        "@snapko/shared": resolve(__electron_vite_injected_dirname, "../../packages/shared/src")
      }
    },
    build: {
      outDir: "dist/renderer",
      emptyOutDir: true
    }
  }
});
export {
  electron_vite_config_default as default
};
