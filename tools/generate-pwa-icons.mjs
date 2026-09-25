#!/usr/bin/env node
// Renders the web icons (apps/web/public/icons and the favicon) from the
// master icon, media-sources/icon.png, with the same renderer as the desktop
// and Android icons (`tauri icon`), so every platform shows the same artwork.
//
// - icon-192.png, icon-512.png, favicon-64.png: the master as is
//   (transparent background).
// - icon-maskable-512.png: a full-bleed variant for Android launchers, which
//   crop icons to their own shape. The artwork shrinks into the maskable safe
//   zone (the centred circle of 80% diameter) on the manifest's background
//   colour (bg_color in media-sources/icon.json).
// - apple-touch-icon.png (180 px): the full-bleed variant too, because iOS
//   rounds the corners itself and fills transparency with black.
//
// Usage: node tools/generate-pwa-icons.mjs   (deterministic; commit the result)

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const master = join(root, "media-sources/icon.png");
const manifest = JSON.parse(readFileSync(join(root, "media-sources/icon.json"), "utf8"));
if (typeof manifest.bg_color !== "string" || !/^#[0-9a-f]{3,8}$/i.test(manifest.bg_color)) {
  throw new Error("media-sources/icon.json must set bg_color to a hex colour, e.g. #244a27.");
}
const publicDir = join(root, "apps/web/public");
const outDir = join(publicDir, "icons");

// The Tauri CLI's own entry point, run with this Node rather than through the
// pnpm shim: Windows installs pnpm as a .cmd file, which Node spawns only via
// a shell, and a shell would split the (temp) paths at spaces.
const tauriPackage = createRequire(join(root, "package.json")).resolve("@tauri-apps/cli/package.json");
const tauriCli = join(dirname(tauriPackage), JSON.parse(readFileSync(tauriPackage, "utf8")).bin.tauri);

// The master matches the maskable safe zone (80%) edge to edge; only the
// transparent glow and the bush tips at the bottom corners fall outside it.
const ARTWORK_SCALE = 0.8;

function maskableSvg() {
  const png = readFileSync(master).toString("base64");
  const size = 1024 * ARTWORK_SCALE;
  const offset = (1024 - size) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" viewBox="0 0 1024 1024">`
    + `<rect width="1024" height="1024" fill="${manifest.bg_color}"/>`
    + `<image x="${offset}" y="${offset}" width="${size}" height="${size}" xlink:href="data:image/png;base64,${png}"/>`
    + `</svg>`;
}

function render(iconPath, sizes, dir) {
  // -p is --png: render only these square sizes, each as NxN.png.
  const run = spawnSync(process.execPath, [tauriCli, "icon", iconPath, "-o", dir, "-p", sizes.join(",")], { cwd: root, encoding: "utf8" });
  if (run.error) throw new Error(`could not run the Tauri CLI: ${run.error.message}`);
  if (run.status !== 0) throw new Error(`tauri icon failed:\n${run.stdout}${run.stderr}`);
}

const work = mkdtempSync(join(tmpdir(), "mm-pwa-icons-"));
try {
  mkdirSync(outDir, { recursive: true });

  render(master, [64, 192, 512], join(work, "plain"));
  copyFileSync(join(work, "plain/64x64.png"), join(publicDir, "favicon-64.png"));
  copyFileSync(join(work, "plain/192x192.png"), join(outDir, "icon-192.png"));
  copyFileSync(join(work, "plain/512x512.png"), join(outDir, "icon-512.png"));

  const maskable = join(work, "icon-maskable.svg");
  writeFileSync(maskable, maskableSvg());
  render(maskable, [180, 512], join(work, "maskable"));
  copyFileSync(join(work, "maskable/512x512.png"), join(outDir, "icon-maskable-512.png"));
  copyFileSync(join(work, "maskable/180x180.png"), join(outDir, "apple-touch-icon.png"));

  console.log(`Wrote the web icons to ${publicDir}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
