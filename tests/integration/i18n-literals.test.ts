import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EN } from "@manors-menaces/content";

// Guards the i18n discipline (spec §71): every user-facing string goes
// through t() with a key in the catalog, and Svelte templates contain no
// bare English text. Dynamic keys (template literals) cannot be checked
// statically; the resource/card/menace/quest families are covered by the
// content package's own completeness tests.

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "apps", "web", "src");

function sourceFiles(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p, ext));
    else if (entry.endsWith(ext)) out.push(p);
  }
  return out;
}

/** Development-only surfaces; not player-facing. */
const DEV_ONLY = new Set(["lib/components/DebugPanel.svelte"]);
const isPlayerFacing = (rel: string): boolean => !DEV_ONLY.has(rel);

/**
 * Extract template text nodes: character runs outside tags and outside
 * Svelte `{...}` expressions. `=>` inside attributes would otherwise end a
 * tag early, so it is neutralised first.
 */
export function templateTextNodes(template: string): string[] {
  const src = template.replace(/=>/g, " ");
  const out: string[] = [];
  let depth = 0; // brace depth (expressions, including inside tags)
  let inTag = false;
  let text = "";
  const flush = () => {
    if (text.trim()) out.push(text);
    text = "";
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i] as string;
    if (c === "{") {
      depth++;
      if (!inTag) flush();
      continue;
    }
    if (c === "}") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (c === "<" && depth === 0) {
      flush();
      inTag = true;
      continue;
    }
    // A '>' inside an attribute expression (disabled={x > 0}) does not end
    // its tag.
    if (c === ">" && depth === 0) {
      if (inTag) inTag = false;
      else text += c;
      continue;
    }
    if (inTag || depth > 0) continue;
    text += c;
  }
  flush();
  return out;
}

describe("i18n discipline (spec §71)", () => {
  it("every static t() key exists in the catalog", () => {
    const missing: string[] = [];
    const keyRe = /\bt\(\s*["']([^"']+)["']/g;
    for (const ext of [".ts", ".svelte"]) {
      for (const file of sourceFiles(SRC, ext)) {
        const src = readFileSync(file, "utf8");
        for (const m of src.matchAll(keyRe)) {
          const key = m[1] as string;
          if (!(key in EN)) missing.push(`${file.replace(SRC + "/", "")}: ${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("Svelte templates contain no bare English text nodes", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC, ".svelte")) {
      const rel = file.replace(SRC + "/", "");
      if (!isPlayerFacing(rel)) continue;
      let src = readFileSync(file, "utf8");
      src = src.replace(/<script[\s\S]*?<\/script>/g, "");
      src = src.replace(/<style[\s\S]*?<\/style>/g, "");
      src = src.replace(/<!--[\s\S]*?-->/g, "");
      for (const node of templateTextNodes(src)) {
        const words = node.replace(/&[a-z]+;/g, " ").match(/[A-Za-z]{3,}/g);
        if (words) offenders.push(`${rel}: ${words.join(" ")}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
