import { spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// `generate-map.mjs --check` is the CI guard that the committed map is the
// generator's output and still passes validateMap (spec §102).

const root = fileURLToPath(new URL("../..", import.meta.url));
const generator = join(root, "tools", "generate-map.mjs");
const committedMap = join(root, "packages", "content", "src", "maps", "greenvale.ts");

function check(...args: string[]): { status: number | null; output: string } {
  const run = spawnSync(process.execPath, [generator, "--check", ...args], { cwd: root, encoding: "utf8" });
  return { status: run.status, output: run.stdout + run.stderr };
}

describe("generate-map --check", () => {
  let dir: string;
  let copy: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mm-map-check-"));
    copy = join(dir, "greenvale.ts");
    copyFileSync(committedMap, copy);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("passes for the committed map", () => {
    const { status, output } = check();
    expect(output).not.toContain("stale");
    expect(status).toBe(0);
  });

  it("passes for an untouched copy of the committed map", () => {
    expect(check("--out", copy).status).toBe(0);
  });

  it("fails when the map file was edited by hand", () => {
    appendFileSync(copy, " ");
    const { status, output } = check("--out", copy);
    expect(status).toBe(1);
    expect(output).toContain("pnpm map:generate");
  });

  it("fails when the map was generated from another seed", () => {
    const { status, output } = check("--out", copy, "--seed", "15");
    expect(status).toBe(1);
    expect(output).toContain("differs from a fresh generation");
  });

  it("fails when the map file is missing", () => {
    rmSync(copy);
    const { status, output } = check("--out", copy);
    expect(status).toBe(1);
    expect(output).toContain("cannot read");
  });
});
