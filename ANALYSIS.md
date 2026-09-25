# Manors & Menaces: analysis and future work

This document merges two reviews of the whole monorepo (rules engine, content, AI, web and Tauri client, online server, tooling and CI) and the follow-ups from the pull requests that came out of them:

- The previous `ANALYSIS.md` (another agent's review of 2026-09-24, spec v0.2, which produced PRs #4 to #7).
- A second, independent review of 2026-09-24 with 226 verified findings (distinct ids: 160 entries plus 66 duplicates merged into them under "Also covers"), most reproduced with scripts, Playwright runs, screenshots or measurements, which produced PRs #8 to #25. Its repro scripts and screenshots lived in a session scratchpad and are not committed.

Work that an open PR already covers is listed only under [Done or in flight](#done-or-in-flight-do-not-redo). Everything under [Backlog](#backlog) is open.

Note on "AquaZone": the original request mentions "the original AquaZone". The name appears nowhere in the repository or the spec. The second review read it as the original iOS Catan clone **Kolonists**, which the project is modelled on, and compares against Kolonists and modern Catan apps (Catan Classic, Catan Universe, colonist.io). The previous analysis treated it as "the polish a Catan/Kolonists-like game needs". Both readings are kept in [Gaps versus Catan and Kolonists](#gaps-versus-catan-and-kolonists).

## How to use this document

This is written for agents (human or LLM) picking up work.

1. **Check [Done or in flight](#done-or-in-flight-do-not-redo) first.** PRs #4 to #30 were consolidated into one tree; see [Consolidation](#consolidation-2026-09-25) for what was merged, folded or closed. Do not redo their work.
2. **Ids are stable.** Refer to entries by id (for example `rules-reaction-window-leaks-counterspell`) in branches, commits and PR bodies. Where several findings shared a root cause, one entry lists the others under "Also covers". Entries carried over from the previous analysis got new ids and say "From the previous analysis".
3. **Entry layout.** Each entry has: id and title; Severity (critical, high, medium, low), Effort (S under a day, M 1 to 3 days, L about a week, XL more) and Delight (0 to 5, how much players would notice and enjoy it); Status of verification ("confirmed" means reproduced; "partially confirmed" means a detail was corrected and the corrected version is what appears; "est." marks ratings estimated when merging the previous analysis, which gave none); Files with `path:line`; Evidence; a shovel-ready Proposal; and the tests that prove it. Where a PR already did part of an entry, the entry says "Partly done in #N" and describes only what is left.
4. **Line numbers** refer to `main` at `65f4f89` unless an entry names a PR. Many open PRs rewrite the files cited (`Board.svelte`, `GameScreen.svelte`, `ActionBar.svelte`, `session.svelte.ts`), so re-locate code after they merge.
5. **Pick work from the [roadmap](#roadmap)**, which groups entries into PR-sized work packages with dependencies. Items marked "needs a decision" need the owner's call before code.
6. **Follow `AGENTS.md`**: branch from the latest `origin/main`, keep legality in `packages/rules`, route randomness through the match RNG, put user-facing text through `t()`, add a regression test and see it fail before a fix, and finish only when the PR is merged.
7. **Do not re-investigate** anything in [Refuted or already-implemented claims](#refuted-or-already-implemented-claims) without new evidence.

## Status snapshot

- Date: 2026-09-25.
- The open PRs of 2026-09-24 and 2026-09-25 were consolidated; see [Consolidation](#consolidation-2026-09-25). The per-PR notes below describe each PR as it was opened.
- Baseline from the second review (do not redo it): the rules engine is solid. A 200-game random fuzzer (61k commands) found no invariant violations, no nondeterminism and no disagreement between the legal-action summary and the engine; the playout, replay and hash tests passed and CI was green on `main`. The problems sit around the engine: the online boundary, save safety, layout and readability, AI pacing and presentation. The written flavour (Lord Mumble, Grum, the goblins' invoice) is good, but almost none of it reaches the screen (see `delight-idea-menace-personality` and `delight-idea-town-crier`).

### Open pull requests

By the previous agent (descriptions kept as that document wrote them):

| PR | Title | Branch |
|---|---|---|
| #4 | Center board pips and banners, fix highlight contrast | `fix/board-readability` |
| #5 | Guard card targets and clone menace destinations | `fix/rules-guards` |
| #6 | Require a human seat and finish tutorials explicitly | `fix/newgame-tutorial-guards` |
| #7 | Pre-index board holdings and banner counts | `perf/board-indexing` |

From the second review (each is one work package; the PR body lists what it leaves out):

| PR | Title | Branch | One line |
|---|---|---|---|
| #8 | Fix online Spells and harden engine command input | `claude/gracious-goodall-oqufa3` | Spells work online; malformed targets get rule errors, not HTTP 500; commands are deep-copied on entry |
| #9 | Keep hot-seat hands private and make the curtain a real modal | `claude/hotseat-privacy` | No hand visible during AI turns or behind the curtain; inert, focus-trapped curtain; basic screen-reader announcer |
| #10 | Never lose a game: per-game autosaves, in-game menu, save export | `claude/save-safety` | Autosave per game, saves include the buffered turn, ☰ menu with confirm, export in production, IndexedDB fixes, useful Load list |
| #11 | Smooth the turn flow and explain disabled actions | `claude/turn-flow` | Multi-click guard, Back to actions, one-click End Turn, Market stays open, phase stepper, Claim button, `getActionAvailability` reasons and Trade-to-afford |
| #12 | Keep play smooth: plain state, faster selectors, AI in a worker | `claude/perf-stutter` | `$state.raw`, locale-free Banner sort, derived work once, AI in a Web Worker, paced AI steps, shared `fallbackIntents` |
| #13 | Make the board camera pan and zoom naturally on every input | `claude/camera-input` | Slow drags pan, trackpad and pinch behave, rAF-batched transform camera, real aspect ratio, targets brought into view, arrow keys |
| #14 | Keep the board the hero on every screen size | `claude/responsive-layout` | Wide, rail and sheet layouts; fixed dock; scoreboard; slide-over fixes; 44 px targets; safe areas; New Game fits 360 px |
| #15 | Make the board readable: clear targets, legible labels, hover cards | `claude/board-readability` | Veil plus cased outlines and a glow overlay; zoom-aware labels; note placement; motion settings honoured; focus rings; hover cards |
| #16 | Catch broken builds, stale maps and boundary breaks in CI | `claude/ci-hardening` | Production build and server smoke test in CI; real map check; tools and tests typechecked; ESLint boundaries |
| #17 | Harden the online server against restarts, abuse and stale sessions | `claude/server-robustness` | AI resumes after restart; WebSocket rate and size limits; heartbeat; `TRUST_PROXY`; stale-token recovery; exit codes; command-id idempotency |
| #18 | Add a victory screen and fix rematch and the Chronicle on load | `claude/victory-screen` | Dismissible victory screen with stats, chart, awards and recap; correct rematch; Chronicle rebuilt on load |
| #19 | Give the game a storybook look: fonts, icons, title screen | `claude/storybook-look` | Self-hosted Alegreya fonts, SVG resource and tool icons, illustrated title screen, parchment UI kit in `app.css` |
| #20 | Make the web app work offline and installable | `claude/offline-pwa` | Generated, versioned service worker with update prompt; PNG manifest icons; no source maps shipped |
| #21 | Plan multi-Route expansion in the AI | `claude/ai-expansion` | 0-1 BFS expansion planner and summed savings goal; Easy stalls gone; new AI beats stock Normal 70% in 3p |
| #22 | Fix dead cards and Quests, card text and map validation | `claude/content-fixes` | Mishap out of 2p decks, Patron needs 2, Fog and Druid targets, opt-in Quest expiry, card text, `validateMap` and content tests; `RULESET_VERSION` 0.3.0 |
| #23 | Show harvests, rival actions and next harvests | `claude/harvest-feedback` | Harvest tokens fly to counters, opponent action toasts and away digest, rivals' next harvest, own purse on wide screens |
| #24 | Add named AI rivals with portraits and quips | `claude/ai-rivals` | Six named rivals with portraits, mottos and seeded quips; picker in New Game |
| #25 | Paint the board as a storybook tabletop | `claude/terrain-art` | Procedural terrain art, five Menace figures, 3/4-view Holdings, landmark art, coast, cartouche, compass and ship |

### Merge order and conflicts

Order suggested before the consolidation, which used a tested order instead (see [Consolidation](#consolidation-2026-09-25)): #8, #16, #21, #22, #17, #20, #12, #10, #9, #13, #14, #11, #15, #25, #18, #19, #23, #24. Decide where #4 to #7 go by the overlaps listed first.

Overlaps between the two sets of PRs (the same ideas were addressed twice; whoever merges must pick one version):
- **#4 and #15 (board highlight contrast):** #4 changes the highlight to a blue outline fill and removes the glow filter; #15 replaces the whole highlight with a dimming veil, cased outlines and a separate glow overlay. They conflict in `Board.svelte` and in intent. #4's pip and banner centring fix may still be wanted if #15 does not cover it.
- **#5 and #22 (Fog and Druid's Blessing targets):** #5 makes Druid's Blessing require an assigned Banner. The second review found that blessing a home Banner and assigning it in the same turn is legal and useful, and #22 makes enumeration list home Banners (with a test that blesses a home Banner and then assigns it). These contradict each other; keep #22's rule or record a spec decision. #5 rejects any already-fogged Route; #22 rejects only a re-fog by the same caster and unowned or own Routes (a different player's re-fog extends the fog).
- **#5 and #8 (Menace destination cloning):** #5 clones the destination in `Tx.moveMenace`; #8 deep-copies every command at the top of `applyCommand`. Both are safe together; one is redundant.
- **#6 and #12 (all-AI games):** #6 blocks New Game with 0 human seats. #12's `apps/web/e2e/ai.spec.ts` plays an all-AI game through the worker, and `critic-newgame-validation` proposes a "Watch AI game" button instead of blocking. Check how #12's test starts its game before merging #6.
- **#7 and #12, #15, #25 (`Board.svelte`):** #7 adds `holdingBySite` and `bannerCountByRegion` derived maps; #12 moves derived work into GameScreen and the other two rewrite the board's layers. Expect manual conflict resolution.

Notes between PRs #8 to #25 (from the merge notes):
- **#22 and #11:** `help.market` in `en.ts` now takes `{give}`, `{receive}` and `{limit}`. #11's data-driven ActionBar (`t(tool.help)`) and Dialogs (`t("help.market")`) call it without parameters. When merging the second of these, pass the Market parameters (from `gs.ruleset.market`) or the text shows a literal "{give}".
- **#22** bumps `RULESET_VERSION` to 0.3.0 (default rules changed). No other PR changes default rules.
- **#20 and #16:** 3 small hunks in `apps/web/vite.config.ts`. Keep both plugins (`plugins: [svelte(), failOnBuildWarnings, serviceWorkerPlugin({ version: rootVersion })]`) and `sourcemap: false`. #16's smoke test requires `/sw.js`, which #20 still serves.
- **#14** rewrote GameScreen, ActionBar and HandPanel. Expect conflicts with #10 (topbar), #11 (ActionBar), #13 (camera buttons), #9 (GameScreen mount points) and #18 (Overlays prop). #14 shows tool costs only in tooltips below 1920 px; #11 adds have/need cost chips, so check the merged tool row.
- **#12, #10, #9:** all touch `session.svelte.ts`, in different sections.
- **#15, #13, #25:** all change `Board.svelte`. #25 moved Region fills into a non-interactive `layer-fills` group with TerrainLayer above them and the `.region` buttons (transparent hit area, target tint, labels) above that. #15 added a veil and glow overlay and a top label layer. #13 put the camera transform on an inner `<g>` and resized the sea rects. #25 was built against both diffs, but expect manual resolution: keep #15's label layer above #25's terrain, and put #25's CoastLayer inside #13's camera group. Note the discrepancy: #25's own PR body says "#13 merges cleanly", while these notes expect manual work for the three-way merge. Do a trial merge of #13 and #25 (with and without #15) instead of trusting either statement.
- **#15 and #13 (glow overlay):** #15's glow overlay `<svg>` copies the board's `viewBox`. #13 no longer rewrites the `viewBox`; it applies a transform to an inner `<g>`. After both merge, the overlay must apply the same camera transform or the glow will not line up with targets.
- **#25 and #15 (target pulse):** #25 animates fill and stroke opacity in steps (Chrome ran an SVG `opacity` animation on the compositor and highlights sometimes never showed over the terrain); #15 replaced the pulse with a breathing glow overlay. Keep #15's overlay and check that highlights still render over the terrain.
- **#19 and #15:** the new fonts change Region-name metrics; retune #15's label sizing after both merge.
- **#19 and #20:** #19 notes that italic board-label font faces are not cached offline until first use. #20 precaches every emitted file, so verify the fonts are in the precache after both merge.
- **Many PRs** add `apps/web/test/**` to `vitest.config.ts` and `apps/web/tsconfig.json` (trivial duplicate-line conflicts).
- **#23 and #14:** 3 GameScreen hunks conflict. Resolve in favour of #14's layout and switch #14's dock `.mine` resource row to #23's `<ResourcePurse {session} playerId={viewer ?? ""} />`. Drop #14's now-unused `[data-layout="sheet"] .floater` rule. ActionFeed already reads #14's `--overlay-bottom`; its hard-coded left offset (for main's vertical camera column) is only a cosmetic indent under #14.
- **#23 and #9, #10, #12:** `session.svelte.ts` gains an event bus emit in `flush()` and `receiveRemote()`; small hunks. #12 made `floaters` `$state.raw`, and #23 removes that field.
- **#24:** small insertions in NewGame (conflicts with #14's phone layout and #19's styling), PlayersPanel (#14, and #23's "Next" row), GameScreen (mount point), LogPanel (#9 removed `aria-live` there), SettingsDialog and OnlineLobby (#17 lobby changes). Its win and lose quips could later be shown on #18's victory screen.

### Consolidation (2026-09-25)

Several agents worked in parallel and opened 28 PRs (#2, #4 to #30), with overlapping work. A third pass reviewed them together, decided per PR, and merged the survivors into one tree in the order below. After each merge it ran typecheck, lint, the unit and integration tests and the affected e2e specs. The final tree passes `pnpm check`, `pnpm map:check`, `pnpm build:check` and the full Playwright suite. The combined tree is on `claude/pr-review-deduplication-sci1jf`. Where a PR needed fixes, they are commits on top of its branch, and behaviour fixes come with regression tests.

| Order | PR | Decision | What changed while merging |
|---|---|---|---|
| 1 | #27 already-stronghold-error | Merged | |
| 2 | #8 online Spells | Merged | |
| 3 | #16 ci-hardening | Fixed, merged | The map check fails only on errors and prints warnings; `region_24` is a known warning. The committed map is compared with CRLF line endings normalised. E2E specs get Vite client types |
| 4 | #21 ai-expansion | Merged | |
| 5 | #22 content-fixes | Fixed, merged | Fog accepts any Route you don't own, unowned Routes included (§19.10). The Quest-expiry countdown no longer counts setup rounds |
| 6 | #26 dragon-whisperer-take-choice | Merged | |
| 7 | #17 server-robustness | Fixed, merged | Proxy rate-limit tests go through a limited route (`/api/me`) |
| 8 | #29 server-options-and-health | Fixed, merged | Resolved with #17's `app.ts`, with `/api/health` still answered before the limiter. The OPTIONS test asserts there is no content type |
| 9 | #20 offline-pwa | Merged | Both Vite plugins kept, next to #16's `failOnBuildWarnings` |
| 10 | #12 perf-stutter | Merged | |
| 11 | #7 board-indexing | Merged | |
| 12 | #10 save-safety | Merged | Its save, Load list and round strings replace #30's copies |
| 13 | #9 hotseat-privacy | Fixed, merged | When the curtain lifts over an open decision dialog (Prophecy), focus goes into the dialog, not behind the inert game |
| 14 | #13 camera-input | Fixed, merged | Retargeted glides ease out, and only newly added targets are framed |
| 15 | #15 board-readability | Merged | Supersedes #4's highlight changes and #30's inspector strings |
| 16 | #18 victory-screen | Merged | Supersedes #30's victory strings |
| 17 | #25 terrain-art | Fixed, merged | Keeps `MENACE_THEME`. #15's glow overlay follows #13's camera transform |
| 18 | #4 board-readability (fix/) | Folded | Kept only the pip-centring formula (with an e2e test) and the QuestPanel ready style. The blue highlight lost to #15 because it clashes with Azure and the focus ring |
| 19 | #28 log-autoscroll-stickiness | Fixed, merged | One effect with no rAF. The Chronicle opens at the latest entry |
| 20 | #14 responsive-layout | Fixed, merged | Dock toasts let board clicks through. Board labels grow with Text size |
| 21 | #11 turn-flow | Fixed, merged | ActionBar uses #12's `hints` prop, and the Market help gets #22's parameters. An armed but unavailable tool looks disabled |
| 22 | #19 storybook-look | Fixed, merged | Buttons press with `translate`, so they keep their position. The remaining glyph icons (ActionBar, VictoryScreen, crown, update prompt) are drawn as SVG to satisfy #19's icon guard |
| 23 | #23 harvest-feedback | Merged | The feed says "Route" to satisfy #22's terminology test |
| 24 | #24 ai-rivals | Merged | Chatter listens on #23's event bus and skips provisional batches. Quips are spoken through #9's Announcer |
| 25 | #30 i18n-hardcoded-ui | Fixed, merged | 24 duplicate or dead keys dropped (3 were TS1117 duplicates with #10). `ui.ai_seat` wired in. The guard is Windows-safe |
| 26 | #6 newgame-tutorial-guards | Fixed, merged | All-computer games are allowed with a note, because #12's e2e plays one. Finish closes the coach and keeps the game |
| | #5 rules-guards | Closed | Its Druid's Blessing guard contradicts §19.4 and its Fog guard contradicts §19.10. The Menace clone is redundant with #8 |
| | #2 Node 25 image | Closed | Node 25 is past end-of-life and ships without Corepack, so `corepack enable` fails. Stay on Node 22 LTS (`.nvmrc`) |

Decisions for the owner:
- **Tool cost chips (#11 against #14):** #11's have/need chips are hidden below 105rem, where #14 moves costs into tooltips and accessible names. Revisit if laptop players miss them.
- **Quest expiry (#22):** the rule is opt-in in New Game. Making it the default is still open.

Follow-ups deferred from the merge reviews (all low severity):
- i18n guard: also check string literals inside template expressions and a11y attributes, then externalise what that finds: the Region, Route and Holding aria-labels in `Board.svelte`, and the seat labels in `NewGame.svelte`.
- #26: build the Hoard take dialog from the engine's legal options. A mixed Hoard also multiplies Dragon Whisperer AI candidates by the number of Hoard types.
- #12: a restarted AI worker that hangs on its first decision is treated as a load failure, so that slow decision reruns on the main thread.
- #17: clear `aiFailures` when a match stops being AI-due. Write the fatal message in `fail()` with `writeSync`, which matters for piped stderr on macOS.
- #16: add a per-request timeout to the build check's smoke-test `fetch`, so a stalled server fails fast instead of waiting for the job timeout.

## Done or in flight (do not redo)

Entries fully covered by an open PR are listed only here. Small leftovers of an otherwise covered entry (whether the PR disclosed them or a later comparison found them) are in [Follow-ups from PR reviews](#follow-ups-from-pr-reviews). Entries a PR covers only in part stay in the backlog, trimmed and marked "Partly done in #N".

### PRs #4 to #7 (previous agent; verify at merge)

- **#4:** banner and pip centring (no-op `*0` offset formulas fixed); highlight changed from a pale-yellow wash (invisible on grain) to a blue outline fill; glow filter removed from `.hl-line`; quest `ready` uses box-shadow instead of border-width. Files: `Board.svelte`, `QuestPanel.svelte`. Overlaps #15 (see above).
- **#5:** Druid's Blessing requires an assigned Banner; Fog rejects already-fogged Routes (enumeration auto-filters via `validateCardTarget`); `Tx.moveMenace` clones the destination (`{...to}`) so state never aliases command objects. Files: `packages/rules/src/cards.ts`, `tx.ts`. Overlaps #22 and #8 (see above).
- **#6:** New Game blocks 0-human seats (disabled Begin, hint, `ui.at_least_one_human_required`); the tutorial's final step has an explicit `ui.finish_tutorial` Finish button instead of a silent exit. Files: `NewGame.svelte`, `TutorialCoach.svelte`, `packages/content/src/i18n/en.ts`. Overlaps #12's all-AI e2e test and `critic-newgame-validation`.
- **#7:** `holdingBySite` and `bannerCountByRegion` derived maps replace O(S×H) per-frame scans in the Board's Site and Region loops. File: `Board.svelte`.

### PRs #8 to #25 (second review)

| PR | Fully covers | Partly covers (entry stays in the backlog) |
|---|---|---|
| #8 | `rules-online-spell-hidden-card`, `rules-malformed-target-typeerror`, `rules-command-object-aliasing` | |
| #9 | `webstate-hotseat-hand-visible-during-ai-turn` | `critic-a11y-keyboard-focus` (curtain), `critic-sr-silent-game` (basic announcer) |
| #10 | `webstate-single-autosave-slot-overwritten` (+`spec-autosave-single-slot-overwritten`), `webstate-save-and-exit-drop-buffered-turn` (+`vis-save-exit-drops-pending`, `resp-hamburger-exits-game`), `webstate-no-save-export-in-production` (+`spec-save-export-dev-only`), `webstate-indexeddb-adapter-leaks-and-false-success` (+`perf-autosave-idb-leak`), `critic-load-list-unusable` | |
| #11 | `critic-multiclick-ends-turn`, `critic-no-undo-banner-phase`, `critic-market-closes-early`, `vis-end-turn-three-clicks`, `vis-no-turn-phase-status`, `spec-claimable-quest-visibility` | `vis-disabled-no-reason` (reasons, chips, Trade-to-afford) |
| #12 | `perf-state-deep-proxy` (+`webstate-deep-proxy-state-perf`), `perf-getplayerbanners-localecompare`, `perf-duplicate-derived-work`, `ai-main-thread-worker` (+`perf-ai-blocks-main-thread`), `webstate-ai-step-silent-stall` (+`ai-fallback-inconsistent`) | `ai-turn-pacing-dead-time` (paced steps; no "Skip to my turn")|
| #13 | `resp-slow-drag-never-pans` (+`resp-stale-pointer-hover-pans`), `resp-camera-trackpad-and-two-finger-pan` (+`bug-wheel-zoom-trackpad`), `perf-panzoom-viewbox-layout`, `resp-viewbox-aspect-locked`, `spec-camera-zoom-to-selection` | |
| #14 | `vis-board-shrinks-with-dock` (+`resp-laptop-bottom-bar-starves-board`, `critic-textscale-collapses-board`), `resp-phone-landscape-board-collapse`, `resp-newgame-overflow-phone`, `resp-slide-over-panel-defects`, `resp-small-touch-targets-hud`, `resp-safe-area-edge-to-edge`, `resp-phone-portrait-hud-half-screen`, `resp-no-opponent-scoreboard-on-small` (small leftovers in [follow-ups](#follow-ups-from-pr-reviews)) | |
| #15 | `vis-highlight-washout`, `vis-label-occlusion`, `vis-board-label-legibility` (+`resp-board-labels-no-lod`), `vis-reduced-motion-setting-ignored` (+`spec-motion-settings-partially-ignored`, `perf-pulse-animation-repaints`), `vis-pulse-animation-perf`, `vis-focus-ring-rectangle`, `vis-no-hover-feedback` (touch long-press and the "If you plant here" line in follow-ups) | `critic-a11y-keyboard-focus` (Region and Menace focus rings) |
| #16 | `tooling-map-check-noop`, `tooling-untypechecked-ts`, `tooling-lint-architecture-boundaries` | `tooling-ci-no-production-build` (build and smoke test; no Docker job) |
| #17 | `online-ai-seats-stall-after-restart`, `online-ws-message-flood-amplification`, `online-rate-limit-behind-proxy`, `online-stale-token-dead-end`, `online-main-swallows-fatal-errors`, `online-command-id-idempotency-flaws` | `online-no-ws-heartbeat` (server heartbeat only) |
| #18 | `vis-victory-screen` (+`og-endgame-summary-stats`, `og-victory-modal-cannot-close`, `spec-stats-never-shown`, `delight-idea-storybook-recap`; the optional storybook book is in follow-ups), `webstate-rematch-stale-config` (+`online-rematch-starts-local-game`, `og-rematch-uses-stale-config`; the server rematch endpoint is in `online-lobby-ux-gaps`), `webstate-chronicle-lost-on-load` (+`og-chronicle-empty-after-load`) | |
| #19 | `delight-aes-selfhosted-fonts`, `delight-aes-iconography`, `delight-aes-title-screen`, `vis-menus-and-forms-polish` | `delight-aes-parchment-ui-kit` (tokens and base styles), `vis-art-direction` (fonts, palette, HUD) |
| #20 | `webstate-sw-runtime-cache-broken-offline-blank` (+`bug-sw-offline-no-bundle`, `spec-offline-sw-clone-bug`, `tooling-sw-never-caches-assets`), `tooling-pwa-manifest-icons`, `tooling-sourcemaps-shipped` | |
| #21 | `ai-expansion-myopia` | |
| #22 | `rules-mishap-dead-in-2p` (+`content-tm-dead-card-2p`), `content-patron-arcane-deck-math`, `rules-card-target-hygiene` (+`content-card-noop-targets`), `content-card-text-omissions`, `content-validate-map-gaps`, `content-no-content-tests` | `content-quest-slots-clog` (opt-in rule only) |
| #23 | `og-rival-next-harvest` | `vis-harvest-feedback-weak` (+`og-harvest-feedback-lost`, `spec-harvest-summary-invisible-hotseat`, `delight-idea-harvest-flight`; flights, badges, curtain holding), `vis-own-resources-hud` (wide-screen purse), `vis-opponent-actions-invisible` (toasts, pulses, away digest) |
| #24 | | `ai-idea-personalities-advisor` (named rivals, portraits, quips) |
| #25 | `delight-aes-terrain-illustration`, `delight-aes-piece-elevation`, `delight-aes-landmarks-coast` | `vis-menace-tokens-indistinct` (figures), `vis-art-direction` (board art) |

Items from the previous analysis that these PRs also cover (listed here, not in the backlog):
- Menace anchor colliding with the Banner row (`Board.svelte:68`, `labelX+40,+4` against `+26`): #15's Banner slots and label layer, and #25's grounded figures (`vis-label-occlusion`, `vis-menace-tokens-indistinct`). The hoard-text overlap in small Regions stays with `vis-menace-tokens-indistinct`.
- AI delay of 550 ms on every step (`settings:56-59`): #12's paced steps.
- `TutorialCoach` 32 px header buttons and phone placement (`TutorialCoach:92-99` against `GameScreen:197-203`): #14 (44 px, placement follows the layout). The coach still covering the board is in `spec-tutorial-incomplete`.
- Topbar "Save" and "Saved." hard-coded in English (`GameScreen.svelte:89`, `session.svelte.ts:59`): #10 moves the topbar round, Save and "Not saved" text to `t()`. Verify "Saved." after merge; the rest is `content-i18n-hardcoded-ui`.
- Overdraw and blur: sea overdraw repainting on pan (`Board:187-189,213-214`) and the infinite pulse (`531-539`): #13 (transform camera, sea sized to reach) and #15 (glow overlay, motion settings).
- Unthrottled camera (`panBy`/`zoomAt` per pointermove, `getScreenCTM().inverse()` per move): #13.
- Floater churn (`GameScreen.svelte:103` filter per render; `session:299-306` spread plus a 1600 ms timer per gain): #23 removes floaters.
- Mobile layout (950 px mid-breakpoint overflow from side `minmax(17rem,22rem)` plus preview `14rem` plus 6 to 7 tools; the previous analysis proposed an 1100 px mid breakpoint, bottom-sheet tools on mobile and a dismissable side panel, which #14's wide, rail and sheet layouts replace; topbar wrap leaving about 40 dvh of board, side slide-over backdrop, focus trap and Escape, NewGame seat crush at 320 px, panel clipping past 100 dvh): #14. Re-check nested scrolling (side panel plus log) and menu overflow in small landscape after merge.
- Title flat gradient, uniform menu weight and orphaned version string (#19's illustrated title, logo lockup and menu card; check where the version string ended up), emoji against SVG glyph clash, board text ignoring text scale, 32 px touch targets, the parchment and wood token system, a single icon set: #19, #15 and #14. The hoard's emoji remain (see follow-ups).
- NewGame radio `:focus-visible` (#19's radio cards have a focus ring) and `aria-live` on the whole log (#9 removed it).
- Harvest summary persistence (floaters vanished after 1.6 s, §16.1): partly #23 (flights, counters, held-back hot-seat harvests). A persistent "Last harvest" line is still open in `vis-harvest-feedback-weak`.
- Novel idea "Harvest comets" (banner fires a token to the HUD on harvest): #23's harvest flights.
- Novel idea "Hot-seat herald" (curtain with crest and "Pass to Azure"): #9's curtain ("Pass to {name}" with the player's emblem).
- "End-game fanfare" gap: #18.

## Review gaps

Automated review (GLM 5.3 via Z.ai) was heavily rate-limited (HTTP 429) early on, because the Z.ai quota is shared with other agents' PRs on the same repository. Failed runs were re-run one at a time, at most once per head; two consecutive failures were treated as a review gap and reported on the PR, never as approval. Final state as of 2026-09-25 06:40 UTC (all PRs open and unmerged):

| PR | Head | GLM review outcome |
|---|---|---|
| #8 online-spells | `c2378eb` | 2 rounds; steady state |
| #9 hotseat-privacy | `2f8b2a9` | **No GLM review** (initial run and re-run both HTTP 429); gap reported on the PR |
| #10 save-safety | `6dfef5f` | 2 rounds (round 1 found an important autosave-pruning bug, fixed); steady state |
| #11 turn-flow | `497efe6` | 2 rounds; steady state |
| #12 perf-stutter | `d085e04` | **No GLM review** (initial run and re-run both HTTP 429); gap reported on the PR |
| #13 camera-input | `72052cc` | 2 rounds; steady state |
| #14 responsive-layout | `0e1a572` | 3 rounds; steady state |
| #15 board-readability | `cabbca9` | 2 partial rounds (1 of 4 chunks each); steady state |
| #16 ci-hardening | `bdc51e4` | 2 rounds; steady state |
| #17 server-robustness | `f5c3b8e` | 2 rounds; steady state |
| #18 victory-screen | `efc6ff8` | 2 rounds (round 1 found an important load-path bug, fixed); steady state |
| #19 storybook-look | `b6bde1d` | 2 rounds; steady state |
| #20 offline-pwa | `ac46385` | 2 rounds (round 1 found the icon script broken on Windows, fixed); steady state |
| #21 ai-expansion | `9a8cc3a` | 2 rounds; steady state |
| #22 content-fixes | `2259a4b` | 3 rounds (round 1 found an important Quest-expiry bug, fixed); steady state |
| #23 harvest-feedback | `6e10165` | 3 rounds (round 1 partial); steady state |
| #24 ai-rivals | `d8e3f9c` | 2 rounds; steady state |
| #25 terrain-art | `6f7d8c1` | 2 rounds; steady state |

"Steady state" means two consecutive rounds without a confirmed important finding, or the reviewer re-raising items already declined with reasons. Every PR also went through an independent adversarial review by a separate agent before it was opened; its findings and triage are summarised in each PR body. Per-round decision records (applied, declined with reasons, refuted with evidence) are in the commit messages of the review-fix commits, and short evidence replies sit on the PR threads where a wrong claim was labelled major or blocker. #9 and #12 are the only PRs no automated reviewer has seen; review them by hand or re-run the GLM workflow before merging.

## Backlog

### Roadmap

Each work package (WP) is sized as one PR or a short series and can land on its own unless a dependency is noted. The order is by value for effort, after the open PRs merge. WP ids are new; the second review's original WP numbers are given where they continue.

| WP | Work package | Ids | Rationale | Effort | Depends on |
|---|---|---|---|---|---|
| 0 | Merge the open PRs | #4 to #25 | Most of the highest-value work is done but unmerged; conflicts grow with every new branch | M | see [Merge order](#merge-order-and-conflicts) |
| 1 | Small correctness and friction fixes (the previous analysis's P0) | `web-log-autoscroll-stickiness`, `web-prophecy-order-reset`, `web-actionbar-draft-diff-null`, `server-options-and-health-limiter`, `ux-targeting-locks-exploration` (sea-click cancel), `rules-already-stronghold-error-code`, `webstate-online-submit-errors-and-busy` | Cheap, visible annoyances and a Docker health check that can fail | S | WP0 for the web items |
| 2 | Hidden-information fixes (old WP16) | `rules-reaction-window-leaks-counterspell`, `ai-peeks-hidden-counterspell` | §83/§105 compliance: the reaction window and the AI both leak who holds a Counterspell | M | #8 |
| 3 | Server robustness, second pass | `online-ai-scheduler-stale-seat`, `online-no-ws-heartbeat` (rest), `server-sqlite-busy-timeout-migrations`, `server-replay-auth-callee-check`, `server-config-validation-and-static-hardening`, `server-pushto-fake-userrow`, `online-tauri-android-default-server` | Multi-AI stalls, `SQLITE_BUSY`, insecure defaults, desktop and Android builds with no usable server | M | #17 |
| 4 | Web unit tests and engine regression guards (old WP15) | `webstate-no-session-unit-tests`, `tooling-rules-untested-paths`, `tooling-ai-modes-untested`, `tooling-server-test-gaps`, `tooling-fastcheck-unused-fuzz`, `tooling-e2e-coverage-gaps`, `protocol-command-field-caps` | Safety net for the refactors that follow; many PRs already added an `apps/web/test` harness | M | WP0 |
| 5 | Explain the rules through the UI (rest of old WP19) | `vis-disabled-no-reason` (rest), `vis-silent-toll-payment`, `og-quest-race-visibility`, `web-undo-lock-unexplained`, `ux-card-unplayable-reason`, `ux-buy-card-two-step` | Players still hit silent disabled states and silent payments | M | #11, #15 |
| 6 | Mobile board (rest of old WP22) | `resp-board-touch-targets-microscopic`, `resp-android-back-button`, `ux-targeting-locks-exploration` (rest: keep focus, inspect non-targets; the sea-click cancel is in WP1) | Phone targets are 5 to 16 px; Android back leaves the game | L | #13, #14 |
| 7 | Accessibility (rest of old WP23) | `critic-sr-silent-game` (rest), `critic-cvd-player-colours`, `spec-a11y-board-accessible-names`, `critic-a11y-keyboard-focus` (rest), `vis-contrast-and-high-contrast-gaps` | §52 compliance | M | #9, #15 |
| 8 | Online features (old WP28) | `online-no-absent-player-resolution`, `online-no-resume-after-reload`, `online-lobby-ux-gaps`, `spec-async-online-catchup`, `online-async-notifications-gap`, `online-guest-identity-device-bound` | One absent player blocks a match forever; async play has no notifications; split into 3 or 4 PRs | L | #17, WP3 |
| 9 | Balance tooling and seat fairness (old WP26) | `ai-simulator-gaps`, `ai-seat-one-dominance`, `rules-ruleset-levers-missing`, `content-quest-slots-clog` (default decision) | Measure before tuning; #21 moved the baseline | L | #21, #22 |
| 10 | AI strength and card use (old WP27) | `ai-difficulty-not-distinct`, `ai-card-play-never`, `ai-idea-personalities-advisor` (rest), `og-steward-hint` | #21 made Easy much stronger; Hard is still not distinct; the AI rarely plays cards | L | #21, #24, WP2, WP9 |
| 11 | Performance, second pass | `ai-latency-beam`, `ai-banner-search-cost`, `perf-server-ai-event-loop`, `perf-board-derived-churn`, `perf-token-transitions`, `perf-engine-singleton-audit` | Hard AI reaches 450 ms; the server runs AI on its only event loop | M | #12 |
| 12 | Replays, saves and versions (old WP29) | `spec-replay-viewer-missing`, `spec-replay-fixtures-and-invariants`, `spec-debug-commands-break-replay`, `spec-versioning-never-enforced`, `webstate-save-import-no-validation`, `spec-state-hash-not-used-online` | Long-term save compatibility and review tools; #22 already bumped the ruleset version | L | #10, #18 |
| 13 | Maps and variety (old WP30) | `content-single-map`, `tools-generate-map-robustness`, `content-trading-posts-dead`, `content-private-region`, `content-opening-imbalance`, `content-kings-highway-unclaimable`, `rules-random-menace-selection-missing` | Replay value; fixes the map flaws under a new map id | L | #16, #22 |
| 14 | Teaching the game (old WP31) | `spec-tutorial-incomplete`, `critic-no-ingame-rules`, `critic-newgame-validation`, `vis-legend-drawer` | New-player success | L | #6, #11, #14 |
| 15 | Art direction, remaining steps (old WP24) | `vis-art-direction` (rest), `vis-menace-tokens-indistinct` (rest), `delight-aes-parchment-ui-kit` (rest) | From prototype to storybook; one PR per step | L | #19, #25 |
| 16 | Motion and audio (old WP25) | `delight-idea-build-juice`, `spec-audio-music-and-menace-cues` | Built on #23's event bus; coordinate with WP11's `perf-token-transitions`, which owns the transition changes | M | #23 |
| 17 | Harvest, opponent and AI-turn feedback, remaining parts | `vis-opponent-actions-invisible` (rest), `vis-harvest-feedback-weak` (rest), `vis-own-resources-hud` (rest), `ai-turn-pacing-dead-time` (rest) | Chronicle lines are still vague and do not pan to the board; no persistent harvest summary; no "Skip to my turn"; your own card is not pinned | M | #12, #23 |
| 18 | Localisation hygiene (old WP32) | `content-i18n-hardcoded-ui`, `content-i18n-plurals`, `content-i18n-region-names` | Readies the codebase for a second locale | M | WP0 |
| 19 | Rules design decisions, spec first (old WP33) | `rules-safer-road-swap-double-count`, `rules-warden-guard-survives-card-move`, `rules-highwayman-quest-connectivity`, `rules-far-reaches-distance-definition`, `rules-react-hardcodes-counterspell`, `rules-2p-deck-drops-dragon-whisperer` | Small code changes, each needing a spec decision | S each | |
| 20 | CI, release and desktop hardening (old WP14 rest and WP34) | `tooling-ci-no-production-build` (rest), `tooling-prettier-not-enforced`, `tooling-rust-checks-and-build-sh`, `tooling-ci-playouts-slow`, `tooling-desktop-release-profile`, `tooling-release-cargo-lock-drift`, `tooling-tauri-fs-scope-home`, `tooling-release-hardening`, `tooling-macos-signing-min-version`, `tooling-idea-pages-deploy`, `tooling-idea-tauri-updater` | Distribution quality; catch Docker and Rust breakage before release | M | #16, #20 |
| 21 | Content expansion, needs design and playtests (old WP36) | `content-landmark-abilities`, `content-card-pool-thin`, `content-dragon-hoard-sink`, `rules-dragon-whisperer-take-choice`, `content-prophecy-weak`, `og-transferable-titles`, `og-optional-player-trade`, `idea-omen-track` | Opt-in rules gated by simulator results | L | WP9 |
| 22 | Delight backlog (old WP35) | `delight-idea-menace-personality`, `delight-idea-town-crier`, `delight-idea-living-board`, `delight-idea-heraldry`, `delight-idea-photo-mode`, `critic-idea-daily-realm`, `og-hall-of-records`, `resp-idea-target-first-radial-menu`, `resp-idea-haptics-and-press-feedback`, and the `idea-*` entries | Personality and retention; pick freely once the core is solid, one per PR | M each | varies |

Dependencies in short:
- WP2 needs #8. WP10 needs WP2 (`ai-card-play-never` should not learn from hidden hands) and WP9 (the baseline).
- WP9 and WP10 build on #21's changed balance baseline; re-measure seat bias on top of it.
- WP6 needs #13 and #14. WP16 and WP17 need #23's event bus.
- `ux-targeting-locks-exploration` is split: WP1 does the sea-click cancel, WP6 the rest. `perf-token-transitions` belongs to WP11 only.
- The Pages deploy in WP20 needs #20's service worker.
- Map fixes in WP13 need a new map id or a map version check (see [Map and content](#map-and-content)).

The previous analysis ranked its "biggest wins" as: (1) board readability and aesthetics, (2) UX friction (tool-first discovery, silent busy and AI delay, Undo vanishing, Banner targeting, log stickiness, tutorial flow), (3) performance and stutter, (4) rules, AI and content dead ends (dragon-hoard choice, charter type, Menace rotation, AI counter coverage), (5) server robustness (AI scheduler stall, invite collision 500, validation, synchronous SQLite and N+1 fan-out, rate-limit blind spots), (6) Catan and Kolonists table stakes (trade offers, Longest Road and Largest Army equivalents, a robber-discard equivalent, stats and rematch, async notifications, mobile layout). Items 1, 3 and parts of 2, 5 and 6 are now in open PRs; the rest is spread over WP1, WP5, WP8, WP13, WP14 and WP21.

The previous analysis's build order, kept for reference and mapped to open PRs or work packages:
- P0: log stickiness, Menace anchor, busy reasons, sea-click cancel, health-check and OPTIONS fixes. Menace anchor is in #15 and #25; the rest is WP1.
- P1: dragon-hoard choice and viewer (`rules-dragon-whisperer-take-choice`, `content-dragon-hoard-sink`, WP21); Omen track (`idea-omen-track`, WP21); server AI stall, invite retry and validation (`online-ai-scheduler-stale-seat`, `online-lobby-ux-gaps`, `server-config-validation-and-static-hardening`, WP3 and WP8); rate-limit and static hardening (#17 for the proxy limiter, rest WP3); Charter decision (`content-card-pool-thin`, WP21); Menace rotation (`rules-random-menace-selection-missing`, WP13). The roadmap above places these later than P1 because the second review ranked hidden-information, tests and UI explanation higher; if the owner prefers the old priority, WP3 and the Menace rotation part of WP13 can move up (they need only #17, #16 and #22); the P1 parts of WP21 still need WP9's simulator baseline first.
- P2: trade offers (`og-optional-player-trade`); crown (`og-transferable-titles`); harvest comets (#23) and postcard (`idea-harvest-postcard`); gossip log (`delight-idea-menace-personality`); lantern guard (`idea-warden-lantern`); quest stamps (`og-quest-race-visibility`, `delight-idea-build-juice`); post pennants (`idea-trading-post-pennants`); replay viewer (`spec-replay-viewer-missing`); stats screen (#18); mid-breakpoint and mobile sheet (#14).

### Bugs

#### Rules engine and hidden information

##### rules-reaction-window-leaks-counterspell: Reaction window reveals who holds a Counterspell
- Also covers: `online-reaction-window-leaks-counterspell-holders`
- Severity: medium (security) | Effort: M | Delight: 2 | Status: confirmed
- Files: `packages/rules/src/engine.ts:695-704,707-712,726-728,741-748`, `packages/rules/src/views.ts:33-38`, `packages/rules/test/rules.test.ts:~299`, `apps/server/src/service.ts:103`, `packages/rules/src/types.ts:130-155`
- Evidence: `playCard` opens `s.pending` only if some opponent holds a card with reaction timing. Repro `r2_misc.ts`: with no Counterspell the Spell resolves immediately; with one, the result is `pending` plus a `reaction_requested` event that names the holder. `views.ts` trims `eligiblePlayerIds` to the first entry, but the window's existence and the unredacted events still leak. An existing test says outright: "p2 holds no Counterspell, so it resolves straight away."
- Proposal:
  1. Add `reactionEligibility?: 'holders' | 'any_hand'` to `RulesetConfig`, defaulting to `'holders'` for local hot-seat (the screen is shared anyway, and this avoids extra curtain passes). Server-created standard matches use `'any_hand'`.
  2. In `'any_hand'` mode, `reactionHolders` returns the opponents after the caster, in turn order, whose `hand.length > 0`, without calling `cardOf` (this also removes the hidden-card crash). Keep the `react()` validation as it is.
  3. Server: arm a reaction deadline (about 5 s; see `online-no-absent-player-resolution`) and auto-pass on expiry, so every window lasts the same time whether or not the opponent holds a Counterspell.
  4. Client: when mode is `'reaction'` and `reactionCards.length === 0`, auto-send `pass_reaction` after a fixed ~1.5 s and show a "No reaction available" toast. In a local session, auto-pass immediately with no curtain.
  5. Tests: (a) in `any_hand` mode with the opponent holding knight_errant, a Spell sets `pending.kind === 'reaction'` with `eligiblePlayerIds = [opp]`; (b) events and pending are identical whether the opponent holds knight_errant or counterspell; (c) an empty opponent hand resolves at once; (d) `redactState(state, P2)` is identical, apart from P3's hand contents, whether or not P3 holds a Counterspell. Update the "resolves straight away" test.
- Note: #8 made `reactionHolders` skip `HIDDEN_CARD`, so the crash is gone; the leak itself is unchanged (#8 follow-up). The `react()` dispatch is also hard-coded to Counterspell, see `rules-react-hardcodes-counterspell`.

##### ai-peeks-hidden-counterspell: AI decisions depend on opponents' hidden hands
- Severity: medium (security) | Effort: M | Delight: 2 | Status: confirmed
- Files: `packages/ai/src/index.ts:91-99`, `packages/rules/src/engine.ts:695-712`, `apps/server/src/service.ts:258`, `apps/web/src/lib/game/session.svelte.ts:354`
- Evidence: `chooseMainAction` simulates candidates on the full state. A Spell whose reaction window opens scores as a lost card (-0.8). Repro `review/ai/leak.ts`: Druid's Blessing is played in 7/12 positions when opponents hold no Counterspell and 0/12 when one opponent secretly holds one. `r8_ai_peek.ts`: the same Arcane Exchange scores 24.749 against 25.019 depending on the opponent's hidden card. The practical effect is that the AI refuses to cast into a hidden Counterspell. It gains no edge from this, but a player can notice the pattern.
- Proposal:
  1. For `play_card` on a Spell while reactions are enabled, always score `(1-p)*evaluate(resolved) + p*evaluate(countered)`. `resolved` is obtained by applying `pass_reaction` repeatedly if a window opened. `countered` is `evaluate(state) - WEIGHTS.cardValue`. `p = min(1, unseenCounters/unseenCards * sum(opponent hand sizes))`, where `unseenCounters` is total counterspell copies minus copies in the discard pile minus copies in the AI's own hand.
  2. Test `packages/ai/test/hidden-info.test.ts`, ported from `leak.ts`: two states that differ only in an opponent's Counterspell produce the same intent under the same rng seed.
  3. Optional follow-up: `determinize(ctx, state, viewer, rng)` built on `redactState`, so future evaluation terms cannot read hidden cards.

##### rules-dragon-whisperer-take-choice: Dragon Whisperer never lets the player choose which hoard resource to take
- From the previous analysis. Severity: medium (est.) | Effort: M | Delight: 3 | Status: reported, not re-verified
- Files: `packages/rules/src/legal.ts:222-223`, `packages/rules/src/cards.ts:142-153` (auto-pick at `:147`)
- Evidence: enumeration offers only `{destination}`, never `{destination, take}`. The resolver takes the first resource type in the hoard, so a player can never aim for the resource they need.
- Proposal: enumerate one `take` variant per resource type when the hoard holds more than one type. In the UI, offer the choice as a small dialog or by dragging one resource out of the hoard (see the "Dragon hoard viewer" idea: clicking the Dragon shows a glinting peek of the hoard, and the whisper becomes drag-one-resource-out). The AI picks the resource with the highest value to it (`resourceNeeds`). Pairs with `content-dragon-hoard-sink`.
- Tests: a hoard with 2 types, whisper with `take`, assert the chosen resource moved; enumeration lists one variant per type; the AI picks its most-needed type.

##### rules-already-stronghold-error-code: Upgrading a Stronghold reports "That Site is taken"
- From the previous analysis. Severity: low (est.) | Effort: S | Delight: 1 | Status: reported, not re-verified
- Files: `packages/rules/src/selectors.ts:163`, `packages/content/src/i18n/en.ts`
- Evidence: the upgrade check returns `SITE_OCCUPIED` for a Site that already holds a Stronghold, which surfaces as the wrong message.
- Proposal: add a distinct `ALREADY_STRONGHOLD` error code, an `error.ALREADY_STRONGHOLD` string and the UI message. Check how #11's `getActionAvailability` reports the upgrade tool so both agree.
- Tests: a rules test that upgrading a Stronghold is rejected with `ALREADY_STRONGHOLD`.

##### rules-react-hardcodes-counterspell: The react command only understands Counterspell
- From the previous analysis. Severity: low (est.) | Effort: S | Delight: 0 | Status: reported, not re-verified (latent until a second reaction card exists)
- Files: `packages/rules/src/engine.ts:728`, `packages/rules/src/legal.ts:89`
- Evidence: `legal.ts` treats any card with `timing: ["reaction"]` as a reaction, but `react` in the engine resolves only Counterspell, so a future reaction card would be offered and then rejected.
- Proposal: dispatch on `timing.includes("reaction")` and resolve through a generic reaction resolver keyed by the card's effect id, next to the other effects in `cards.ts`. Land it with `rules-reaction-window-leaks-counterspell`, which changes the same window.
- Tests: a test-only reaction card definition is accepted by `react` and its effect runs.

##### protocol-command-field-caps: Oversized command fields reach the engine
- From the previous analysis. Severity: low (est.) | Effort: S | Delight: 0 | Status: reported, not re-verified
- Files: `packages/protocol/src/index.ts:158-165`
- Evidence: `isWellFormedCommand` checks only the envelope and an 8 KB size cap. Oversized `assignments` maps or `order` arrays pass to the engine. #8 made the engine robust to malformed fields (structured errors, a field fuzz), but the server still does the work for absurd payloads.
- Proposal: per-field caps in the protocol guard (for example `assignments` at most the player's Banner count or 64 entries, prophecy `order` at most 3, ids at most 64 characters) with a clear 400 error. Cover it in the fuzz from `tooling-fastcheck-unused-fuzz`.
- Tests: oversized fields are rejected by the guard; `fc.anything()` never throws.

#### Web client

##### webstate-save-import-no-validation: Corrupt, old or seatless saves load silently into stuck games
- Severity: medium | Effort: M | Delight: 2 | Status: partially confirmed
- Files: `packages/protocol/src/index.ts:34-47`, `apps/web/src/App.svelte:64-82`, `apps/web/src/lib/game/session.svelte.ts:133-135`, `apps/web/src/lib/game/engine.ts:5-19`
- Evidence: `importtest.mjs`: an old ruleset (0.0.1 vs 0.2.0) loads without a warning; a corrupt save (P1 deleted) loads stuck with "Waiting for …"; `seats: []` produces an all-AI game that plays itself. `loadSave` has no try/catch, so an unknown map id becomes an unhandled rejection. Correction: do not hard-reject old ruleset versions or gate on replay hashes, because every balance bump would wipe saves and debug commands are not recorded.
- Proposal: add `apps/web/src/lib/game/saveValidation.ts` with `validateSave(save): {ok:true, warnings} | {ok:false, reason}`. Hard failures: unknown map (`error.SAVE_UNKNOWN_MAP`); seats not one-to-one with `turnOrder` (`SAVE_BAD_SEATS`); missing players or an invalid active player (`SAVE_CORRUPT`); `getLegalActions(currentActor)` throws (`SAVE_CORRUPT`). A different ruleset version is only a soft warning, `ui.save_other_ruleset`. Wrap load and import in try/catch, translate the errors, and reset the file input. Fixtures: `save-{ok,oldruleset,corrupt,noseats}.json`. E2E: the first two open (the second with a warning), the last two show `.error`.
- Note: #10 made the Load list tolerate unreadable rows and replays saved pending commands defensively, and #22 bumped `RULESET_VERSION` to 0.3.0, so the "different ruleset" warning now matters for every save made before #22.

##### spec-debug-commands-break-replay: Debug commands are not recorded, so exported logs cannot be replayed
- Severity: low | Effort: M | Delight: 1 | Status: confirmed
- Files: `apps/web/src/lib/game/session.svelte.ts:415-426`, `apps/web/src/lib/components/DebugPanel.svelte`, `apps/web/src/lib/devlog.ts:5`, `packages/rules/src/engine.ts:96`
- Evidence: `debug_grant` followed by 3 × `build_route` fails replay at command 10 with `INSUFFICIENT_RESOURCES`. The e2e test uses exactly this pattern. §100's "import replay" and "legal-action overlay" are missing. The `rules` and `render` devlog categories are never used.
- Proposal: record debug commands in history with `SaveFile.debugUsed`, route `debug_*` through `applyDebugCommand` in `engine.replay` (the server whitelist still rejects them), and call `afterStateChange([])` after `debug()`. Add "Import replay…" and a "Show legal overlay" toggle to DebugPanel. Log rejections under `devlog('rules')`. Unit test: debug grant plus build, then the replay hash equals the live hash.
- Note: #18 rebuilds the Chronicle and the victory report from history and shows a note when debug commands break the replay; recording debug commands would remove that gap.

##### webstate-online-submit-errors-and-busy: HTTP 4xx/5xx retried as network errors; no in-flight indicator; Ctrl+Z skips the busy guard
- Severity: low | Effort: M | Delight: 2 | Status: confirmed
- Files: `apps/web/src/lib/game/session.svelte.ts:176,209-217,221-259`, `apps/web/src/lib/online/client.ts:60-68,146-154`, `apps/web/src/lib/components/GameScreen.svelte:66-69`, `apps/server/src/service.ts:210-212`
- Evidence: Every thrown error becomes `NETWORK`, which retries for 4.8 s, even on a 403 or 404. No component reads `session.busy`, so clicks during a submit are silently ignored. `undo()` has no busy guard.
- Proposal: add a typed HttpError; return NETWORK only for fetch TypeErrors and 502/503/504, otherwise `HTTP_<status>` with `error.SERVER_REJECTED`. Show a "Sending…" state and disable actions while busy. Add a busy guard in `undo()` and use `canUndo` for Ctrl+Z. E2E: a routed 403 shows its error within 1 s.
- From the previous analysis: "silent busy": `session.svelte.ts:176` returns false with no feedback and the only spinner is in ActionBar. Add a global busy indicator and disabled-state reasons on tools.
- #17 follow-up: the in-game transport still treats every HTTP error, including #17's new 409 `COMMAND_ID_CONFLICT` and 400 `DUPLICATE_COMMAND_ID`, as a network error and retries it. #17's `ApiError` type in `apps/web/src/lib/online/client.ts` is the natural base for the typed HttpError.

##### web-log-autoscroll-stickiness: The Chronicle jumps to the bottom on every new entry
- From the previous analysis. Severity: medium (est.) | Effort: S | Delight: 3 | Status: reported, not re-verified
- Files: `apps/web/src/lib/components/LogPanel.svelte:11-14` (synchronous `scrollHeight` read at `:13`)
- Evidence: every append forces the list to the bottom, so a player reading earlier entries loses their place during an AI turn. The synchronous `scrollHeight` read per append (up to 300 entries) also forces layout.
- Proposal: auto-scroll only when the list is already within about 40 px of the bottom; otherwise show a "Jump to latest" pill. Batch the scroll in `requestAnimationFrame`.
- Tests: e2e: scroll the Chronicle up, let the AI act, `scrollTop` is unchanged and the pill is visible; clicking it scrolls to the end.

##### web-prophecy-order-reset: Reordering the Prophecy with the keyboard is wiped
- From the previous analysis. Severity: low (est.) | Effort: S | Delight: 1 | Status: reported, not re-verified
- Files: `apps/web/src/lib/components/Dialogs.svelte:50-52`
- Evidence: an `$effect` re-initialises the prophecy `order` whenever `pending` changes, which discards the player's keyboard reordering.
- Proposal: initialise `order` once when the dialog opens (keyed by the pending prophecy's identity), not on every reactive change. See also the "Prophecy fan" idea.
- Tests: e2e: open a prophecy, move a card with the keyboard, trigger an unrelated state update, and the order is kept.

##### web-actionbar-draft-diff-null: The Banner draft diff miscounts null and undefined
- From the previous analysis. Severity: low (est.) | Effort: S | Delight: 1 | Status: reported, not re-verified; #11 and #14 rewrote ActionBar, so check it still applies
- Files: `apps/web/src/lib/components/ActionBar.svelte:36-38`
- Evidence: the draft diff compares `regionId !== r`, so a Banner whose draft is `undefined` counts as changed against a stored `null`.
- Proposal: normalise both sides with `?? null` in a small pure helper and unit-test it.
- Tests: unit: `null` against `undefined` is no change; a real move is one change.

#### Online server and tools

##### online-no-ws-heartbeat: Half-open sockets and reconnects (client side and socket cap)
- Partly done in #17: a server ping/pong heartbeat (configurable `heartbeatMs`) terminates half-open sockets and marks the player offline.
- Severity: medium | Effort: S | Delight: 2 | Status: confirmed (half-open behaviour not reproduced on a real network)
- Files: `apps/server/src/app.ts:188-247,201,217,240`, `apps/web/src/lib/online/client.ts:109-140`, `apps/web/src/lib/components/PlayersPanel.svelte:26-27`
- Evidence: sockets count toward `MAX_SOCKETS_PER_USER = 5`, so a reconnecting phone can loop on 429. The client does not reconnect on `online` or `visibilitychange` events (backoff reaches 10 s).
- Proposal: the client reconnects immediately on `online` or when the page becomes visible. At the cap, the original proposal was to drop the user's oldest socket instead of rejecting the new one; #17 notes that with six open tabs they would keep kicking each other, so drop the oldest only if it has missed a heartbeat, or tell the new tab the match is open elsewhere.
- Tests: client reconnect on a dispatched `online` event (fake timers); a 6th socket with a stale oldest socket is accepted.

##### online-ai-scheduler-stale-seat: Consecutive AI seats can stall when a step returns early
- From the previous analysis. Partly done in #17 (AI seats resume after restart; retry timers are tracked and back off from 5 s to 5 minutes; a throwing step stalls only its own match) and #12 (shared `fallbackIntents`).
- Severity: high (est.) | Effort: S | Delight: 3 | Status: reported; the null-intent path is confirmed by #12's follow-up
- Files: `apps/server/src/service.ts:238-287`
- Evidence: a pending timer plus a stale-seat early return without rescheduling stalls games with several AI seats; the `setTimeout(5000).unref()` retry was unbounded. #12 notes that the server still does `if (!intent) return;` without rescheduling.
- Proposal: after #17 merges, route every early-return path (null intent, stale seat, pending timer) through the logged retry, and run `fallbackIntents` before giving up.
- Tests: a server test with two consecutive AI seats reaches the human's turn without any human action; a mocked null intent advances via the fallback.

##### online-tauri-android-default-server: Desktop and Android builds have no usable default server, and release Android blocks http
- Also covers: `tooling-android-cleartext`
- Severity: medium | Effort: S | Delight: 2 | Status: confirmed (not tested on a device)
- Files: `apps/web/src/lib/online/client.ts:26-31`, `src-tauri/gen/android/app/build.gradle.kts:19-20,29`, `src-tauri/gen/android/app/src/main/AndroidManifest.xml:12`, `docker-compose.yml:8`, `src-tauri/tauri.conf.json:25`
- Evidence: `defaultServer()` returns `location.origin`, which is `http://tauri.localhost` on Windows and Android and falls back to `http://localhost:8787` on macOS and Linux. The release APK sets `usesCleartextTraffic=false`, while the documented docker server serves plain HTTP. The server field is hidden in a collapsed `<details>`. Network errors appear as a raw "Failed to fetch".
- Proposal: in a Tauri context (`__TAURI__`, `tauri.localhost` or the `tauri:` protocol), default to `import.meta.env.VITE_SERVER_URL ?? ''` and show the server field expanded and required. Map fetch TypeErrors to `error.server_unreachable`. Set cleartext to `true` in `defaultConfig` (the file is committed), or keep it blocked and show `online.https_required` on Android. Document the choice in AGENTS.md. Unit-test `defaultServer()` with stubbed locations; test a release APK against `http://10.0.2.2:8787`.

##### server-options-and-health-limiter: OPTIONS returns a body with 204, and the health check is rate-limited
- From the previous analysis. Severity: medium (est.) | Effort: S | Delight: 0 | Status: reported, not re-verified
- Files: `apps/server/src/app.ts:71-80,140,149`, `Dockerfile:23`
- Evidence: `OPTIONS` answers 204 with a JSON body. `GET /api/health` goes through the rate limiter, so the Docker HEALTHCHECK can get 429 under load and mark a healthy container unhealthy.
- Proposal: send an empty body with 204; exempt `/api/health` from the limiter. Re-check after #17, which changes how rate-limit keys are computed.
- Tests: `OPTIONS` has an empty body; with `rateLimitPerSecond: 1`, 20 health requests all return 200.

##### server-sqlite-busy-timeout-migrations: No busy timeout, no migrations and a missing index
- From the previous analysis. Severity: medium (est.) | Effort: M | Delight: 0 | Status: reported, not re-verified
- Files: `apps/server/src/store.ts:46-93`
- Evidence: there is no `busy_timeout`, so `BEGIN IMMEDIATE` throws `SQLITE_BUSY` under concurrent commits. There is no migration table, and `match_players(user_id)` has no index (it backs the lobby list).
- Proposal: `PRAGMA busy_timeout = 5000`; a `schema_migrations` table with an ordered ladder, replacing the ad-hoc "`ALTER TABLE` guarded by `PRAGMA table_info`" steps that several backlog entries propose (`rematch_of`, `spectate_code`, `map_json`, `match_events.events`, `ai_personality`, `link_codes`, `user_tokens`); an index on `match_players(user_id)`.
- Tests: two concurrent commits on the same match both succeed or one gets a clean 409; migrating an old DB file adds the columns once.

##### server-replay-auth-callee-check: replayData trusts its caller for authorisation
- From the previous analysis. Severity: low (est.) | Effort: S | Delight: 0 | Status: reported, not re-verified
- Files: `apps/server/src/service.ts:294-298`, `apps/server/src/app.ts:173-177`
- Evidence: `MatchService.replayData` has no auth check and is safe only because the route checks first.
- Proposal: pass the viewer into `replayData` and check membership (and the finished state) in the service.
- Tests: a non-member calling the service directly gets a 403 `HttpError`.

##### server-config-validation-and-static-hardening: Unvalidated env, permissive CORS, token in the WebSocket URL, thin static server
- From the previous analysis. Severity: medium (est., security) | Effort: M | Delight: 0 | Status: reported, not re-verified
- Files: `apps/server/src/main.ts:24,26`, `apps/server/src/app.ts` (CORS, WebSocket upgrade, static handler)
- Evidence: `PORT`, `HOST` and `AI_DELAY_MS` are not validated (#17 validates only `TRUST_PROXY`). `CORS_ORIGIN` defaults to `*`. WebSocket auth uses `?token=`, which lands in proxy logs. The static server has no HEAD, Range or ETag support, misses some MIME types and serves dotfiles and source maps.
- Proposal: parse every env var with an explicit error and exit 1, like #17 does for `TRUST_PROXY`. Default CORS to same-origin with an explicit allow-list. Authenticate the WebSocket with a first `hello` message (keep `?token=` as a deprecated fallback). In the static handler: HEAD, `ETag`/`If-None-Match`, MIME types for `.webmanifest`, `.woff2` and `.png`, and deny dotfiles and `*.map`.
- Tests: `PORT=abc` exits 1; a cross-origin request is refused by default; HEAD `/` returns headers only; `/.env` returns 404.

##### server-pushto-fake-userrow: pushTo fabricates a UserRow
- From the previous analysis. Severity: low (est.) | Effort: S | Delight: 0 | Status: reported, not re-verified
- Files: `apps/server/src/app.ts:250-253`
- Proposal: call the per-viewer view function with the user id directly instead of building a fake row. Coordinate with #17, which now builds each member's view once per broadcast.

##### tools-generate-map-robustness: The map generator has exponential and silent failure modes
- From the previous analysis. Severity: low (est.) | Effort: M | Delight: 0 | Status: reported, not re-verified
- Files: `tools/generate-map.mjs:322-345` and the seed parsing, BFS and `goblinSite` code
- Evidence: the maximum independent set search is exponential; `bfs().get()` can return undefined and produce NaN; `--seed 0` silently becomes 14; tunables are hard-coded; the output is written non-atomically; `goblinSite` can throw. #16 fixed `--seed` reading the next flag's value and made `--check` compare against a fresh generation.
- Proposal: a greedy MIS with the current result as a regression check; validate BFS results; accept 0 as a seed; expose tunables as options; write to a temp file and rename; fall back to the next candidate when no Goblin site fits. Do it as part of `content-single-map` step 1, which moves the generator into `packages/content`.
- Tests: `--seed 0` produces a different map from 14; generation of seeds 1 to 50 finishes quickly with no NaN.
- From the previous analysis: the root `vitest.config.ts` (`include` at line 5) collects only `packages/*/test`, `apps/server/test` and `tests/integration`, so nothing under `tools/**` (map generator, simulator) is ever tested. Put these tests under `tests/integration/` or add a `tools/test/**` include (the `apps/web/**` part of that note is handled by the open PRs; see `webstate-no-session-unit-tests`).
- **#14, crowded wide top bar:** after the resource strip returned to the wide layout's top bar, 1280x720 with 1.5x text crowds the bar (names shortened, the third player shows a letter). Hide the title or round label in the wide layout when the bar is tight.
- **#11, leftovers:** the ActionBar `.on` styling overrides `:disabled` when a Route or Manor tool stays selected after the player can no longer afford it (cosmetic); assert Buy Card is disabled before opening the Market in `turn-flow.spec.ts` (better failure message); add unit coverage for `missingAny`.
- **#18, tutorial flag in saves:** the rematch plan recognises a tutorial by its fixed seed, so a normal game started with the custom seed "tutorial-1" gets "Play a real game". Store an explicit tutorial flag in the save file (a save-format change). Also cosmetic: `lostToMenaces` counts a Druid's Blessing Banner robbed by the dragon as 1 although it loses 2.

### Balance and rules design

#### ai-seat-one-dominance: Seat order decides games (3-player and especially 2-player)
- Also covers: `critic-2p-balance`
- Severity: medium | Effort: M | Delight: 3 | Status: confirmed (the evidence comes from AI mirror games)
- Files: `packages/rules/src/balance.ts:34-44,56-84`, `packages/rules/src/engine.ts:192-212,405-409`, `packages/rules/src/types.ts:154`, `apps/web/src/App.svelte:42-54`, `apps/web/src/lib/components/NewGame.svelte:25`, `tools/simulate.ts:62,126`, `manors_and_menaces_project_spec.md:4164-4181`
- Evidence: 3p Normal: seat 1 wins 75/20/5% (the same with `--equal-turns`). 3p Hard: seat 1 wins 100% with an average of 11.1 rounds. 2p standard: 70/30 with 1.1 Writs per game. 2p Core: 77/23 with 0.1 Writs, 1 Essence per game and 57% hereditary Regions. 4p: 20/20/23/37 with 9.5 Writs. `seatBonus` exists but no ruleset sets it. In 3p, `seatBonus [{}, {timber:1}, {timber:1,stone:1}]` gives 50/33/17. In 2p Core, `equalTurns` plus `seatBonus [{}, {grain:1,timber:1}]` gives 58/43 but does nothing for contention. §129.4 has no 2p rows.
- Proposal:
  1. Fix `ai-expansion-myopia` and add opening variety first (Hard picks among sites within 3% of the top score, `index.ts:169`), then re-measure with 100 games per configuration.
  2. For 2p, add `BALANCE.twoPlayer = { equalTurns: true, seatBonus: [{}, {grain:1, timber:1}] }` and apply it in `standardRuleset(2)` and `mvpRuleset(playerCount=2)`. Pass `count` from `NewGame.svelte:25` and `PLAYERS` from `simulate.ts:62`.
  3. Sweep `seatBonus` for 3p and 4p with the upgraded simulator (`ai-simulator-gaps`), wire in the winning table, bump `RULESET_VERSION`, and show the bonus in NewGame through `t()`.
  4. Record 2p rows in §129.4. Neutral "Crown" Banners for 2p contention belong in a playtest note, not a default.
  5. Acceptance: seat maximum ≤45% in 3p and ≤30% in 4p (§68); an integration test of 40 seeded 2p games with seat 1 ≤65%.
- Update from #21: the baseline moved. 3p Normal seat 1 now wins 38% instead of 68%, while Hard mirror games are still degenerate (one seat wins 100% in 3p, now a different seat). #22's simulator runs showed 3p seat 1 at 63% (Normal, before #21). Re-measure on top of both.

#### content-quest-slots-clog: Unclaimable Royal Quests sit in the revealed slots (default rule)
- Partly done in #22: an opt-in `questExpiryRounds` rule (spec §27.2, off by default). A Quest nobody claims for N rounds swaps with the top of the Quest deck as a new round begins (no new randomness), with a `quest_expired` event, `GameState.revealedQuestRounds` (present only when the option is on), a "Leaves in N rounds" line in QuestPanel and a New Game checkbox under Advanced.
- Severity: medium | Effort: S (once decided) | Delight: 4 | Status: confirmed; needs a decision
- Files: `packages/rules/src/engine.ts:496-500,786-796`, `packages/rules/src/types.ts:305`, `apps/server/src/service.ts:103`
- Evidence (original): a slot is freed only when its quest is claimed. Revealed player-turns against claims: Patron of Heroes 1023/0, King's Highway 988/0, Friend of the Forest 877/3, Arcane Scholar 765/1, against Prosperous Estates 394/23. With expiry at 4 rounds (#22): Quests claimed per game 2.25 to 3.42 (2p) and 2.80 to 4.00 (3p); rounds 14.8 to 13.8 and 15.6 to 14.3; each Quest shown in 38 to 40 of 40 games against 9 to 27.
- Proposal: (1) owner decision: should expiry become the default? §27 currently replaces only claimed Quests. If yes, set the default in `BALANCE`, bump `RULESET_VERSION` and update §27. (2) Online matches cannot use it yet because the server builds rulesets from fixed names; add it to the house-rules payload from `rules-random-menace-selection-missing` step 4.
- Tests: if made default, the existing expiry tests plus updated seed-pinned fixtures.

#### content-kings-highway-unclaimable: King's Highway is almost never claimable on Greenvale
- Severity: medium | Effort: M | Delight: 3 | Status: partially confirmed (the AI confounds the telemetry)
- Files: `packages/content/src/maps/greenvale.ts:1074-1076`, `tools/generate-map.mjs:301-307`, `packages/rules/src/quests.ts:17-27,55-57`, `packages/ai/src/evaluate.ts:143-146`, `packages/rules/src/selectors.ts:107-112`
- Evidence: The endpoints `site_19` and `site_23` are 6 apart. Removing `{site_17, site_31}`, which are opened in every 3p and 4p game, disconnects them. Every landmark pair has only 2 vertex-disjoint paths. The quest was claimed 0 times in 45 to 60 games. Its progress is binary 0/1, so the AI gets no gradient toward it.
- Proposal:
  1. Graded progress: `kingsHighwayGap` as a 0-1 BFS (own usable Route costs 0, unowned costs 1, opponent Routes and opponent Holdings other than the endpoints are impassable); `current = D - min(gap, D)`, `target = D`.
  2. In the generator, choose the landmark pair at distance 5 to 7 that maximises the number of vertex-disjoint paths, print `kingsHighwayMinCut`, and make validateMap warn when it is below 3.
  3. Optional lever `quests.kingsHighwayPassesHoldings`.
  4. Tests for graded progress. Acceptance: King's Highway claimed at least once per 10 games in which it is revealed.
- #22 follow-up: flagging Quests that can never be completed was not done; only King's Highway can be detected reliably (via the min-cut above).

#### rules-ruleset-levers-missing: §129.2 and §129.4 balance levers cannot be configured
- Severity: medium | Effort: L | Delight: 3 | Status: partially confirmed (`seatBonus`, `equalTurns` and Writ variants B and C already exist)
- Files: `packages/rules/src/balance.ts:7-17`, `packages/rules/src/types.ts:130-155`, `packages/rules/src/engine.ts:430,478,631-636,639,658,667-690,407`, `packages/rules/src/legal.ts:140-151`, `packages/rules/src/selectors.ts:144-172`, `packages/ai/src/candidates.ts:66,84`, `packages/ai/src/evaluate.ts:52-55`, `apps/web/src/lib/components/Dialogs.svelte:36`, `tools/simulate.ts:34`
- Evidence: Costs are read from the global `BALANCE.costs` in engine, legal, selectors, AI and UI, so `--override` cannot change them. There is no Writ variant D or E, no Costlier Warden, no card-play limit and no starting cards. A card can be played on the turn it is bought.
- Proposal:
  1. `RulesetConfig.costs` plus a `costOf(state, key)` selector, replacing every `BALANCE.costs` read (engine, the hard-coded writ check at legal.ts:140-147, selectors, AI, Dialogs). Defaults stay unchanged, so hashes do not move.
  2. `cardPlay: {per, allowSameTurnAsBought}` with `boughtThisTurn` on the player (pushed in `buyCard`, reset in `startTurn`).
  3. `startingCardsBySeat`.
  4. `writ.tenureSurcharge` with `harvestsHeld` on each Banner.
  5. Simulate each lever and record the results in §129.4.

#### rules-warden-guard-survives-card-move: A Warden's guard protects another player's card move
- Severity: low | Effort: S | Delight: 1 | Status: partially confirmed (this matches the spec text, so it is a design improvement)
- Files: `packages/rules/src/tx.ts:69-78`, `packages/rules/src/engine.ts:439,661-662`, `packages/rules/src/types.ts:200`
- Evidence: B wards the Troll; A moves it with Knight Errant onto B's Region; the Troll is still `guardedBy: B`, so a third player cannot Warden it away.
- Proposal: update §26.1 ("If another player moves the Menace with a card, the Warden leaves it"), then in `moveMenace` add `if (by !== null && m.state.guardedBy && m.state.guardedBy !== by) delete m.state.guardedBy`. Test in 3p that a third player's Warden hire is accepted.

#### rules-highwayman-quest-connectivity: Quest connectivity ignores the Highwayman, against §13.2 and §27
- Severity: low | Effort: S | Delight: 1 | Status: partially confirmed
- Files: `packages/rules/src/quests.ts:26-27,42`, `manors_and_menaces_project_spec.md:538,1169`
- Evidence: The code passes `allowHighwayman: true` ("Quest connectivity ignores him"). The spec defines connectivity over usable Routes. §22.2 partly supports the code.
- Proposal: Option A: remove the flag at quests.ts:27 and :42 and test that the Highwayman on the only path gives `QUEST_NOT_COMPLETE`, which gives him a job in 2p. Option B: clarify §13.2 and §27 instead. Rerun the playouts either way.

#### rules-safer-road-swap-double-count: One Teleportation Mishap counts as two Menace moves for quests
- Also covers: `content-tm-double-counts-quests`
- Severity: low | Effort: S | Delight: 1 | Status: partially confirmed (design question)
- Files: `packages/rules/src/tx.ts:69-78`, `packages/rules/src/cards.ts:97-105`, `packages/rules/src/quests.ts:67-68,99-100`
- Evidence: The swap calls `moveMenace` twice. One card gives `menacesMoved +2` and `menacesMovedOffOwnAssets +2`, which completes The Safer Road even when both Menaces end up on the player's own Banners (`r4_quests.ts`), and counts 2 of the 3 moves for Monster Problems. A literal reading of the quest text allows this.
- Proposal: decide the rule first and record it in spec §27 and §19.5. If one move is chosen: add `moveMenace(by, m, to, opts: {countStats?: boolean})`; in the Mishap, compute `affected = locationAffectsPlayer(la) || locationAffectsPlayer(lb)` before moving, move both with `countStats: false`, then add +1 to `menacesMoved` and +1 to `menacesMovedOffOwnAssets` if `affected`. Optionally count "away" only when the destination does not affect the mover. Test: a 4p game with the Troll and Dragon on different Regions, play TM, assert `menacesMoved` +1. If the double count is intended, add "A swap counts as two moves" to §27 and to `en.ts`.

#### rules-far-reaches-distance-definition: Far Reaches measures raw graph distance
- From the previous analysis. Severity: low (est.) | Effort: S | Delight: 1 | Status: reported, not re-verified; needs a decision
- Files: `packages/rules/src/quests.ts:90-97`, `packages/rules/src/board.ts:73`
- Evidence: the quest uses raw graph distance, ignoring ownership, Fog and the Highwayman, unlike other connectivity checks.
- Proposal: decide in the spec whether distance is over the player's network or the raw graph; implement it, test both interpretations while deciding, and document the choice next to `rules-highwayman-quest-connectivity`.
- Tests: a board where the two interpretations differ gives the documented result.

#### rules-2p-deck-drops-dragon-whisperer: 2-player games silently lose Dragon Whisperer
- From the previous analysis. Severity: low (est.) | Effort: S | Delight: 1 | Status: reported; needs a decision
- Files: `packages/rules/src/engine.ts:159`, `packages/rules/test/rules.test.ts:370-374`
- Evidence: the 2-player Menace set has no Young Dragon, so the deck filters `dragon_whisperer`. #22 generalised the filter (`isCardUsableInRuleset`) and also drops Teleportation Mishap in 2p, so the 2p deck is now 20 cards with 3 Heroes.
- Proposal: document it as intentional in the spec (and in How to play), or rotate Menace and card pools together once `rules-random-menace-selection-missing` lands.

### Map and content

Common constraint: regenerating `greenvale` renumbers every id, and `isSaveFile` checks only `mapId`. Ship map fixes under a new map id (for example `greenvale2`, registered in `MAPS` and set as the default in `session.svelte.ts:120` and `service.ts:48`), or add `MapDefinition.version` stored in the save and the matches table and reject mismatches.

#### content-trading-posts-dead: Both Trading Posts sit on dead-end west-coast sites
- Severity: medium | Effort: M | Delight: 3 | Status: confirmed
- Files: `tools/generate-map.mjs:291-300`, `packages/content/src/maps/greenvale.ts:80,214`, `packages/content/src/validate.ts`
- Evidence: `site_07` (Iron) and `site_20` (Stone) are both degree 1, 3 routes apart, and x < 250. The mean distance to a post is 3.1 routes from west sites and 8.5 from east sites. Post trades against market trades: 0/256, 6/425 and 1/368. `site_20` was built 0 to 1 times in 15 games.
- Proposal: post candidates must have `cells.size >= 3`, degree ≥ 2, and not be landmarks. The first post maximises distance from landmarks; the second must be at least `ceil(diameter/2)` from the first and on the opposite side of CX. Print `postDistance`. Add validateMap warnings for posts that are too close or touch fewer than 3 Regions. Acceptance: post trades ≥5% of market trades. Optionally add a third post (Timber 2:1).
- See the "Trading-post pennants" idea for making posts visible on the board, and #22's `validateMap` warning for posts touching fewer than 3 Regions. #22 did not add a warning for posts placed too close together.

#### content-private-region: Honeydew Pastures touches only one Site, so it can never be contested by a Writ
- Severity: medium | Effort: S | Delight: 2 | Status: partially confirmed (it does not feed the hereditary metric; Menaces and Wizard's Interference can still reach it)
- Files: `packages/content/src/maps/greenvale.ts:997`, `tools/generate-map.mjs:193-205`, `packages/content/src/validate.ts:39-48`, `packages/rules/src/selectors.ts:405-410`
- Evidence: `region_24` (Grain, capacity 1) is adjacent only to `site_33` (degree 1), which is built in 10 to 12 of 15 games. Six more Regions touch only 3 Sites.
- Proposal: coast pruning skips a victim site if any of its cells would be left with fewer than 2 (preferably 3) alive sites. validateMap reports an error below 2 adjacent sites and a warning below 3. Add `packages/content/test/validate.test.ts` (the clone with a single site must produce the error; every `MAPS` entry must have zero errors).
- #22 added a single-Site Region warning (not an error, because Greenvale's Honeydew Pastures would make the loader refuse the shipped map). Make it an error once the generator fix lands.

#### content-opening-imbalance: One standout opening site and an under-used west
- Severity: medium | Effort: M | Delight: 2 | Status: partially confirmed
- Files: `tools/generate-map.mjs:246-250,309-318`, `packages/content/src/maps/greenvale.ts:175,1041`
- Evidence: `site_17` touches four Regions with 6 Banner slots (07 Grain 2, 08 Essence 2, 13, 14) and is opened in every game. Correction: sites 10, 11, 12, 18, 19, 29 and 30 each touch two rich Regions as well, and most "never built" sites are blocked by the one-edge spacing rule next to the always-opened sites. The real west gap is sites 13, 20, 24, 25 and 35 (built 0 to 2 of 15). The Toll Troll starts on Stone, the scarcest resource (21 per game against 53 Grain).
- Proposal: define `slots(site) = Σ adjacent capacity`. Retry the rich-cell shuffle until `max(slots) ≤ 5` and no 4-Region site includes a rich Region. Print the top-8 opening scores and a per-third west-coverage stat, and warn when any third has fewer than 3 sites with slots ≥3. Start the Troll on the most central non-rich Grain Region. Acceptance: no site opened in more than 80% of games.

#### content-single-map: Only one hand-committed map, although the generator can already make more
- Also covers: `og-random-maps`
- Severity: medium | Effort: L | Delight: 5 | Status: confirmed / partially confirmed
- Files: `packages/content/src/index.ts:15,42,53`, `tools/generate-map.mjs:19,45,61-69,167,360-366,407-408,426,434-435`, `apps/server/src/service.ts:48,72,106`, `apps/web/src/lib/game/session.svelte.ts:120,124`, `apps/web/src/lib/game/engine.ts:6-17`, `apps/web/src/lib/components/NewGame.svelte:61-66`, `packages/protocol/src/index.ts:26,41`, `packages/content/src/validate.ts`, `manors_and_menaces_project_spec.md:288-300`
- Evidence: `MAPS = { greenvale }`. The generator hard-codes the id, name and output path. The server pins `MAP_ID`, while the web client already handles `mapId`. `--seed 1..20 --check` gives valid statistics in under a second each. The generator uses `Math.sin/cos/atan2/hypot`, which are not guaranteed bit-identical across V8 and JavaScriptCore (Tauri on macOS and Linux), so regenerating from an id on another platform is unsafe.
- Proposal:
  1. Move the pure logic to `packages/content/src/maps/generate.ts`, `generateMap({seed, id, name, regionCount})` with sfc32 and no `Math.random`, asserting that `regionCount` fits the name tables. `tools/generate-map.mjs` becomes a thin wrapper, and CI checks that the output matches the committed `greenvale.ts` (see `tooling-map-check-noop`).
  2. Add the fairness constraints from section 2.2 and retry seeds until `validateMap` passes.
  3. Commit 2 curated maps (candidate seeds 2 and 10) with i18n names.
  4. Random realms are generated **once**, on the creating side: embed `map?: MapDefinition` in the SaveFile (schema bump with a migration where a missing map means greenvale) and in MatchView (a `map_json` column). Add a `registerMap(def)` registry in `apps/web/src/lib/game/engine.ts` that validates and caches, and have `fromSave` register first. The server keeps an engine cache per map and validates the `mapId`.
  5. NewGame gets a Realm picker (Greenvale / Random realm with an optional seed / Small realm for 2 players) with SVG thumbnails.
  6. Tests: `generateMap(14)` deep-equals GREENVALE; `validateMap` passes for seeds 1 to 50; a 3-AI playout on 5 seeds; `pnpm simulate --map`.
- From the previous analysis: `MAP_ID = "greenvale"` is hard-coded in `service.ts:48,72,106` and `createMatch` ignores the client's `mapId`. Also wanted: a map preview in the lobby and a random-map option. See `tools-generate-map-robustness` for generator bugs to fix during step 1.

#### content-card-pool-thin: 11 unique cards, no Charter cards, 1 Trick and 1 Story (spec target 72/24)
- Severity: low | Effort: L | Delight: 4 | Status: partially confirmed (§95 says not to commit to that scope before the prototype is validated)
- Files: `packages/content/src/cards.ts:22-34`, `packages/rules/src/types.ts:73`, `packages/content/src/i18n/en.ts:33`
- Proposal: add content in staged waves, one card per PR, each with a CardEffectId, validate/resolve/enumerate cases, `en.ts` text and a rules test. First wave: `masons_charter` (Charter ×2, stored in a new public `PlayerState.charters`; once per turn pay 2 Grain instead of the Stone, via an explicit `stoneSubstitute` flag), the catch-up card `royal_census` (Story ×1), and `dragons_bane` (see `content-dragon-hoard-sink`). After each addition run `pnpm simulate` for 3p and 4p, and reject the card if the seat-1 win rate rises. Hold `pathfinder` and `market_day` until an IP review under §125.
- From the previous analysis: `CardType "charter"` is declared (`packages/rules/src/types.ts:73`, `packages/content/src/types.ts:69-80`, `packages/content/src/cards.ts:22-33`) but no card uses it. Either implement 2 or 3 Charter cards (economic or scoring modifiers, starting with `masons_charter` above) or remove the type.

#### content-landmark-abilities: Landmarks do nothing beyond two Quests (§80 abilities not implemented)
- Also covers: `spec-landmark-abilities-post-v1`
- Severity: medium | Effort: M-L | Delight: 5 | Status: partially confirmed (landmarks go unbuilt because of spacing, not because they are unattractive; §129.4 balance is not yet stable)
- Files: `packages/rules/src/board.ts:19,74`, `packages/rules/src/quests.ts:39-48,71`, `packages/content/src/maps/greenvale.ts:1009-1035`, `packages/rules/src/engine.ts:596-617,667-678`, `packages/rules/src/balance.ts`, `manors_and_menaces_project_spec.md:2898`
- Proposal: add an opt-in `RulesetConfig.landmarkAbilities` (default false until §129.4 is settled) and `packages/rules/src/landmarks.ts`. A player gets an ability when their network reaches the landmark (reuse `reachedSites` from Grand Tour), so the spacing rule does not lock anyone out. Abilities matching §80:
  - Adventurers' Inn: refund 1 Grain when a bought card is a Hero.
  - Wizard Tower: refund 1 Iron when a bought card is a Spell.
  - Dwarven Hall: a 2:1 Stone and Iron post (virtual trade posts in `legal`).
  - Royal Castle: +1 bonus Renown on the first Quest claim.
  - Sacred Grove: +1 Essence from an adjacent Essence Banner, with the new HarvestNote `sacred_grove`.
  Route all costs through `costFor()` in selectors. Show `landmark.<id>.ability` in the site inspector. Tests: one per ability plus one with the flag off. Record `pnpm simulate --override '{"landmarkAbilities":true}'` next to §129.4. Acceptance: each landmark is reached by some player's network in ≥50% of 3p games.

#### content-dragon-hoard-sink: The Dragon's Hoard grows (mean 9 to 12, max 30 to 42) with almost no way to get it back
- Severity: low | Effort: M | Delight: 4 | Status: partially confirmed (a hoard badge already exists)
- Files: `packages/rules/src/engine.ts:163-167,463`, `packages/rules/src/cards.ts:142-153`, `packages/content/src/cards.ts:33`, `apps/web/src/lib/components/Board.svelte:384-400`
- Proposal: a new Hero card `dragons_bane` (×1, requires the young_dragon): "Move the Young Dragon. Take up to 3 resources from its Hoard." Target `{destination, take: ResourceType[] (≤3, available)}`; reuse the Whisperer path in a loop and enumerate greedily. Flavour: 'Some say slain. The dragon says "relocated".' Add a quest `hoard_breaker` (1 Renown, take 4 in total, player stat `hoardTaken`) with `requiresMenace` on quest definitions and filtering in `createGame`. Tests: validation limits, stats, and exclusion in 2p.
- See `rules-dragon-whisperer-take-choice`: letting the Whisperer choose what to take is the cheaper first step.

#### content-prophecy-weak: Very Minor Prophecy barely affects the game
- Severity: low | Effort: M | Delight: 3 | Status: partially confirmed ("never played" is an artifact of how the AI evaluates)
- Files: `packages/rules/src/cards.ts:125-136`, `packages/rules/src/engine.ts:757-770`, `packages/rules/src/commands.ts:114`, `packages/rules/src/views.ts:30,47`, `apps/server/src/service.ts:269`, `packages/ai/src/index.ts:70-72`, `packages/content/src/i18n/en.ts:61`
- Proposal: "Look at the top 3, put 1 into your hand, return the rest in any order." Add `keep: CardId` to `ResolveProphecyCommand`, validate it and move the card to the hand. `prophecy_resolved` must not reveal the kept card. The hand limit applies at end of turn. Update the Dialogs keep choice, the server auto-resolve and the AI (worth about 0.8 of a purchase; keep the best card). Test: hand +1, deck -1, and the remaining order applies.
- See also `web-prophecy-order-reset` and the "Prophecy fan" idea.

### AI

AI performance entries (`ai-latency-beam`, `ai-banner-search-cost`) are under [Performance](#performance), with the other latency work.

#### ai-difficulty-not-distinct: Hard is not measurably stronger than Normal; §57.4 features are missing
- Also covers: `spec-ai-hard-not-stronger`
- Severity: medium | Effort: L | Delight: 4 | Status: partially confirmed ("Hard is weaker" is noise; pooled, Hard won 32 of 60 in 2p and 21 of 60 in 3p)
- Files: `packages/ai/src/index.ts:89,96-110,169,176-178,183,204,212`, `packages/ai/src/evaluate.ts:143-161`, `manors_and_menaces_project_spec.md:2342`
- Evidence: The levels differ only in the follow-up search breadth, the opening pick and the Banner search budget. There is no opponent estimate, no Quest race and only a weak denial term. Head-to-head samples of 30 games swung from 12-18 to 20-10 depending on seeds.
- Proposal: Easy: add a 20% blunder rate. Normal: current behaviour plus the expansion fix. Hard:
  - `questRace`: value = renown × my × clamp(1 - (best - my), 0, 1);
  - an opponent estimate: take the top 5 candidates, simulate the next opponent's Normal reply, and re-rank;
  - Banner denial on capacity-1 Regions the leader wants;
  - pick among openings within 3% of the best;
  - a beam search over up to 3 own actions.
  Acceptance: 100 or more rotated-seat games over 2 or more seed families. Hard ≥45% against 2 Normals in 3p, ≥60% against 1 in 2p; Normal ≥60% against Easy. Run as `tools/ai-ladder.ts` / `pnpm ai:ladder` or behind `AI_STRENGTH`, not in `pnpm test`.
- Update from #21: Easy no longer stalls and is much stronger. Normal now wins only 14/30 against two Easies (was 20/30); Hard wins 17/30 against two Normals (was 13/30). The 20% Easy blunder rate above would restore the gap. Other #21 follow-ups: the planner looks only 3 Routes ahead (`MAX_PLAN_ROUTES`; a free Site 4 or more Routes away occurs in under 1% of turns); Normal can still trade away resources its next Route needs when a trade plus one Route looks better one ply ahead; in 4p Standard the "never built a Manor" counts rose slightly (Normal 20 to 22, Hard 21 to 26 of 160) and Core Hard Manors per player fell (2p 2.5 to 2.0, 4p 1.75 to 1.5), probably from faster board saturation.

#### ai-card-play-never: The AI never plays Wizard's Interference, Fog or Prophecy, and half its cards go unused
- Severity: medium | Effort: M | Delight: 4 | Status: confirmed
- Files: `packages/ai/src/evaluate.ts:161,167,173`, `packages/ai/src/index.ts:63-73,126-136`
- Evidence: A flat 0.8 per card in hand means every play starts at -0.8. Interference pays only 0.12 × threat × raw harvest. Fog and Prophecy are not modelled at all. Cards bought against played: 2.7 vs 1.3 (Normal 3p), 6.7 vs 2.2 (Easy). The AI discards the oldest cards, even a Counterspell, keeps the Prophecy order, and only counters Spells that target itself. Simply not charging the 0.8 did not change strength.
- Proposal: add `cardHeuristics.ts` with per-card values (wizard 1.0, knight 0.8, druid 0.9, counterspell 1.2, fog 0.4, prophecy 0.2) and set `handValue = Σ heuristic` (no add-back). Weight denial by need (0.35). For Fog, target the leader's path. Order the Prophecy by heuristic and discard the lowest cards. Counter a Spell when its source is the leader and it is worth at least 1 to them. Fix `ai-peeks-hidden-counterspell` first. Tests: Interference goes to the leader's 2-yield Banner; a discard keeps the Counterspell. Acceptance: cards played ≥80% of cards bought.
- #22 note: after #22 the AI can no longer fog unowned Routes, so its Fog plays in 2p fell from 2 to 0; `cardHeuristics.ts` should target opponents' Routes only.

#### ai-idea-personalities-advisor: AI rivals play identically (personality weights)
- Also covers: `og-ai-personalities`, `delight-idea-ai-personalities`
- Partly done in #24: six named rivals (Lord Mumble, Grum, Madame Quill, Sir Brash, Tally Nib the Goblin Accountant, Lady Fennick) with titles, mottos, SVG portraits and 3 to 4 quips for each of 7 moments, a rival picker in New Game, a "Rival banter" setting, quips from a UI-only seeded PRNG (at most one per batch and one per rival per turn), and an optional `SeatConfig.rivalId`. The advisor part is `og-steward-hint`.
- Severity: low | Effort: M | Delight: 4 | Status: confirmed
- Files: `packages/ai/src/evaluate.ts:21-35,115-177`, `packages/ai/src/index.ts:34-48,88,94,111-121`, `packages/protocol/src/index.ts:9-16`, `apps/server/src/service.ts:117,257-258`, `apps/server/src/store.ts:78`, and #24's `packages/content/src/rivals.ts`
- Proposal:
  1. Thread a `weights` parameter (default `WEIGHTS`) through `evaluate` and `bestFollowUp`, merging `{...WEIGHTS, ...personality}` without mutating the global. Build on #21's evaluation changes.
  2. Give each #24 rival a play style. The original profiles: the meddler (`denial .45`, `menacePressureOnOpponents .6`), the builder (`networkReach 1.9`, `buildOptions 1.3`), the hoarder (`stock 1.1`, `cardValue .5`) and the card sharp (`cardValue 1.5`, `questProgress 1.2`).
  3. Online: send `rivalId` in the create-match request, validate it on the server and store it (a new `ai_personality`/`rival_id` column via `server-sqlite-busy-timeout-migrations`). Today online AI seats send only the display name and are matched by name.
  4. Tests: two personalities on the same seed diverge within 3 rounds; each stays at a 15 to 45% win share against Normal (`simulate --personality`); unknown ids are rejected.

#### og-steward-hint: "Ask the Steward" hint button built from the AI search
- Also covers: `ai-idea-personalities-advisor` (the advisor part)
- Severity: low | Effort: M | Delight: 4 | Status: confirmed
- Files: `packages/ai/src/index.ts:48,80-110`, `apps/web/src/lib/components/ActionBar.svelte:94-99`, `packages/rules/src/views.ts`
- Evidence: A Hard `chooseAction` takes 15 ms on average (max 244 ms). It works for any seat.
- Proposal: a Steward ghost button, local games only, counted as "hints used". On click only, run `chooseAction` in the AI worker on the viewer's redacted view, so the hint cannot use opponents' hidden cards. Map the intent to a highlight: pulse a Route or Site, prefill `ui.bannerDraft` (the player still confirms), open the Market preselected, or say "nothing better, assign Banners". Show a one-line reason from `evaluateBreakdown()` (the top 2 components). Never auto-apply. Make it a lobby option, off by default for online games with more than one human. E2E: during Banner assignment the draft is prefilled and the revision is unchanged.
- Not started; #24 left it out. It needs #12's AI worker and should use the viewer's redacted view.

### Performance

#### ai-latency-beam: Hard decisions reach 130 to 450 ms; the search repeats a lot of work
- Also covers: `perf-ai-search-hotspots`
- Severity: medium | Effort: M | Delight: 3 | Status: confirmed / partially confirmed
- Files: `packages/ai/src/index.ts:89-122,141,160-185`, `packages/ai/src/candidates.ts:35-36,70-78`, `packages/ai/src/evaluate.ts:40-65,141,155-162`, `packages/rules/src/legal.ts:150,228-235`, `packages/rules/src/selectors.ts:44-47`, `packages/rules/src/errors.ts:53`
- Evidence: At the worst-case position (215 candidates) Hard takes 384 to 458 ms, because `bestFollowUp` runs on every candidate. The profile: `bestFollowUp` 66%, `getLegalActions` 25% (card-target enumeration 15%), RuleViolation stack captures 7%, `holdingAt` linear scan 6.6%. A prototype with a beam of 12 takes 51 to 68 ms at the same strength.
- Proposal:
  1. Always deepen trade candidates, which is Normal's current behaviour. Apply a BEAM of 12 (by one-ply score) only to Hard's extra deepening.
  2. `getLegalActions(..., {cards:false})` for the follow-up search, and a `kinds: 'build'` option.
  3. A non-throwing `isCardTargetValid` or `hasAnyCardTarget`.
  4. Compute `need` once in `pickInitialSite` and `pickInitialRoute` only. `evaluate` depends on the state it evaluates, so do not hoist it there.
  5. A `WeakMap<GameState, Map<SiteId,Holding>>` cache for `holdingAt`.
  6. An optional `deadlineMs` in AiOptions.
  Verify: identical decision counts, `h2h` over 60+ games (new against stock, both levels), and `latency.test.ts` asserting Hard under 150 ms on the worst-case position.
- Note: #21 changed decision costs (Hard 3p mean 12.7 to 9.7 ms, Hard 2p p95 54 to 106 ms because of larger networks). Re-profile on top of #21 and #12.

#### perf-server-ai-event-loop: The server runs AI search on its only event loop and re-parses the match 4+N times per step
- Also covers: `online-ai-blocks-event-loop`
- Severity: medium | Effort: M | Delight: 2 | Status: partially confirmed
- Files: `apps/server/src/service.ts:82-88,99-122,202,238,254-263`, `apps/server/src/store.ts:103-215,153-154`, `apps/server/src/app.ts:189,249-252`
- Evidence: `chooseAction` is inline, so a Hard move freezes every match. Verifier measurement: Normal p95 26 ms, Hard p95 67 ms with a maximum of 185 ms. Every call parses `initial_state`. Statements are prepared per call. `isConnected` scans all sockets. There is no per-user match quota, so a single guest can create 500 AI matches.
- Proposal, in priority order:
  1. Quotas: at most 10 active matches per user (409 beyond), guest creation limited to 20 per hour per client, and hourly cleanup of stale lobbies older than 7 days and playing matches untouched for 60 days.
  2. Prepare statements once, add `matchState(id)` without `initial_state`, keep a per-match revision cache, and keep a `connectedCount` map.
  3. A `worker_threads` AI worker that is compatible with the single-file bundle (`new Worker(new URL(import.meta.url), {workerData:{role:'ai'}})` with an `isMainThread` switch in `main.ts`). The step becomes async and re-checks the revision.
  Tests: the 11th match returns 409; 4 concurrent Hard matches keep event-loop delay p99 under 50 ms; `node dist/server.mjs` runs an AI match.
- From the previous analysis: server fan-out is O(S×(DB + redact + stringify)) per move; `presenceChanged` is O(M×S); `listMatches` is N+1 (about 100 queries); `DatabaseSync` is synchronous with a full-snapshot stringify on every read and write; the rate-bucket sweep has gaps. Its suggested order: exempt health and trust the proxy IP (done or covered by #17 and `server-options-and-health-limiter`), a per-match view cache per revision, batched `seats()` for the list, `busy_timeout` (`server-sqlite-busy-timeout-migrations`), and snapshot diffing or compression later. #17 already builds each member's view once per broadcast.

#### ai-banner-search-cost: optimizeBanners recomputes values at every DFS node; Easy's noise breaks the bound
- Severity: low | Effort: S | Delight: 1 | Status: partially confirmed (costs are usually under 1 ms; 28.7 ms at 12 Banners)
- Files: `packages/ai/src/index.ts:196-229,238-240`
- Proposal: precompute a table of (Banner, Region) values once, drawing Easy's noise once per pair, plus `suffixMax` so `upperBound` is O(1). Tests: Normal equals brute force on a small state; Easy's rng call count equals the number of pairs; 12 Banners in under 20 ms.

#### perf-board-derived-churn: The board rebuilds derived maps on every draft change
- From the previous analysis. Partly done in #7 (`holdingBySite`, `bannerCountByRegion`) and #12 (legal actions, highlights and the harvest preview derived once in GameScreen).
- Severity: low (est.) | Effort: S | Delight: 1 | Status: reported; re-profile after the Board PRs merge
- Files: `apps/web/src/lib/components/Board.svelte:17-22` and `bannerPositions`
- Evidence: Maps are rebuilt on any draft change; `bannerPositions` sorts per Region and `getHarvestPreview` runs on every draft change during Banner dragging.
- Proposal: memoise by `(revision, draftVersion)`; debounce the preview while a Banner is being dragged.
- Tests: a performance trace of a drag assignment shows one preview computation per drop, not per move.

#### perf-token-transitions: Every Banner and Menace carries a transition
- From the previous analysis. Severity: low (est.) | Effort: S | Delight: 2 | Status: reported, not re-verified
- Files: `apps/web/src/lib/components/Board.svelte:504-510`
- Evidence: transitions on every `.banner` and `.menace` animate mass layout shifts all at once, and `dur = 0` still creates a transition. #15's `.reduce-motion` class caps durations but does not remove the transitions.
- Proposal: animate only tokens whose position changed (diff positions per state), and skip the transition entirely when the duration is 0. Coordinate with `delight-idea-build-juice`.
- Tests: after loading a save, no running animations on `.banner`; one moved Banner animates alone.

#### perf-engine-singleton-audit: Shared engine instance per map id
- From the previous analysis. Severity: low (est.) | Effort: S | Delight: 0 | Status: audit, not verified
- Files: `apps/web/src/lib/game/engine.ts:4-13`
- Evidence: one engine (and its content context) is cached per `mapId` and shared by every session.
- Proposal: confirm that nothing in the cached engine holds per-match state (rulesets, RNG, caches keyed by state); document the invariant in a comment. Do this before `content-single-map` adds a map registry.
- Tests: two sessions with different rulesets on the same map do not affect each other.

### Missing features (spec gaps)

#### Game setup, rules and teaching

##### rules-random-menace-selection-missing: Random Menace selection (§118) and house rules cannot be reached from the UI; Goblin Tinkers never appears in play
- Also covers: `spec-menace-pool-and-house-rules-unreachable`, `og-house-rules`
- Severity: medium | Effort: M | Delight: 4 | Status: confirmed (§118 marks random selection as "Later")
- Files: `packages/rules/src/balance.ts:34-44,56-87`, `packages/rules/src/types.ts:128-155`, `packages/rules/src/engine.ts:142-152,159,197`, `apps/web/src/lib/components/NewGame.svelte:10-27,55-73`, `apps/server/src/service.ts:100-103`, `packages/protocol/src/index.ts:57-64`, `packages/content/src/maps/greenvale.ts:1066`
- Evidence: `ALL_MENACES` has no callers, and `standardMenaces()` never returns goblin_tinkers. The Tinkers are fully implemented and have a start position on Greenvale, but they only run in tests. `RulesetConfig` already supports `targetRenown`, `equalTurns`, `seatBonus`, `market.maxTradesPerTurn`, `writ.requireSettled/bribeToOwner`, `warden.guard` and `revealedQuestCount`. NewGame offers only Standard/Core plus a seed. `CreateMatchRequest` has only `rulesetName`. §129 wants human playtests of these variants.
- Proposal:
  1. Engine: add `menaceSelection?: {mode:'random'; count; pool?}`. In `createGame`, after the first-player draw, compute `active = rng.shuffle([...(pool ?? ALL_MENACES)]).slice(0, count)` (fixed mode makes no extra RNG call, so existing seeds stay identical). Use `active` for placement and for the `requiresMenace` and mishap-pair filters, and store it in `state.ruleset.activeMenaces`. Add `randomMenacesRuleset(n)` with counts 2/2/3.
  2. Add a pure `applyHouseRules(base, overrides)` in `balance.ts` that clamps target 6-16, trades 1-3, quests 2-4, and filters Menaces to those the map has start positions for. Unit-test the clamping.
  3. NewGame gets a "House rules" section: target Renown, a Quick game (8) preset, equal turns, the Writ variants, Warden guard, trades per turn, quests revealed, and a Menace choice (Standard / Random / Custom checkboxes). Show a "House rules" tag in the topbar when the ruleset differs from its preset.
  4. Online, in a separate PR: `houseRules?` on `CreateMatchRequest`, validated in protocol and applied in `service.ts:103`.
  5. Tests: same seed gives the same Menace set; every Menace appears across 200 seeds; the playout invariants hold with random Menaces; `pnpm simulate --override '{"menaceSelection":...}'` works; a game with `targetRenown = 6` finishes at 6; an e2e picks Custom → Goblin Tinkers and sees the token.
- From the previous analysis: `standardMenaces()` (`balance.ts:34-43`) never yields `goblin_tinkers`, the Highwayman appears only in 2p and the Bog Witch only in 4p, although all five starts are defined (`greenvale.ts:1036-1072`). Its suggested rotation: in 3p, Troll and Dragon plus Highwayman or Goblins alternating by seed; in 4p, include the Goblins. Update `balance.ts`, tests and docs.
- #22 added `isCardUsableInRuleset` (with `requiresMenacePair`), which already filters cards by the active Menace set; reuse it for the random set.

##### spec-tutorial-incomplete: The tutorial teaches 5 of the 9 §55 points interactively, and the coach covers the board
- Also covers: `vis-tutorial-coach-occludes`
- Severity: medium | Effort: L | Delight: 4 | Status: confirmed
- Files: `apps/web/src/lib/components/TutorialCoach.svelte:16-60`, `apps/web/src/App.svelte:42-62`, `packages/content/src/i18n/en.ts:162,256-264`
- Evidence: The tutorial runs `mvpRuleset()`, which has no cards or Quests. Point 5 (the network rule) appears during setup, where that rule does not apply. Step 4 completes passively. The Menace step auto-completes at round 5. Point 7 (cards) is paired with a build task. Writs and the Market are never exercised. The coach is fixed top-right, hides Regions and Sites, has hard-coded English task strings and never points at the control it describes. The "You: place a Manor" wording is awkward. Continue drops the coach. A Hide button does exist.
- Proposal: add `tutorialRuleset()` (standard rules, Troll only, cards on, deterministic deck, 2 Quests). Scripted steps take the shape `{textKey, taskKey, target?, done(state, events)}`: place, assign, read the preview, end turn, harvest, Route then Manor (network rule), a full Region, a Writ on the AI's settled Banner, a Warden, buy and play Knight Errant, claim a Quest. Draw a `.tutorial-spotlight` ring around the target element, anchor the coach bottom-left, and auto-minimise it while targeting. Add `data-id` attributes on board entities, keys `tutorial.task.*` and `setup.place_manor_you`, and persist `tutorialStep` in the save. E2E: the first 4 steps, and the spotlight overlapping `.preview`.
- Related: #6 adds an explicit Finish button to the last tutorial step; #14 places the coach by layout but notes it still covers part of a small board in rail and sheet layouts; #18 and #10 recognise a tutorial resumed from a save by its fixed seed (`TUTORIAL_SEED`). A New Game started with the seed "tutorial-1" typed by hand is treated as a tutorial by Play again (#18 follow-up).

##### critic-no-ingame-rules: No rules reference during a game; "How to play" leaves out the phases and 4 of the 5 Menaces
- Severity: medium | Effort: M | Delight: 3 | Status: confirmed
- Files: `apps/web/src/App.svelte:149-165`, `apps/web/src/lib/components/GameScreen.svelte:79-93`, `apps/web/src/lib/stores/ui.svelte.ts:15`, `packages/content/src/i18n/en.ts:98-110,149-155,256-264`
- Evidence: The modal is 1,143 characters and exists only on the title screen. It never mentions Highwayman, Dragon, Witch, Goblin, "settled", the phases or the per-turn limits. The `'rules'` dialog id is declared but never rendered. §52 says "tooltips not required to discover essential rules".
- Proposal: extract a `RulesDialog.svelte({ruleset?})` and open it from the title screen and from a 44 px "?" topbar button (shortcut `?`/F1). Sections: Goal, the four phases (`rules.phase.*`), Banners and Settled, Building (costs from `t('cost.*')`), Trading, Writs and Wardens with their limits, Menaces (loop over `activeMenaces`), Cards (loop over content), Quests (the revealed ones), Controls and shortcuts. Test: every active Menace name appears in a 4p game, and every `rules.*` key exists.
- Also list the keyboard shortcuts added by the open PRs: arrow keys pan and double click zooms (#13), Enter confirms and ends the turn in Banner Assignment and End (#11), Ctrl or Cmd+Z undoes.

#### Replays and history

##### spec-replay-viewer-missing: No replay viewer, although saves hold full histories and the server exposes /replay
- Also covers: `og-replay-viewer`, `online-spectator-and-replay-viewer`
- Severity: medium | Effort: L | Delight: 4 | Status: confirmed / partially confirmed
- Files: `apps/server/src/app.ts:173-177`, `apps/server/src/service.ts:161-166,293-298`, `packages/rules/src/engine.ts:87-95`, `packages/rules/src/views.ts:17-21`, `apps/web/src/lib/game/session.svelte.ts:360-383`, `apps/web/src/lib/components/Overlays.svelte:85-103`, `apps/web/src/App.svelte:132-145`
- Evidence: `grep -ri replay apps/web/src` finds nothing. A replay is exact (identical hash) and takes about 5 ms per game. Board and panels are typed on the `GameSession` class, so a parallel class would not type-check.
- Proposal: add a `'replay'` transport kind (submit always rejects) and `GameSession.replay(save)`, which precomputes `states[]` and the `turnStarts[]` indices, plus `seek(i)`. `legalFor` returns null for replay, and autosave and AI stay off. `ReplayScreen.svelte` adds a scrubber (buttons for first, previous, next and last turn; play at 1 turn per second) and a filtered Chronicle. Refuse to open when the replay diverges. Entry points: Watch replay in the victory screen, the Load list, and finished online matches (`client.getReplay`). Later: spectator codes (a `spectate_code` column added via guarded `ALTER TABLE`, `view(viewer=null)`, at most 20 spectators, `redactEvent(e, null)`). E2E: finish a game, open the replay, scrub to 0, and see Round 1 with no Holdings.
- From the previous analysis: the API exists but there is no UI scrubber, and the hash check runs only in tests; an event-list scrubber can reuse `replay()`. Spectator mode (after #6 closed the 0-human hole) is a separate task: a read-only view that follows the actor.
- #18 added `apps/web/src/lib/game/replay.ts` (shared history replay) and `buildMatchTimeline`-style reporting in `matchReport.ts`; build the viewer on them. #18 does not fetch the server's `/replay` for online games, so online victory screens lack the chart; the viewer and that fetch share the async transport path.

#### Online play

##### online-no-absent-player-resolution: No leave, resign, timer or AI stand-in, so one absent human blocks a match forever
- Also covers: `og-online-presence-qol`
- Severity: high | Effort: L | Delight: 4 | Status: confirmed
- Files: `apps/server/src/app.ts:3-12,150-179`, `apps/server/src/service.ts:124-136,231-252,282`, `apps/server/src/store.ts:210-212`, `packages/protocol/src/index.ts:124-127`, `apps/web/src/lib/online/OnlineLobby.svelte:143-150`, `apps/web/src/lib/components/PlayersPanel.svelte:28-32`, `manors_and_menaces_project_spec.md:3688`
- Evidence: There are no leave, fill, kick or replace routes. `scheduleAi` only drives AI seats. An offline Counterspell holder freezes the active player's turn. §109's `responseDeadline` is not implemented. One guest created 500 unfillable lobbies.
- Proposal:
  1. Store: add `releaseSeat`, `convertSeatToAi` and `deleteMatch`; `claimSeat` already exists.
  2. `POST /api/matches/:id/leave`: in the lobby a joiner frees the seat and the creator deletes the match; during play the seat becomes a Normal AI, followed by an emit and `scheduleAi`.
  3. `POST /fill-ai` (creator only, lobby only) converts open seats to AI and starts the match.
  4. A reaction deadline via a `reactionTimers` map and `AppOptions.reactionTimeoutMs` (default 30 s live, or shorter per `rules-reaction-window-leaks-counterspell`), which re-checks the revision and then passes.
  5. Optional turn timeout (`TURN_TIMEOUT_MS`, 90 s live, off for async) with an Easy stand-in and `{type:'stand_in'}`.
  6. Emotes from a fixed set (`well_played`, `curses`, `troll`, `thanks`, `hurry`), rate-limited to one every 3 s.
  7. Client: Leave and "Fill with computer players" buttons, a countdown ring, emote bubbles.
  8. Tests with fake timers.
- From the previous analysis: lobby leave, kick and delete-match endpoints, one endpoint at a time.

##### online-lobby-ux-gaps: Bare lobby and waiting room
- Severity: medium | Effort: M | Delight: 4 | Status: confirmed
- Files: `apps/web/src/lib/online/OnlineLobby.svelte:22,143-150,176-187`, `apps/web/src/App.svelte:17`, `apps/server/src/service.ts:57,105,133,231-236`, `apps/web/src/lib/game/session.svelte.ts:59`
- Evidence: There is no Copy or Share button. Statuses are raw English ("Open seat - waiting", "playing · code X7GDGQ", "your turn!") and `yourTurn` ignores reactions. The invite landing does not say you were invited and needs two clicks. Hash navigation to an invite in an open tab does nothing. Codes include O/0 and I/1, and a collision gives a 500. Two players can both be named "Alice". `cleanName` does not strip bidi or zero-width characters.
- Proposal:
  - Copy link and Share (with `navigator.share`) buttons.
  - Seat chips with colour swatches and translated statuses.
  - Move `currentActor` into `packages/rules` and use it both for `yourTurn` and in place of `service.actorOf`.
  - An invite landing (`ui.invited_to_match`) that chains guest creation, join and open on one submit, then calls `replaceState`.
  - A `hashchange` listener in App.
  - Codes from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` via `crypto.randomInt`, retried up to 5 times on collision.
  - Deduplicate names by appending " (2)".
  - Strip `\u200B-\u200F`, `\u202A-\u202E`, `\u2066-\u2069` and `\uFEFF` (zero-width and bidirectional control characters) in `cleanName`.
  - E2E: a second context opens the invite, types a name and submits once.
- From the previous analysis: the invite code collision (6-character code, no retry, `service.ts:104-105`, `store.ts:116-121`) returns 500; retry, and answer 409 only after N tries, with a collision test. The lobby list is capped at `LIMIT 50` with no pagination.
- Server rematch (from `webstate-rematch-stale-config`, whose client part #18 did): `POST /api/matches/:id/rematch` with a `rematch_of` column; the second caller joins the existing rematch. #18 offers "Back to lobby" online for now.
- #17 follow-up: a "Signed in as {name} on {server}" row with Sign out (from `online-stale-token-dead-end`; #17 recovers from a stale token by creating a new guest).
- #19 follow-up: the refresh button sits inside the `<h3>` heading in `OnlineLobby.svelte`; move it next to the heading.

##### online-async-notifications-gap: Async play gives no way to learn it is your turn unless the match is open
- Severity: medium | Effort: L | Delight: 5 | Status: confirmed
- Files: `apps/web/src/lib/game/session.svelte.ts:323-331`, `apps/web/src/lib/platform/adapter.ts:84-88`, `apps/web/src/lib/online/OnlineLobby.svelte:46-52,175`, `apps/server/src/app.ts:238`, `manors_and_menaces_project_spec.md:3008-3021`
- Evidence: Only `turn_started` notifies, and only inside an open session. Setup placements, reaction and prophecy prompts, and reconnects never notify. The permission request is made without a user gesture. The lobby list updates only when ↻ is pressed. §85 also wants notifications for major Quests, match end and invites.
- Proposal: add a lightweight `MatchSummary` in protocol (also used by `GET /api/matches`) and a per-user WS channel pushing `matches_changed`. The lobby updates live. Set `document.title = '(Your turn) …'`. Notify on any transition to "you must act" by comparing `currentActor` before and after, and on `quest_claimed` (≥2 Renown by others) and `game_won`. Ask for notification permission from an explicit toggle. Later: Web Push (VAPID, a `push_subscriptions` table) and polling in Tauri.
- From the previous analysis: presence is tracked but unused in the UI; turn start notifies only inside an open online session (`session:329-331`). Wanted: a badge, a sound and an optional email or push hook.

##### spec-async-online-catchup: Reopening or reconnecting to a match shows no missed events
- Also covers: `online-reconnect-event-gap`
- Severity: medium | Effort: M | Delight: 4 | Status: confirmed
- Files: `apps/web/src/lib/online/OnlineLobby.svelte:95-121`, `apps/web/src/lib/game/session.svelte.ts:111-116,262-281`, `apps/server/src/app.ts:236-238`, `apps/server/src/store.ts:81-92,192-196`, `packages/rules/src/views.ts:43`
- Proposal: add a `match_events.events TEXT` column (guarded `ALTER TABLE`) holding the full events of each batch. `subscribe` accepts `sinceRevision` and replies with up to 200 events passed through `redactEvent(e, viewer)`. Also add `GET /api/matches/:id/events?since=`. The client stores `lastSeenRevision` per match, seeds the log, and shows a "While you were away" card (see `delight-idea-away-digest`). Tests: 3 AI steps while disconnected all arrive on reconnect, redacted for the other seat.
- #23's away digest (`game/feed.ts`, digest rules) is the natural renderer for the missed events.

##### online-no-resume-after-reload: Reloading drops you out of an online match; no deep link
- Severity: medium | Effort: S | Delight: 4 | Status: confirmed
- Files: `apps/web/src/App.svelte:17`, `apps/web/src/lib/online/OnlineLobby.svelte:95-122`
- Proposal: `launch()` writes `#/match/<id>`. App routes that hash (when a token exists) to the lobby with `autoOpen`, and `exit()` clears it. Add a separate `session.connection` state rendered as a "Reconnecting…" pill (`ui.reconnecting`) rather than overwriting `session.error`. On the title screen, show "Resume online match: your turn". E2E: reload mid-game and the board is visible.

##### online-guest-identity-device-bound: Guest identity is stuck in one browser
- Severity: low | Effort: M | Delight: 3 | Status: confirmed
- Files: `apps/web/src/lib/online/client.ts:17-58`, `apps/server/src/service.ts:82-95`, `apps/server/src/store.ts:53,110-112`
- Proposal: add a `link_codes` table (6 characters, 10 minutes), `POST /api/me/link-code` and `POST /api/link`, and a `user_tokens(user_id, token_hash UNIQUE)` table migrated from `users.token_hash` with `INSERT OR IGNORE`. Add "Use on another device" with a QR code for `#/link/CODE`. `POST /api/me {displayName}` should use the currently unused `renameUser`. Tests: linking works; an expired code returns 410.
- From the previous analysis: session expiry, logout and token rotation are missing, and `renameUser` is unused.

#### Versioning and consistency

##### spec-versioning-never-enforced: Ruleset and save versions are recorded but never compared
- Also covers: `online-version-skew-unchecked`
- Severity: medium | Effort: M | Delight: 1 | Status: confirmed
- Files: `packages/protocol/src/index.ts:20,34-47`, `apps/web/src/lib/game/session.svelte.ts:126,133-135,375`, `apps/web/src/App.svelte:64-82`, `apps/server/src/service.ts:106,150,202-227`, `apps/server/src/app.ts:152`, `apps/web/src/lib/online/OnlineLobby.svelte:95-121`, `packages/rules/src/balance.ts:31`
- Evidence: `rulesetVersion` is written and never read. Bumping `SAVE_SCHEMA_VERSION` would reject every existing save, because there is no migration. The server applies commands to matches created under an older ruleset, and clients never learn the server's version.
- Proposal:
  1. In protocol, add `migrateSave(raw)` with a ladder of `vN→vN+1` steps, plus `checkSaveCompatibility(save, current)`, tested in packages/protocol.
  2. Add `PROTOCOL_VERSION = 1`. `/api/health` and the WS `hello` carry `{rulesetVersion, protocolVersion}`. On a mismatch the lobby shows a banner (`ui.version_mismatch`) with a Reload action and disables create and join.
  3. Add `rulesVersion` to MatchView and log mismatches. Do not freeze old matches by default: rejecting them is a product decision, because every balance tweak changes the version.
  4. A local save with a different ruleset loads with a notice, and replay is disabled for it.
- #22 bumps `RULESET_VERSION` from 0.2.0 to 0.3.0 and notes that command histories recorded under 0.2.0 that fog an unowned or own Route are now rejected on replay. That makes step 4 (load old saves with a notice, disable replay) concrete.

##### spec-state-hash-not-used-online: §107 state hash never used to detect desync
- Severity: low | Effort: S | Delight: 0 | Status: partially confirmed
- Files: `packages/rules/src/hash.ts:15-27`, `packages/rules/src/views.ts:17-41`, `apps/server/src/service.ts:204-205`, `apps/web/src/lib/game/session.svelte.ts:231-250`
- Evidence: A redacted state zeroes `rngState`, so any client-side command that consumes randomness diverges legitimately. A naive comparison would raise false alarms.
- Proposal: add `stateHash = hashState(redactState(state, viewer))` to the submit response. Compare only when a pure helper `shouldCheckDesync(draft, resState, batch)` in packages/protocol says so: same revision, the rng was untouched, and the batch has no buy, prophecy or discard. On mismatch, log to devlog, show `error.DESYNC` and adopt the server state. Unit-test the helper.

### Visual and layout

#### resp-board-touch-targets-microscopic: Phone tap targets are 5 to 16 px
- Severity: high | Effort: L | Delight: 5 | Status: partially confirmed (sites measure 16 px and Banners 12x13 px once the `.hit` stroke is counted; Route targets are 5.7 px)
- Files: `apps/web/src/lib/components/Board.svelte:145-148,275,314,367,433-437,490-496,518-522`
- Evidence: SVG scale is 0.2575 at 412x915 and 0.225 at 360x740. The shortest Route is 41 board units. Pinch zoom exists but makes building a zoom-tap-zoom routine.
- Proposal:
  1. Tap snapping: pure `hittest.ts` (`distToSegment`, `nearest(candidates, point, maxDist)`) with Vitest. In `onPointerUp`, for a touch without a drag while targeting, pick the nearest highlighted entity within `28/scale` units, and consume the native click that follows.
  2. On coarse pointers, when a tool is armed and the scale is below 0.6, auto-zoom to the highlighted entities (and reset afterwards).
  3. Scope `stroke-width: max(22px, calc(40px*var(--k)))` to `.targeting .hl .hit`, keeping the focus-visible rule working.
  4. E2E at 412x915: arm Build Route, tap 14 px to the side of a highlighted Route's midpoint, and that Route gains an owner.
- From the previous analysis: the Banner draft hit rectangle is 26×30 board units and hard to tap when Banners stack, and `send_home` needs a selection with no list fallback. Add a Banner list fallback (tap a row to select, then Send home) and larger hit areas while targeting.
- Status after the open PRs: #14 enlarged the HUD targets but not board targets; #13 brings off-screen targets into view but does not auto-zoom; #15's labels scale with zoom. Re-measure on-screen target sizes after they merge.

#### vis-contrast-and-high-contrast-gaps: Remaining contrast, high-contrast and small visual defects
- From the previous analysis. Severity: medium (est.) | Effort: M | Delight: 2 | Status: reported; several items may have changed with #14, #19 and #25, so re-check each
- Files: `apps/web/src/lib/components/ActionBar.svelte` (small text), `HandPanel.svelte` (card meta), `apps/web/src/app.css` (high contrast), `Board.svelte` (coast stroke)
- Evidence: borderline contrast on ActionBar `small` (opacity .68 and .75), hand card meta and `#7a1d10` at .8rem; the high-contrast theme does not remap wood, map fills or player themes; the busy spinner has no `role=status`; topbar ghost buttons look washed out on wood; side tabs are weak; the coast stroke (`stroke-width: 18`, centred) covers near-shore edges (#25 redrew the coast); hand cards (10.5rem) scroll with `overflow-x: auto` and no snap or peek (#14 made compact cards).
- Proposal: an axe-core contrast pass over the main screens at 1400x900 and 412x915 and fix what fails (4.5:1 for text); remap wood, map fills and player colours in high contrast; `role=status` on the spinner; `scroll-snap-type: x mandatory` plus a visible peek of the next card in the hand; stroke the coast outside the land (or clip it) if #25 did not already.
- Tests: axe-core with zero contrast violations on title, main turn and victory; a high-contrast screenshot baseline.

#### vis-legend-drawer: A legend for colour, shape and terrain encoding
- From the previous analysis. Severity: low (est.) | Effort: S | Delight: 3 | Status: idea
- Files: new `apps/web/src/lib/components/LegendDrawer.svelte`, `apps/web/src/lib/theme.ts`
- Evidence: spec §49 requires every board meaning to use two channels (colour plus shape or pattern), but nothing tells players what the shapes, hatchings and figures mean.
- Proposal: a drawer (from the "?" button of `critic-no-ingame-rules` or a key) listing player colours with their emblem shapes, each resource's colour, glyph and terrain motif, the Menace figures with their effects, and what highlights, veils and badges mean. Building it doubles as an audit of the dual-channel rule.
- Tests: every player, resource and active Menace has a legend row.

### UX

#### vis-disabled-no-reason: Touch users still cannot read why a tool is disabled
- Also covers: `og-affordability-shortfall`, `resp-hover-only-help`
- Partly done in #11: `getActionAvailability(ctx, state, playerId)` in `legal.ts` with reason codes (`WRONG_PHASE`, `FEATURE_DISABLED`, `LIMIT_REACHED`, `NO_TARGET`, `DECK_EMPTY`, `NO_TRADE_GIVE`, `NEED_RESOURCES`), missing resources and the shortest trade fix; have/need cost chips; a one-line reason under each disabled action; a Trade button that opens the Market with the trade preselected.
- Severity: medium | Effort: S | Delight: 3 | Status: confirmed
- Files: `apps/web/src/lib/components/ActionBar.svelte`, `apps/web/src/lib/components/HandPanel.svelte:107-109`, `apps/web/src/lib/components/Board.svelte:396`
- Evidence: the previous analysis called this "tool-first discovery": disabled tools explain themselves only through `title=`, with no touch help. #11 added visible reason lines, but its PR left out the long-press popover and hover gating, and HandPanel still shows the Buy Card cost as plain text. #14 shows tool costs only in tooltips below 1920 px wide.
- Proposal: (1) a long-press action (`longpress.ts`, 450 ms, cancelled by movement over 8 px) that opens a help popover with the reason and cost on touch; reuse #14's press-and-hold card preview mechanics. (2) Wrap hover lifts in `@media (hover:hover)`. (3) Cost chips for Buy Card in HandPanel. (4) After #11 and #14 merge, make sure the reason line survives #14's compact tool row. (5) Add the `GUARDED` reason code from the original proposal: #11's codes do not include it, so "every Menace is Warden-guarded" has no specific reason; return it from `getActionAvailability` when every Menace the player could move has `guardedBy` set (`packages/rules/src/types.ts:200`), with a unit case in `availability.test.ts`.
- Tests: e2e on the phone project: long-pressing Build Manor shows the reason; no hover lift on touch.

#### vis-opponent-actions-invisible: The Chronicle is still vague and not linked to the board
- Also covers: `og-turn-recap`, `delight-idea-away-digest`
- Partly done in #23: opponents' actions appear as stacked toasts worded from the viewer's side, the affected piece pulses, and a "What happened while you were away" digest collapses 4 or more missed actions (also for hot-seat actions behind the curtain).
- Severity: medium | Effort: M | Delight: 3 | Status: partially confirmed
- Files: `apps/web/src/lib/game/log.ts:13,46-155`, `apps/web/src/lib/components/LogPanel.svelte:1-77`, `apps/web/src/lib/components/GameScreen.svelte:285-316`, `packages/rules/src/events.ts:49-55,65`
- Evidence: log lines are vague ("Cordelia assigned 1 Banner(s).") because `banner_assigned` entries are collapsed into a count; log entries cannot be clicked; on desktop the Chronicle is a non-default tab.
- Proposal: (4) the log uses `toRegionId` (null means sent home) and groups by player ("Cordelia planted Banners in Faerie Ring and Moonglade") with plural keys (`content-i18n-plurals`); reuse #23's `feed.ts` grouping. (5) Clicking a log entry pans to the entity (use #13's camera `centerOn`). (6) On desktop, keep Players and Chronicle visible together.
- Tests: a log unit test for grouping; e2e: clicking an entry centres the camera on its Region.

#### vis-harvest-feedback-weak: No lasting harvest summary and no screen-reader harvest status
- Also covers: `og-harvest-feedback-lost`, `spec-harvest-summary-invisible-hotseat`, `delight-idea-harvest-flight`
- Partly done in #23: harvested resources fly from each producing Region to the owner's counter (yours, a rival's card or a toast), counters tick up as tokens land, Regions changed by a Menace or Druid's Blessing get a badge, a hot-seat harvest dealt behind the curtain is held and plays on reveal, and with animation off counters update at once with a highlight. The 1.6 s floater is gone.
- Severity: medium | Effort: S | Delight: 3 | Status: confirmed on `main`; remaining parts derived from #23's description (not re-measured on its branch)
- Files: `apps/web/src/lib/components/HarvestPreview.svelte`, `apps/web/src/lib/audio/sfx.ts:35,71`, #23's `apps/web/src/lib/game/feedback.svelte.ts` and `game/harvestFlights.ts`, `manors_and_menaces_project_spec.md:2121`
- Evidence: on `main`, harvest feedback disappeared after 1600 ms and was filtered to the viewer; in hot-seat the timer ran behind the curtain (0 floaters after a 2.5 s wait). §50 asks for a 250 to 400 ms fly-to-HUD, and the previous analysis asked for harvest-summary persistence (§16.1). #23's description mentions no persistent summary line, no `role=status` announcement, no sound timed to the landing tokens (`sfx.ts:71` plays the `resource` cue once per batch on `resource_gained`) and no reduced scale for AI flights.
- Proposal: keep a "Last harvest: +1 Grain +1 Essence" line in HarvestPreview until `end_turn` (from the viewer's last `banner_harvested` events; with animation off this static summary is the only feedback). Announce the viewer's harvest once through a `role=status` toast (or #9's announcer). Time the `resource` cue to the viewer's tokens landing instead of the batch (respect mute). Play AI flights at 60% scale so the viewer's own harvest stands out.
- Tests: e2e after a hot-seat curtain wait of 3 s: the "Last harvest" line is visible and matches the counters, and stays until End Turn; the status region contains the harvest once; a unit test for the summary builder (3 Banners, 1 blocked gives 2 gains).

#### vis-own-resources-hud: Your own card is not pinned, and there is no Renown progress
- Partly done in #23: on wide screens your resources sit over the bottom centre of the board as a purse with `data-res` targets, used by the harvest flights. #14 adds a dock resource row for its rail and sheet layouts.
- Severity: low | Effort: S | Delight: 3 | Status: confirmed on `main`
- Files: `apps/web/src/lib/components/PlayersPanel.svelte:15-45`, `apps/web/src/lib/components/GameScreen.svelte:83-87,178-181,293-295`
- Proposal: in PlayersPanel, pin a "You" tag on the viewer's card and sort it first; add a Renown progress bar (current/target) to each card; show "Almost there!" when the viewer is at target-2 (an `en.ts` key, not literal text). In hot-seat, "You" follows the viewer.
- Tests: e2e at 1400x900: the first player card is the viewer's and carries "You"; the progress bar's value equals Renown/target; with Renown set to target-2 via debug, "Almost there!" is shown.

#### ai-turn-pacing-dead-time: No way to skip ahead while the AI plays
- Partly done in #12: AI steps are decide-then-pace; steps that change nothing get no wait, handing over the turn gets half a beat and visible moves a full beat, thinking time counts toward the wait, and the beat follows the animation speed. A 3-AI round fell from 6.0 to 7.5 s to 2.9 to 4.5 s at normal speed. #12 declined the proposed under-4 s e2e gate (its range reaches 4.5 s and wall-clock gates are flaky on shared runners); unit tests on `aiStepPace` and `aiPaceDelayMs` guard the pacing instead.
- Severity: low | Effort: S | Delight: 3 | Status: confirmed (the button is absent from #12's description)
- Files: `apps/web/src/lib/game/session.svelte.ts` (#12's AI scheduler), #12's `apps/web/src/lib/game/aiStep.ts`, `apps/web/src/lib/components/ActionBar.svelte`, `packages/content/src/i18n/en.ts`
- Proposal: add a `fastForwardAi` flag with a "Skip to my turn" button, shown only while an AI acts in a local game. While set, the pacing delay is 0 and animations for AI batches are skipped; clear it at the next human `turn_started` or when a reaction prompt needs the viewer. Add the `en.ts` key.
- Tests: unit test that `aiPaceDelayMs` returns 0 while fast-forwarding; e2e with 3 Normal AIs: after pressing the button, the human's turn starts and the button is gone.

#### og-quest-race-visibility: Rival quest progress is hidden, and quests are not linked to the board
- Also covers: `vis-quests-not-linked`
- Severity: medium | Effort: M | Delight: 4 | Status: partially confirmed
- Files: `apps/web/src/lib/components/QuestPanel.svelte:26-45`, `packages/rules/src/quests.ts:50-117,120-122`, `packages/rules/src/types.ts:42`, `packages/rules/src/views.ts:20`
- Proposal: show `current/target` beside the bar. Under each bar, one chip per rival (emblem, `current/target`, aria-label `ui.quest_rival_progress`). Mark `.threat` only when `target ≥ 3 && target - current === 1` (binary quests would otherwise always be red), and put a crown on the leading rival. Hovering a quest sets `ui.questFocus`, and Board rings the relevant Sites, Regions and Routes using a new `focusEntities(ctx, state, questId)` in `quests.ts` (King's Highway uses `questParams`). Tests: a vitest showing `getQuestProgress` for a non-viewer equals the value on a redacted view; chip count equals players-1; `focusEntities` for King's Highway.
- From the previous analysis ("Quest wax-seal stamp and progress pips"): show Monster Problems style progress as pips (1/3, 2/3) on the quest card and stamp a wax seal when it is claimed (the stamp animation is in `delight-idea-build-juice`).

#### vis-silent-toll-payment: Toll and surcharge resources are chosen silently by an AI heuristic
- Also covers: `ai-payment-choice`
- Severity: medium | Effort: S | Delight: 3 | Status: confirmed
- Files: `apps/web/src/lib/game/interaction.ts:4,182-185,230-251`, `packages/ai/src/candidates.ts:24-35,42-68`, `apps/web/src/lib/components/Dialogs.svelte:111`
- Evidence: `spareResource` picks the most plentiful resource regardless of need, both for the AI and for humans (the UI imports it from the AI package). An AI with 3 Stone that needs Stone pays the Toll in Stone. Writ bribes follow the same rule.
- Proposal:
  1. AI: `spareResource(state, pid, exclude, weights?)` returns the argmin of `weights[r]/(left+1)`, with `resourceNeeds` passed in. For bribes, use own need minus 0.5 times the victim's need.
  2. Web: when a check reports `needsToll` or `needsSurcharge` and more than one resource is payable, open a payment dialog (reuse the bribe markup, keys `ui.choose_toll`/`ui.choose_surcharge`) preselected with the suggestion. Auto-pay when there is only one option. Move the plain helper out of the AI package into web or rules selectors. Show "Toll: +1 any" in the tool's cost chip.
  3. Tests: an AI unit test (`{stone:3, grain:2}` with Stone needed pays Grain); a Playwright test where a Route under the Highwayman opens the picker and choosing Iron spends Iron.

#### critic-newgame-validation: New Game accepts duplicate names and forgets the last setup
- Severity: low | Effort: S | Delight: 1 | Status: confirmed
- Files: `apps/web/src/lib/components/NewGame.svelte:9-26,44-45`
- Proposal: mark duplicate names (after trim and lowercase) with `aria-invalid`, show `ui.names_must_differ` and disable Begin. Persist the form in `mm.newgame.v1` (inside try/catch). With no human seats, Begin reads "Watch AI game". E2E for both.
- Conflict to resolve: #6 blocks Begin when no seat is human, while this entry proposes "Watch AI game". Pick one (and check #12's all-AI e2e test).

#### web-undo-lock-unexplained: Undo disappears after a locking action with no explanation
- From the previous analysis. Severity: low (est.) | Effort: S | Delight: 2 | Status: reported, not re-verified
- Files: `apps/web/src/lib/game/session.svelte.ts:251-252`, `apps/web/src/lib/components/ActionBar.svelte`
- Evidence: once a locking command (draw, play, a committed trade) is sent, Undo stays disabled with no reason.
- Proposal: a reason line or tooltip on the disabled Undo ("Undo works until you draw, play a card or end the phase"), and a one-time toast the first time an action locks the turn. Reuse #11's reason-line styling.
- Tests: e2e: buy a card, Undo shows the reason.

#### ux-buy-card-two-step: Buy Card fires at once while every build is preview-then-confirm
- From the previous analysis. Severity: low (est.) | Effort: S | Delight: 2 | Status: reported, not re-verified
- Files: `apps/web/src/lib/components/ActionBar.svelte`, `apps/web/src/lib/components/HandPanel.svelte`
- Evidence: builds arm a tool and wait for a target; Buy Card spends immediately and cannot be undone (it draws hidden information).
- Proposal: standardise on preview-then-confirm: the first tap shows the cost, deck count and "cannot be undone", the second confirms. Keep keyboard activation to one confirm step.
- Tests: e2e: one click does not change resources; confirming buys.

#### ux-card-unplayable-reason: Unplayable cards give no reason, and the discard quota is buried
- From the previous analysis. Severity: low (est.) | Effort: S | Delight: 2 | Status: reported, not re-verified
- Files: `apps/web/src/lib/components/HandPanel.svelte`
- Evidence: clicking a non-playable card does nothing visible; when over the hand limit, "discard N" is easy to miss.
- Proposal: `aria-disabled` plus a visible reason on unplayable cards (wrong phase, no legal target, needs Essence), and a "Select N to discard" group header with a counter. Card frames per type are in `delight-aes-parchment-ui-kit`.
- Tests: e2e: an unplayable card shows its reason; the discard header counts down.

#### ux-targeting-locks-exploration: Targeting freezes the board and loses focus; clicking the sea does not cancel
- From the previous analysis. Severity: medium (est.) | Effort: S | Delight: 3 | Status: reported; re-check after #15
- Files: `apps/web/src/lib/components/Board.svelte` (targeting styles and handlers)
- Evidence: while a tool is armed, non-targets get `pointer-events: none` and `tabindex=-1`, so players cannot inspect the board, keyboard focus is lost, and a click on empty sea does not cancel the tool. #15 adds a dimming veil over non-targets, which keeps this behaviour.
- Proposal: keep focus on the armed tool or first target; allow inspecting non-targets (hover card or long-press, without picking); a click or tap on empty sea cancels the tool (with #13's drag threshold so pans do not cancel).
- Tests: e2e: arm Build Route, click the sea, the tool is disarmed; hovering a non-target shows its card.

#### resp-android-back-button: The Android back button leaves the game instead of closing a dialog or panel
- Severity: medium | Effort: M | Delight: 3 | Status: confirmed (from code; Tauri's AppPlugin finishes the activity when the WebView cannot go back)
- Files: `apps/web/src/App.svelte:15-17,100-129`, `apps/web/src/lib/components/GameScreen.svelte:62-73`
- Proposal: add `backstack.svelte.ts`. `pushLayer(name, close)` calls `history.pushState`, one `popstate` listener closes the top layer, and a normal close calls `history.back()` behind a flag. Register a layer from Modal, the slide-over panel, an armed tool, and the game screen (which asks "Leave game? It is autosaved."). Choose this or a `PlatformAdapter.onBack` wrapper around Tauri's `onBackButtonPress`, but not both. E2E: open the Market, `goBack()`, the dialog closes and the game stays.
- #10's game menu and #14's slide-over already handle Escape; register the same close handlers as back-stack layers.

### Accessibility

#### critic-a11y-keyboard-focus: Remaining keyboard gaps
- Partly done in #9 (the curtain is a modal: the game is `inert`, focus starts on "Tap to begin turn", Tab is trapped, focus moves to the first enabled action or board target on reveal), #15 (`.focus-ring` rings on Regions and Menaces, no focus rectangle after mouse clicks) and #11 (focus moves to the replacement button after a keyboard activation).
- Severity: low | Effort: S | Delight: 2 | Status: partially confirmed
- Files: `apps/web/src/lib/components/Board.svelte`, `apps/web/src/lib/components/GameScreen.svelte:62-73`
- Evidence: keyboard shortcuts are documented nowhere; after a phase change triggered by the AI or a pointer, focus can sit on `<body>`; the previous analysis found the board focus ring weak over the sea.
- Proposal: list shortcuts in the Rules dialog (`critic-no-ingame-rules`); after any mode change where focus is on `<body>`, move it to the new primary button (helps screen readers and WebKit); give the focus ring a light casing so it shows on sea as well as land.
- Tests: Playwright: after the AI's turn ends, `document.activeElement` is the primary action, not `<body>`.

#### critic-sr-silent-game: Remaining screen-reader gaps
- Partly done in #9: an always-present polite live region outside the inert game root announces turn changes, opponents' builds with the place, their important actions, the winner, and the local seat's harvest and payments; the Chronicle list no longer has `aria-live`.
- Severity: medium | Effort: S | Delight: 2 | Status: confirmed
- Files: `apps/web/src/lib/components/HarvestPreview.svelte:18,23`, `apps/web/src/lib/components/PlayersPanel.svelte:20-38`, `apps/web/src/lib/components/Dialogs.svelte:88-90`, `apps/web/src/lib/components/ResourceIcon.svelte:9`
- Evidence: Renown reads as a bare "2/12"; the active player is marked only by a class; Market buttons read "3× Stone Stone"; HarvestPreview re-announces itself. In hot-seat no seat's harvest or payment is announced (no single seat owns the screen), and free setup placements are not in the Chronicle, so they are not announced.
- Proposal: remove `aria-live` from HarvestPreview; PlayersPanel gets `aria-current` and visually hidden "Renown" text; pass `label={false}` to ResourceIcon where the name is also printed; in hot-seat, announce the harvest of the seat that just revealed; add setup placements to the announcer (not necessarily the Chronicle).
- Tests: unit tests in #9's `apps/web/test/announce.test.ts` for the hot-seat harvest and setup placements; Playwright: the Market button's accessible name is "3 Stone".

#### critic-cvd-player-colours: Player colours collapse under colour blindness and clash with terrain
- Also covers: `vis-player-color-terrain-clash`
- Severity: medium | Effort: M | Delight: 3 | Status: confirmed
- Files: `apps/web/src/lib/theme.ts:6-12,32-40,70`, `apps/web/src/lib/components/Board.svelte:276-281,336,369-370`
- Evidence: Under deuteranopia Azure and Violet are almost identical (ΔE2000 5.8; `cvd-deutan.png`). Gold matches Grain terrain (WCAG 1.05 to 1.63; ΔE76 26). Routes carry colour only. The Banner emblem is about 3 px. Correction: the palette proposed in `vis-player-color-terrain-clash` fails its own test and introduces an Ivory/Stone clash.
- Proposal: keep Crimson, Azure and Gold, and replace **Violet** (seat 4) with **Ivory** `{color:"#f4f0e4", light:"#ffffff", dark:"#5a5040", shape:"square"}`. The minimum pair distance under deuteranopia rises from 5.8 to 17.4, all pairs are ≥17 under protanopia and tritanopia, and the violet-on-Essence clash disappears. Seat indices, and therefore saves, are unchanged. Alternatively swap Gold for burnt orange `#e0701a`. Keep the `#3a2d1a` Route casing. Draw `emblemPath(shape, 5)` at each owned Route's midpoint, and enlarge the Banner emblem to about r=4 on the flag. Add a 1.5 px `#fffaf0` inner halo on pieces. Vitest `theme.test.ts`: Machado matrices with every pair ΔE2000 ≥15 (deutan, protan, tritan); CIELAB ΔE76 player-to-terrain ≥35; casing WCAG contrast ≥3.
- Note: #25 draws Holdings and Banners with new art; apply the halo and emblem sizes to #25's `HoldingFigure` and Banner rendering.

#### spec-a11y-board-accessible-names: Board accessible names are ambiguous (37 of 43 Routes read "Road unowned")
- Severity: medium | Effort: M | Delight: 2 | Status: partially confirmed
- Files: `apps/web/src/lib/components/Board.svelte:229,271,308-310`, `apps/web/src/lib/game/log.ts:28-39`
- Evidence: There are 111 tab stops. Labels include "Road unowned" ×24, "Site" ×23 and "Manor of Alice" ×2. Region labels omit occupants and Menaces. The log says "road #17". A site name built from the first two adjacent Regions is not unique (5 duplicate pairs); the full sorted adjacency is.
- Proposal: in a pure `packages/content/src/names.ts`, re-exported by `log.ts`, add `siteName` (landmark name, else "coast of A" / "between A and B" / "between A, B and C" using all adjacent Regions) and `routeName` ("{kind} from {A} to {B}"). Use them in `placeName`, aria-labels (owner, Highwayman, fog, holding, post) and the inspector, all through `t()`. Add roving focus: `<g role=group>` per layer, one tab stop each, and arrow keys move to the nearest item. Tests: every GREENVALE site and route name is unique (vitest); aria-labels are unique (e2e).
- From the previous analysis: the side tabs use `tablist` without `aria-controls`, arrow keys or `tabpanel`; the board is `role=application`, which traps screen-reader users and supports only Enter and Space, with no arrows; labels do not say selectable, selected or disabled; the reaction and prophecy dialogs need a focus-trap and Escape audit.

### Aesthetics

Performance rule for all board art, measured at 6x CPU throttle: merge decorations into a few `<path>` elements and bake shadows as ellipses, which costs nothing (p95 stays at 16.8 ms). Avoid hundreds of `<use>` elements (p95 doubled to 33 ms) and CSS or SVG filters on pieces (50 to 83 ms spikes, though that measurement was confounded). Keep filters on static layers only. #25 followed this rule (frame p95 16.7 to 16.8 ms at 4x).

#### vis-art-direction: Remaining steps from flat prototype to storybook tabletop
- Partly done in #19 (step 1 fonts; step 2 paper tokens and parchment kit; step 6 HUD framing and SVG icons; the title screen) and #25 (step 3 terrain motifs; step 5 pieces with shadows and lit edges; landmark art; coast with shallows, surf, beach, cartouche, compass rose and ship).
- Severity: medium | Effort: L (in steps) | Delight: 4 | Status: confirmed
- Files: `apps/web/src/app.css`, `apps/web/src/lib/theme.ts`, `apps/web/src/lib/components/Board.svelte`, #25's `apps/web/src/lib/art/` and `components/board/`
- Evidence: §4.2 asks for "cheerful, storybook medieval fantasy, warm". After #19 and #25 the board still has flat saturated Voronoi fills (`RESOURCE_COLORS` unchanged), no paper grain or inked borders, plain Region names and white-disc resource glyphs next to the new figures.
- Proposal, each step on its own:
  1. Palette: soften Region fills toward a painted palette (#25 follow-up), keeping hatch patterns for high contrast. The original tokens: `--paper #fbf5e6`, `--parchment #f1e4c4`, `--vellum-edge #d9c49a`, `--ink #2b2115`, `--ink-soft #5a4a32`, `--wood #5b3d22` with a grain gradient, `--brass #b8862b`, `--accent #2f6b3a`, danger `#a3190c`; sea as a radial gradient from `#4f86a0` to `#9cc9d6` with a foam stroke (26 px `#e8f1ee` at 0.5) and a sand stroke (10 px `#cdb88a`) (compare with #25's coast first).
  2. Textures: a single paper-grain overlay (`feTurbulence` at 6% alpha on one rect) and an `inked` displacement filter on static Region borders (deferred from #25 as "grain/ink filters").
  3. Region names on parchment ribbons; resources as wax-seal discs in the terrain's dark colour, distinct from the Menace figures.
  4. Motion: pieces drop in, Banners are planted, Menaces hop (`delight-idea-build-juice`).
- Tests: Playwright `toHaveScreenshot` baselines (title, main turn, Warden mode, victory at 1400x900, fixed seed, animation off). #19's `icons.test.ts` already guards against glyph icons.

#### vis-menace-tokens-indistinct: Menace figures are small, the hoard is emoji, and Menace effects have no area cue
- Also covers: `delight-aes-menace-figures`
- Partly done in #25: five distinct figures (troll, highwayman, young dragon, bog witch with cauldron, goblin tinkers) with idle fidgets that stop under reduced motion; aria-labels unchanged.
- Severity: medium | Effort: M | Delight: 4 | Status: confirmed
- Files: `apps/web/src/lib/components/Board.svelte:50,64-78,241-242,379-405` (hoard text at `:400`), #25's `components/board/MenaceFigure.svelte`, `apps/web/src/lib/theme.ts:7-11`
- Evidence: the figures are about 28 px on screen (to fit the existing ring and position), against the proposed 40 px; the Dragon's hoard is still emoji text from `RESOURCE_COLORS[r].label`, and the previous analysis found it overlapping in small Regions; there is no cue for which Region or Route a Menace affects. The Highwayman, Goblin Tinkers and Bog Witch figures were only checked in a gallery page because they do not appear at game start.
- Proposal: grow figures to about 40 px at fit view, grounded at `(labelX+50, labelY+30)`, with the Banner row starting at `labelX-28` (reconcile with #15's Banner slots); render the hoard as a pile of 7 px resource tokens (3-2-1, capped at 8 with "+n") using `ResourceIcon` shapes, then drop the emoji `label` field from `theme.ts` and extend #19's `icons.test.ts` to scan `.ts` files; add an area-of-effect cue (a red dashed hatch on the affected Region, an X-dash on a Highwayman Route).
- Tests: e2e: `.menace` is at least 36 px tall and does not intersect its `.region-name`; aria-labels still match; a game with random Menaces (after `rules-random-menace-selection-missing`) screenshots every figure in play.

#### delight-aes-parchment-ui-kit: Card frames, card reveal, tabs and curtain styling
- Also covers: `vis-cards-presentation`
- Partly done in #19: paper tokens with a noise tile, bevelled buttons with a pressed state, a primary gradient, recessed fields, styled fieldsets, radio cards, paper dialogs with a gilt rule, high-contrast fallbacks. #9 gave the curtain the player's emblem.
- Severity: medium | Effort: M | Delight: 4 | Status: confirmed
- Files: `apps/web/src/lib/components/HandPanel.svelte:26-146`, #9's `PrivacyCurtain.svelte`, `apps/web/src/lib/components/GameScreen.svelte:242-254`, `apps/web/src/lib/components/ActionBar.svelte:93`
- Evidence: playable cards differ from unplayable ones only by opacity 1 against 0.7; reaction cards are marked by a text suffix; buying a card shows no reveal; deck and discard counts are not shown; the side tabs are weak; #19 left card frames, the buy flip and the curtain tint out to avoid conflicts.
- Proposal:
  1. `.primary` as a wax-seal ribbon; tool tiles with ink-circle icons; tabs as bookmark ribbons.
  2. Card frames per type (Spell violet/star, Hero crimson/sword, Trick green/mask, Charter gold/seal, Story teal/book), 5:7 aspect, name in Alegreya SC, flavour in italic. Playable cards get a green ring and a "Play" affordance; unplayable ones are greyed with a reason (`ux-card-unplayable-reason`); reaction cards get a lightning corner.
  3. A 600 ms flip reveal from the deck to the hand on buy (WAAPI, scaled by the animation setting), with deck and discard counts next to Buy Card.
  4. Curtain tinted from the player's colours, "Pass the device to {name}" and rotating `ui.curtain_quip.1..6` lines, with at least 4.5:1 contrast.
- Tests: axe-core contrast checks, screenshot snapshots, visible focus rings.

#### delight-idea-build-juice: No build, plant or quest animations; the event bus has no subscribers
- Also covers: `webstate-event-animation-queue-missing`, `og-feedback-animations-audio` (animation part)
- Severity: medium | Effort: M | Delight: 4 | Status: partially confirmed (Menaces and Banners already glide via CSS transitions)
- Files: `apps/web/src/lib/components/Board.svelte:276-281,327-337,358,389,504-510,541`, `apps/web/src/lib/game/session.svelte.ts:94,166-169,291-293`, `apps/web/src/lib/components/QuestPanel.svelte`, `apps/web/src/lib/stores/settings.svelte.ts:50`, `apps/web/src/App.svelte:106`
- Proposal: add `apps/web/src/lib/fx/transitions.ts` with Svelte transitions that read `animationScale()`:
  - `drawRoute`: `getTotalLength`, then a dashoffset animation from the owner's end, 400 ms;
  - `dropIn`: translateY -18 px with squash, 380 ms;
  - `raisePennant`.
  Apply `in:drawRoute` to owned Route lines and `in:dropIn` to Holdings; Svelte runs intros only after mount, so loaded saves do not animate. Also: a dust puff through the FxLayer; a plant bounce on `banner_assigned`; a wax seal stamping onto a claimed quest card (scale 2→1, rotate -12 deg, 300 ms); a scroll flying on a Writ. Subscribe with `session.onEvents` and skip provisional batches. Tests: the Route dashoffset is >0 at 100 ms and 0 at 600 ms; it is 0 immediately with animation off; after loading a save, no animations run in `.layer-routes, .layer-sites`.
- #23 replaced the unused `onEvents` listeners with a typed `EventBus` (`game/eventBus.ts`); subscribe there. #25 changed how Holdings and Routes render, so apply the transitions to its figures.

#### spec-audio-music-and-menace-cues: One generic Menace sound, music not restored on reload, a jittery music loop, no volume control
- Also covers: `delight-idea-distinct-audio`, `og-feedback-animations-audio` (audio part)
- Severity: medium | Effort: M | Delight: 4 | Status: confirmed
- Files: `apps/web/src/lib/audio/sfx.ts:36-50,59-73,77-93`, `apps/web/src/lib/components/SettingsDialog.svelte:10-16,36-37`, `apps/web/src/App.svelte:94-97`, `apps/web/src/lib/game/session.svelte.ts:190,246,276`, `packages/rules/src/engine.ts:150`
- Evidence: `setMusic` is called only from SettingsDialog, so a saved "music on" plays nothing until the dialog is opened. Every `menace_moved` plays the same `menace` cue, although §51 asks for distinct cues. Music is a `setInterval(420ms)` loop scheduled at `currentTime+0`.
- Proposal: call `setMusic(settings.music)` from App's `$effect`, resume the AudioContext on the first pointerdown, and pause on `visibilitychange`. Derive the Menace type from `e.menaceId.replace(/^menace_/, '')` (no event schema change) and use a pure `cueFor(events)`:
  - Troll grumble: detuned 78/81 Hz saws through a 380 Hz lowpass, sliding down.
  - Dragon whoosh: a noise bandpass sweep from 300 to 2200 Hz plus a 60 Hz swell.
  - Witch cackle: sine hops with vibrato.
  - Goblin ratchet: 8 square clicks.
  - Highwayman whistle: a 1200-1800-1400 Hz glide.
  - Harvest events: a troll grumble for a blocked harvest, a coin clink for a Dragon take.
  Use a Karplus-Strong lute for Banner, turn and music voices. Replace the loop with a lookahead scheduler (a 25 ms timer scheduling 120 ms ahead) playing 4 composed phrases in D Mixolydian, moving to minor while a Menace sits on a Region with the viewer's Banner. Add `sfxVolume` and `musicVolume` sliders through master gain nodes. Tests: a `cueFor` unit test; a fake-AudioContext test that the scheduler produces increasing start times; a manual listening pass.
- From the previous analysis ("Sound and haptics"): woodblock, chime and thud cues. Its illegal-tap vibration is in `resp-idea-haptics-and-press-feedback`.

### Gaps versus Catan and Kolonists

What already matches Kolonists: bank and Trading Post trades, a paid displacement (the Royal Writ standing in for Kolonists' bribe), undo, a hot-seat curtain, AI levels, speed settings, save and load, online invites. Kolonists had no negotiation with the AI (TouchArcade 2009 review), so player trading ranks low.

| Feature players expect | Status | Entry |
|---|---|---|
| Several or random boards | One fixed map; the generator is CLI-only | `content-single-map` |
| End-game stats, graphs, awards | In flight | #18 |
| Animated production, resources flying to players | In flight | #23 |
| Opponent action feed | In flight (toasts, digest); log detail open | #23, `vis-opponent-actions-invisible` |
| Longest Road / Largest Army race visibility | Rival quest progress hidden | `og-quest-race-visibility` |
| House rules, points to win | Knobs exist, none exposed (Quest expiry opt-in in #22) | `rules-random-menace-selection-missing` |
| Missing-resource badges, quick trade | In flight | #11 |
| Replay and post-game review | Post-game review in flight; no replay viewer | #18, `spec-replay-viewer-missing` |
| Turn timers, bots that replace leavers, emotes | None | `online-no-absent-player-resolution` |
| Rematch | Local in flight; online open | #18, `online-lobby-ux-gaps` |
| AI characters | Named rivals in flight; one play style | #24, `ai-idea-personalities-advisor` |
| Profiles, achievements | Dev-only telemetry | `og-hall-of-records` |
| Transferable titles | Claim-once Quests only | `og-transferable-titles` |
| Robber-style discard pressure | Hand limit 7, but no 7-roll equivalent | `idea-omen-track` |

The previous analysis's "AquaZone" list (the polish a Catan or Kolonists-like game needs), with status:
- Animated water and ambient life: coast ripples and surf in #25; more in `delight-idea-living-board`.
- A tactile harvest ritual: #23's harvest flights; `idea-harvest-postcard`.
- A robber-tension loop and a catch-up rubber band: `idea-omen-track`, `ai-seat-one-dominance`.
- Harbour mastery feel (posts are invisible): `idea-trading-post-pennants`, `content-trading-posts-dead`.
- A crown moment: `og-transferable-titles`.
- Table talk (chat, emotes, trade offers): emotes in `online-no-absent-player-resolution`, `og-optional-player-trade`; #24's rival quips for local games.
- End-game fanfare (confetti, score breakdown, "one more game"): #18.

#### og-transferable-titles: No contested, transferable bonus like Longest Road
- Severity: low | Effort: L | Delight: 4 | Status: confirmed (needs design sign-off; conflicts with §7's rule that only the active player gains Renown)
- Files: `packages/rules/src/quests.ts:17,50-117`, `packages/rules/src/selectors.ts:84`, `manors_and_menaces_project_spec.md:238-285,1148-1170`
- Proposal: an opt-in `titles: {enabled, minRoute: 5, minMenaceMoves: 3, renown}`. `state.titles` holds `longestRoad` ("Lord of the Roads": the longest simple path over own usable Routes, cut by opponent Holdings) and `wardenGeneral` (most Menace moves). A title changes hands only on a strictly greater value. Recompute after `route_built`, `menace_moved` and `holding_built`, emit `title_changed`, include titles in `getRenown` and the AI's `evaluate`, and show title cards in QuestPanel. Tests: path length on a branching network and a split by an opponent Manor; transfer only on strictly greater values; Renown includes titles. Simulate with titles on and off before considering them as a default.
- From the previous analysis: a persistent holder crown (most Routes, most Menaces moved) with a steal animation and a jewel marker on the holder's card.

#### og-optional-player-trade: No player-to-player trading (low priority)
- Severity: low | Effort: L | Delight: 3 | Status: confirmed (§3 and §17 allow an optional form)
- Files: `packages/rules/src/commands.ts:25-115`, `packages/rules/src/types.ts:312`, `manors_and_menaces_project_spec.md:107,778-781`
- Proposal: only if the designer wants it. Add `playerTrade: {enabled, maxOffersPerTurn: 1}`, `offer_trade`, then `pending{kind:'trade_offer'}`, then `respond_trade`, reusing the reaction plumbing. Keep it off in async games. The AI accepts only if its evaluation gains more than 0.3 and the offerer is not within 2 Renown of the target. Add a Propose tab in the Market dialog, rules tests and an AI test, and record the §3/§17 decision.
- From the previous analysis: async offers with accept, decline and expiry, and AI evaluators that judge fairness.

#### og-hall-of-records: Game history exists but is dev-only; no records or achievements
- Also covers: `delight-idea-realm-deeds`
- Severity: low | Effort: M | Delight: 3 | Status: confirmed
- Files: `apps/web/src/lib/game/telemetry.ts:7-72`, `apps/web/src/lib/components/DebugPanel.svelte:8,43-64`, `apps/web/src/lib/game/session.svelte.ts:319-321`, `apps/web/src/App.svelte:106-117`, `packages/rules/src/types.ts:204-217`
- Proposal:
  1. Extend `GameSummary` (`aiLevels`, `humanSeats`, `mapId`) under a v2 storage key with a migration.
  2. A "Hall of Records" modal on the title screen: games played, wins against each AI level (only games with a single human), fastest win, biggest harvest, most Writs, last 10 games.
  3. Deeds: `deeds.ts` checks run over a live `eventTrail` collected in `notify()` for non-provisional batches, not over a replay, because debug commands break replays. Examples: "Troll Whisperer" (Bribe twice), "Six Minutes Early" (played Very Minor Prophecy), "Unbothered" (won with no blocked harvests), "Paperwork" (3 Writs), "Road to Somewhere" (3 Routes in one turn), "Humble Beginnings" (won with no Stronghold). Use `cardDefIdOf(e.cardId)`. Store them in `mm.deeds.v1` inside try/catch, and show locked deeds greyed with hints.
  4. Tests: pure `computeRecords` and `computeAchievements`, predicate tests, and an e2e unlock of "Six Minutes Early".
- From the previous analysis ("stats screen"): telemetry `recordGame` exists but has no UI; show win rate, average harvest, and Writs and Wardens per game. #18's `matchReport.ts` computes per-game stats and awards that the Hall can store.

### Novel and delightful ideas

Pick one per PR. Ideas from both analyses; the previous analysis's "Harvest comets" and "Hot-seat herald" are done in #23 and #9.

#### delight-idea-menace-personality: Menaces with idle animations, speech bubbles and nicknames
- Severity: low | Effort: M | Delight: 5 | Status: partially confirmed
- Files: `apps/web/src/lib/game/session.svelte.ts:166-170,194,253,278,291-293,325`, `packages/content/src/i18n/en.ts:97-111`, `apps/web/src/lib/components/Board.svelte:379-405`, `apps/web/src/lib/components/Overlays.svelte:54`, `apps/web/src/lib/stores/settings.svelte.ts:5-27`
- Evidence: The flavour text ("Grum insists the bridge was his first…") appears only in the inspector. Per game there are 2 to 11 Troll blocks, 4 to 11 Dragon takes and 2 to 8 Menace moves, but essentially 0 Witch conversions.
- Proposal: a pure `quipFor(event, state)` (blocked, took, converted, moved, bribed, the goblins' invoice) with the variant chosen by `hash(matchId:revision)`, so every viewer sees the same line. Write 4 to 6 lines per key in `en.ts` plus nicknames (Grum, Ember, Mother Moss, Gentleman Nell, Snik & Snak), weighted toward the Troll and Dragon. `MenaceChatter.svelte` shows one bubble at a time for 2.2 s, is `aria-hidden`, respects the new `menaceChatter` setting, queues while the curtain is up and ignores provisional batches. Idle loops on an inner `<g>`: the Troll breathes, the Dragon flicks its tail, the cauldron bubbles, the goblin hammers. The Dragon naps after 2 rounds without moving. Tests: `quipFor` is deterministic and returns null for unrelated events; with animation normal a bubble appears and disappears, and with animation off none appears.
- From the previous analysis ("Menace gossip diary"): one line of flavour per Menace in the log and in its tooltip; zero rules changes. #24's quip director (`game/quips.ts`, seeded, at most one line per batch) is a model for pacing.

#### delight-idea-town-crier: Town Crier flavour lines and a "Hear ye!" toast
- Severity: low | Effort: S | Delight: 4 | Status: partially confirmed
- Files: `apps/web/src/lib/game/log.ts:46-155`, `apps/web/src/lib/i18n.ts:12-15`, `packages/content/src/i18n/en.ts:212-235`, `apps/web/src/lib/components/LogPanel.svelte`
- Proposal: add `tVariant(prefix, seed, params)` (collects `prefix.1..n`) and a FNV-1a `hashString` in `apps/web/src/lib/util/hash.ts`, seeded by `hashString(matchId) + revision + index`. Add a `LogEntry.flavor` line in italics for `menace_moved` (per type), `holding_upgraded`, `quest_claimed`, `banner_displaced` by a Writ, `card_cancelled`, `game_won`, and an empty harvest. Example: "{name}'s fields observe a moment of silence." Add a `chronicleFlavour` setting (on by default). `CrierToast.svelte`: a scroll unfurls for important non-viewer entries, at most 2 queued, `role=status`, skipped with animation off. Tests: every `crier.*` prefix has keys and placeholders; the output is deterministic; a quest claim shows `.crier-toast`.

#### delight-idea-living-board: Seasons, dusk, clouds, chimney smoke and carts
- Severity: low | Effort: M | Delight: 4 | Status: confirmed
- Files: `apps/web/src/lib/components/Board.svelte:168-218`, `apps/web/src/lib/theme.ts:6-12`, `apps/web/src/lib/stores/settings.svelte.ts:5-27`, `apps/web/src/lib/components/SettingsDialog.svelte`
- Proposal: `seasonFor(round) = ['spring','summer','autumn','winter'][floor((max(round,1)-1)/3)%4]` with tints (autumn timber `#b8743a`/`#d19a3a`, winter highlight caps, spring blossoms) applied through CSS variables with a 1.2 s fill transition. A warm dusk overlay at 8% during Banner assignment and a 600 ms dawn sweep on `turn_started`. Two gradient-filled cloud ellipses drifting over 90 s. Smoke from up to 4 chimneys and up to 1 cart per player on their longest Route, with at most about 8 animated elements, paused while the page is hidden. Show "Round 7 · Autumn" in the topbar. A `livingBoard` setting, forced off under reduced motion. Tests: `seasonFor(1,3,4,12,13)` gives spring, spring, summer, winter, spring; a `?season=winter` screenshot; p95 ≤16.8 ms at 4x.

#### delight-idea-heraldry: A heraldry editor for each player
- Severity: low | Effort: M | Delight: 4 | Status: confirmed
- Files: `apps/web/src/lib/theme.ts:23-50`, `apps/web/src/lib/components/NewGame.svelte:40-57`, `apps/web/src/lib/components/Board.svelte:336,369-370`, `packages/protocol/src/index.ts:9-16`, `apps/server/src/service.ts:110-125`
- Proposal: `heraldry.ts` defines `{division: plain|per_pale|per_bend|chevron|quarterly|bordure, charge: none|tree|tower|boar|owl|key|sheaf|anvil|crescent, motto?}` and `renderArms(theme, heraldry, size)`. The outline shape stays as the colour-blind-safe channel. Below 16 px only the field and division render. `SeatConfig.heraldry` is validated in both the create and join payloads (unknown values rejected, motto ≤40 characters with control characters stripped). NewGame gets an emblem popover with a "Roll arms" button and mottos ("Mostly Punctual", "We Were Here First", "Ask Nicely"), and remembers the local player's choice in `mm.heraldry.v1`. Arms appear on flags, Holdings, the players panel, the curtain and the recap. Tests: validation and determinism; the arms survive save and load.
- Note: #24's `RivalPortrait` builds portraits from shapes in the seat colour; arms for AI rivals could reuse it.

#### delight-idea-photo-mode: Photo mode with a PNG export
- Severity: low | Effort: M | Delight: 3 | Status: partially confirmed
- Files: `apps/web/src/lib/platform/adapter.ts:18,76-83,102-107,117-119`, `apps/web/src/lib/components/GameScreen.svelte:78-133`, `src-tauri/capabilities/default.json`
- Proposal: add `exportBinary(name, blob)` (web download; Tauri save dialog plus `fs.writeFile`, which needs the `fs:allow-write-file` permission and a `TauriGlobal.fs.writeFile` type, falling back to download). A camera button hides the HUD and shows a cartouche (map name, round and season, arms and Renown). Capture clones the SVG at 2x, inlines the CSS and fonts as data URLs, draws it to a canvas and exports `greenvale-round-N.png`. Reuse it from the recap. E2E: the download ends in `.png` and is >50 KB, and Escape restores the view. Verify manually on a desktop build.

#### critic-idea-daily-realm: A "Daily Realm" challenge with a shareable result
- Severity: low | Effort: M | Delight: 4 | Status: confirmed (the map is fixed, so the seed varies only the RNG-driven setup; resuming a saved game re-seeds the AI)
- Files: `apps/web/src/lib/game/session.svelte.ts:114,119-131`, `apps/web/src/lib/components/NewGame.svelte:64-67`, `packages/rules/src/hash.ts`
- Proposal: a Daily Realm button on the title screen that calls `start({seats: [You, 2 Hard AIs with fixed names], ruleset: standardRuleset(3), seed: 'daily-' + localDate})`. The match id derives from the seed. Store the best result per date in `mm.daily.v1`. Show a share string ("Daily Realm 2026-09-24: won in round 11 (+4)") with a Copy button (clipboard in try/catch). No debug in daily games. Once random realms land, the daily seed can also drive the map. Tests: the same seed gives an identical `hashState(initialState)`; the button starts a 3p game.

#### resp-idea-target-first-radial-menu: Tap a board spot first, then pick from a radial menu (Kolonists-style)
- Severity: low | Effort: L | Delight: 5 | Status: confirmed
- Files: `apps/web/src/lib/game/interaction.ts:182-230`, `apps/web/src/lib/components/ActionBar.svelte:69-97`, `apps/web/src/lib/components/Board.svelte:145-148`, `packages/rules/src/selectors.ts:138,177`, `packages/rules/src/legal.ts:110-127`
- Proposal: in main phase with no tool armed, tapping a site sets `ui.radial = {pick, x, y}`. `RadialMenu.svelte` shows 56 px buttons built from the cost-free `check*` legality functions: Build Manor, Upgrade, a Build Route for each adjacent legal Route (tapping thin Routes is unreliable), Warden or Writ where they apply, and Inspect. Options are enabled only if they are also in the affordable legal lists, otherwise greyed with the missing resources. Extract `intentFor(tool, pick, session, legal)` from `onPick`, sharing the toll logic, with unit tests. Keep the tool-first flow on desktop. E2E at 412x915: tapping a legal site shows the radial, and "Build Manor" places a Manor.

#### resp-idea-haptics-and-press-feedback: Haptic ticks and press feedback on touch
- Severity: low | Effort: S | Delight: 4 | Status: partially confirmed
- Files: `apps/web/src/lib/platform/adapter.ts:93-100`, `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs:8-10`, `apps/web/src/app.css:28-44`, `apps/web/src/lib/game/session.svelte.ts:300-330`
- Proposal: add `tauri-plugin-haptics` under `#[cfg(mobile)]` with `haptics:default` in a mobile capability. Add `PlatformAdapter.haptic('tick'|'success'|'warn')`: Tauri invokes `plugin:haptics|impact_feedback`; the browser calls `navigator.vibrate?.(8|20)` (Android WebView needs the VIBRATE permission). Gate it behind a `haptics` setting and call it from the UI on a successful pick, the local harvest and the local turn start. Add `button:active:not(:disabled){transform:translateY(1px)}` and wrap hover styles in `(hover:hover)`. Unit test: the browser adapter does nothing without `vibrate`.
- From the previous analysis: `vibrate(10)` on an illegal tap, respecting mute and reduced motion.

#### idea-omen-track: An Omen track for tension and catch-up
- From the previous analysis. Severity: low | Effort: M | Delight: 4 | Status: idea; needs design and simulation
- Files: new rules state and a ruleset option in `packages/rules/src/types.ts` and `balance.ts`; `QuestPanel.svelte` or the topbar for the meter
- Evidence: Catan's 7-roll creates dread and hand pressure; here the hand limit of 7 exists but nothing forces discards, and seat 1 dominates (`ai-seat-one-dominance`).
- Proposal: a "Trouble brews..." meter that ticks when the leader pulls ahead (for example when a player's Renown exceeds the next player's by 2 or more at a round boundary). When it fills, the weakest player moves a Menace for free, or a "Menace tithe" event makes players over the hand limit discard. Opt-in ruleset flag; deterministic (no new randomness, or only through the match RNG). Simulate seat balance with it on and off.
- Tests: the meter ticks only on the defined trigger; the free move goes to the lowest-Renown player (ties by turn order); replay determinism.

#### idea-warden-lantern: Show why a guarded Menace cannot move
- From the previous analysis. Severity: low | Effort: S | Delight: 3 | Status: idea
- Files: `apps/web/src/lib/components/Board.svelte:378-407` (Menace layer), `packages/rules/src/types.ts:200` (`guardedBy`), #15's `apps/web/src/lib/game/inspect.ts` (hover card text), `packages/content/src/i18n/en.ts`
- Proposal: a lantern ring around a Warden-guarded Menace until the hirer's next turn, with the guard's colour, so players see why the Menace is immobile. Pair with the hover card from #15 ("Guarded by Alice until her next turn").
- Tests: e2e: after hiring a Warden, the guarded Menace carries a `.lantern` ring in the hirer's colour and the hover card names the guard; the ring is gone at the hirer's next turn.

#### idea-prophecy-fan: Reorder the Prophecy as a fan of cards
- From the previous analysis. Severity: low | Effort: S | Delight: 3 | Status: idea
- Files: `apps/web/src/lib/components/Dialogs.svelte:48-51,166-180` (prophecy order and dialog), `packages/rules/src/engine.ts` (`resolve_prophecy` permutation check)
- Proposal: the top 3 cards fan out and the player drags them into order, replacing the modal list; keep keyboard reordering (see `web-prophecy-order-reset`) and the `content-prophecy-weak` "keep one" choice.
- Tests: e2e: dragging the third card to the front sends that order in `resolve_prophecy`; keyboard reordering still works (`web-prophecy-order-reset` regression).

#### idea-festival-bread: Festival confetti and shared bread
- From the previous analysis. Severity: low | Effort: S | Delight: 3 | Status: idea
- Files: `packages/rules/src/cards.ts:53,121` (`festival_at_the_inn`), `apps/web/src/lib/components/Dialogs.svelte:140-149` (festival dialog), #23's `apps/web/src/lib/game/harvestFlights.ts` and `feedback.svelte.ts`, `apps/web/src/app.css` (reduced-motion rules)
- Proposal: when Festival at the Inn resolves, confetti in player colours and a shared-bread icon, with simultaneous +1 Grain tokens flying to every player (reuse #23's harvest flights). Off under reduced motion.
- Tests: unit test that a Festival batch plans one Grain flight per player; e2e with animation off: no confetti elements, counters still update.

#### idea-fog-drift: Fog as drifting translucency
- From the previous analysis. Severity: low | Effort: S | Delight: 3 | Status: idea
- Files: `apps/web/src/lib/components/Board.svelte:80,285-287` (fog ellipse on the Route), `apps/web/src/app.css` (high contrast and reduced motion)
- Proposal: draw Fog of Confusion as a slow, drifting translucent band over the Route instead of the static white ellipse `main` draws at its midpoint (the previous analysis said "dashed line"); static under reduced motion; keep a pattern for high contrast.
- Tests: e2e: a fogged Route renders the drift element; with Reduced motion no animation runs on it; high contrast shows the pattern.

#### idea-troll-toll-booth: A toll booth for the Troll
- From the previous analysis. Severity: low | Effort: S | Delight: 3 | Status: idea
- Files: #25's `apps/web/src/lib/components/board/MenaceFigure.svelte` (troll figure), `apps/web/src/lib/components/Board.svelte` (Region notes for blocked harvests)
- Proposal: the Toll Troll stands at a small booth with a "TOLL" sign on its Region; blocked Banners show crumbs. Build on #25's troll figure.
- Tests: e2e: the Troll's Region shows the booth; a Banner blocked by the Troll shows the crumb marker; accessible names unchanged.

#### idea-trading-post-pennants: Make Trading Posts visible
- From the previous analysis. Severity: low | Effort: S | Delight: 3 | Status: idea
- Files: `apps/web/src/lib/components/Board.svelte:310,321-326` (Trading Post badge), `apps/web/src/lib/components/Dialogs.svelte:15-30,82-103` (Market via posts)
- Proposal: pennants and a "2:1" badge on Trading Post Sites, and posts the player can reach glow in the Market dialog. Pairs with `content-trading-posts-dead`.
- Tests: e2e: each Trading Post Site shows a pennant and "2:1"; with a reachable post, its row in the Market dialog is marked.

#### idea-banner-weather-vane: Unsettled Banners flutter
- From the previous analysis. Severity: low | Effort: S | Delight: 3 | Status: idea
- Files: `apps/web/src/lib/components/Board.svelte:346-371` (Banner layer, `banner.settled`), `apps/web/src/app.css` (reduced motion)
- Proposal: unsettled Banners flutter (a CSS sway on the flag), settled ones stand crisp, which teaches visually that only Settled Banners are Writ targets. Off under reduced motion. The same sway was proposed in `delight-aes-piece-elevation`; #25's description does not mention it.
- Tests: e2e: an unsettled Banner's flag animates and a settled one does not; no animation under Reduced motion.

#### idea-harvest-postcard: "Tomorrow's harvest" postcard
- From the previous analysis. Severity: low | Effort: S | Delight: 3 | Status: idea
- Files: `apps/web/src/lib/components/ActionBar.svelte:65-66` (`confirmBanners`), `apps/web/src/lib/components/HarvestPreview.svelte`, `packages/rules/src/selectors.ts:322` (`getHarvestPreview`)
- Proposal: at Banner-phase confirm, show the next harvest as a small postcard (Region names, resources, Menace warnings) with a Stamp button that confirms; reuses `getHarvestPreview`. Fits #11's one-click "Confirm & End Turn" as an optional preview.
- Tests: e2e: confirming Banners shows the postcard with the same lines as HarvestPreview; Stamp ends the turn; a setting or Escape skips it.

### Tooling, tests, CI and release

Baseline at review time: `pnpm typecheck`, `lint` and `test` pass (50 tests in about 11 s; v8 coverage 90.5% of lines and 74% of branches). An 8-worker Playwright stress run passed 32 of 32. `pnpm audit` is clean. The Dockerfile runs as the `node` user and has a HEALTHCHECK.

#### tooling-ci-no-production-build: Docker image and Tauri check still untested in CI
- Partly done in #16: CI builds the web and server bundles, fails on bundler warnings, and smoke-tests the bundled server (`/api/health`, the app shell, its JS bundle and `/sw.js`); the release gate also runs lint, the map check and the build check.
- Severity: medium | Effort: S | Delight: 1 | Status: confirmed
- Files: `.github/workflows/ci.yml`, `.github/workflows/release.yml:16-61,157-185`, `Dockerfile:1-24`
- Evidence: `docker build` first runs in `release.yml`, after the tag exists, and the image is pushed without a smoke test; `cargo check` runs against a placeholder `dist`; `dist` is not uploaded.
- Proposal: add a `docker` job (buildx, `load: true`, GHA cache, run it, poll health for at least 90 s, or add `--start-period=5s --start-interval=2s` to the HEALTHCHECK); run `tauri-check` against the real `dist`; upload `dist` as an artifact.
- Tests: the docker job fails when the server throws at startup.

#### spec-replay-fixtures-and-invariants: No replay regression fixtures; 3 of the §66.4 invariants are unchecked
- Severity: medium | Effort: M | Delight: 0 | Status: confirmed
- Files: `tests/integration/playouts.test.ts:20-64,82-91`, `packages/rules/src/engine.ts:634-636`, `tools/simulate.ts:98-100`
- Proposal: `tools/record-fixture.ts` writes `tests/replay-fixtures/<name>.json` (`{rulesetVersion, initialState, commands, finalHash, winnerId, round, checkpoints every 50}`) for MVP 3p, standard 2p/3p/4p and async 3p. `replay-fixtures.test.ts` checks `hashState` and reports the first diverging checkpoint. Add `pnpm fixtures:update`, documented as "only for intentional rule changes, bump RULESET_VERSION". Extend `playGame` with per-command invariants: a Writ targets only a Banner that was Settled; a Writ conserves resources (the players' total drops by exactly 1 with `bribeToOwner`, 2 without); `getRenown` never decreases.

#### ai-simulator-gaps: The simulator cannot compare AI levels and misses §67/§68 checks
- Also covers: `spec-balance-telemetry-gaps`, `tooling-idea-balance-gate`
- Severity: medium | Effort: M | Delight: 2 | Status: confirmed
- Files: `tools/simulate.ts:30,43-66,92-100,105-106,135-152`, `apps/web/src/lib/game/telemetry.ts:9-57`, `manors_and_menaces_project_spec.md:2652-2667`
- Evidence: `--level` applies to every seat. Each command is applied twice. Missing metrics: quest claim share, bottleneck resource, Writs per player against §68, stalled seeds, latency, post trades, spending by type, Renown per turn. Rounds ≤6 are printed as "early" against the "mid 3-5" target. The 45% seat threshold for 2p/3p is the tool's own heuristic, not §68.
- Proposal:
  1. Move `playOne`, `summarize` and the types into `tools/simulate-core.ts` with no top-level side effects.
  2. Add `--seats easy,normal,hard`, `--rotate`, `--seed-offset` and `--json`, plus `--assert` with the thresholds in one exported const mirroring §68.
  3. Report Wilson intervals for win rates, stalled seeds, per-quest claim share (fail above 60%), spending by type, post trades, a Writ log with retakes, the bottleneck distribution, players who never expand, resources held at end of main (mean and p90), cards bought against played, and `chooseAction` p50/p95/max.
  4. Split harvest into early ≤4, mid 5-10 and late >10.
  5. Add a nightly `balance.yml` (2/3/4 players × 200 games, step summary table, `continue-on-error` at first).
  6. Add `durationMs` to telemetry and a DebugPanel stats tab.
  7. A vitest in `tests/integration` runs 2 games with `--seats normal,hard`.
- From the previous analysis: `tools/simulate.ts:92-96` applies the engine twice (`runAiUntilHuman` plus `applyCommand` for events), costing 2x CPU with a divergence risk; `MAX_ROUNDS` 60 against 80 in the playouts; `Math.min(...[])` gives Infinity and `avg([])` NaN when no game finishes (`:146`). Wanted: single-apply event capture, unified max rounds, guarded empty stats, `--jobs` and a non-zero exit on a missed target. #21 notes that `--rules core` is treated as Standard by the simulator (Core is `--rules mvp`).

#### webstate-no-session-unit-tests: The web client (about 4.7k lines) has no unit tests; vitest never runs apps/web
- Also covers: `tooling-web-no-unit-tests`
- Severity: medium | Effort: M | Delight: 1 | Status: confirmed
- Files: `vitest.config.ts:5`, `apps/web/src/lib/game/session.svelte.ts`, `apps/web/src/lib/game/interaction.ts:37-134,152-330`, `apps/web/src/lib/game/log.ts:46-155`, `apps/web/src/lib/i18n.ts:12-15`, `packages/rules/src/events.ts`
- Evidence: 15 of the 37 event types fall through `default: break` in `formatEvents` (among them `deck_reshuffled`, `prophecy_resolved` and `reaction_passed`). A missing i18n key would ship as raw key text.
- Proposal:
  1. Add `apps/web/vitest.config.ts` (`plugins:[svelte()]`, `resolve.conditions:['browser']`, node environment, `test/**/*.test.ts`) and reference it from the root `test.projects`.
  2. Mock `sfx`, the platform adapter (an in-memory Map) and telemetry.
  3. `session.test.ts`: undo restores the draft; a buffered batch flushes in order; the viewer is null during an AI turn (after the privacy fix); REVISION_MISMATCH resets the draft; the constructor does not overwrite another match's autosave; `aiStalled` is set on failure. Use fake timers.
  4. `log.test.ts`: export `SILENT_EVENTS`, add explicit cases, and end with a `default: { const _exhaustive: never = e; }` guard so a new event type fails typecheck. Decide which silent events deserve Chronicle lines.
  5. An i18n completeness test: static `t("...")` keys plus dynamic card, menace, quest and error keys.
  6. `interaction.test.ts`: highlight snapshots for the main tools.
- Status: #9, #10, #12, #13, #14, #15, #18, #19, #20, #23, #24 and #25 each add `apps/web/test/**` to the root `vitest.config.ts` and `apps/web/tsconfig.json` and add pure-logic tests (privacy, saves, adapter with a fake IndexedDB, AI step and client, camera, layout, board view, log, rematch, match report, service worker, harvest flights, feed, event bus, rivals, quips, board art). None compiles Svelte runes, so `session.svelte.ts` itself still has no unit test (#8 and #12 say so). Step 1 is therefore a web vitest project with the Svelte plugin, not the include line.

#### tooling-rules-untested-paths: Several engine paths have no targeted test
- Severity: low | Effort: M | Delight: 0 | Status: confirmed (the paths work today; these tests are regression guards)
- Files: `packages/rules/src/engine.ts:636,746-748,777-781`, `packages/rules/src/tx.ts:83-85`, `packages/rules/src/cards.ts:42-45,98-115`, `packages/rules/src/views.ts:31,48,51`, `packages/rules/src/selectors.ts:385`, `packages/rules/src/legal.ts:85,91`, `packages/rules/test/rules.test.ts:231-239,363-369`
- Proposal: add tests for: a discard down to the hand limit, then `end_turn`; deck reshuffle and DECK_EMPTY; Arcane Exchange, Teleportation Mishap (swap and region/route rejection) and Bribe the Troll; prophecy and `card_bought` redaction for other viewers; a 3-player reaction hand-off; a Writ without `bribeToOwner`; Goblin Tinkers site destinations. Rewrite `rules.test.ts:231-239` so it actually tests the surcharge (build without the payment is rejected with INVALID_PAYMENT, then accepted with it). Add `@vitest/coverage-v8` with thresholds of 89% lines and 72% branches and a `test:coverage` script.

#### tooling-ai-modes-untested: The AI's reaction, prophecy and discard decisions and the Hard level are untested
- Severity: low | Effort: S | Delight: 0 | Status: partially confirmed (Easy is covered by `server.test.ts:117,164`)
- Files: `packages/ai/src/index.ts:63-73,126-136`, `tests/integration/playouts.test.ts:46-92`, `apps/server/src/service.ts:264-283`
- Proposal: `packages/ai/test/ai.test.ts`: Normal and Hard react when their own Banner is targeted; the prophecy result is a permutation; a discard removes exactly the excess over the hand limit; each intent is accepted by the engine. Add `[4, standardRuleset(4), 'std-4p-hard', 'hard']` to the playouts (about 3.6 s). A server test forces an illegal intent via `vi.mock` and checks that the fallback ladder advances the match.
- #12 added `packages/ai/test/fallback.test.ts` (fallbacks for setup, main, assignment, end of turn, reaction, prophecy, discard) and #21 added `packages/ai/test/expansion.test.ts`. The Hard playout, reaction and discard choices remain.

#### tooling-e2e-coverage-gaps: E2E covers only hot-seat setup
- Severity: low | Effort: M | Delight: 1 | Status: confirmed
- Files: `apps/web/e2e/game.spec.ts:15,24,43-52,67-136`, `apps/web/e2e/online.spec.ts:24-59`, `apps/web/playwright.config.ts:12,28,83-102`
- Proposal: add `vs-ai.spec.ts` (1 human against a Normal AI, 3 turns, AI actions logged, no page errors), `cards.spec.ts` (draw `festival_at_the_inn` via debug, play it, a Market trade, a Writ), `layout.spec.ts @mobile` (Pixel 7 and 915x412: no horizontal overflow, primary button in the viewport), and the `pwa` project. Replace the 1.5 s swallowed timeout in `passCurtain` with waiting on `.curtain, .actions .status`, then clicking the curtain only if it is visible.
- Status: the open PRs add `ai.spec.ts` (all-AI through the worker, #12), `layout.spec.ts` (#14), `offline.spec.ts` (PWA via `vite preview`, #20), `turn-flow.spec.ts` (#11), `camera.spec.ts` (#13), `board.spec.ts` (#15), `hotseat.spec.ts` (#9), `feedback.spec.ts` (#23), `rivals.spec.ts` (#24), `look.spec.ts` (#19), `board-art.spec.ts` (#25) and save tests in `game.spec.ts` (#10). Still missing: `vs-ai.spec.ts` (1 human against Normal for 3 turns), `cards.spec.ts`, and the `passCurtain` fix. #11's review also asked for a shared e2e helpers module (its helpers duplicate `game.spec.ts`).

#### tooling-prettier-not-enforced: Prettier is configured but not enforced (47 files drift)
- Severity: low | Effort: S | Delight: 0 | Status: confirmed
- Files: `package.json:17-18`, `.prettierrc.json`, `.github/workflows/ci.yml:31-36`
- Proposal: one isolated reformat PR, landed when few branches are open. Add `format:check` and include it in `check` and CI. Add the reformat commit's SHA to `.git-blame-ignore-revs` after it merges.

#### tooling-server-test-gaps: Server tests never check that the AI moves, or cover restart, replay, 429 and fallbacks
- Severity: low | Effort: M | Delight: 0 | Status: confirmed
- Files: `apps/server/test/server.test.ts:90-133,158-185`, `apps/server/src/app.ts:149,173-177,236-238`, `apps/server/src/service.ts:277-283,294-298`
- Proposal: poll until the revision increases after subscribe. Persistence: a temp-file DB closed and reopened keeps revision N and accepts the next command. Replay: extract the API-driven loop from lines 100-133 into a helper and finish an MVP match; `/replay` returns 409 before the end and 200 after, the seed reads "hidden", and replaying the commands reaches the final state. Rate limit: `rateLimitPerSecond: 1` with 10 parallel requests produces a 429. Add the fallback ladder test from `tooling-ai-modes-untested`.
- From the previous analysis: `server.test` uses a 10000/s limiter, so rate limiting was never tested; also missing: CORS, `WEB_DIST`, a negative replay-auth test, a full lobby, AI fallback, persistence and concurrency tests. #17 added restart, flood, heartbeat, proxy, 401, 400, `EADDRINUSE` and idempotency tests in `apps/server/test/robustness.test.ts`, and #8 added `online-spells.test.ts`.

#### tooling-fastcheck-unused-fuzz: fast-check is installed but unused; no fuzz tests at the input boundary
- Severity: low | Effort: S | Delight: 0 | Status: partially confirmed (`COMMAND_TYPES` is not exported)
- Files: `package.json:36`, `packages/protocol/src/index.ts:34-47,131,158-166`, `apps/server/src/app.ts:168-171`
- Evidence: A scratch fuzz of 1197 hostile payloads produced 0 throws.
- Proposal: export `COMMAND_TYPES`. `packages/rules/test/fuzz.test.ts` feeds hostile payloads (`fc.dictionary(fc.string(), fc.anything())`) through main, assignment and end states and asserts no throws and intact invariants (move `checkInvariants` to `tests/invariants.ts`). `packages/protocol/test/protocol.test.ts` asserts that the `is*` guards never throw on `fc.anything()`. Use about 500 runs per property.
- #8 added a hand-written fuzz over every command field and card-target field (`packages/rules/test/command-input.test.ts`), including own `__proto__` keys; fast-check properties and the protocol guards are still open (see `protocol-command-field-caps`).

#### tooling-release-cargo-lock-drift: A version bump leaves Cargo.lock stale and breaks `cargo check --locked`
- Severity: low | Effort: S | Delight: 0 | Status: partially confirmed (it is unknown whether `lkm-release` updates the lock file)
- Files: `scripts/release.sh:12-15`, `scripts/sync-versions.mjs:7-19`, `src-tauri/Cargo.lock:2003-2004`, `.github/workflows/ci.yml:75`
- Proposal: check the external engine first. If it does not update the lock, have `sync-versions.mjs` rewrite the `manors-menaces` entry in `Cargo.lock` (failing if it finds no match). Add `scripts/check-versions.mjs` (package.json files, `tauri.conf.json`, `Cargo.toml`, `Cargo.lock`) as a CI step.
- From the previous analysis: `scripts/sync-versions.mjs:7` also misses `src-tauri/Cargo.toml` and `tauri.conf.json`, so their versions drift; add both.

#### tooling-tauri-fs-scope-home: The Tauri capability allows writing any text file under $HOME
- Severity: low (security, excess privilege) | Effort: S | Delight: 0 | Status: confirmed
- Files: `src-tauri/capabilities/default.json:9-10`, `src-tauri/tauri.conf.json:26,38`, `apps/web/src/lib/platform/adapter.ts:102-107`
- Evidence: `tauri-plugin-dialog`'s save already adds the chosen path to the fs scope, so the static scope is unnecessary. The build has no `{@html}` or innerHTML, so exploiting this would take a supply-chain compromise.
- Proposal: delete the `fs:scope` entry and keep `fs:allow-write-text-file`. Append `; object-src 'none'; base-uri 'self'; form-action 'none'` to the CSP. Manual test: export through the dialog still works, and a direct write to `~/.probe` is rejected.

#### tooling-release-hardening: The release workflow is over-privileged, uses tag-pinned actions, races uploads and publishes no checksums
- Severity: low (security) | Effort: M | Delight: 0 | Status: confirmed
- Files: `.github/workflows/release.yml:11-13,16-32,54,102,105,151`, `.github/workflows/zai-code-review.yml:57-60`
- Proposal: top-level `contents: read`; write permissions only for a final `publish` job and `packages: write` only for the image job. Build jobs upload artifacts; `publish` downloads them all, writes `SHA256SUMS` and calls `action-gh-release` once. Pin actions by SHA (Dependabot already covers them). Optionally add build provenance attestation. Test with a `v0.0.0-test.1` tag on a fork.

#### tooling-macos-signing-min-version: macOS builds are unsigned and declare no minimum OS
- Severity: low | Effort: S | Delight: 1 | Status: partially confirmed
- Files: `src-tauri/tauri.conf.json:41-47`, `.github/workflows/release.yml:73-75,102-104`, `packages/rules/src/clone.ts:3`, `apps/web/vite.config.ts:15`
- Proposal: add `"macOS": {"minimumSystemVersion":"12.0","signingIdentity":"-"}` and a README note for first launch (right-click Open or `xattr -dr com.apple.quarantine`). Optionally wire the `APPLE_*` secrets for notarisation. Do not bother replacing `Object.hasOwn`: the es2022 output sets the real floor anyway. Verify with `codesign -dv` (expect adhoc).

#### tooling-idea-pages-deploy: Auto-deploy main to GitHub Pages
- Severity: low | Effort: S | Delight: 4 | Status: confirmed
- Files: `.github/workflows/`, `apps/web/vite.config.ts:13`, `apps/web/src/lib/online/client.ts:29`, `README.md:13`
- Proposal: add `pages.yml` (on push to main, `pages: write` and `id-token: write`, build web, `upload-pages-artifact` then `deploy-pages`, a concurrency group). The default server in `client.ts` is empty on `github.io`, with the `online.server_required` hint. Add a "Play in your browser" link to the README. Land it after the service-worker fix.

#### tooling-idea-tauri-updater: In-app updates for desktop builds
- Severity: low | Effort: L | Delight: 3 | Status: confirmed
- Files: `src-tauri/Cargo.toml:17-23`, `src-tauri/src/lib.rs:7-12`, `.github/workflows/release.yml:102-115`
- Proposal: add `tauri-plugin-updater` and `tauri-plugin-process` under `#[cfg(desktop)]`, with `updater:default` and `process:allow-restart` in a desktop-only capability. Add signing keys as secrets and the pubkey and endpoint (the release's `latest.json`) in `tauri.conf.json`, with `createUpdaterArtifacts: true`. Pass `includeUpdaterJson` to `tauri-action`. `TauriPlatformAdapter.checkForUpdate()` is guarded by `if (t.updater)`, shows an `update.available` toast, and relaunches after install. Test from a fork with v0.1.1-test and v0.1.2-test.

#### tooling-rust-checks-and-build-sh: No Rust checks in CI, and build.sh skips targets silently
- From the previous analysis. Severity: low (est.) | Effort: S | Delight: 0 | Status: reported, not re-verified
- Files: `package.json` (`check`), `.github/workflows/ci.yml`, `scripts/build.sh`
- Evidence: `pnpm check` and CI run no `cargo fmt`, `clippy` or `cargo test` for `src-tauri`; `scripts/build.sh` skips targets with a missing toolchain on a default run (documented), which CI logs do not surface; the Tauri app is not in any e2e run.
- Proposal: a CI step with `cargo fmt --check`, `cargo clippy -- -D warnings` and `cargo test` in `src-tauri`; `build.sh` prints a summary of skipped targets at the end; later, a `tauri-driver` smoke test.

#### tooling-ci-playouts-slow: The playout tests dominate CI time
- From the previous analysis. Severity: low (est.) | Effort: S | Delight: 0 | Status: reported, not re-verified
- Files: `tests/integration/playouts.test.ts:57,82-90`
- Evidence: 20000 steps for each of 4 configurations with 120 s timeouts. `tooling-ai-modes-untested` wants to add a 4p Hard configuration.
- Proposal: run a reduced set on PRs and the full set nightly (next to the `balance.yml` from `ai-simulator-gaps`).

#### tooling-desktop-release-profile: Desktop builds are slow and build every bundle target
- From the previous analysis. Severity: low (est.) | Effort: S | Delight: 0 | Status: reported, not re-verified
- Files: `src-tauri/Cargo.toml` (release profile), `src-tauri/tauri.conf.json` (`bundle.targets`)
- Evidence: `codegen-units = 1`, `lto` and `opt-level = "s"` make every build slow; `bundle.targets: "all"` builds targets nobody ships.
- Proposal: keep the heavy profile for release builds only (a separate profile or CI flag) and list the shipped bundle targets per platform.

### Localisation

#### content-i18n-hardcoded-ui: About 30 or more user-facing strings bypass t()
- Also covers: `spec-i18n-hardcoded-strings`
- Severity: low | Effort: M | Delight: 1 | Status: confirmed
- Files: `apps/web/src/lib/components/Overlays.svelte:29-67,88-95`, `apps/web/src/lib/components/Board.svelte:160-164,229,271,308-310`, `apps/web/src/lib/components/Dialogs.svelte:68,70,108`, `apps/web/src/lib/components/PlayersPanel.svelte:42-43`, `apps/web/src/lib/components/HandPanel.svelte:31-33,52`, `apps/web/src/lib/components/TutorialCoach.svelte:17-25,36-38`, `apps/web/src/lib/components/GameScreen.svelte:59,82,89`, `apps/web/src/App.svelte:69,80`, `apps/web/src/lib/game/log.ts:32-36`, `packages/content/src/i18n/en.ts:155`
- Evidence: Hard-coded strings include the inspector text ("No Banners", "Settled - can be targeted…"), aria-labels, the victory line, "Saved.", "Round", tutorial tasks and load errors. `placeName` logs every Route as "road #NN" even for bridges and passes (a user-visible inaccuracy). `help.tradepost` is unused, while Overlays hard-codes "2".
- Proposal: move the strings to `tip.*`, `aria.*`, `ui.*`, `tutorial.task.*`, `victory.*` and `hand.*` keys. Fix `placeName` to use the Route's kind. Add a guard test at `tests/integration/i18n-literals.test.ts` (reads `.svelte` files, strips script and style, fails on bare English text or aria/title literals outside an allowlist).
- From the previous analysis: `GameScreen.svelte:89` "Save" and `session.svelte.ts:59` "Saved." (#10 moves the topbar Save, round and "Not saved" text to `t()`; verify "Saved."). Several PRs moved their own new strings into `en.ts` (#9 hand title, #15 `inspect.*`, #18 victory strings), so re-run the guard test after they merge.
- #15 follow-up: `apps/web/src/lib/game/inspect.ts:63` wraps Menace flavour text in hard-coded typographic quotes; move them into an i18n key such as `"inspect.flavor": "“{text}”"`.

#### content-i18n-plurals: "Banner(s)" everywhere, and t() has no plural support
- Severity: low | Effort: S | Delight: 1 | Status: confirmed
- Files: `packages/content/src/i18n/en.ts:172,218`, `apps/web/src/lib/i18n.ts:12-15`, `apps/web/src/lib/components/HarvestPreview.svelte:37`, `apps/web/src/lib/game/log.ts:52`, `apps/web/src/lib/components/PlayersPanel.svelte:42-43`
- Proposal: add `tn(key, count, params)` using `Intl.PluralRules`, with `.one`/`.other` fallbacks. Split `harvest.unassigned` and `log.banner_assigned`, and add `ui.cards_in_hand` and `ui.routes_count`. Put the selection logic in a pure helper that vitest can reach (in packages/content or with the web vitest project) and test counts 0, 1 and 2.

#### content-i18n-region-names: Region and landmark names cannot be localised
- Severity: low | Effort: S | Delight: 1 | Status: confirmed (latent until a second locale ships)
- Files: `apps/web/src/lib/game/log.ts:21-23`, `packages/content/src/types.ts:34-37`, `apps/web/src/lib/components/Board.svelte:229,248`, `apps/web/src/lib/components/Overlays.svelte:27`, `tools/generate-map.mjs:360`
- Proposal: use map-scoped keys `map.<mapId>.region.<regionId>` and `map.<mapId>.name`, emitted by the generator to `i18n/maps/<mapId>.en.ts` and merged into EN. `regionName()` uses `t()` with the data name as fallback. Board and Overlays call `regionName`. Content test: every map Region has a key.
- Later, with a second locale: #24 matches seats without `rivalId` to rivals by English name (`rivals.ts:79`), and #23's Menace badge width assumes 7.5 px per character (`BoardFx`); both need revisiting.

## Follow-ups from PR reviews

Small leftovers that the open PRs disclosed or deferred, and declined review items worth doing later. Each is self-contained; do it on top of the named PR once it has merged. Larger leftovers are folded into the backlog entries above and are only pointed to here.

### Engine and rules
- **#8, `menace_moved` aliasing:** `menace_moved` events share the destination object with the new state. It is engine output, not caller input, so #8 left it; clone `to` when emitting the event (`packages/rules/src/tx.ts`, `moveMenace`) and assert that mutating an event does not change the state.
- **#8, rule rejections over HTTP:** rejected commands stay HTTP 200 with `accepted: false` and an error code, because the web client treated every non-2xx response as a network failure. Revisit once `webstate-online-submit-errors-and-busy` gives the client typed HTTP errors.
- **#8, online round trip:** online, a locking command now updates the board only after one server round trip, and if the server rejects it, undo-able actions buffered before it are dropped (as with any rejected batch). Consider re-applying the buffered prefix locally after a rejection.
- **#22, content text:** the Fog flavour text still says "road" (flavour is exempt from the wording check); the i18n key `ui.you_need_3_of_one` keeps its old name although its text is now parameterised (rename when no branches touch it); the case for Patron of Heroes at 2 rests on the probability calculation (2 or more Heroes in 6 draws from 20 cards: about 20% against under 2% for 3), because the AI rarely buys cards.
- **#21, board exhaustion in 4p Core:** 1 of 40 Normal games now reaches round 60 because every Site is taken and all four players hold only Strongholds below the 10 Renown target (Core has no Quests or cards). This is a rules or content dead end: consider a Core end condition (for example most Renown after N rounds) or a lower Core target in 4p.
- **#22, `help.tradepost`:** the key hardcodes "2" and is unused; Trading Post rates vary per post in the map data. Remove the key, or have it take the post's rate once something shows it.
- **#22, `questRoundsLeft` doc:** null means "not leaving at the coming round start" (permanent only while the deck is empty; a crowded due Quest can leave a round later). The return values are right; reword the doc comment in `packages/rules/src/quests.ts` and check the QuestPanel copy for null.
- **#22, Patron of Heroes balance:** whether a target of 2 Heroes is too easy in 3 and 4 player games needs a simulation run (`pnpm simulate`) with card-buying AIs.

### Web client
- **#10, AI while the menu is open:** AI turns keep running while the game menu is open. Pause AI stepping (the #12 scheduler in `session.svelte.ts`) while the menu or Settings is open in a local game.
- **#10, no autosave after a rejected batch:** if the local engine rejects a batch, no new autosave is scheduled. Schedule one in `flush()` after #12 and #23 settle its shape.
- **#10, unverified paths:** the Tauri save dialog and writing outside the allowed folders; whether an IndexedDB write started while the tab closes finishes. Test on a desktop build.
- **#10 and #9, menu behind the curtain:** the privacy curtain covers the ☰ button between hot-seat turns. Decide whether the curtain should offer Menu and Save.
- **#9, curtain and dialogs:** if Settings is open when the curtain rises, it stays under the curtain (focus is held by the curtain; nothing private is in the dialog). Close open dialogs when the curtain rises.
- **#9, hot-seat layout:** the harvest preview is hidden during AI turns in hot-seat, so the bottom bar gets shorter then; reserve its height. The previous analysis also flagged the next-harvest preview as hidden whenever there is no actor; decide what it should show between turns.
- **#9, test gap:** the AI reaction-window case (the view stays while an AI answers the viewer's own Spell) is covered only by unit tests of `privacy.ts`; an e2e test needs an AI holding a Counterspell (debug-draw one).
- **#11, dock height and landscape:** at 1280x720 the dock is taller than on main when a Quest is claimable (the extra reason line and the Claim button); at 915x412 the phase buttons could end up below the screen edge on #11's branch alone. Re-check both after #14 merges.
- **#12, Tauri webviews:** the module worker was not tested in WebKitGTK, WKWebView or the Android WebView. If it fails to load, the client decides in-thread and logs a warning; a silent worker hits the 15 s deadline. Test on each desktop build.
- **#12, remaining long tasks:** 50 to 83 ms tasks remain (probably rendering, batch application and the autosave JSON round trip). Drop the JSON round trip in `apps/web/src/lib/platform/adapter.ts` now that state is plain (`perf-state-deep-proxy` proposal), then re-profile.
- **#12, untested orchestration:** the session's in-flight guard and the 5 s stuck-seat retry have no unit test because `GameSession` needs the Svelte compiler (see `webstate-no-session-unit-tests`); the no-legal-move retry is not reachable in normal play.
- **#12, "Skip to my turn":** not in #12; now the remaining scope of `ai-turn-pacing-dead-time` in the backlog.
- **#12, bundle size (informational):** the main bundle grows by about 4 KB gzipped for the in-thread AI fallback; the 70 KB worker chunk loads only when an AI plays. Re-check if the fallback grows.
- **#13, wheel heuristics:** a mouse notch is guessed as a purely vertical step of 50 px or more, or a line or page delta; a fast trackpad flick with no sideways movement may zoom instead of pan. Add a "Wheel zooms / Wheel pans" setting and test on WebKit and Tauri with real hardware.
- **#13, double tap:** double tap zooms only when the first tap is not on a highlighted target; a first tap on a non-target Region still opens the inspector before the second tap zooms. Delay the inspector by the double-tap window on touch.
- **#13, "Frame targets":** the optional "Frame targets" button and `f` key (`zoomTo(points, 90)`) from `spec-camera-zoom-to-selection` were not added.
- **#14, native insets:** safe-area padding is CSS only and was not checked on a device; if the Android WebView does not report system-bar insets, apply `systemBars()|displayCutout()` insets in `MainActivity.kt` (see `resp-safe-area-edge-to-edge`). Verify on an Android 15 emulator with gesture and three-button navigation.
- **#14, tablets:** on 600 to 900 px wide portrait tablets a little empty space can remain in the sheet's bottom row.
- **#14, scoreboard leftovers:** #14's `ScoreStrip` shows emblem, name and Renown and marks the player to act. The rest of the `resp-no-opponent-scoreboard-on-small` proposal is not done: a card count on each chip and tapping a chip to open the Players tab (e2e at 412x915: a tap opens the panel).
- **#15, `inspect.ts`:** the Region inspector lists only the first Menace in a Region (`find`, `apps/web/src/lib/game/inspect.ts:27`) and the Site branch never lists Menaces; verify whether Menaces can share a Region, then use `filter` and list them all. An unknown Route id (`inspect.ts:81`) renders a generic "Route / Unowned" card instead of returning null like the other branches. The quote marks at `inspect.ts:63` are in `content-i18n-hardcoded-ui`.
- **#15, hover card:** the "If you plant here: +1 Timber" line (via `computeBannerHarvest`) was deferred; long-press to open the hover card on touch (§47.2, from `vis-no-hover-feedback`) was not done, because #15 keeps hover off touch devices (combine it with the long-press in `vis-disabled-no-reason` and `ux-targeting-locks-exploration`); a hover card can stay open briefly after its piece stops accepting the pointer (for example when targeting starts from the keyboard) and closes on the next mouse move.
- **#15, animation speed:** scaling the spinner (and any remaining floater) durations with the Fast animation setting via `--anim-scale` was deferred.
- **#15, #13, #25, WebKit:** none of the board changes were measured on WebKit (Tauri, iOS).
- **#18, end of game:** the side panel's action tools stay visible after the game ends (hide the dock tools once `game_won`); on a landscape phone (915x412) the victory header and buttons take about a third of the height.
- **#18, storybook recap (optional):** #18 has a 3 to 6 sentence recap, a pennant and falling leaves. The optional storybook version from `delight-idea-storybook-recap` was not built: a parchment "Chronicle of the Realm" book with page turns, winner heraldry, confetti in player colours (off when motion is off), chapters (Founding, First Stronghold, Greatest Harvest, Troubles, Intrigues, The Crowning) with `recap.*` keys, and a log-only fallback when the history does not replay. Build it on `matchReport.ts`.
- **#18, online reports:** online games do not fetch `GET /api/matches/:id/replay`, so their victory screen has no chart, by-type harvest, Wardens or losses; this needs an async path through the transport and a completeness check against the redacted state.
- **#19:** a `.num { font-variant-numeric: lining-nums tabular-nums }` utility for counters, Renown and costs (Alegreya defaults to old-style figures); a DEV-only icon sheet page (`#/dev/icons`); pause the TitleVignette animation on `visibilitychange` when the tab is hidden; `size-adjust` needs a recent WebKit, so on older WebKitGTK Alegreya Sans shows unscaled. #19 also left "the Continue subtitle needs a real autosave label"; #10 makes Continue show the players and round ("Alice vs Bertram · Round 1"), so this is moot once #10 merges.
- **#19, hoard emoji:** `Board.svelte` (about line 400) still renders the hoard with emoji labels from `RESOURCE_COLORS[r].label`; tracked in `vis-menace-tokens-indistinct`.
- **#20:** when one tab moves to a new release, other tabs still on the old release keep showing the update prompt (harmless with the single-file bundle, relevant once chunks are lazy-loaded); navigations have no network timeout, so on a very slow connection the app waits before falling back to the cache (add a 3 to 5 s timeout); `apps/web/public/favicon.svg` has simpler artwork than `media-sources/icon.svg`; hidden source maps kept as separate release attachments were not done (`tooling-sourcemaps-shipped` proposal).
- **#23:** under #14's sheet layout the action feed keeps a left indent meant for main's vertical camera column (key it to `data-layout`); the Troll and Dragon badges are covered by unit tests but were not visually checked; online feedback was verified only by e2e tests.
- **#24:** show the rivals' win and lose quips on #18's victory screen (they currently sit behind the dialog); quips are not saved, so a Chronicle rebuilt from history after loading (#18) has none (store them as client-side notices or regenerate them deterministically from the seed).
- **#25:** a sea serpent; grain and ink paper filters (in `vis-art-direction`); painted fills and the Menace area cue (in `vis-art-direction` and `vis-menace-tokens-indistinct`).

### Online server
- **#17, socket cap:** see `online-no-ws-heartbeat`. **Per-user rate bucket:** add a `u:${user.id}` bucket on authenticated routes (from `online-rate-limit-behind-proxy`). **Client command ids:** the client still uses predictable command ids; use `${playerId}-${random}` with a fallback where `crypto.randomUUID` is unavailable (non-HTTPS LAN origins), and when a retried batch returns ok with no events and a higher revision, keep the provisional log entries (from `online-command-id-idempotency-flaws`). **Real proxies:** `TRUST_PROXY` was not tested behind nginx, Caddy or Traefik.
- **#16:** `eslint.config.js`, `svelte.config.js` and the `.mjs` scripts are still not type-checked; the smoke test requires `/sw.js`, so it must change if the service worker moves.
- **#17, `aiFailures` cleanup:** entries are never removed once a match's AI is no longer due (one small entry per match whose AI step failed); clear them when the seat stops being due. **Concurrent 401s:** several requests failing with 401 at once could each start a guest-session renewal; share one in-flight renewal in the client.

### Tests and tooling
- **Web tests environment:** several reviews asked for the Svelte plugin or a jsdom environment in the web vitest setup; declined as speculative while every web test is pure logic. Add them with the first test that imports a runes module (`webstate-no-session-unit-tests`).
- **Shared e2e helpers:** #11's `turn-flow.spec.ts` duplicates helpers from `game.spec.ts` (declined in review as out of scope); extract an `apps/web/e2e/helpers.ts`.
- **#21, expansion planner tests:** the test board has a single reachable Site, so nothing pins "nearest Site first" or the same-distance value tie-break. Add a board with a near low-value Site and a far rich one, and one with two equidistant Sites of different value.
- **Windows:** #16's `build:check` and #20's icon generator were fixed for Windows (`pnpm.cmd` needs a shell; the icon script now runs the Tauri CLI entry through `process.execPath`), but neither was run on Windows.

## Refuted or already-implemented claims

These came up during review or in PR review rounds and were ruled out or corrected. Do not re-investigate them without new evidence.

From the second review:
- **"Hard AI is weaker than Normal."** Not robust. 30-game samples swung from 12-18 to 20-10 depending on seeds. The correct statement is that Hard is not measurably stronger.
- **"Play again reuses the previous seed."** False: `lastConfig` stores only seats and ruleset, so each rematch gets a fresh seed.
- **"AI Warden moves teleport Menaces with no visual cue."** False. Menaces and Banners already glide via CSS transform transitions (`Board.svelte:505-509`), and 450 ms is shorter than the AI step delay. What is missing is entrance animation for Routes and Holdings, and visuals for resource transfers.
- **"The Dragon's Hoard needs an on-board badge."** Already done (`Board.svelte:384-400`, inspector `Overlays.svelte:51-54`).
- **"Druid's Blessing on an unassigned Banner is a no-op, so tighten the validator."** False. Blessing a home Banner and assigning it in the same turn is legal and useful. Only the enumeration needed fixing (#22). Note that #5 tightens the validator anyway; see the merge notes.
- **"Fogging an already-fogged Route is always wasted."** False when a different player fogs it (the duration is extended). Only a re-fog by the same caster is wasted.
- **"The pulse animation costs 32% of the phone main thread."** That figure came from an artificial rAF loop. Without it, main-thread cost is under 1%. The raster cost on desktop (7 fps) is real.
- **"The IndexedDB leak blocks upgrades permanently."** The stall is about 3 s and depends on garbage collection.
- **"51 to 86 Tab presses between phase buttons."** The 51 was an artifact of calling `blur()`; after a phase change, the next Tab reaches the new button. The 86 presses to reach the hot-seat curtain button was real (fixed in #9).
- **"Honeydew Pastures inflates the hereditary-regions metric."** False. The simulator counts only contestable Regions.
- **"Landmarks go unbuilt because they are unattractive."** False. The one-edge spacing rule next to the always-opened sites blocks them.
- **"`site_17` is the only site touching two rich Regions."** False. Seven other sites do too. `site_17` stands out for having 6 Banner slots.
- **"Very Minor Prophecy never being played proves it is weak."** That is an AI evaluation artifact. The design criticism still stands.
- **"The Easy AI is never exercised by tests."** False: `apps/server/test/server.test.ts:117,164`.
- **"`fieldset { min-width: 0 }` alone fixes the New Game overflow."** False. The full rule set is required.
- **"Fitting the viewBox to the island gives about 80% fill on phones."** False. The gain is about 8%, because the island is roughly 1.75:1. The real portrait defect was in `zoomTo`.
- **"Harvest warnings are unreadable everywhere."** HarvestPreview already lists them in readable text. Only the on-map notes were illegible.
- **"Replacing `Object.hasOwn` lowers the macOS floor."** False. The es2022 build and Svelte 5 set the floor anyway.
- **"The web build never works offline."** Overstated. The HTTP cache often masked the bug on the bundled server. The service worker bug was real, and fatal on static hosts.
- **"The service worker cache grows forever."** Not before #20, because runtime caching was broken. It would have started once the clone bug was fixed, which is why #20 versions the cache.
- **"The proposed replacement palettes fix contrast."** The Ivory/Onyx/desaturated-terrain palette in `vis-player-color-terrain-clash` fails its own contrast test, and Ivory clashes with Stone terrain. Use the single Violet to Ivory swap instead.
- **"`optimizeBanners` often takes about 300 ms."** Rare outliers. It is usually under 1 ms, and 28.7 ms at 12 Banners.
- **"Opening-score check (b) would reject Greenvale."** No. The ratio is 1.15, below the 1.3 threshold. Use the slot-cap rule instead.
- **"Server AI p95 is 62 ms with a 299 ms maximum."** The verifier measured Normal p95 26 ms and Hard p95 67 ms (maximum 185 ms). The blocking is real; the quotas matter more.
- **Event field names.** `banner_harvested` uses `produced`, not `resource`. `banner_assigned` uses `fromRegionId`/`toRegionId`, not `regionId`. `menace_moved` has `from`/`to` MenaceLocation fields.
- **"Spec §64 requires rejecting old saves."** False. It only requires tracking versions separately and matching them online. Rejecting old local saves would wipe them on every balance change.
- **"Landmark abilities are safe to enable now, since §129.4 reports stable balance."** False. §129.4 reports seat bias and a turn count above target. Ship landmark abilities opt-in.

From PR review rounds (claims an automated reviewer may raise again):
- **"There are other locales that need the new keys."** False: `packages/content/src/i18n` contains only `en.ts`, `i18n.ts` has `catalogs = { en }`, and `t()` falls back to English (#19, #23).
- **"The glow and veil animations lack reduced-motion guards."** False: `app.css` caps every animation at 0.001 ms and one iteration under both `prefers-reduced-motion` and the `.reduce-motion` root class; a Chromium probe confirmed no animation in all three motion settings (#15).
- **"`resolve_prophecy` lacks a permutation check."** False: `resolveProphecy` in `engine.ts` sorts and compares the multisets (#8).
- **"`views.ts` creates an import cycle with the engine."** False: `views.ts` imports only `clone.js` plus type-only events and types (#8).
- **"Starting-resource gains are aggregated, so flights start from the wrong Region."** False: `engine.ts:355` emits one amount-1 gain per adjacent Region, pinned by a test (#23).
- **"A Menace move can displace a Banner, so a 'menace hit' quip is dead code."** False: `Tx.moveMenace` only sets the location; Banners are displaced only by a Royal Writ or Wizard's Interference (#24; a probe of 8 self-play games found 48 Menace moves onto another player's asset and 0 losses).
- **"`undo()` must be awaited."** False: `undo()` is synchronous (#11). **"`perform()` success is truthy by accident."** False: it returns `Promise<boolean>` (#11).
- **"The browser `exportFile` always reports success."** By design: a synchronous throw rejects and shows "export failed"; a blocked download cannot be detected (#10). **"`newestFirst` compares dates as strings."** Safe: every writer uses `toISOString()`, a fixed format (#10).
- **"`deleteDatabase` in e2e tests must be awaited."** Not needed: Playwright gives each test a fresh browser context (#11, #19, #24).
- **"The Settings `rivalChatter` default is lost for old settings."** False: `load()` spreads `defaults()` under the persisted settings (#24).
- **"`var(--token, none)` fallbacks would make Modal styles safer."** No: the tokens are defined on `:root`, and `var(--sheet-rule, none)` is invalid inside a `box-shadow` list and would drop the whole declaration (#19).
- **"Alegreya SC 700 italic is unused; drop the face."** False: `Board.svelte:453` uses italic 600 `var(--font-display)` for board labels. Do not delete the font files (#19). **"`titleWords` in `App.svelte` is not reactive."** Not needed: `locale` is a plain module variable, there is one catalog and `setLocale` is never called, so `$derived` would never recompute (#19).
- **"A destroyed harvest flight leaks the held-back count."** False: tokens are removed only via `landed()`; the `FLIGHT_GRACE_MS` timer calls the idempotent `landed()`, and unmounting the overlay calls `feedback.destroy()`, which clears incoming tokens (#23). **"The away digest goes stale after a control change."** False: `ActionFeed` renders the digest only for `digest.viewerId === session.viewerId`, and clearing it on every control change would drop unread digests (#23). **"Online `own` is set for AI seats."** False: online `localActor` is only `onlinePlayerId`, and `scheduleAi` runs only for the local transport (#23). **"Duplicate `data-res-target` purses."** False: the top-bar `.mine` is hidden above 900 px, the board purse below, and `landingPoint` skips hidden or zero-size targets (#23).
- **"`QuipBubble` is `aria-hidden`, so screen readers miss quips."** False: `RivalQuips` has an sr-only `role="status"` and the Chronicle is `aria-live` (#24).
- **"`GameMenu.leave` stays busy if `flushAutosave` rejects."** False: `flushAutosave` returns the autosave queue, which handles both outcomes (#10). **"`listSaves` now rejects."** Handled: its only UI caller catches and sets `savesUnavailable`; pruning is caught in `flushAutosave` (#10). **"`settingsFromMenu` goes stale."** False: Settings closes only through `onclose`, and the other `ui.dialog` writers are mutually exclusive (#10). **"The export file name embeds an unsanitized seed."** False: `exportFileName` uses the match id, slugified with `/[^\w-]+/g` (#10).
- **"`button.suggested` is a Playwright strict-mode violation."** False: at most one receive button matches the suggestion, and trades are sequential (#11). **"The Claim button needs a double-click guard."** False: `perform()` returns false while busy, and the claimed button is removed before a second click (#11).
- **"A rejected `flush()` may not set `this.error`."** False: `flush()` calls `showError(res.code)`, and the online transport maps `accepted: false` to the server's error code (#8).

From the GLM rounds on PRs #8 to #25 (each checked against the code, a test or a probe):
- **ESLint `no-restricted-imports` groups miss subpath imports** (`@manors-menaces/*`, `node:*`; #16). False: the groups use ignore-style matching, where a matched path also excludes everything below it; `node:*` matches `node:fs/promises`.
- **A 4 KB WebSocket frame cap drops valid turns** (#17). False: commands travel over HTTP; the largest client socket message is a 71-byte subscribe.
- **`commandsByIds` can exceed SQLite's parameter limit** (#17). False: batches over 50 commands are rejected before the query.
- **Keyboard picks stop working after a board drag** (#13). False: the keyboard handler never goes through the drag-gated `pick()`.
- **ActionBar toasts have no positioned parent** (#14). False: they anchor to `.dock` on purpose, measured on all three layouts.
- **Rematch after a tutorial drops the coach; Master Builder counts Strongholds twice; the writs recap credits the leader with every writ** (#18). All false: a tutorial never offers "Play again"; founding and raising are separate builds; the recap names the realm total on purpose.
- **`tauri icon -p` takes platform names** (#20). False for the pinned CLI 2.11.5: `-p, --png` takes pixel sizes, and the script reproduces the committed icons byte for byte.
- **`passesSpacing` accepts held Sites** (#21). False: its first line rejects them.
- **`session.undo()` must be awaited; a "dangerous function" in `turn-flow.spec.ts`** (#11). False: `undo()` is synchronous; the flagged line is a regex `.exec()`.
- **`GameMenu.leave()` can leave the menu disabled** (#10). False: `flushAutosave()` never rejects; e2e probes with every IndexedDB call failing still exit.
- **Awaiting `indexedDB.deleteDatabase` in e2e setup** (raised on most PRs). Not needed: every Playwright test runs in a fresh browser context.
