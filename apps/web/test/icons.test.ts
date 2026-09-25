import { describe, expect, it } from "vitest";
import { RESOURCE_DETAILS, RESOURCE_GLYPHS } from "../src/lib/theme.js";

// Every component's source, read through Vite rather than node:fs: apps/web
// type-checks its tests with browser and Vite types only (no @types/node).
const SOURCES = import.meta.glob<string>("../src/**/*.svelte", { query: "?raw", import: "default", eager: true });

// Unicode and emoji glyphs that used to stand in for icons. They render
// differently per platform (or not at all without symbol fonts), so icons
// are ToolIcon/ResourceIcon SVGs. Arrows that end a text label ("→", "⏎")
// and the "×" in "2× Grain" are typography, not icons, and stay allowed.
const GLYPH_ICONS = /[☰⚙⤢◎✕✖♛↻↶↷⌂✓✔↑↓−🌾🌲⛰⚒✦]/u;

describe("icons", () => {
  it("components draw SVG icons instead of glyph characters", () => {
    // Guard against a vacuous pass if the source tree moves.
    const files = Object.entries(SOURCES);
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.flatMap(([file, source]) =>
      source
        .split("\n")
        .map((line, i) => ({ line: line.trim(), at: `${file.replace("../src/", "")}:${i + 1}` }))
        .filter(({ line }) => !line.startsWith("//") && GLYPH_ICONS.test(line))
        .map(({ at, line }) => `${at}: ${line}`),
    );
    expect(offenders).toEqual([]);
  });

  it("every resource has its own silhouette and hand-drawn detail", () => {
    const glyphs = Object.values(RESOURCE_GLYPHS);
    expect(new Set(glyphs).size).toBe(glyphs.length);
    for (const [resource, glyph] of Object.entries(RESOURCE_GLYPHS)) {
      expect(glyph, resource).toMatch(/^M[-\d.,\sMLQCZ]+$/);
      expect(RESOURCE_DETAILS[resource as keyof typeof RESOURCE_DETAILS], resource).toMatch(/^M/);
    }
  });
});
