import { readFileSync } from "node:fs";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type Plugin } from "vite";
import { serviceWorkerPlugin } from "./pwa/serviceWorkerPlugin.js";

// The root package.json is the single version source (scripts/release.sh).
const rootVersion = (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version;

// A bundler warning in the production build (an externalized Node module, a
// missing export, an unresolved import) means a broken bundle, so the build
// fails instead of shipping it. Rolldown ignores errors thrown from `onwarn`,
// so the warnings are collected there and raised once the bundle is rendered,
// or at close for warnings that plugins emit while writing it.
const buildWarnings: string[] = [];
// Warnings Vite's default handler drops as noise; failing on them would make
// the build stricter than Vite intends.
const IGNORED_WARNING_CODES = new Set(["CIRCULAR_DEPENDENCY", "THIS_IS_UNDEFINED"]);
const IGNORED_DYNAMIC_IMPORT_WARNINGS = ["Unsupported expression", "statically analyzed"];
const isIgnoredWarning = (warning: { code?: string; plugin?: string; message: string }) =>
  (warning.code !== undefined && IGNORED_WARNING_CODES.has(warning.code)) ||
  (warning.plugin === "rollup-plugin-dynamic-import-variables" && IGNORED_DYNAMIC_IMPORT_WARNINGS.some((text) => warning.message.includes(text)));
function raiseBuildWarnings(error: (message: string) => never) {
  const pending = buildWarnings.splice(0);
  if (pending.length > 0) error(`Production build warnings:\n${pending.join("\n")}`);
}
const failOnBuildWarnings: Plugin = {
  name: "fail-on-build-warnings",
  apply: "build",
  buildStart() {
    buildWarnings.length = 0;
  },
  generateBundle() {
    raiseBuildWarnings((message) => this.error(message));
  },
  closeBundle() {
    raiseBuildWarnings((message) => this.error(message));
  },
};

// One Vite build serves the web deployment and the Tauri shell (spec §43.3).
export default defineConfig({
  plugins: [svelte(), failOnBuildWarnings, serviceWorkerPlugin({ version: rootVersion })],
  // Relative asset paths so the build works from any static host path and
  // from Tauri's custom protocol.
  base: "./",
  server: { port: 5173, strictPort: true },
  build: {
    target: "es2022",
    // No source maps: they would ship in every web, server and desktop artifact.
    sourcemap: false,
    rolldownOptions: {
      output: {
        // The content package (map, card and UI text, rival quips) grows with
        // every card. Its own chunk keeps the app chunk under Rolldown's 500 kB
        // warning, which the build treats as an error (see above).
        codeSplitting: { groups: [{ name: "content", test: /packages[\\/]content[\\/]/ }] },
      },
      onwarn(warning, defaultHandler) {
        // The default handler prints the warning and applies Vite's own filters.
        defaultHandler(warning);
        if (!isIgnoredWarning(warning)) buildWarnings.push(warning.message);
      },
    },
  },
  // The AI runs in a module worker (lib/game/ai.worker.ts).
  worker: { format: "es" },
  define: {
    __APP_VERSION__: JSON.stringify(rootVersion),
  },
});
