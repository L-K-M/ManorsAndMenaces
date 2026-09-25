#!/usr/bin/env bash
# Builds every Manors & Menaces target and stages the results in dist/.
#
# Usage: scripts/build.sh [target...] [--debug] [--clean] [--check] [--install]
#   targets: web server desktop android   (default: all that this machine can build)
#   A missing toolchain skips a target on a default run, but fails when the
#   target was named explicitly.
#
#   --debug    debug variants: Tauri desktop --debug, Android debug APK
#   --clean    remove dist/ and the Rust build tree first
#   --check    print the plan (targets, toolchains, outputs) and exit
#   --install  after the desktop build, install the .app into /Applications
#              (macOS only; implies the desktop target)
#
# Requirements: Node 22.14+ with corepack (pnpm); desktop also needs Rust and the
# Tauri system libraries; android needs the Android SDK + NDK and JDK 17 —
# auto-detected from ANDROID_HOME/NDK_HOME/JAVA_HOME or their default install
# locations — plus `rustup target add aarch64-linux-android …`.
#
# Before any build it checks Node against package.json and that pnpm is
# reachable. The Android build uses rustup's toolchain when the rustc on PATH
# (say, Homebrew's) lacks the Android targets. On macOS, when only the DMG
# step fails, it retries once without the Finder window layout.
set -uo pipefail
cd "$(dirname "$0")/.."

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  awk 'NR==1 && /^#!/ {next} /^#/ {sub(/^# ?/,""); print; next} {exit}' "$0"
  exit 0
fi

DIST="dist"
VARIANT="release"
CLEAN=0
CHECK=0
INSTALL=0
EXPLICIT=""
TARGETS=()

for arg in "$@"; do
  case "$arg" in
    --debug) VARIANT="debug" ;;
    --clean) CLEAN=1 ;;
    --check) CHECK=1 ;;
    --install) INSTALL=1 ;;
    -h|--help) exec awk 'NR==1 && /^#!/ {next} /^#/ {sub(/^# ?/,""); print; next} {exit}' "$0" ;;
    --*) echo "!! unknown option: $arg (see --help)" >&2; exit 2 ;;
    *) TARGETS+=("$arg") ;;
  esac
done

