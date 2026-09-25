# Storybook visual refresh

Last updated: 2026-09-25. Artwork committed and pushed; latest main included.

## User request and scope

The user loves the generated manor-and-troll icon and asked for the existing
game artwork and interface to feel similarly fun, warm and polished. They
initially requested local changes without commits or pull requests for this
refresh. They subsequently asked for more varied gender/species roles, including
a woman knight and a goblin emperor, and for this document to stay up to date.

The original icon is saved at
`media-sources/manors-and-menaces-icon-concept.png`. Its earlier storage-only
PR #35 was merged before this refresh. The user has now authorized committing
and pushing this work, then merging the latest main into the task branch.
No new PR was requested. The current branch is `codex/save-icon-concept`,
updated to `origin/main` at `15640a5` during the second pass. This includes the
separate icon update (#36) and build improvements (#37).

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

## Current end state and future work

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

Both visual passes are complete and their relevant checks passed. Everything
remains uncommitted locally; no refresh commits or PRs were created. Preview at
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
