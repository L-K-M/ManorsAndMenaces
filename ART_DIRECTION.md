# Storybook visual refresh

Last updated: 2026-09-26. New Game player grouping in progress.

## User request and scope

The user loves the generated manor-and-troll icon and asked for the existing
game artwork and interface to feel similarly fun, warm and polished. They
initially requested local changes without commits or pull requests for this
refresh. They subsequently asked for more varied gender/species roles, including
a woman knight and a goblin emperor, and for this document to stay up to date.

The original icon is saved at
`media-sources/manors-and-menaces-icon-concept.png`. Its earlier storage-only
PR #35 was merged before this refresh. The user later authorized committing
and pushing the first passes to `codex/save-icon-concept`. That work is now
merged into main at `4edc1cb`. The second-wave card pass is on
`codex/second-wave-card-art`, following the replacement AGENTS.md review and
merge workflow. The historical checkpoints below record earlier end states.

## Design goals and decisions

- Match the icon's storybook ink outlines, warm cream stone, terracotta roofs,
  moss greens, brass accents and expressive, mischievous faces.
- Keep the board readable. Retain its geography, label placement, ownership
  colours, heraldic shapes, legal-action highlights and camera behavior.
- Use painted portraits where faces benefit from detail. Keep terrain, pieces,
  resource tokens and card symbols in SVG so they stay crisp when zoomed.
- Make the title screen, header, player cards, resource tokens and hand feel
  like parts of the same game. Keep texture subtle behind text.
- Preserve reduced motion, high contrast, mobile layouts, offline asset loading
  and existing save compatibility. This is a visual refresh, not a rules change.
- Emperor Mumble is a goblin ruler. Dame Brash is a human woman knight with
  dark brown skin and practical armour. Their existing ids (`lord_mumble`,
  `sir_brash`) stay stable for saved games.

## Implemented locally

- Six generated rival portraits, saved as originals in `media-sources/storybook/`.
  Exact built-in image-generation prompts are in `prompts.json` there.
- `tools/generate-game-art.mjs` derives 256px runtime portraits and 640px title
  artwork in `apps/web/public/art/`. App icons use the newer upstream
  `media-sources/icon.png` and `icon.json` pipeline independently.
- Painted portraits with player-colour rings and heraldic badges. High contrast
  retains the vector portraits. Larger portraits on player cards.
- Updated character names, goblin vector fallback and tutorial rival. Legacy
  name lookup keeps older saves without rival ids recognizable.
- Icon artwork on the title screen and game header; responsive title layout.
- Forest-green header, warmer paper panels and raised buttons; softened paper
  grain. Player headers now use a grid so long names do not strand the score.
- Warmer terrain palette, soft region shading, quieter teal water, sunlit
  borders and richer forest highlights.
- Shaded holdings with masonry details and roof seams; more expressive troll
  miniature with larger eyes, ivory horns and a grin.
- Resource coin rims, illustrated card-type emblems and branded card backs.
- The newer upstream PNG favicon, native and PWA icons are retained unchanged.
- New-game form grid constrained to its available width, so the longer emperor
  title does not push controls beyond a small phone's edge.
- Second pass: more expressive dragon, witch and tinkers; a purple hood,
  lantern details and grin for the highwayman; brass gears and clearer eyes.
- Quest cards now share the parchment, ink borders and display typography.
  Their expiry indicator uses a consistent SVG hourglass instead of emoji.
- Victory standings use the same rival portraits as the rest of the game.
  Dame Brash's vector fallback now retains her brown skin and dark hair.

## Validation and current checkpoint

- The dev server runs at `http://127.0.0.1:5173/`.
- Visually inspected the title screen at phone and desktop sizes and a live
  three-player board with Dame Brash and Emperor Mumble.
- Initial typecheck caught the `charter` card type missing from the new card
  art component; fixed by using the rules package's `CardType`.
- Added legacy/current rival-name coverage to the existing rival tests.
- Typecheck and lint passed. All 383 tests across 40 test files passed.
- Asset URLs respect Vite's relative base for installations below a URL subpath.
- All six selected portraits have been inspected. Emperor Mumble's spectacles
  caused duplicated eyes in the generated art; removing them produced the clean
  final portrait. Its correction prompt is in `storybook/emperor-edit.txt`.
- Platform icon generation completed, including Android resource copies.
  Visually inspected the standard and maskable PWA icons.
- Installed the missing Playwright Chromium executable. The first running
  browser suite passed 46/52 cases and exposed a small-phone form overflow.
  Fixed the grid's implicit minimum column width. A new portrait test expected
  a production-style relative URL from the dev server; corrected its assertion.
  A turn-flow test was interrupted by a live reload while editing. All affected
  suites passed on the final rerun of the first pass.
- Regenerated the runtime emperor portrait after its final correction. Inspected
  the player-card grid, softened paper grain and long title-menu save label in
  the live desktop preview. Confirmed the small-phone form no longer overflows.
- First-pass `pnpm check` passed: typecheck with zero warnings, lint, 383 tests in
  40 files, deterministic map validation, production web/server builds and
  the server smoke test. Map validation still reports its existing advisory
  warnings about two coastal trading posts and one single-site region.
