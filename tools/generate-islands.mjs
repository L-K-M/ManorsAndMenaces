#!/usr/bin/env node
// Generates every published island (tools/islands.mjs) with generate-map.mjs.
//
// Usage: node tools/generate-islands.mjs [--check]
//   --check  verify each committed island instead of writing it (CI).

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ISLANDS } from "./islands.mjs";

const generator = fileURLToPath(new URL("./generate-map.mjs", import.meta.url));
const check = process.argv.includes("--check");
const failed = ISLANDS.filter((island) => {
  const run = spawnSync(process.execPath, [generator, "--island", island.key, ...(check ? ["--check"] : [])], { stdio: "inherit" });
  return run.status !== 0;
});
if (failed.length > 0) {
  console.error(`${check ? "check" : "generation"} failed for: ${failed.map((i) => i.key).join(", ")}`);
  process.exit(1);
}
