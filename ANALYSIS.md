# Manors & Menaces — Analysis & Future Work (ANALYSIS.md)

> Consolidated from `tmp.md` (2026-09-24 thorough review: spec v0.2, `packages/*`, `apps/web`, `apps/server`, `tools/`, `tests/`, `src-tauri`). Items already fixed via open PRs are marked DONE with PR refs and removed from the work list. Everything else is shovel-ready for an LLM to pick up. “AquaZone” appears nowhere in repo/spec; §7 treats it as “polish a Catan/Kolonists-like needs”.
>
> Open PRs (left open for review/merging, no blocking feedback received yet):
> - #4 Center board pips and banners, fix highlight contrast (`fix/board-readability`)
> - #5 Guard card targets and clone menace destinations (`fix/rules-guards`)
> - #6 Require a human seat and finish tutorials explicitly (`fix/newgame-tutorial-guards`)
> - #7 Pre-index board holdings and banner counts (`perf/board-indexing`)

## 0. Biggest wins (in priority order)

1. Board readability + aesthetics (contrast, parchment/wood system, icon unity).
2. UX friction (tool-first discovery, silent busy/AI delay, undo vanishing, banner targeting, log stickiness, tutorial flow).
3. Perf/stutter (derived churn, SVG blur/pulse, unthrottled camera, transitions).
4. Rules/AI/content dead-ends (dragon-hoard choice, charter type, menace rotation, AI counter coverage).
5. Server robustness (AI scheduler stall, invite collision 500, validation, sync SQLite + N+1 fan-out, rate-limit blind spots).
6. Missing Catan/Kolonists table stakes: trade offers, longest-road/largest-army equivalents, robber-discard equivalent, stats/rematch, async notifications, mobile layout.

## 1. DONE in this round (do not re-do; verify at merge)

