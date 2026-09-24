#!/usr/bin/env node
// Keeps every workspace package.json in lockstep with the root version
// (run by scripts/release.sh as RELEASE_POST_BUMP; RELEASE_NEW_VERSION is set).
import { readFileSync, writeFileSync } from "node:fs";

const version = process.env.RELEASE_NEW_VERSION ?? JSON.parse(readFileSync("package.json", "utf8")).version;
const files = ["packages/rules", "packages/content", "packages/protocol", "packages/ai", "apps/web", "apps/server"].map((d) => `${d}/package.json`);
for (const f of files) {
  const text = readFileSync(f, "utf8");
  const next = text.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`);
  if (!next.includes(`"version": "${version}"`)) {
    console.error(`!! could not set version in ${f}`);
    process.exit(1);
  }
  writeFileSync(f, next);
}
// README version marker.
const readme = readFileSync("README.md", "utf8").replace(/<!-- version -->[^<]*<!-- \/version -->/, `<!-- version -->${version}<!-- /version -->`);
writeFileSync("README.md", readme);
console.log(`-- synced ${files.length} packages and README to ${version}`);