if [[ ${#TARGETS[@]} -eq 0 ]]; then
  TARGETS=(web server desktop android)
else
  EXPLICIT=1
fi
if [[ $INSTALL -eq 1 ]]; then
  # --install means the desktop app; make sure it is built.
  has_desktop=0
  for t in "${TARGETS[@]}"; do [[ "$t" == "desktop" ]] && has_desktop=1; done
  [[ $has_desktop -eq 0 ]] && TARGETS+=(desktop)
  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "!! --install requires macOS: install the .deb from $DIST/desktop on Linux" >&2
    exit 1
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  echo "!! Node.js not found: install the version in .nvmrc (with nvm: nvm install)" >&2
  exit 1
fi
VERSION=$(node -p "require('./package.json').version")

version_at_least() { # have want: compares major.minor
  local h1 h2 w1 w2 rest
  IFS=. read -r h1 h2 rest <<<"$1"
  IFS=. read -r w1 w2 rest <<<"$2"
  (( h1 > w1 || (h1 == w1 && ${h2:-0} >= ${w2:-0}) ))
}

# Every target starts with `pnpm install`, so settle Node and pnpm first:
# an older Node's corepack fails with "Cannot find matching keyid", and
# Node 25 and later ship no corepack at all.
NODE_HAVE="$(node -p process.versions.node)"
NODE_WANT="$(node -p "require('./package.json').engines.node.match(/\d+(\.\d+)?/)[0]")"
NODE_PROBLEM=""
if ! version_at_least "$NODE_HAVE" "$NODE_WANT"; then
  NODE_PROBLEM="Node $NODE_HAVE is older than the $NODE_WANT this project needs (with nvm: nvm install && nvm use)"
fi
if command -v pnpm >/dev/null 2>&1; then
  PNPM="pnpm"
elif command -v corepack >/dev/null 2>&1; then
  PNPM="corepack pnpm"
else
  PNPM=""
  NODE_PROBLEM="${NODE_PROBLEM:+$NODE_PROBLEM; }pnpm not found and Node $NODE_HAVE has no corepack: run npm install -g corepack && corepack enable"
fi
# Corepack otherwise stops to ask before downloading the pinned pnpm.
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
declare -a OK=() SKIPPED=() FAILED=()

skip_or_fail() { # target reason
  if [[ $EXPLICIT -eq 1 || ( $INSTALL -eq 1 && "$1" == "desktop" ) ]]; then
    echo "!! $1: $2"
    FAILED+=("$1")
  else
    echo ".. skipping $1: $2"
    SKIPPED+=("$1")
  fi
}

# Locate the Android SDK, NDK and JDK without demanding exported variables:
# honour ANDROID_HOME/NDK_HOME/JAVA_HOME, else fall back to the default
# install locations. Exports what it finds; on failure sets ANDROID_FAIL.
detect_android_toolchain() {
  ANDROID_FAIL=""
  if [[ -z "${ANDROID_HOME:-}" ]]; then
    case "$(uname -s)" in
      Darwin) [[ -d "$HOME/Library/Android/sdk" ]] && ANDROID_HOME="$HOME/Library/Android/sdk" ;;
      Linux)
        shopt -s nullglob
        for d in "$HOME/Android/Sdk" /opt/android-sdk /usr/lib/android-sdk; do
          [[ -d "$d" ]] && ANDROID_HOME="$d" && break
        done
        shopt -u nullglob
        ;;
    esac
    [[ -n "${ANDROID_HOME:-}" ]] && export ANDROID_HOME
  fi
  if [[ -z "${ANDROID_HOME:-}" || ! -d "$ANDROID_HOME" ]]; then
    ANDROID_FAIL="Android SDK not found (set ANDROID_HOME or install it in the default location)"
    return 1
  fi

  if [[ -z "${NDK_HOME:-}" ]]; then
    shopt -s nullglob
    local ndks=("$ANDROID_HOME"/ndk/*)
    shopt -u nullglob
    if [[ ${#ndks[@]} -eq 0 ]]; then
      ANDROID_FAIL="no NDK under $ANDROID_HOME/ndk (install one via sdkmanager)"
      return 1
    fi
    NDK_HOME="$(printf '%s\n' "${ndks[@]}" | sort -V | tail -1)"
    export NDK_HOME
  fi
  if [[ ! -d "$NDK_HOME" ]]; then
    ANDROID_FAIL="NDK_HOME=$NDK_HOME does not exist"
    return 1
  fi

  if [[ -z "${JAVA_HOME:-}" ]]; then
    if [[ -x /usr/libexec/java_home ]]; then
      JAVA_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || /usr/libexec/java_home 2>/dev/null || true)"
    elif command -v java >/dev/null 2>&1; then
      JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")"
    fi
    [[ -n "${JAVA_HOME:-}" ]] && export JAVA_HOME
  fi
  if ! command -v java >/dev/null 2>&1 && [[ ! -x "${JAVA_HOME:-/nonexistent}/bin/java" ]]; then
    ANDROID_FAIL="JDK not found (install one or set JAVA_HOME)"
    return 1
  fi
  # Tauri's Android build needs JDK 17+; an older JDK fails cryptically
  # deep inside gradle. Best effort: accept when the version is unreadable.
  local java_bin=""
  if [[ -n "${JAVA_HOME:-}" && -x "$JAVA_HOME/bin/java" ]]; then
    java_bin="$JAVA_HOME/bin/java"
  else
    java_bin="$(command -v java 2>/dev/null || true)"
  fi
  if [[ -n "$java_bin" ]]; then
    local major
    major="$("$java_bin" -version 2>&1 | head -1 | sed -nE 's/.*version "(1\.)?([0-9]+).*/\2/p')"
    if [[ -n "$major" && "$major" -lt 17 ]]; then
      ANDROID_FAIL="JDK $major is too old: the Android build needs JDK 17+ (set JAVA_HOME)"
      return 1
    fi
  fi

  detect_android_rust
}

ANDROID_RUST_TARGETS=(aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android)

missing_android_targets() { # rustc: prints the targets it has no std for
  local target libdir missing=""
  for target in "${ANDROID_RUST_TARGETS[@]}"; do
    libdir="$("$1" --print target-libdir --target "$target" 2>/dev/null)"
    if [[ -z "$libdir" ]] || ! ls "$libdir"/libstd-*.rlib >/dev/null 2>&1; then
      missing="${missing:+$missing }$target"
    fi
  done
  echo "$missing"
}

# `tauri android build` compiles for all four Android targets with the
# cargo on PATH. A Rust without their standard library, typically
# Homebrew's ahead of rustup's, fails deep inside cargo with "can't find
# crate for `core`" even after `rustup target add`. So check up front, and
# when only rustup's toolchain has the targets, put it first on PATH for
# the Android build (ANDROID_RUST_BIN).
detect_android_rust() {
  ANDROID_RUST_BIN=""
  ANDROID_RUST_NOTE="the rustc on PATH has the Android targets"
  local path_rustc rustup_rustc missing=""
  path_rustc="$(command -v rustc 2>/dev/null || true)"
  if [[ -n "$path_rustc" ]]; then
    missing="$(missing_android_targets "$path_rustc")"
    [[ -z "$missing" ]] && return 0
  fi

  rustup_rustc="$(rustup which rustc 2>/dev/null || true)"
  if [[ -n "$rustup_rustc" ]]; then
    missing="$(missing_android_targets "$rustup_rustc")"
    if [[ -n "$missing" ]]; then
      ANDROID_FAIL="Rust has no standard library for $missing (run: rustup target add $missing)"
      return 1
    fi
    ANDROID_RUST_BIN="$(dirname "$rustup_rustc")"
    ANDROID_RUST_NOTE="rustup's toolchain in $ANDROID_RUST_BIN (${path_rustc:-no rustc on PATH}${path_rustc:+ lacks the Android targets})"
    return 0
  fi

  if [[ -z "$path_rustc" ]]; then
    ANDROID_FAIL="Rust toolchain not found (https://rustup.rs)"
  else
    ANDROID_FAIL="$path_rustc has no Android standard library and cannot get one: install Rust with rustup (https://rustup.rs), then run: rustup target add ${ANDROID_RUST_TARGETS[*]}"
  fi
  return 1
}

if [[ $CHECK -eq 1 ]]; then
  echo "==> plan"
  echo "-- targets:  ${TARGETS[*]}${EXPLICIT:+ (explicit)}"
  echo "-- variant:  $VARIANT"
  echo "-- version:  $VERSION"
  echo "-- staged:   $DIST/"
  echo "-- node:     ${NODE_PROBLEM:-$NODE_HAVE, $PNPM}"
  command -v cargo >/dev/null && echo "-- rust:     $(cargo --version)" || echo "-- rust:     missing (desktop will skip)"
  if detect_android_toolchain; then
    echo "-- sdk:      $ANDROID_HOME"
    echo "-- ndk:      $NDK_HOME"
    echo "-- java:     ${JAVA_HOME:-from PATH}"
    echo "-- rust std: $ANDROID_RUST_NOTE"
  elif [[ $EXPLICIT -eq 1 ]]; then
    echo "-- android:  $ANDROID_FAIL (android will FAIL: requested explicitly)"
  else
    echo "-- android:  $ANDROID_FAIL (android will skip)"
  fi
  exit 0
fi

if [[ -n "$NODE_PROBLEM" ]]; then
  echo "!! $NODE_PROBLEM" >&2
  exit 1
fi

if [[ $CLEAN -eq 1 ]]; then
  echo "==> cleaning"
  rm -rf "$DIST" src-tauri/target
fi
mkdir -p "$DIST"

echo "==> Installing dependencies"
$PNPM install --frozen-lockfile >/dev/null || { echo "!! pnpm install failed"; exit 1; }

BUNDLE_PROFILE="$VARIANT"   # release|debug bundle paths in src-tauri/target
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
      echo "==> desktop (Tauri, $VARIANT)"
      if ! command -v cargo >/dev/null 2>&1; then
        skip_or_fail desktop "Rust toolchain not found (https://rustup.rs)"
        continue
      fi
      if [[ "$(uname)" == "Linux" ]] && ! pkg-config --exists webkit2gtk-4.1 2>/dev/null; then
        skip_or_fail desktop "webkit2gtk-4.1 development files not installed"
        continue
      fi
      DEBUG_FLAG=""; [[ $VARIANT == "debug" ]] && DEBUG_FLAG="--debug"
      DMG_NOTE=""
      BUILD_MARK="$(mktemp)"
      $PNPM tauri build $DEBUG_FLAG
      desktop_status=$?
      # Tauri rewrites the .app's Info.plist on every build, so a fresh one
      # means the .app is complete and bundle_dmg.sh failed after it. Its
      # usual cause is the AppleScript that lays out the DMG window: it
      # needs the terminal to have Automation access to Finder. Tauri skips
      # that step when CI=true, so retry once without it.
      if [[ $desktop_status -ne 0 && "$(uname)" == "Darwin" ]] &&
        [[ -n "$(find src-tauri/target -maxdepth 7 -path "*/$BUNDLE_PROFILE/bundle/macos/*.app/Contents/Info.plist" -newer "$BUILD_MARK" -print -quit 2>/dev/null)" ]]; then
        echo ".. desktop: the .app was built but the DMG was not; retrying without the Finder window layout"
        CI=true $PNPM tauri build $DEBUG_FLAG
        desktop_status=$?
        DMG_NOTE=" (DMG without its window layout; for that, let your terminal control Finder in System Settings > Privacy & Security > Automation)"
      fi
      rm -f "$BUILD_MARK"
      if [[ $desktop_status -eq 0 ]]; then
        mkdir -p "$DIST/desktop"
        find src-tauri/target -path "*/$BUNDLE_PROFILE/bundle/*" -type f \
          \( -name '*.dmg' -o -name '*.AppImage' -o -name '*.deb' -o -name '*.rpm' -o -name '*.msi' -o -name '*.exe' \) \
          -exec cp {} "$DIST/desktop/" \;
        if [[ $INSTALL -eq 1 ]]; then
          APP="$(find src-tauri/target -maxdepth 6 -path "*/$BUNDLE_PROFILE/bundle/macos/*.app" -print -quit 2>/dev/null)"
          [[ -n "$APP" ]] || { echo "!! no .app bundle found to install"; FAILED+=("desktop install"); continue; }
          NAME="$(basename "$APP")"
          # Stage into a temp dir and swap, so a failed copy never destroys
          # an already-installed app.
          TMP_APP="/Applications/.${NAME}.incoming"
          rm -rf "$TMP_APP"
          if ditto "$APP" "$TMP_APP" 2>/dev/null || { rm -rf "$TMP_APP" && cp -R "$APP" "$TMP_APP"; }; then
            rm -rf "/Applications/$NAME"
            mv "$TMP_APP" "/Applications/$NAME"
          else
            rm -rf "$TMP_APP"
            echo "!! failed to install $APP into /Applications"
            FAILED+=("desktop install")
            continue
          fi
          open -R "/Applications/$NAME" 2>/dev/null || true
        fi
        OK+=("desktop → $DIST/desktop$DMG_NOTE")
      else
        FAILED+=("desktop")
      fi
      ;;
    android)
      echo "==> android (Tauri mobile, $VARIANT)"
      detect_android_toolchain || { skip_or_fail android "$ANDROID_FAIL"; continue; }
      [[ -n "$ANDROID_RUST_BIN" ]] && echo ".. android: using $ANDROID_RUST_NOTE"
      DEBUG_FLAG=""; [[ $VARIANT == "debug" ]] && DEBUG_FLAG="--debug"
      if PATH="${ANDROID_RUST_BIN:+$ANDROID_RUST_BIN:}$PATH" $PNPM tauri android build --apk $DEBUG_FLAG; then
        mkdir -p "$DIST/android"
        find src-tauri/gen/android/app/build/outputs -name '*.apk' -exec cp {} "$DIST/android/" \;
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