- Confirmed built CSS rewrites the card-back image URL relative to its asset
  folder, so it supports subpath installations alongside the portrait URLs.
- Reviewed the code diff and asset sizes. Original portraits total about 15 MB;
  all runtime art totals about 1.8 MB.
- The browser's temporary viewport override has been cleared and the preview
  is open on the refreshed board. `AGENTS.md` now points to this document and
  asks future visual work to keep it current.
- All 52 selected browser cases passed on first-pass code (look, layout, board art,
  rivals, turn flow and offline behavior), including desktop/phone portrait
  loading, high contrast, full hands, touch previews and small-screen layouts.
- `git diff --check` passed. Native desktop/mobile executables have not been
  built or launched in this visual-refresh pass; their icon assets were
  regenerated using the existing pipeline.

## Second-pass checkpoint

- Fetched and fast-forwarded the current branch to `15640a5`. Preserved the
  first pass in stash `6b1af0e8c36e1b70b450cc5a129756a6976da438` before updating.
  All game UI, portrait sources, prompts and runtime assets were restored.
  The old local icon variants were superseded by the newer merged icon work;
  their backup remains in that stash. Do not blindly apply the stash, since it
  would reintroduce obsolete icon files and overwrite later refinements.
- The game-art generator no longer creates an SVG app-icon wrapper. Its job is
  now solely deriving runtime game art. Native/web icon generators stay as
  upstream implemented them.
- Visually inspected all five menace miniatures at 48, 96 and 160px and the
  vector portrait row in a temporary review page. Removed that page afterward.
- The first second-pass check encountered the temporary review page's English
  labels in the localization test. That page is removed; final checks rerun
  without it. No product localization exemption was added.
- Final `pnpm check` passed on the updated project: typecheck, lint, all 395
  tests in 41 files, map validation, production builds and server smoke test.
- All 47 affected browser cases passed: board art, game flow including victory,
  look and responsive layout. The earlier pass additionally covered offline
  behavior and rival/turn-flow suites. No CI run or native build was performed.
- Inspected quest cards in the live narrow-screen panel. Confirmed the revised
  game-art generator renders all seven runtime assets without recreating the
  obsolete SVG icon master. `git diff --check` passed.

## Earlier desktop pass and follow-up guidance

### Desktop screenshot follow-up

The user supplied two screenshots from the installed desktop app, showing the
older vector portraits, brown header and title screen. Inspection confirmed
the running process is `/Applications/Manors & Menaces.app/Contents/MacOS/manors-menaces`
using `tauri://localhost`. It does not consume the browser dev server's updates.

- Added a small illustrated fan of cards to the empty hand, with its existing
  buying-cost guidance. Preserve fixed dock geometry so drawing cards or
  changing phase does not resize the board.
- Building a local release `.app` with `pnpm tauri build --bundles app` to verify
  the refresh in the actual desktop WebView. Do not replace `/Applications`
  as part of this inspection; open the built copy from the project.
- Confirmed the empty-hand treatment visually at 1400x900. All 28 layout/look
  browser tests passed, including large text and full hands; typecheck and lint
  passed.
- Saved the running installed game's Grum/Madame Quill/Alice session through
  its Save button before switching builds; the UI confirmed "Saved."
- The macOS release build succeeded. Opened
  `src-tauri/target/release/bundle/macos/Manors & Menaces.app` through the native
  app controls after closing the older installed copy. The installed
  `/Applications` bundle was not replaced.
- Verified the new native title artwork and loaded the original save: Grum and
  Madame Quill still each have one Manor and Route, Alice is still placing her
  first Manor. Inspected the painted portraits, green header, updated board,
  gold legal-site highlights and illustrated empty-hand panel in WebKit.
- Leave the local built app open for the user. To see this version later,
  reopen that project bundle; the older `/Applications` copy remains older.

At this earlier milestone both visual passes and their relevant checks were
complete, with changes still local. Later passes below record commits and
pushes after the user authorized them. Original preview at
`http://127.0.0.1:5173/`; restart the dev server if the session has ended.

Future work should begin with the user's visual feedback. macOS packaging and
the native screen have now been checked; mobile devices remain unverified.
If changing the artwork again,
keep the original paintings and prompts, regenerate their runtime derivatives,
and rerun the checks affected by those changes. Update this document after each
substantial milestone, especially before pausing or ending a session.

## Resuming and tooling

Read this document, `AGENTS.md`, and the working-tree diff first. Preserve all
local changes. The default shell selects obsolete Node 20; use:

```sh
export PATH=/Users/lmathis/.nvm/versions/node/v22.23.3/bin:$PATH
pnpm dev --host 127.0.0.1
```

Regenerate game artwork with `node tools/generate-game-art.mjs`, native icons
with `pnpm tauri icon media-sources/icon.json -o src-tauri/icons`, and web icons
with `node tools/generate-pwa-icons.mjs`. The current native icon generator
writes Android launchers directly to the Android project's resource directory.

