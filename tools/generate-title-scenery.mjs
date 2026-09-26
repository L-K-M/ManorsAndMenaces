#!/usr/bin/env node
// Optional artwork preparation, not required for development/builds. Install
// libwebp (cwebp) to regenerate the checked-in runtime landscape from its source.
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "apps/web/public/art");
mkdirSync(output, { recursive: true });
for (const [width, name] of [[1920, "title-coast.webp"], [960, "title-coast-small.webp"]]) {
  const result = spawnSync("cwebp", ["-quiet", "-q", "84", "-m", "6", "-resize", String(width), "0", join(root, "media-sources/storybook/title-coast.png"), "-o", join(output, name)], { encoding: "utf8" });
  if (result.error) throw new Error("Scenery generation requires cwebp from libwebp. Existing runtime assets can be used without it.", { cause: result.error });
  if (result.status !== 0) throw new Error(`Scenery rendering failed: ${result.stderr}`);
}
console.log("Rendered two responsive title landscapes.");
