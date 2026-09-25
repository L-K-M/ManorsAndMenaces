#!/usr/bin/env node
// Optional source-art preparation. Builds use the checked-in WebP copies.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "media-sources/storybook/cards");
const { cards } = JSON.parse(readFileSync(join(source, "prompts.json"), "utf8"));
const output = join(root, "apps/web/public/art/cards");
mkdirSync(output, { recursive: true });
for (const { id } of cards) {
  const result = spawnSync("cwebp", ["-quiet", "-q", "85", "-m", "6", "-resize", "600", "0", join(source, `${id}.png`), "-o", join(output, `${id}.webp`)], { encoding: "utf8" });
  if (result.error) throw new Error("Card art preparation requires cwebp from libwebp. Normal builds use the existing runtime copies.", { cause: result.error });
  if (result.status !== 0) throw new Error(`Card art rendering failed for ${id}: ${result.stderr}`);
}
console.log(`Rendered ${cards.length} individual card paintings.`);