No agents were delegated. No changes from this visual refresh have been
committed or pushed. Keep this document factual: record design rationale,
observable results and next actions, rather than assuming an unfinished check
succeeded.

## Island geography follow-up

The user dislikes the oval, potato-like silhouette. The old generator only
perturbed an ellipse by 7.5%, 4.5% and 2.5% sine waves. Its coastline occupied
98.4% of its convex hull, leaving almost no meaningful bays.

- Keep the original layout envelope and seeded gameplay generation stable;
  apply a separate deterministic geography deformation at emission. Shape
  shared region vertices and sites together, then recalculate label centroids.
- Add broad asymmetric land masses, deep northern and southeastern bays,
  smaller western/eastern inlets and rocky coves. This is illustrated geography,
  not a geological simulation. Preserve one connected, playable island.
- Regression first: the substantial-bays test failed on the original map.
  A fingerprint records all non-geometric map data, including stable identities,
  adjacency, resource assignments, landmarks and menace starts, to protect saves.
- Additional tests check simple polygons, tiled area, labels within regions,
  sites on land and complete routes on land. These pass on the current draft.
- Final tuning moved the southeastern bay eastward to retain a usable
  Cinderholm peninsula. Limited inward deformation to keep the radial mapping
  monotone for other seeds. The fixed published map stays 24 Regions, 36 Sites,
  43 Routes, with exactly the same non-geometric data.
- Small coastal Regions now get a bounded second chance to place two terrain
  motifs outside their random clusters, without reducing any clearance.
- Maximum zoom-out is 15% beyond the home view (previously 30%); the camera's
  existing tests initially caught excessive sea at the extremes after adding
  deeper bays. Home framing and maximum zoom-in are unchanged.
- Browser inspection at 1400x900 confirmed the new silhouette and readable
  region labels. All 44 applicable board-art, camera, layout and gameplay
  browser tests passed, including phone touch tests; two desktop instances of
  phone-only tests were intentionally skipped.
- The first full check hit an unrelated five-second build-script test timeout
  while browser tests ran concurrently (398 other tests passed). A fresh full
  check passed with less contention: all 399 tests in 42 files, typecheck,
  lint, deterministic map validation, production builds and server smoke test.
  The existing three map-balance warnings are unchanged.
- The macOS release rebuild succeeded. Relaunched the local project bundle
  and opened the user's current Grum/Madame Quill/Alice save. Verified the
  indented coastline, terrain, names, holdings and legal-site highlights in
  the native WebView. Each player now has one Manor and one Route in the
  user's saved setup; no game commands were issued during this inspection.
- Both the browser preview and local native app have the new island. The
  native game is left open. The installed `/Applications` copy remains
  untouched; reopen the project bundle to use this local build. All changes
  remain uncommitted, as requested. Island follow-up is complete.
- Logs for this pass: `/tmp/mm-island-check.log`, `/tmp/mm-island-e2e.log`,
  `/tmp/mm-island-desktop.log`. Temporary logs may not survive a later cleanup;
  the verification outcomes above are the durable record.

## Painted board miniatures follow-up

The user's cropped Sheaf Hollow screenshot showed the remaining flat vector
creatures, small buildings and dense field lines. This pass targets those
on-board details rather than changing game rules or map connections.

- Created five transparent painted miniatures using the built-in imagegen tool
  with the original manor/troll icon as style reference. Originals and exact
  prompts are in `media-sources/storybook/menaces/`; the existing art generator
  derives five 256px runtime PNGs in `apps/web/public/art/menaces/` (about 552KB
  total). The full art pipeline now derives 12 runtime images.
- The cast includes a copper dragon, moss-green toll troll, brown-skinned
  highwaywoman, elderly brown-skinned bog witch, and a female/male pair of
  goblin mechanics. Keep existing menace IDs for saves and rules.
- MenaceFigure uses the painted art within its existing board footprint;
  vector figures remain for high contrast or a failed image load. Idle motion
  continues to obey animation settings and the system's reduced-motion setting.
- Identified a real washout cause: targeting a build site faded all unavailable
  creatures and buildings to 50% opacity. Their art now stays fully colored;
  unavailable empty-site dots, routes and banners still dim, and pointer and
  keyboard targeting restrictions remain unchanged. The new regression test
  failed at opacity 0.5 before the fix and now passes at opacity 1.
- Landmarks gained warm stone and roof shading, masonry, lit window accents,
  gate bars, ivy, runes and steps. Grain motifs have fuller tied sheaves and
  softer haystacks; field rows are more widely spaced, thinner and lighter.
- Inspected the actual board at 1400x900 and at two closer zoom steps. All
  22 board-art/look browser cases passed, including transparent alpha for all
  five sprites, high-contrast and network-failure vector fallbacks, highlighted
  routes over busy art and reduced motion. The 16 terrain/island unit tests,
  typecheck and lint also passed before the last test-only additions.
- Updated the visible menace name to Highwaywoman; internal `highwayman`
  identity stays stable. Final typecheck, lint, production web/server builds
  and server smoke test passed. Desktop packaging also succeeded.
- Sources were generated with the built-in image tool, not the API/CLI
  fallback. No external image dependencies were added. Runtime alpha was
  verified by decoding all five sprites and checking transparent corners.
