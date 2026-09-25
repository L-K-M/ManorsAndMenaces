import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RESOURCE_DETAILS, RESOURCE_GLYPHS } from "../src/lib/theme.js";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

function svelteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return svelteFiles(path);
    return e.name.endsWith(".svelte") ? [path] : [];
  });
}

// Unicode and emoji glyphs that used to stand in for icons. They render
// differently per platform (or not at all without symbol fonts), so icons
// are ToolIcon/ResourceIcon SVGs. Arrows that end a text label ("→", "⏎")
// and the "×" in "2× Grain" are typography, not icons, and stay allowed.
const GLYPH_ICONS = /[☰⚙⤢◎✕✖♛↻↶↷⌂✓✔↑↓−🌾🌲⛰⚒✦]/u;

describe("icons", () => {
  it("components draw SVG icons instead of glyph characters", () => {
    const offenders = svelteFiles(SRC).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => ({ line: line.trim(), at: `${file.slice(SRC.length + 1)}:${i + 1}` }))
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
