import { builtinModules } from "node:module";
import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import ts from "typescript-eslint";

// Architecture boundaries (AGENTS.md; spec §33, §103). Options of one rule do
// not merge across config objects, so every scope below lists all it forbids.
const nodeBuiltins = (message) => ({
  paths: builtinModules.map((name) => ({ name, message })),
  patterns: [{ group: ["node:*"], message }],
});
const FRAMEWORK_FREE = "Shared packages stay framework-free: no Svelte, Tauri, Node or server code (spec §33, §103).";
const frameworkFreeImports = (...extraPatterns) => {
  const node = nodeBuiltins(FRAMEWORK_FREE);
  return [
    "error",
    {
      paths: [...node.paths, { name: "ws", message: FRAMEWORK_FREE }],
      patterns: [
        ...node.patterns,
        { group: ["svelte", "svelte/*", "@tauri-apps/*", "@sveltejs/*", "ws/*"], message: FRAMEWORK_FREE },
        { group: ["@manors-menaces/web", "@manors-menaces/server", "**/apps/**"], message: "Packages must not depend on apps." },
        ...extraPatterns,
      ],
    },
  ];
};
const BROWSER_ONLY = nodeBuiltins("The web client runs in the browser; reach the server over the protocol.");
// Gameplay state must be a pure function of the seed and commands (§30).
const DETERMINISM = "Shared packages must be deterministic and environment-free (spec §30); pass time and I/O in from the app.";
const ENVIRONMENT_GLOBALS = ["window", "document", "localStorage", "sessionStorage", "indexedDB", "navigator", "fetch", "process", "setTimeout", "setInterval", "performance", "crypto", "Buffer"];

export default ts.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "src-tauri/**", "**/test-results/**", "packages/content/src/maps/**"] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs["flat/recommended"],
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node, __APP_VERSION__: "readonly" } },
    rules: {
      "prefer-const": ["error", { destructuring: "all" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Gameplay must not use Math.random (spec §30, §98); AI/UI code may.
      "no-restricted-properties": ["error", { object: "Math", property: "random", message: "Use the match RNG (spec §30)." }],
    },
  },
  {
    files: ["apps/web/**", "tools/**"],
    rules: { "no-restricted-properties": "off" },
  },
  {
    files: ["packages/*/src/**"],
    rules: {
      "no-restricted-globals": ["error", ...ENVIRONMENT_GLOBALS.map((name) => ({ name, message: DETERMINISM }))],
      "no-restricted-syntax": [
        "error",
        { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: DETERMINISM },
        { selector: "NewExpression[callee.name='Date']", message: DETERMINISM },
      ],
    },
  },
  {
    // The rules engine is the base layer and depends on no other workspace package.
    files: ["packages/rules/src/**"],
    rules: {
      "no-restricted-imports": frameworkFreeImports({ group: ["@manors-menaces/*"], message: "The rules engine depends on no other package." }),
    },
  },
  {
    // Content, AI and protocol build on the rules engine only (their package.json).
    files: ["packages/content/src/**", "packages/ai/src/**", "packages/protocol/src/**"],
    rules: {
      "no-restricted-imports": frameworkFreeImports({
        group: ["@manors-menaces/*", "!@manors-menaces/rules"],
        message: "Content, AI and protocol may import only @manors-menaces/rules.",
      }),
    },
  },
  {
    // The web client is a browser bundle (Tauri reaches it through a global
    // bridge) and talks to the server only over the protocol.
    files: ["apps/web/src/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...BROWSER_ONLY.paths, { name: "ws", message: "Use the browser WebSocket." }],
          patterns: [
            ...BROWSER_ONLY.patterns,
            { group: ["@manors-menaces/server", "**/server/src/**", "**/apps/server/**"], message: "Apps must not import other apps; share code through packages." },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/server/src/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["svelte", "svelte/*", "@tauri-apps/*"], message: "The server has no UI framework." },
            { group: ["@manors-menaces/web", "**/web/src/**", "**/apps/web/**"], message: "Apps must not import other apps; share code through packages." },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: { parserOptions: { parser: ts.parser, extraFileExtensions: [".svelte"] } },
  },
  {
    files: ["**/*.svelte"],
    rules: {
      // Board glyphs and resource icons are keyed by static arrays.
      "svelte/require-each-key": "off",
      "svelte/no-navigation-without-resolve": "off",
    },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    rules: {
      // Maps/Sets here are short-lived locals inside $derived computations,
      // not reactive state; wrapping them in SvelteMap would only add cost.
      "svelte/prefer-svelte-reactivity": "off",
      // `let { … } = $props()` is the idiomatic Svelte 5 form.
      "prefer-const": "off",
    },
  },
);