- Saved the native session (the UI confirmed "Saved."), relaunched the local
  built `.app`, and continued the original Grum/Madame Quill/Alice save.
  Confirmed the painted dragon/troll, full-color holdings, shaded landmarks
  and quieter fields in the native WebView. The saved setup still has one
  Manor and one Route for each player; no gameplay commands were issued.
- Native and browser previews are left open; temporary browser viewport/zoom
  overrides were cleared. No installed app replacement, commit, push or PR.
  This miniature pass is complete. Logs are `/tmp/mm-miniature-e2e.log`,
  `/tmp/mm-miniature-unit.log`, `/tmp/mm-miniature-typecheck.log`,
  `/tmp/mm-miniature-lint.log`, `/tmp/mm-miniature-build.log` and
  `/tmp/mm-miniature-desktop.log`.
- Further visual feedback can guide the next pass. The remaining scenery,
  landmarks and holdings intentionally retain editable SVG construction;
  this pass replaces all five menace figures with painted art.

## Title scenery follow-up

The latest screenshot exposed the title composition's remaining mismatch:
flat firs, primary-color cottages, dotted roads and rectangular fields beneath
the painted manor. Replace the entire old vector title vignette with a quiet
storybook coastal painting in the icon's palette and texture. Keep the manor
and parchment menu as the foreground focus. Use natural coves and layered
headlands instead of another oval island. The game board is unchanged here.

The new backdrop must cover wide and portrait screens without distortion,
keep every menu action readable, remain usable if its image fails, and respect
high contrast and reduced motion. Only subtle foreground motes should animate;
the landscape itself stays still. Save the original and exact prompt under
`media-sources/storybook/`, with compressed runtime copies under web `art/`.
- The built-in image tool produced `media-sources/storybook/title-coast.png`;
  the exact prompt is `title-coast-prompt.txt` in the same directory. It uses
  the original icon as style reference. The optional
  `tools/generate-title-scenery.mjs` script uses libwebp's `cwebp` to make 1920px
  and 960px WebP copies (249KB and 100KB). No runtime dependency was added.
- Replaced the old vector vignette entirely, including the flat castle,
  dragon, cottages, firs, fields, dotted path, boat and clouds. The existing
  foreground manor and menu remain. Image failure leaves a quiet gradient;
  high contrast uses plain cream. Motes stop for both the game animation
  setting and the OS reduced-motion setting.
- Visually checked the title with a Continue button at 1400x900 and 390x844.
  The menu fits, text stays readable, and the background crops without
  stretching. Cleared stale dev-server App styles by refreshing the source;
  they had temporarily made the foreground manor render at its intrinsic
  640px size despite the responsive rules on disk.
- All 30 look/layout browser tests passed, including image-failure, high
  contrast, animation, short autosave layouts and phone cases. Typecheck
  reported no warnings/errors, lint passed, and production web/server builds
  plus server smoke test passed. No rules or board behavior changed here.
- Saved the native session and observed the UI's Saved confirmation. Native
  packaging succeeded, then relaunched the project bundle and visually checked
  the complete painted title in its WebView. The Continue button still points
  to the user's Grum/Madame Quill/Alice Round 1 save. No gameplay commands were
  issued. Left the new title screen open in native and browser previews;
  cleared the browser viewport override. This title scenery pass is complete.
  The installed `/Applications` copy is unchanged.
- Logs: `/tmp/mm-title-e2e.log`, `/tmp/mm-title-typecheck.log`,
  `/tmp/mm-title-lint.log`, `/tmp/mm-title-build.log`,
  `/tmp/mm-title-desktop.log`. Everything remains local and uncommitted.

## Custom card illustrations

User asked for custom illustrations on every card. The prototype deck has 24
physical cards and 11 distinct definitions in `packages/content/src/cards.ts`.
Create one individual storybook painting for each definition, matched to its
actual effect and flavor, using the original icon as style reference. Preserve
all card IDs, counts and effects. Include a female knight and diverse fantasy
roles, consistent with the user's earlier casting preference.

Exact prompts live in `media-sources/storybook/cards/prompts.json`; originals
will sit beside them and compressed runtime copies in web `art/cards/`. Cards
need recognizable art in the compact hand and larger illustrations in their
hover/focus/touch-hold previews. Preserve readable rules, reaction timing,
selection, discard controls, privacy, responsive layouts and image-failure /
high-contrast fallbacks.

- Generated and visually inspected all eleven full-bleed paintings with the
  built-in image tool. The saved originals are 1536x1024 PNGs. The optional
  `tools/generate-card-art.mjs` script derives 600px WebP runtime images,
  approximately 712KB combined, using the same libwebp tool as title scenery.
- CardArt now loads individual images by typed effect ID. CardGlyph preserves
  the old editable type emblems for high contrast and image-load failure.
  The compact hand has a framed thumbnail beside the text; hover, keyboard
  focus and touch-hold previews show larger art with full rules and flavor.
  Prophecy's ordering list also uses the individual card images.
