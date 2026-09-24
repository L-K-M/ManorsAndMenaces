import { readFileSync } from "node:fs";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// The root package.json is the single version source (scripts/release.sh).
const rootVersion = (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version;

// One Vite build serves the web deployment and the Tauri shell (spec §43.3).
export default defineConfig({
  plugins: [svelte()],
  // Relative asset paths so the build works from any static host path and
  // from Tauri's custom protocol.
  base: "./",
  server: { port: 5173, strictPort: true },
  build: { target: "es2022", sourcemap: true },
  // The AI runs in a module worker (lib/game/ai.worker.ts).
  worker: { format: "es" },
  define: {
    __APP_VERSION__: JSON.stringify(rootVersion),
  },
});
