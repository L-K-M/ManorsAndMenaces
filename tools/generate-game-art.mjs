#!/usr/bin/env node
// Derive small runtime PNGs from the original storybook paintings. Tauri's
// existing renderer keeps this reproducible without another image dependency.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tauriPackage = createRequire(join(root, "package.json")).resolve("@tauri-apps/cli/package.json");
const cli = join(dirname(tauriPackage), JSON.parse(readFileSync(tauriPackage, "utf8")).bin.tauri);
const portraits = ["emperor-mumble", "grum", "madame-quill", "dame-brash", "tally-nib", "lady-fennick"];
const menaces = ["toll-troll", "young-dragon", "highwayman", "bog-witch", "goblin-tinkers"];
const landmarks = ["royal_castle", "wizard_tower", "adventurers_inn", "dwarven_hall", "sacred_grove"];
const assets = [
  { source: "storybook/ui/empty-hand.png", output: "ui/empty-hand.png", size: 256 },
  { source: "manors-and-menaces-icon-concept.png", output: "manor-troll.png", size: 640 },
  ...portraits.map((name) => ({ source: `storybook/${name}.png`, output: `rivals/${name}.png`, size: 256 })),
  ...menaces.map((name) => ({ source: `storybook/menaces/${name}.png`, output: `menaces/${name}.png`, size: 256 })),
  ...landmarks.map((name) => ({ source: `storybook/landmarks/${name}.png`, output: `landmarks/${name}.png`, size: 256 })),
];
const work = mkdtempSync(join(tmpdir(), "mm-game-art-"));
try {
  for (const asset of assets) {
    const run = spawnSync(process.execPath, [cli, "icon", join(root, "media-sources", asset.source), "-o", work, "-p", String(asset.size)], { cwd: root, encoding: "utf8" });
    if (run.error) throw run.error;
    if (run.status !== 0) throw new Error(`Art rendering failed for ${asset.source}:\n${run.stdout}${run.stderr}`);
    const output = join(root, "apps/web/public/art", asset.output);
    mkdirSync(dirname(output), { recursive: true });
    copyFileSync(join(work, `${asset.size}x${asset.size}.png`), output);
  }
  console.log(`Rendered ${assets.length} storybook assets.`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
