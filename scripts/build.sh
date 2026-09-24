#!/usr/bin/env bash
# Builds every Manors & Menaces target and stages the results in dist/.
#
# Usage: scripts/build.sh [target...]
#   targets: web server desktop android   (default: all that this machine can build)
#   A missing toolchain skips a target on a default run, but fails when the
#   target was named explicitly.
#
# Requirements: Node 22.13+ with corepack (pnpm); desktop also needs Rust and the
# Tauri system libraries; android needs the Android SDK/NDK and `tauri android init`.
set -uo pipefail
cd "$(dirname "$0")/.."

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  awk 'NR==1 && /^#!/ {next} /^#/ {sub(/^# ?/,""); print; next} {exit}' "$0"
  exit 0
fi

EXPLICIT=0
TARGETS=("$@")
if [[ ${#TARGETS[@]} -eq 0 ]]; then
  TARGETS=(web server desktop android)
else
  EXPLICIT=1
fi

DIST="dist"
mkdir -p "$DIST"
PNPM="pnpm"
command -v pnpm >/dev/null 2>&1 || PNPM="corepack pnpm"
VERSION=$(node -p "require('./package.json').version")
declare -a OK=() SKIPPED=() FAILED=()

skip_or_fail() { # target reason
  if [[ $EXPLICIT -eq 1 ]]; then
    echo "!! $1: $2"
    FAILED+=("$1")
  else
    echo ".. skipping $1: $2"
    SKIPPED+=("$1")
  fi
}

echo "==> Installing dependencies"
$PNPM install --frozen-lockfile >/dev/null || { echo "!! pnpm install failed"; exit 1; }

for target in "${TARGETS[@]}"; do
  case "$target" in
    web)
      echo "==> web"
      if $PNPM --filter @manors-menaces/web build; then
        rm -rf "$DIST/web" && cp -R apps/web/dist "$DIST/web"
        OK+=("web → $DIST/web")
      else
        FAILED+=("web")
      fi
      ;;
    server)
      echo "==> server"
      if $PNPM --filter @manors-menaces/server build; then
        cp apps/server/dist/server.mjs "$DIST/manors-menaces-server-$VERSION.mjs"
        OK+=("server → $DIST/manors-menaces-server-$VERSION.mjs")
      else
        FAILED+=("server")
      fi
      ;;
    desktop)
      echo "==> desktop (Tauri)"
      if ! command -v cargo >/dev/null 2>&1; then
        skip_or_fail desktop "Rust toolchain not found (https://rustup.rs)"
        continue
      fi
      if [[ "$(uname)" == "Linux" ]] && ! pkg-config --exists webkit2gtk-4.1 2>/dev/null; then
        skip_or_fail desktop "webkit2gtk-4.1 development files not installed"
        continue
      fi
      if $PNPM tauri build; then
        mkdir -p "$DIST/desktop"
        find src-tauri/target -path '*/release/bundle/*' -type f \( -name '*.dmg' -o -name '*.AppImage' -o -name '*.deb' -o -name '*.rpm' -o -name '*.msi' -o -name '*.exe' \) -exec cp {} "$DIST/desktop/" \;
        OK+=("desktop → $DIST/desktop")
      else
        FAILED+=("desktop")
      fi
      ;;
    android)
      echo "==> android (Tauri mobile)"
      if [[ -z "${ANDROID_HOME:-}" || ! -d src-tauri/gen/android ]]; then
        skip_or_fail android "needs ANDROID_HOME and a one-time 'pnpm tauri android init'"
        continue
      fi
      if $PNPM tauri android build; then
        mkdir -p "$DIST/android"
        find src-tauri/gen/android -name '*.apk' -o -name '*.aab' | xargs -I{} cp {} "$DIST/android/"
        OK+=("android → $DIST/android")
      else
        FAILED+=("android")
      fi
      ;;
    *)
      echo "!! unknown target: $target"
      FAILED+=("$target")
      ;;
  esac
done

echo
echo "Summary"
for x in ${OK[@]+"${OK[@]}"}; do echo "   ok      $x"; done
for x in ${SKIPPED[@]+"${SKIPPED[@]}"}; do echo "   skipped $x"; done
for x in ${FAILED[@]+"${FAILED[@]}"}; do echo "   FAILED  $x"; done
if [[ "$(uname)" == "Darwin" && ${#OK[@]} -gt 0 ]]; then open "$DIST"; fi
[[ ${#FAILED[@]} -eq 0 ]]
