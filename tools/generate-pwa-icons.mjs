#!/usr/bin/env node
// Renders the web app manifest icons (apps/web/public/icons) from the master
// icon, media-sources/icon.svg, with the same renderer as the desktop and
// Android icons (`tauri icon`), so every platform shows the same artwork.
//
// - icon-192.png, icon-512.png: the master as is (rounded, transparent corners).
// - icon-maskable-512.png: a full-bleed variant for Android launchers, which
//   crop icons to their own shape. The artwork shrinks into the maskable safe
//   zone (the centred circle of 80% diameter).
// - apple-touch-icon.png (180 px): the full-bleed variant too, because iOS
//   rounds the corners itself and fills transparency with black.
//
// Usage: node tools/generate-pwa-icons.mjs   (deterministic; commit the result)

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const master = join(root, "media-sources/icon.svg");
const outDir = join(root, "apps/web/public/icons");

// The master's rounded background; the maskable variant replaces it with a square one.
const ROUNDED_BACKGROUND = /<rect width="1024" height="1024" rx="\d+" fill="url\(#bg\)"\/>/;
const ARTWORK_SCALE = 0.9;

function maskableSvg(svg) {
  if (!ROUNDED_BACKGROUND.test(svg)) throw new Error("media-sources/icon.svg no longer has the expected background <rect>; update tools/generate-pwa-icons.mjs.");
  const artwork = `<g transform="translate(512 512) scale(${ARTWORK_SCALE}) translate(-512 -512)">`;
  return svg.replace(ROUNDED_BACKGROUND, `<rect width="1024" height="1024" fill="url(#bg)"/>${artwork}`).replace("</svg>", "</g></svg>");
}

function render(svgPath, sizes, dir) {
  const run = spawnSync("pnpm", ["exec", "tauri", "icon", svgPath, "-o", dir, "-p", sizes.join(",")], { cwd: root, encoding: "utf8" });
  if (run.status !== 0) throw new Error(`tauri icon failed:\n${run.stdout}${run.stderr}`);
}

const work = mkdtempSync(join(tmpdir(), "mm-pwa-icons-"));
try {
  mkdirSync(outDir, { recursive: true });

  render(master, [192, 512], join(work, "plain"));
  copyFileSync(join(work, "plain/192x192.png"), join(outDir, "icon-192.png"));
  copyFileSync(join(work, "plain/512x512.png"), join(outDir, "icon-512.png"));

  const maskable = join(work, "icon-maskable.svg");
  writeFileSync(maskable, maskableSvg(readFileSync(master, "utf8")));
  render(maskable, [180, 512], join(work, "maskable"));
  copyFileSync(join(work, "maskable/512x512.png"), join(outDir, "icon-maskable-512.png"));
  copyFileSync(join(work, "maskable/180x180.png"), join(outDir, "apple-touch-icon.png"));

  console.log(`Wrote the PWA icons to ${outDir}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
