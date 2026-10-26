// Types for bundled-modules.mjs, which is vendored unchanged from the shared
// license-notices recipe. Only what vite.config.ts relies on: a build-only
// Vite plugin.
declare function bundledModules(options?: { dir?: string }): { name: string; apply: "build" };
export default bundledModules;