- Knight Errant features a Black woman knight; her flavor text now names
  Dame Alda. The illustrations also include a goblin woman druid, male goblin
  alchemist, male dragon whisperer and female bard. No effects or counts changed.
- Measured full preview height to keep enlarged cards within the viewport.
  A new regression test first reproduced the preview extending above a short
  landscape screen, then passed after the fix. Tests also wait for the
  responsive layout to settle before opening a phone tray, and use real
  keyboard modality when checking focus previews.
- Verified all eleven runtime images decode at 600px and resolve to distinct
  URLs, with matching larger previews and full rules. Verified both fallback
  modes, touch holds, discard controls, board sizing and hidden-hand privacy.
  The 20 existing layout/hot-seat cases passed; all 3 new card-art cases passed
  after the fixes. Manually inspected desktop (1400x900), short landscape
  (844x390) and portrait (390x844) layouts in an isolated localhost:5175 game.
  The user's browser/native saves were not used for drawing review cards.
- Final full project check passed: typecheck and lint, all 399 tests,
  deterministic map validation, production builds and server smoke test.
  The three existing map-balance warnings remain unchanged. Native packaging
  succeeded (local project bundle). The Mac was locked when attempting the
  final app inspection, so the running desktop app was not relaunched and the
  new card UI was verified in browser only. Reopen the local project bundle
  after unlocking to use this build; `/Applications` remains unchanged.
  This card-art pass is complete. An isolated card review is available at
  `http://localhost:5175/`; the viewport override has been reset. Logs are
  `/tmp/mm-cards-check.log`, `/tmp/mm-cards-e2e-final.log`,
  `/tmp/mm-cards-art-e2e-final.log`, `/tmp/mm-cards-desktop.log`.
  All work remains local, without commits or PRs.

## Branch synchronization

The user authorized a new end state after the card-art pass: commit and push
the completed refresh, fetch upstream, merge `origin/main` into this branch,
and reconcile any newly added cards or other content. Earlier local-only
checkpoints above describe their state at the time and are superseded by this
instruction. Preserve both upstream gameplay work and the visual refresh.

The pre-sync snapshot passed the full project check (399 tests, typecheck,
lint, deterministic map check, production builds and server smoke test), plus
the card and layout browser checks documented above. After merging, inspect
the card roster against the illustration manifest and rerun the affected
checks before pushing the reconciled result.

Completed: artwork snapshot `5359885` was committed and pushed to
`origin/codex/save-icon-concept`. A fresh fetch found `origin/main` still at
`15640a5`; merging it returned "Already up to date." There were no incoming
code or content changes and no conflicts. All 11 card definitions still have
an original painting, a runtime WebP and a recorded prompt. The checks above
apply to the unchanged implementation; no unnecessary rerun was needed.
This checkpoint is committed and pushed separately. No PR was opened, no
merge into main was performed, and there was no new CI/review round.

## Royal Quest illustrations

Continuing the visual refresh after the user's "continue": a fresh fetch
found no additional main changes. The live preview shows Royal Quests still
as plain text cards beside the illustrated hand. Add distinct paintings for
all 12 quest definitions, matching their conditions and the existing card
art. Keep the panel compact, the full rules readable, expiry and claim actions
intact, and provide a high-contrast/image-failure fallback. Give progress bars
an accessible name and a visible percentage using the existing rules selector.
Originals and exact prompts live in `media-sources/storybook/quests/`; web
copies go in `apps/web/public/art/quests/`. Inspect desktop and phone layouts,
verify every definition has art, and check quest claiming still works.
The Mac remains locked, so use the isolated browser review on localhost:5175.

- Generated and inspected all 12 distinct quest paintings with the built-in
  image tool. Originals and a linked scene index are saved in
  `media-sources/storybook/quests/`. Runtime WebPs are 600 × 400, about 960KB
  combined. The existing `generate-card-art.mjs` now derives both decks;
  regenerating preserved every existing hand-card runtime file unchanged.
- Quest cards show uncropped landscape art next to their title and full
  requirement. Expiry and progress share a compact footer. Progress uses the
  existing rules selector, with visible percentages and localized accessible
  names. The existing parchment emblem handles high contrast and failed loads.
- Checked the panel visually at 1280 × 720 and 360 × 640. All three current
  quests fit the desktop panel; the phone keeps readable rules and rewards.
  Browser resize overrides are reset and the isolated quest preview remains
  open. The user's main browser game and native save were not played.
- All 26 quest/card/layout browser tests passed, including all 12 distinct
  artwork URLs, readable rules, expiry, partial progress, both fallback modes,
  phone and short-landscape panels, and a successful claim awarding Renown.
  Typecheck reported zero errors/warnings, lint passed, and all 19 card/quest
  rules tests passed. No rules code or gameplay content was changed.
- Production web/server builds and the server smoke test passed. Desktop
  packaging also succeeded; the new app is in the project's
  `src-tauri/target/release/bundle/macos/` directory. Native visual inspection
  remains unavailable while the Mac is locked. The installed `/Applications`
  copy remains unchanged. This pass is complete and is being committed and
  pushed to `codex/save-icon-concept`, without a PR or a merge into main.
  Logs: `/tmp/mm-quests-e2e-final.log`, `/tmp/mm-quests-typecheck-final.log`,
  `/tmp/mm-quests-lint-final.log`, `/tmp/mm-quests-unit.log`,
  `/tmp/mm-quests-build.log`, `/tmp/mm-quests-desktop.log`.

