import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import ts from "typescript-eslint";

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
