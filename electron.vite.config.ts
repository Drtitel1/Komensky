import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const shared = { "@shared": resolve(__dirname, "src/shared") };

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared },
    build: { rollupOptions: { input: { index: resolve(__dirname, "src/main/index.ts") } } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/preload/index.ts") },
        // sandboxed preload scripts must be CommonJS
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    publicDir: resolve(__dirname, "src/renderer/public"),
    resolve: { alias: { ...shared, "@": resolve(__dirname, "src/renderer/src") } },
    plugins: [react(), tailwindcss()],
    build: { minify: process.env.NOMINIFY ? false : "esbuild", rollupOptions: { input: { index: resolve(__dirname, "src/renderer/index.html") } } },
  },
});
