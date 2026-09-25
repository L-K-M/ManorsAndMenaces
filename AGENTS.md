# AGENTS.md — working on Manors & Menaces

## Toolchain

- **Node 22.14+** (see `.nvmrc`; older releases bundle a corepack that rejects npm's current signing key) with **corepack** — `corepack enable` provides the pinned pnpm (`packageManager` in `package.json`). Node 25 and later no longer include corepack; run `npm install -g corepack` first.
- **Desktop builds:** Rust (stable, via rustup) and the Tauri system libraries. On Debian/Ubuntu: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`.
- **Android (optional):** JDK 17, Android SDK with NDK 29 (`ANDROID_HOME`, `NDK_HOME`), and `rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android`. The Android Studio project lives in `src-tauri/gen/android` (committed). Build with `pnpm tauri android build --apk`; release APKs are unsigned until a keystore is configured (see Tauri's Android signing guide).
- **E2E tests:** `pnpm --filter @manors-menaces/web exec playwright install --with-deps chromium`.

## Commands

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Web dev server | `pnpm dev` (http://localhost:5173) |
| Online server (dev) | `pnpm server` (http://localhost:8787; `DB_PATH`, `PORT`, `WEB_DIST`, `CORS_ORIGIN`, `AI_DELAY_MS`, `TRUST_PROXY` = reverse proxies in front whose X-Forwarded-For is trusted, default 0; see `apps/server/src/main.ts`) |
| Desktop dev | `pnpm tauri:dev` |
| Typecheck everything | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Unit + integration + server tests | `pnpm test` |
| UI end-to-end tests | `pnpm test:e2e` |
| CI-equivalent check (no e2e) | `pnpm check` (typecheck, lint, test, map:check, build:check) |
| Production build + server smoke test | `pnpm build:check` |
| Balance simulation | `pnpm simulate --games 40 --players 3 --rules standard` |
| Regenerate the map | `pnpm map:generate` (deterministic; commit the result; `pnpm map:check` verifies it) |
| Build all targets | `scripts/build.sh [web] [server] [desktop] [android]` → `dist/` |
| Release | `scripts/release.sh X.Y.Z [--push]` |
| Installers without a release | `gh workflow run build.yml` → macOS `.dmg`, Linux `.deb`/`.AppImage`, Android `.apk` as run artifacts |

## Architecture rules (from the spec)

- `packages/rules` must not import Svelte, DOM, SVG, Tauri or server code (§33, §103); `eslint.config.js` enforces these package and app import boundaries. All randomness goes through the match RNG (§30); ESLint forbids `Math.random` outside UI/tools.
- Legality lives only in the rules engine and its selectors; UIs and the AI ask `getLegalActions`/selectors and send commands (§103).
- State is plain JSON (§106). The engine clones and never mutates its input.
- Content is data; card/quest behaviour is typed code keyed by id (§39–41). User-facing text goes through `t()` with keys in `packages/content/src/i18n/en.ts` (§71).
- Online: the server is authoritative. Clients send command batches with `expectedRevision`; the server redacts hidden information per viewer (§59–60, §105).

## Helper scripts

- `scripts/release.sh` — stub over the shared `lkm-release` engine (kind `tauri`); `scripts/sync-versions.mjs` keeps every workspace `package.json` and the README marker in lockstep.
- `scripts/build.sh` — multi-target orchestrator (web, server, desktop, android); missing toolchains skip on a default run and fail when named. It checks Node and pnpm before installing, uses rustup's toolchain for Android when the `rustc` on PATH lacks the Android targets, and retries a macOS DMG without its Finder window layout; `--check` shows what it found.
- `update.sh` — pull + `docker compose up -d --build` for a self-hosted server.
- `tools/generate-map.mjs` — Voronoi map generator; `tools/simulate.ts` — AI-vs-AI telemetry against the §68 targets.

## Icons

`media-sources/icon.png` is the master; `media-sources/icon.json` adds the background colour for iOS, the Android adaptive icon and the web's full-bleed variants, and the Android foreground scale. Regenerate the desktop, iOS and Android icons with `pnpm tauri icon media-sources/icon.json -o src-tauri/icons` (the Android launcher icons land in `src-tauri/gen/android/app/src/main/res`), and the web favicon and manifest icons (including the maskable and Apple touch variants) with `node tools/generate-pwa-icons.mjs`; the derived icons are committed.

## Offline web app

The production web build emits `sw.js` (from `apps/web/pwa/sw.template.js`) with a precache manifest of every built file and a cache name hashed from their contents, so each release installs as a new service worker. It registers only in production web builds, never in the dev server or Tauri, and never intercepts `/api/` requests or the WebSocket.

<!-- shared-rules:start -->

## Working practices

- Follow explicit task instructions over the default workflow below.
- Writing the code is not finishing the task. A task is finished when
  its changes are merged to main through a PR that passed CI and review,
  or when the user explicitly accepts a different end state.
- Start every task on current code. Fetch first, then cut the task
  branch from origin/main — never from a stale local branch or an old
  checkout. To continue existing work, rebase or merge the latest
  origin/main into it before editing. Never overwrite existing work to
  update.
- Resolve ambiguity before making consequential changes. State low-risk
  assumptions; ask when scope, safety, or expected behavior is unclear.
- Keep changes focused. Do not modify unrelated code, formatting, or comments.
- Prefer surgical edits over whole-file rewrites when the result is equivalent.
- Stage only intended files. Inspect the diff before committing.

## Communication

- Be concise, factual, and direct. Preserve necessary context and uncertainty.
- Avoid praise, motivational filler, emojis, and em dashes in new prose.
- Address the reader directly in user-facing copy.
- Report what was verified and what remains unverified. Never imply that an
  unavailable check passed.

## Code design

- Prefer early returns and shallow nesting. Separate logical blocks with
  blank lines.
- Use descriptive constants or enums for meaningful or repeated values.
  Use existing standard definitions for protocol/specification constants.
  Keep obvious, one-off values inline.
- Use enums for behavioral modes that would otherwise require ambiguous
  boolean arguments.
- Default members to private. Widen visibility only for required consumers,
  and review the change as an API design decision.
- Follow the repository's declared dependency boundaries. UI and controllers
  must use application services rather than directly accessing databases,
  subprocesses, sockets, or other low-level mechanisms.
- Encapsulate low-level mechanics behind domain-oriented interfaces.
- Reuse genuinely shared logic. Avoid speculative abstractions and layers
  that only forward calls.
- Prefer pure functions for business rules and immutable data where practical.
  Isolate side effects; document non-obvious state ownership or synchronization.
- Explain non-obvious intent, constraints, and tradeoffs in comments.
  Do not narrate obvious code. Add examples or diagrams when they clarify it.

## Validation and errors

- Validate untrusted input at entry points. Where practical, represent valid
  states in types and enforce persistent invariants in database schemas.
- Represent absence and failure explicitly.
- Use assertions for internal programming invariants, not external-input
  validation or required runtime error handling.
- Prefer explicit, actionable errors over silent failure or undocumented
  fallback. Document intentional recovery behavior.
- Never report a skipped or failed operation as successful.

## Bug fixes

1. Identify the root cause and define an observable success criterion.
2. Add a regression test and observe the relevant failure before fixing it.
3. Implement the fix and observe the test passing.
4. Check surrounding behavior for regressions and architectural consistency.

If an automated regression test is impractical, document the reproduction
and verification procedure. State any inability to reproduce the failure.

## Verification

- Run relevant tests and lint after changes.
- Choose coverage by affected behavior and risk, not patch size.
- Use integration or end-to-end tests for critical workflows and boundaries;
  test isolated business rules at the lowest effective level.
- Run broader suites for cross-cutting or high-risk changes, and the full
  required release checks before releasing.
- Validate the requested command, options, platform, and configuration.
  Unrelated green CI is not proof that the reported problem is fixed.
- Recheck after the final edit. Distinguish local checks from CI results.

## Commit messages

- Use a capitalized, imperative subject without a final period.
- Target 50 characters; never exceed 72.
- Separate the subject and body with one blank line.
- Wrap body text at 72 characters.
- Explain what changed and why. Leave implementation mechanics to the code.

## Implementation and review

Unless explicitly instructed otherwise:

1. Work on a focused branch cut from the latest origin/main and open a PR
   against main before reporting the task as done.
2. Inspect CI results and completed review feedback for the latest commit.
   A successful reviewer job does not mean the review found no problems.
3. Address important findings or explain why they do not apply. Handle minor
   findings according to the stopping rules below.
4. Evaluate each fix in the surrounding project, add regression coverage,
   and rerun affected checks before pushing.
5. Repeat until a stopping criterion is met.
6. Merge without asking again once the stopping criterion is met, required
   checks pass on the latest commit, and no unresolved blockers or required
   human review requests remain.

### Reviewer context limits

The automated PR reviewer does not see the user's original prompt or
conversation. It may suggest changes that go against or beyond what the
user asked for. Do not implement such suggestions. Note each conflict and
report it to the user at the end of the thread.

### Automated review stopping rules

Judge findings by verified impact, not the reviewer's severity label.
Important findings concern correctness, security, data loss, broken builds,
or materially degraded behavior/performance.

Track completed review rounds and consecutive rounds without important
findings. Reruns of the same revision and integration failures do not count.

- No applicable actionable feedback: finish immediately.
- First minor-only round: optionally fix worthwhile, low-risk findings.
  Do not manufacture another push merely to obtain another review.
- Two consecutive rounds without important findings: stop responding to
  automated nitpicks, even if actionable minor suggestions remain.
  Defer worthwhile leftovers rather than continuing the cycle.
- A confirmed important finding resets the minor-only streak. Address it
  and verify the fix before continuing.

After ten completed rounds, enter stabilization:

- Stop optional cleanup, refactoring, and nitpick fixes.
- One completed review without confirmed important findings is sufficient
  to finish, even if minor suggestions remain.
- Continue only for confirmed important defects. If resolving them stalls,
  report the blockers rather than continuing indefinitely.

These limits end optional automated-feedback work. They do not waive
confirmed blockers, unresolved human review requests, or required checks.

### Reviewer integration failures

After two consecutive reviewer-integration failures, stop and report the
review gap. Do not treat failures as approval. An explicit user instruction
may waive review; report that waiver rather than claiming review passed.

## Ending a task

- A task ends with its changes merged to main — not with code written,
  and not with a PR merely opened. An open PR is work in progress:
  monitor CI on the latest commit, address review findings per the
  stopping rules, and merge once the criteria are met.
- Never finish with uncommitted changes or unpushed commits in the
  worktree. Commit, push, and open or update the PR first.
- If a step is impossible (missing push access, CI failure, reviewer
  outage), report the exact blocker instead. Never present unreviewed or
  unmerged work as finished.
- Before finishing, confirm: the requested behavior is implemented
  without unrelated changes; relevant checks pass on the latest code;
  important review findings are addressed or rejected with reasons;
  deferred suggestions, remaining risks, and validation gaps are
  disclosed.
- The final response states where the work stands: branch, PR, CI
  status, review rounds completed, and whether it is merged.

<!-- shared-rules:end -->
