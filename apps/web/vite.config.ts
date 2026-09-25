import { readFileSync } from "node:fs";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { serviceWorkerPlugin } from "./pwa/serviceWorkerPlugin.js";

// The root package.json is the single version source (scripts/release.sh).
const rootVersion = (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version;

// One Vite build serves the web deployment and the Tauri shell (spec §43.3).
export default defineConfig({
  plugins: [svelte(), serviceWorkerPlugin({ version: rootVersion })],
  // Relative asset paths so the build works from any static host path and
  // from Tauri's custom protocol.
  base: "./",
  server: { port: 5173, strictPort: true },
  // No source maps: they would ship in every web, server and desktop artifact.
  build: { target: "es2022", sourcemap: false },
  define: {
    __APP_VERSION__: JSON.stringify(rootVersion),
  },
});
