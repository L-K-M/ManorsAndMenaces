import { readFileSync } from "node:fs";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type Plugin } from "vite";

// The root package.json is the single version source (scripts/release.sh).
const rootVersion = (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version;

// A bundler warning in the production build (an externalized Node module, a
// missing export, an unresolved import) means a broken bundle, so the build
// fails instead of shipping it. Rolldown ignores errors thrown from `onwarn`,
// so the warnings are collected there and raised once the bundle is rendered.
const buildWarnings: string[] = [];
const failOnBuildWarnings: Plugin = {
  name: "fail-on-build-warnings",
  apply: "build",
  buildStart() {
    buildWarnings.length = 0;
  },
  generateBundle() {
    if (buildWarnings.length > 0) this.error(`Production build warnings:\n${buildWarnings.join("\n")}`);
  },
};

// One Vite build serves the web deployment and the Tauri shell (spec §43.3).
export default defineConfig({
  plugins: [svelte(), failOnBuildWarnings],
  // Relative asset paths so the build works from any static host path and
  // from Tauri's custom protocol.
  base: "./",
  server: { port: 5173, strictPort: true },
  build: {
    target: "es2022",
    sourcemap: true,
    rolldownOptions: {
      onwarn(warning) {
        buildWarnings.push(warning.message);
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(rootVersion),
  },
});