- DONE (#4): banner/pip centering no-op `*0` formulas fixed; highlight changed from pale-yellow wash (invisible on grain) to blue outline fill; glow filter removed from `.hl-line`; quest `ready` uses box-shadow not border-width. Files: `Board.svelte`, `QuestPanel.svelte`.
- DONE (#5): Druid’s Blessing requires assigned banner; Fog rejects already-fogged routes (enumeration auto-filters via `validateCardTarget`); `Tx.moveMenace` clones destination (`{...to}`) so state never aliases command objects. Files: `packages/rules/src/cards.ts`, `tx.ts`.
- DONE (#6): New Game blocks 0-human seats (disabled Begin + hint + `ui.at_least_one_human_required`); tutorial final step has explicit `ui.finish_tutorial` Finish button instead of silent exit. Files: `NewGame.svelte`, `TutorialCoach.svelte`, `packages/content/src/i18n/en.ts`.
- DONE (#7): `holdingBySite` + `bannerCountByRegion` derived maps replace O(S*H) per-frame scans in Board site/region loops. File: `Board.svelte`.

## 2. Bugs still open (observable wrong behaviour)

### Rules engine
- `packages/rules/src/legal.ts:222-223` vs `cards.ts:142-153`: `dragon_whisperer` enumerates only `{destination}`, never `{destination,take}`. Resolver auto-picks first hoard resource (`cards.ts:147`). Shovel-ready: enumerate per-resource `take` variants when hoard has >1 type; add UI choice (drag-one-resource-out or dialog); AI should pick max-value resource. Test: hoard with 2 types, whisper, assert chosen resource taken.
- `packages/rules/src/selectors.ts:163`: upgrading a Stronghold returns `SITE_OCCUPIED` (“That Site is taken”). Shovel-ready: add distinct `ALREADY_STRONGHOLD` code + i18n string + UI message.
- `packages/rules/src/engine.ts:728`: `react` hardcodes counterspell; future `timing:["reaction"]` cards rejected despite `legal.ts:89`. Shovel-ready: dispatch on `timing.includes("reaction")` + generic reaction resolver.
- `packages/rules/src/quests.ts:90-97` + `board.ts:73`: `far_reaches` uses raw graph distance ignoring ownership/fog/highwayman. Shovel-ready: decide spec (network vs graph), implement + test both interpretations, document.
- `packages/rules/src/balance.ts:34-43`: `standardMenaces()` never yields `goblin_tinkers`; `highwayman` only 2p, `bog_witch` only 4p, despite all 5 starts defined (`greenvale.ts:1036-1072`). Shovel-ready: design rotation (e.g. 3p: troll + dragon + highwayman/goblin alternate by seed; 4p: include goblin), update `balance.ts` + tests + docs.
- `packages/rules/src/types.ts:73` / `content/types.ts:69-80` / `content/cards.ts:22-33`: `CardType "charter"` declared, zero cards use it. Shovel-ready: either implement 2–3 charter cards (economic/scoring modifiers) or remove the type.
- `packages/protocol/src/index.ts:158-165`: `isWellFormedCommand` envelope-only (8k cap); oversized `assignments`/`order` reach engine. Shovel-ready: per-field caps + fuzz test.
- 2p deck filters `dragon_whisperer` (`engine.ts:159`, `rules.test.ts:370-374`). Document as intentional or rotate menace/card pools together.

### Web client
- `Board.svelte:68` menace anchor (`labelX+40,+4`) collides with banner row (`+26`); hoard text (`:400`) overlaps in small regions. Shovel-ready: dynamic anchor (banner-count-aware offset) + hoard badge below token.
- `ActionBar.svelte:36-38` draft diff `regionId!==r` miscounts `null` vs `undefined`. Shovel-ready: normalize with `?? null` + unit test.
- Silent busy: `session.svelte.ts:176` returns false with no feedback; AI delay 550ms (`settings:56-59`); spinner only in ActionBar. Shovel-ready: global busy indicator + disabled-state reasons on tools.
- Undo vanishes after lock (`session:251-252`); button stays disabled with no explanation. Shovel-ready: tooltip “Undo available until you draw/play/trade-lock” + toast on lock.
- `LogPanel.svelte:11-14` forces scroll to bottom on every append. Shovel-ready: stickiness toggle — only auto-scroll if already near bottom; add “jump to latest” pill.
- `Dialogs.svelte:50-52` `$effect` resets prophecy `order`, wiping keyboard reorder. Shovel-ready: init once on open, not on every pending change.
- Hardcoded English: `GameScreen.svelte:89 "Save"`, `session.svelte.ts:59 "Saved."`. Shovel-ready: move to `t()` keys.
- `TutorialCoach` mobile position crowds camera (`TutorialCoach:92-99` vs `GameScreen:197-203`); header buttons 32px violate 44px min (`app.css:32`). Fix at next touch-target pass.

### Server / tools
- AI scheduler stall (`service.ts:238-287`): pending timer + stale seat early-return without reschedule stalls multi-AI games; `setTimeout 5000 unref` retry unbounded. Shovel-ready: reschedule on early-return; bound retries; regression test with 2 AI seats.
- Invite collision 6-char code without retry → 500 (`service.ts:104-105`, `store.ts:116-121`). Shovel-ready: retry loop → 409 only after N tries; test collision.
- `OPTIONS` returns 204 with JSON body (`app.ts:71-80,140,149`); `GET /api/health` rate-limited → Docker HEALTHCHECK can 429 (`Dockerfile:23`). Shovel-ready: empty 204 body; exempt `/api/health` from limiter.
- `store.ts:46-93`: no `busy_timeout`/migrations; `BEGIN IMMEDIATE` throws `SQLITE_BUSY`; no index on `match_players(user_id)`. Shovel-ready: `busy_timeout=5000`, migration table, index, concurrent-commit test.
- `tools/simulate.ts:92-96`: double-applies engine (runAiUntilHuman + applyCommand for events) → 2× CPU + divergence risk; `MAX_ROUNDS 60` vs `playouts 80`; `Math.min(...[])` → Infinity / `avg([])` → NaN when 0 finished (`:146`). Shovel-ready: single-apply event capture; unify max rounds; guard empty stats; `--jobs` + non-zero exit on target miss.
- `tools/generate-map.mjs`: exponential MIS (`322-345`); `bfs().get()` undefined → NaN; `--seed 0` → 14 silently; tunables hardcoded; no atomic write; `goblinSite` can throw. Shovel-ready: greedy MIS, validate BFS, explicit seed handling, atomic write, golden-map diff test.
- `scripts/sync-versions.mjs:7` misses `src-tauri/Cargo.toml` + `tauri.conf.json` → drift. Add both.
- `MatchService.replayData` has no auth check (`service.ts:294-298`); safe only via caller (`app.ts:173-177`). Add callee-side check.
- `MAP_ID="greenvale"` hardcoded (`service.ts:48,72,106`); `createMatch` ignores client `mapId`. Multi-map support task (§4).
- No validation of `PORT/HOST/AI_DELAY_MS` (`server/main.ts:24,26`); `CORS_ORIGIN *` default insecure; WS auth via `?token=` leaks; static server gaps (no HEAD/Range/ETag, missing MIME, serves dotfiles/sourcemaps). Harden per tmp §2.
- `pushTo` fakes UserRow (`app.ts:250-253`). Refactor to direct view call.

## 3. Performance / stutter (remaining after #4/#7)

- Full-board derived churn: `Board.svelte:17-22` rebuilds Maps on any draft change; `bannerPositions` sorts per region + `getHarvestPreview` on every draft keystroke. Shovel-ready: memoize by revision + draft-version; debounce preview during drag.
- Overdraw + blur: sea `+1600×1200` with waves pattern + 5 hatches repaints on every pan (`Board:187-189,213-214`); `pulse 1.4s infinite` (`531-539`) on N targets = continuous repaint. Shovel-ready: smaller sea overdraw, `will-change` scoping, pause pulse when `animationScale()==0`, gate `prefers-reduced-motion`.
- Unthrottled camera: `panBy/zoomAt` per pointermove (`116-139`), `getScreenCTM().inverse()` (`94-102`) each move → layout thrash + whole-board re-render. Shovel-ready: rAF-coalesced pan/zoom, cache CTM per frame.
- Transitions on every `.banner/.menace` (`504-510`) animate mass shifts at once; `dur=0` still creates transition. Shovel-ready: animate only moved tokens (diff positions), skip transition when `dur==0`.
- Floater churn: `GameScreen.svelte:103` `.filter(viewer)` per render; `session:299-306` spread + `setTimeout 1600ms` per resource_gained. Shovel-ready: memoize filtered floaters; pool timers.
- `LogPanel.svelte:13` sync `scrollHeight` read per append (up to 300 entries). Shovel-ready: rAF-batched scroll (ties into stickiness fix).
- Shared engine Map singleton per mapId (`engine.ts:4-13`). Audit for cross-match state.
- Server: fan-out `O(S×(DB+redact+stringify))` per move; `presenceChanged` `O(M×S)`; `listMatches` N+1 (~100 queries); sync `DatabaseSync` + full-snapshot stringify per read/write; rate-bucket sweep gaps; proxy shared-bucket DoS. Shovel-ready items in priority order: exempt health + trusted-proxy IP; per-match view cache per revision; batch `seats()` for list; `busy_timeout`; snapshot diff/compress later.
- CI: `playouts.test.ts:57,82-90` 20000 steps ×4 configs with 120s timeouts → slow. Shovel-ready: reduce configs on PR, full on nightly.
- Desktop: `codegen-units=1+lto+opt-s` slow builds; `bundle.targets all` builds unneeded targets. Profile-gate.

## 4. Missing features (vs spec + Catan/Kolonists table stakes)

- Player-to-player trade offers/counter-offers (spec has neutral Market only). Shovel-ready: async offer + accept/decline + expiry; AI evaluators for fairness.
- Longest-road / largest-army equivalents (King’s Highway quest is closest). Shovel-ready: persistent holder crown (most routes / most menaces moved) with steal animation + jewel marker.
- Robber-discard / hand-pressure equivalent (hand limit 7 exists, no 7-roll). Shovel-ready: Omen track (§6) or Menace-tithe event.
- Lobby: rematch, leave/kick, delete match, pagination (`LIMIT 50`), session expiry/logout/rotation (`renameUser` unused). Shovel-ready one endpoint at a time.
- Multi-map support + map preview in lobby + random-map option.
- Async notifications (turn-started only online `session:329-331`; presence unused in UI). Shovel-ready: badge + sound + optional email/push hook.
- Stats screen (telemetry `recordGame` exists, no UI): win-rate, avg harvest, writs/wardens per game.
- Replay viewer (API exists, no UI scrubber; hash check test-only). Shovel-ready: event-list scrubber reusing `replay()`.
- Spectator mode (0-human hole closed by #6; full spectator = separate task: read-only view + follow-actor).
- Mobile: mid breakpoint (950px overflow: side `minmax(17rem,22rem)` + preview `14rem` + 6–7 tools); topbar two-row wrap leaves board ~40dvh; side slide-over needs backdrop/focus-trap/Escape; nested scroll (side + log); `NewGame` seat crush on 320px; panel clipping over 100dvh; menu overflow in small landscape. Shovel-ready: 1100px mid breakpoint; bottom-sheet tools on mobile; dismissable side panel.
- Content: charter cards or remove type; Highwayman/Goblin rotation; dragon-hoard choice (§2).
- Tests: `vitest.config` excludes `tools/**`, `apps/web/**`; `server.test` uses 10000/s limiter (rate limiting never tested); missing CORS/WEB_DIST/replay-auth-negative/lobby-full/AI-fallback/persistence/concurrency tests; Tauri not in e2e; `build.sh` silently skips without toolchain; no `cargo test/clippy/fmt` in `check`. Harden incrementally.

## 5. Visual / layout / aesthetics (remaining)

- Menace/banner collision (§2); coast stroke bleed (`stroke-width 18` centred covers near-shore edges); hand `10.5rem` cards force `overflow-x:auto` with no snap/peek; title flat gradient + uniform menu weight + orphaned version; emoji vs SVG glyph clash (🌾🌲⛰⚒✦/♛ vs hand-drawn glyphs — pick one set via `ResourceIcon`); topbar ghosts washed on wood; side tabs weak; text-scale ignored on board (SVG fixed 13/11/12/9px); touch targets 32px < 44px min; contrast borderline (`ActionBar small .68/.75`, hand meta, `#7a1d10/.8rem`); high-contrast theme doesn’t remap wood/map fills/player themes; spinner needs `role=status`.
- Shovel-ready aesthetic pass: parchment/wood token system (spacing, radius, border tokens); single icon set; topbar contrast; legend drawer for colour+shape encoding (spec §49 already requires dual-channel — surface it); hand snap/peek; SVG text-scale hookup.

## 6. UX gaps (remaining)

- Tool-first discovery (disabled tools with `title=` only, no touch help); `buy_card` fires immediately vs two-step builds. Standardise to preview-then-confirm + reason tooltips (“needs X / wrong phase / limit”).
- Cards give no reason on non-playable click; discard quota buried. Add `aria-disabled` + reason + “select N to discard” group.
- Banner draft: `26×30` hit rect hard to tap when stacked; `send_home` needs selection with no list fallback. Add banner list fallback + bigger hits when targeting.
- Targeting locks exploration (`pointer-events:none`, `tabindex -1`); focus lost; empty-sea click doesn’t cancel. Keep focus, allow sea-click cancel.
- Tabs (`tablist` without `aria-controls`/arrows/`tabpanel`); board `role=application` trap (Enter/Space only, no arrows); labels miss selectable/selected/disabled; reaction/prophecy Modal trap + Escape audit; NewGame radio `:focus-visible`; board focus ring weak on sea; `aria-live` on whole log too verbose (single status line instead).
- No harvest-summary persistence (§16.1 wants concise summary; floaters vanish in 1.6s); next-harvest preview hidden when no actor.

## 7. “AquaZone” gap list (interpreted)

Animated water/ambient life; tactile harvest ritual (banners lack drama); robber-tension loop; harbour mastery feel (posts invisible — need pennants + 2:1 badges); crown moment; table talk (chat/emotes/trade offers); catch-up rubber-band; end-game fanfare (verify confetti/score breakdown/“one more game” in `Overlays.svelte`).

## 8. Novel / delightful / quirky (pick one per PR)

1. Harvest comets: banner fires comet to HUD on harvest (SVG animateMotion, gated by animationScale).
2. Menace gossip diary: one-line flavour per menace in log + tooltip. Zero rules.
3. Dragon hoard viewer: click dragon → glint peek; whisper = drag-one-resource-out (pairs with §2 hoard-choice fix).
4. Warden lantern guard: lantern ring until hirer’s next turn explains immobility.
5. Prophecy fan: top-3 cards fan out, drag to reorder (replaces modal list).
6. Festival confetti + shared-bread icon; simultaneous +1 Grain fly-outs.
7. Fog as drifting translucency over route, not dashed line.
8. Troll toll booth: booth + TOLL sign; blocked banners show crumbs.
9. Trading-post pennants + 2:1 badges; reachable posts glow in market dialog.
10. Banner weather-vane: unsettled flutters (CSS sway), settled stands crisp — teaches writ protection visually.
11. Quest wax-seal stamp + progress pips (Monster Problems 1/3, 2/3) on quest card.
12. Omen track: “Trouble brews…” meter ticks when leader pulls ahead; weakest player moves a menace free. Replaces dice dread + catch-up.
13. “Tomorrow’s harvest” postcard: banner-phase confirm shows postcard + Stamp button.
14. Hot-seat herald: curtain with crest + “Pass to Azure”.
15. Sound + haptics: woodblock/chime/thud; `vibrate(10)` on illegal tap (respect mute/reduced-motion).
16. Legend drawer for dual-channel encoding audit.

## 9. Suggested build order for future LLMs

- P0: log stickiness; menace anchor; busy reasons; sea-click cancel; health-check + OPTIONS fixes.
- P1: dragon-hoard choice + viewer; omen track; server AI-stall + invite retry + validation; rate-limit + static hardening; charter decision; menace rotation.
- P2: trade offers; crown; harvest comets + postcard; gossip log; lantern guard; quest stamps; post pennants; replay viewer; stats screen; mid-breakpoint + mobile sheet.
