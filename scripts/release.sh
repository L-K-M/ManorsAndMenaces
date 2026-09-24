#!/usr/bin/env bash
# Cuts a release: bumps the version, commits, tags "v<version>", and with --push
# pushes branch + tag — which triggers .github/workflows/release.yml to test, then
# build and publish the desktop installers, the web bundle, the server bundle and
# the server container image. The root package.json is the version source; every
# workspace package, tauri.conf.json and src-tauri/Cargo.toml move in lockstep.
#
# Usage: scripts/release.sh [X.Y.Z] [--push]
# Shared engine: https://github.com/L-K-M/release-tool (this stub only sets config).
set -euo pipefail
export RELEASE_APP_NAME="Manors & Menaces"
export RELEASE_KIND="tauri"
export RELEASE_TAURI_CONF="src-tauri/tauri.conf.json"
export RELEASE_CARGO_TOMLS="src-tauri/Cargo.toml"
export RELEASE_POST_BUMP="node scripts/sync-versions.mjs"
export RELEASE_CI_NOTE="CI (release.yml) will now test, build the installers and container image, and publish the <tag> GitHub Release."
export RELEASE_INVOKED_AS="scripts/release.sh"
BIN="${LKM_RELEASE_BIN:-lkm-release}"
command -v "$BIN" >/dev/null 2>&1 || {
  echo "error: lkm-release not found — clone https://github.com/L-K-M/release-tool and run ./install.sh" >&2
  exit 1
}
exec "$BIN" "$@"
