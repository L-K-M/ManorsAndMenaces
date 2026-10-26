#!/usr/bin/env node
// Third-party notices for the Tauri apps, run by beforeBuildCommand
// (src-tauri/tauri.conf.json) right after the web build. One
// Third-Party-Notices.txt per app covers everything its binary contains:
//   1. scripts/rust-notices.py lists the crates linked for the target being
//      built (Tauri sets TAURI_ENV_TARGET_TRIPLE; Android builds all four
//      ABIs) and copies Rust-Licenses.html, the Rust standard library's notices;
//   2. scripts/third-party-notices.mjs lists the web bundle's packages and
//      includes the crate notices.
// Both files go into apps/web/dist, which Tauri embeds in the binary
// (Settings > Licenses shows them), and into src-tauri/licenses/, which the
// bundle configs install next to the app. Linux builds also get the DEP-5
// copyright file, and Android builds a copy in the APK's assets/licenses/ for
// the native licenses screen. Any generator error fails the build.
//
// Usage: node scripts/tauri-notices.mjs   (needs TAURI_ENV_PLATFORM and
// TAURI_ENV_TARGET_TRIPLE, which Tauri sets for its build hooks)

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "src-tauri/licenses");
const WEB = join(root, "apps/web");
const ANDROID_ASSETS = join(root, "src-tauri/gen/android/app/src/main/assets/licenses");
const ANDROID_TARGETS = ["aarch64-linux-android", "armv7-linux-androideabi", "i686-linux-android", "x86_64-linux-android"];
const NOTICES = "Third-Party-Notices.txt";
const RUST_STD = "Rust-Licenses.html";
const RUST_CRATES = "Rust-Crates.txt";
// Windows runners name the interpreter python.
const PYTHON = process.platform === "win32" ? "python" : "python3";

function run(command, args, options = {}) {
  console.log(`==> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// The toolchain that builds the app, as rust-toolchain files select it.
function rustc(...args) {
  const result = spawnSync("rustc", args, { cwd: join(root, "src-tauri"), encoding: "utf8" });
  if (result.status !== 0) throw new Error(`rustc ${args.join(" ")} failed: ${result.error?.message ?? result.stderr}`);
  return result.stdout.trim();
}

const platform = process.env.TAURI_ENV_PLATFORM;
if (!platform) throw new Error("TAURI_ENV_PLATFORM is not set: run this from a Tauri build hook");
// Elsewhere rust-notices.py reads the target from TAURI_ENV_TARGET_TRIPLE.
const targets = platform === "android" ? ANDROID_TARGETS.flatMap((target) => ["--target", target]) : [];

mkdirSync(OUT, { recursive: true });
run(PYTHON, [
  "scripts/rust-notices.py", "--manifest-path", "src-tauri/Cargo.toml", ...targets,
  "--title", "Manors & Menaces", "--overrides", "licenses/rust-overrides.json", "--own-license", "Unlicense",
  "--out", join(OUT, RUST_CRATES), "--rust-std", join(OUT, RUST_STD),
]);
// Reads the module records of the web build that just ran.
run(process.execPath, [
  join(root, "scripts/third-party-notices.mjs"), "--modules", "node_modules/.cache/bundled-modules", "--check-assets", "dist",
  "--title", "Manors & Menaces", "--include", join(OUT, RUST_CRATES), "--out", join(OUT, NOTICES),
], { cwd: WEB });

if (platform === "linux") {
  const env = { ...process.env, RUST_DOC: join(rustc("--print", "sysroot"), "share/doc/rust"), RUSTC_VERSION: rustc("--version").split(" ")[1] };
  run(PYTHON, ["scripts/deb-copyright.py", "generate", "licenses/linux-copyright.json", "--copyright-out", join(OUT, "copyright")], { env });
}

for (const dir of [join(WEB, "dist"), ...(platform === "android" ? [ANDROID_ASSETS] : [])]) {
  mkdirSync(dir, { recursive: true });
  for (const file of [NOTICES, RUST_STD]) copyFileSync(join(OUT, file), join(dir, file));
}
console.log(`==> ${NOTICES} and ${RUST_STD} written for ${platform}`);
