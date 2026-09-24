# AGENTS.md — working on Manors & Menaces

## Toolchain

- **Node 22.13+** (see `.nvmrc`) with **corepack** — `corepack enable` provides the pinned pnpm (`packageManager` in `package.json`).
- **Desktop builds:** Rust (stable, via rustup) and the Tauri system libraries. On Debian/Ubuntu: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`.
- **Android (optional):** JDK 17, Android SDK with NDK 29 (`ANDROID_HOME`, `NDK_HOME`), and `rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android`. The Android Studio project lives in `src-tauri/gen/android` (committed). Build with `pnpm tauri android build --apk`; release APKs are unsigned until a keystore is configured (see Tauri's Android signing guide).
- **E2E tests:** `pnpm --filter @manors-menaces/web exec playwright install --with-deps chromium`.

## Commands

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Web dev server | `pnpm dev` (http://localhost:5173) |
| Online server (dev) | `pnpm server` (http://localhost:8787; `DB_PATH`, `PORT`, `WEB_DIST`, `CORS_ORIGIN`, `AI_DELAY_MS`) |
| Desktop dev | `pnpm tauri:dev` |
| Typecheck everything | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Unit + integration + server tests | `pnpm test` |
| UI end-to-end tests | `pnpm test:e2e` |
| CI-equivalent check | `pnpm check` |
| Balance simulation | `pnpm simulate --games 40 --players 3 --rules standard` |
| Regenerate the map | `pnpm map:generate` (deterministic; commit the result) |
| Build all targets | `scripts/build.sh [web] [server] [desktop] [android]` → `dist/` |
| Release | `scripts/release.sh X.Y.Z [--push]` |
| Installers without a release | `gh workflow run build.yml` → macOS `.dmg`, Linux `.deb`/`.AppImage`, Android `.apk` as run artifacts |

## Architecture rules (from the spec)

- `packages/rules` must not import Svelte, DOM, SVG, Tauri or server code (§33, §103). All randomness goes through the match RNG (§30); ESLint forbids `Math.random` outside UI/tools.
- Legality lives only in the rules engine and its selectors; UIs and the AI ask `getLegalActions`/selectors and send commands (§103).
- State is plain JSON (§106). The engine clones and never mutates its input.
- Content is data; card/quest behaviour is typed code keyed by id (§39–41). User-facing text goes through `t()` with keys in `packages/content/src/i18n/en.ts` (§71).
- Online: the server is authoritative. Clients send command batches with `expectedRevision`; the server redacts hidden information per viewer (§59–60, §105).

## Helper scripts

- `scripts/release.sh` — stub over the shared `lkm-release` engine (kind `tauri`); `scripts/sync-versions.mjs` keeps every workspace `package.json` and the README marker in lockstep.
- `scripts/build.sh` — multi-target orchestrator (web, server, desktop, android); missing toolchains skip on a default run and fail when named.
- `update.sh` — pull + `docker compose up -d --build` for a self-hosted server.
- `tools/generate-map.mjs` — Voronoi map generator; `tools/simulate.ts` — AI-vs-AI telemetry against the §68 targets.

## Icons

`media-sources/icon.svg` is the master. Regenerate all app icons with `pnpm tauri icon media-sources/icon.svg -o src-tauri/icons`; the derived icons are committed.