## Painted landmarks and board inspector

The user requested another polish pass. Fetched and cleanly merged main at
`f359477`, bringing in online resume and missed-move summaries (#38). There
are no new card definitions. Keep these upstream features intact and verify
the online browser tests along with the visual changes.

- Completed five transparent painted landmarks: Royal Castle, Wizard Tower,
  Adventurers' Inn, Dwarven Hall and Sacred Grove. Originals, exact prompts
  and a linked scene index are in `media-sources/storybook/landmarks/`.
  The five 256px runtime PNGs total about 486KB. The existing
  `tools/generate-game-art.mjs` derives them along with portraits and menaces;
  existing runtime art remained unchanged after regeneration.
- Landmarks preserve the existing site positions, ownership emblems, holding
  overlap and pointer targets. High contrast and image failures retain the
  vector drawings, including the generic keep for unknown landmark IDs.
- The board inspector reuses landmark and menace art at a larger size. A
  parchment frame, display heading, responsive illustration size and bounded
  scrolling keep the rules readable on phones and short landscape windows.
  Gameplay commands, map topology and content definitions are unchanged.
- Visually inspected all five landmark inspectors and the dragon inspector
  in the isolated browser preview. Checked 1280 × 720, 360 × 640 and
  844 × 390 layouts; restored the normal viewport afterward. The preview
  uses `/tmp/mm-landmark-review.json`, a test save with a legal 15-command
  setup history and all five menaces. The user's original game was untouched.
- `pnpm check` passed: typecheck, lint, 411 tests across 45 files, map check,
  production web/server builds and server smoke test. Full log:
  `/tmp/mm-landmarks-check.log`.
- All 39 board/art/online browser tests passed, including five unique alpha
  sprites, building overlap, pointer targeting, inspector details, 150% text
  on phone/short layouts, both vector fallbacks, online resume and missed
  moves. Log: `/tmp/mm-landmarks-e2e.log`.
- Mac release packaging succeeded. The refreshed app is in
  `src-tauri/target/release/bundle/macos/Manors & Menaces.app`; log:
  `/tmp/mm-landmarks-desktop.log`. Native visual inspection of this pass
  remains unavailable while the Mac is locked. `/Applications` is unchanged.
- This pass is complete and is being committed and pushed with the upstream
  merge to `codex/save-icon-concept`. No PR or merge into main is part of the
  authorized end state. Next work should start with new visual feedback and
  preserve these tested assets, their source prompts and vector fallbacks.

## Second-wave cards and empty-hand polish

Started from current main `4edc1cb` on `codex/second-wave-card-art`. Main now
contains the prior artwork and ten new card definitions (#40), plus turn
notifications. There are 21 distinct card types. The new cards currently fall
back to type emblems because their paintings are missing.

Plan: paint all ten new cards in the established gouache style, retaining
playful and varied casting. Save originals and exact prompts beside the first
eleven card paintings. Replace the screenshot's flat empty-hand card fan with
a painted stack, retain a high-contrast fallback, and give the buying cost a
clearer visual hierarchy. Keep gameplay, hidden hands and dock geometry intact.
Check full-deck coverage, large text, narrow layouts and fallback rendering.

- All ten new card paintings are complete: Changeling, Ragnarök, Fire Bolt,
  Dragon's Landing, Transmutation Magic, The Plague, Royal Insurance Policy,
  Robin of the Glade, The Unreliable Bard and Treasure Hunter. The bard received
  one anatomy correction; its exact correction prompt is recorded. All new
  PNG originals are in `media-sources/storybook/cards/`; the 600 × 400 WebPs
  total about 765KiB. Earlier card and quest images regenerated unchanged.
- Added a transparent painted card fan in `media-sources/storybook/ui/`, with
  its prompt and a 256px runtime PNG (105KiB). The empty-hand panel has a clear
  heading and resource-cost badges sourced from the rules balance constants.
  Existing vector art remains for high contrast and failed loads. Harvest
  totals now use readable individual badges, including zero values.
- The existing whole-deck browser test failed before adding the missing
  paintings and passes with all 21 unique designs. All 36 card-art/layout/look
  tests passed, plus two stronger large-text checks requiring the whole empty
  heading and each cost badge to be visible. Responsive tests wait for the
  layout transition before inspecting the tray. Logs:
  `/tmp/mm-wave2-before.log`, `/tmp/mm-wave2-e2e.log`,
  `/tmp/mm-wave2-empty-final.log`.
- `pnpm check` passed: typecheck, lint, 579 tests across 55 files, deterministic
  map check, web/server production builds and server smoke test. Log:
  `/tmp/mm-wave2-check.log`. Visually checked the empty hand and harvest on
  desktop and a 360px phone, plus Ragnarök, Royal Insurance Policy and the
  corrected bard previews. Browser viewport overrides are reset; the isolated
  preview is on localhost:5175 with a deliberately oversized debug test hand.
  Saved games made before the deck expansion do not contain the new cards;
  use a fresh test game when reviewing their artwork.
- Mac release packaging passed; the updated app is in
  `src-tauri/target/release/bundle/macos/Manors & Menaces.app`. The installed
  application was not replaced. Opened the packaged app and loaded the current
  Grum/Madame Quill/Alice save: the painted empty hand and resource badges render
  correctly in WebKit, with the save still at the same setup step. Log:
  `/tmp/mm-wave2-desktop.log`.
- PR #43 is open. The first automated review completed without a confirmed
  blocker; missing-file and alpha warnings were checked against the tracked
  assets and actual rendering. Unused legacy copy cleanup is deferred.
- Browser CI timed out. A full local run reproduced Banners intercepting Route
  clicks in both setup and the Chronicle test. The board exempted owned Banners
  from its inactive-target hit-area rule even though assignment already marks
  every selectable Banner as highlighted. Removed that exemption. The stronger
  Chronicle regression failed before the fix and now passes in 9.4 seconds;
  the companion Banner-switching check also passes. Typecheck and lint pass.
  Rechecking the full browser suite alongside the next CI run. Logs:
  `/tmp/mm-banner-before.log`,
  `/tmp/mm-wave2-full-e2e-fixed.log`. CI and latest-revision review must pass
  before merging.
- Full local browser run: 142 passed, two desktop-only skips, one harvest-note
  fixture failure because it selects `.banner.mine`. Preserved that ownership
  marker while retaining the hit-area fix. All 33 board, Chronicle and turn-flow
  checks now pass, including the harvest-note test; typecheck and lint pass again.
  Log: `/tmp/mm-wave2-board-final.log`. Review round two had only an optional
  nonempty-selector assertion, deferred under the minor-feedback stopping rule.
  Await final CI and review for the ownership-marker restoration before merging.


## New Game player grouping

The second-wave art pass merged through PR #43 as `1d27d63`. Final CI passed
143 browser tests (two intentional skips); three review rounds had no unresolved
blockers. The final Mac app bundle also rebuilt successfully.

The next screenshot showed that names, AI controls and rival pickers visually
ran together. On `codex/new-game-player-panels`, each player now has a numbered
fieldset with their portrait/emblem, a player-colour left edge and a paper
background. All their controls and their rival motto live inside that boundary.
The rival picker uses the panel width instead of the old portrait indentation.
Phone layouts give the name its own row. High contrast retains numbered groups
and ink borders, so ownership does not depend on colour.

The new accessibility/containment regression failed before the change. All 20
look and rival browser checks now pass, including four-player forms at 150% text
on desktop and phone, high contrast, changing a player to human, and reaching
Begin. Visually reviewed desktop and 360px phone layouts; reset the preview
viewport afterward. Typecheck and lint passed. Logs:
`/tmp/mm-player-groups-before.log`, `/tmp/mm-player-groups-e2e.log`.
Merged through PR #44 as `89445f1`. All CI checks passed, including 145 browser
tests with two intentional skips. One review round completed without important
findings; optional test diagnostics were deferred. The Mac app bundle rebuilt.

## Larger board pieces and shared map junctions

The next screenshots showed undersized gameplay pieces and short region edges
with a Site sitting between two corners. On
`codex/board-piece-scale-and-junctions`, Holdings, Menaces and landmarks are 30%
larger on the board. Target rings, holding hit areas, hover bounds, Banner
offsets and harvest-note exclusions follow the larger figures. Region Menaces
sit farther right and slightly lower to leave labels and resource discs clear.
Terrain clearance grows with the pieces while preserving decoration density.

The generator already collapsed Voronoi edges shorter than 38 board units in
the gameplay graph, but left the region polygons at their original vertices.
It now remaps those vertices through the same merge chain and removes duplicate
corners. Regions, roads and Sites therefore meet at a single shared point.
Original cells still drive resource and identity decisions: published Site and
Route IDs, adjacency, resources and capacity remain unchanged, verified by the
existing gameplay fingerprint regression. Only display paths and label centres
change in the generated map.

Both geometry regressions failed before the fix and pass afterward: every Site
is a corner of all its adjacent Regions, and every shared-border Route matches
both polygon segments. The larger-piece browser regression also failed before
the scale change and now passes on desktop and phone, including placing a Route
beside the Manor. The 43 affected board/camera checks passed (two intentional
desktop skips). After the final terrain-spacing adjustment, all 18 terrain and
island geometry checks pass. Visually reviewed the normal and zoomed board and
a Manor at the Royal Castle; restored the isolated preview's test position and
camera afterward.

The final `pnpm check` passed: typecheck, lint, all 581 tests in 55 files,
deterministic map generation, production builds and the server smoke test.
All 12 final artwork browser checks passed. The first sandboxed full check
could not complete local server tests; the successful run used local networking.
Logs: `/tmp/mm-junction-check-final.log`,
`/tmp/mm-piece-art-final.log`, `/tmp/mm-board-size-e2e.log`.
Merged through PR #45 as `649780b`. All CI jobs passed, including 147 browser
tests with two intentional skips. One review round completed with no confirmed
important findings. The speculative degenerate-outline concern did not reproduce
in the published map or a sweep of 200 seeds; reverting individual polygons
would restore the junction bug. Minor assertion diagnostics and landmark-only
hit/harvest-note refinements were deferred. The Mac app bundle rebuilt.

## Always-visible action prices

The next screenshot showed costs disappearing from unaffordable action buttons.
The toolbar deliberately hid its price chips when the row got crowded, and
removed them entirely on small screens or for actions blocked by a non-resource
reason. On `codex/always-visible-action-costs`, every purchase action keeps its
resource price below its label, including disabled actions. Chips show the
required amount instead of inventory/price fractions, with larger resource
icons. Shortages retain their red treatment. Accessible names and tooltips
include both the price and the reason an action is unavailable.

Removed the measuring/ResizeObserver logic and cost-hiding breakpoints. On
narrow screens the action strip scrolls horizontally, keeping each price with
its button and leaving the turn controls visible. The board retains its fixed
phase-independent size. Costs still come from the rules availability selector;
no gameplay prices or legality changed.

Both new price-visibility regressions failed before the change and passed
afterward. All 26 responsive-layout and turn-flow checks passed, including
large text, phone/landscape layouts, trade-to-afford and phase controls.
Typecheck and lint passed. Visually reviewed desktop and 390px phone layouts,
including scrolling to the later purchase actions; reset viewport afterward.
The isolated localhost:5175 preview is now an Alice/Lady Fennick test game in
Main with some unaffordable actions, suitable for reviewing the price chips.
Logs: `/tmp/mm-costs-before.log`, `/tmp/mm-costs-after.log`,
`/tmp/mm-costs-layout.log`.

PR #46 is open. The first review had only minor findings. Added underlining to
missing-resource amounts so shortages do not rely on colour alone. The proposed
missing-cost guard is unnecessary: ActionAvailability requires a cost and the
selector initializes it for every action before checking blocked states.
The base button rule already retains a 44px minimum height, and the phone
touch-target audit passed. Initial Mac packaging succeeded; rebuild after the
final CSS change and wait for latest-commit CI/review before merging.

## Complete coastal building network (in progress)

PR #46 merged as `413e925`, with all CI passing (147 browser tests, two
intentional skips) and two review rounds without important findings. The final
Mac bundle rebuilt. Optional containment-test refinements were deferred; the
no-scroll suggestion conflicted with the intended narrow-screen action strip.

The beach screenshot exposes topology omitted by the generator, not a build
legality issue. It prunes coastal junctions to reach 36 Sites and explicitly
excludes coastline Routes. The current map has seven missing beach junctions;
16 junctions in total should form the coastal network. The fix will restore
those Sites and their inland links, and add roads following the shoreline
between consecutive coastal junctions. Ordinary manor spacing, network and
resource rules still apply. Decorative coastline bends are not building Sites.

Because adding adjacency changes gameplay, keep the published `greenvale` map
for existing saves and introduce a new default map ID for new local/online
games. Preserve existing region names, resource placement and interior artwork.
Coastal roads need explicit drawing points so they follow bays rather than
crossing water. Use the same geometry for rendering, hit areas, highlights,
Menace positions, camera targets and terrain/note clearance. Add regressions
for complete coastal connectivity, coastal setup/build legality, old-save
compatibility and curved route rendering before merging.

Implemented on `codex/coastal-building-network`: new games use
`greenvale-coastal-v2` with 43 Sites and 66 Routes. Restored seven junctions and
seven inland links; added 16 shoreline roads. The exact boundary segments drive
road drawing, stroke-only hit areas, highlights, Menace/effect positions,
hover anchors, camera targets and scenery/note clearance. Sparse terrain gets
more bounded placement attempts to retain its minimum illustration density.
The published `greenvale` remains registered and its gameplay fingerprint is
unchanged. The server now selects an engine using each match's stored map ID,
including old lobbies, AI turns, submitted commands and history replay.

The coastal-network and invalid-polyline regressions failed before their fixes.
All 589 unit/integration/server tests, typecheck, lint, deterministic map check
and production build/smoke test pass. New coverage verifies every shoreline
segment exactly once, coastal Manor/Route setup, route marker geometry and old
versus new online match legality. Existing save fixtures explicitly use the
legacy engine. Browser preview reopened the old 36-Site save successfully,
then created and resumed a new coastal game and built a shoreline road.
A focused browser run verified the actual curved-road click; its assertion
initially assumed Alice started, corrected to accept either shuffled player.
Two other checks were interrupted by Vite reloads during edits; a full browser
run is now in progress. Also recheck the harvest-note zoom scenario, which
failed to keep a note visible with the denser road network.
Logs: `/tmp/mm-coast-check.log`, `/tmp/mm-coast-e2e.log`,
`/tmp/mm-coast-regressions.log`. The localhost:5175 preview contains a fresh
Alice/Madame Quill/Dame Brash game with a coastal Manor and road.
