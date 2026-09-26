<script lang="ts">
  // In-game layout (spec §53): board first, side panel for players/quests/log,
  // a dock for actions, harvest preview and hand. See layout.ts for the three
  // arrangements. The dock never changes size while you play, so the board
  // never rescales between phases or as the hand grows.
  import { tick } from "svelte";
  import { innerHeight, innerWidth } from "svelte/reactivity/window";
  import { getHarvestPreview } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import { computeHighlights, legalFor } from "../game/interaction.js";
  import { hasSlideOverPanel, layoutFor } from "../layout.js";
  import type { GameSession } from "../game/session.svelte.js";
  import { resetTool, ui } from "../stores/ui.svelte.js";
  import { nudge, resetView, zoomBy, zoomTo } from "../stores/viewport.svelte.js";
  import ActionBar from "./ActionBar.svelte";
  import Announcer from "./Announcer.svelte";
  import Board from "./Board.svelte";
  import BoardHud from "./BoardHud.svelte";
  import DebugPanel from "./DebugPanel.svelte";
  import Dialogs from "./Dialogs.svelte";
  import GameMenu from "./GameMenu.svelte";
  import HandPanel from "./HandPanel.svelte";
  import HarvestPreview from "./HarvestPreview.svelte";
  import LogPanel from "./LogPanel.svelte";
  import Overlays from "./Overlays.svelte";
  import PlayersPanel from "./PlayersPanel.svelte";
  import PrivacyCurtain from "./PrivacyCurtain.svelte";
  import QuestPanel from "./QuestPanel.svelte";
  import ResourcePurse from "./ResourcePurse.svelte";
  import RivalQuips from "./RivalQuips.svelte";
  import ScoreStrip from "./ScoreStrip.svelte";
  import ToolIcon from "./ToolIcon.svelte";
  import SettingsDialog from "./SettingsDialog.svelte";
  import TutorialCoach from "./TutorialCoach.svelte";

  let { session, tutorial = false, onexit, onrematch }: { session: GameSession; tutorial?: boolean; onexit: () => void; onrematch: () => void } = $props();

  const gs = $derived(session.draft);
  const viewer = $derived(session.viewerId);
  // Derived once per change and shared with the board, action bar and
  // preview, which used to recompute them each.
  const legal = $derived(legalFor(session));
  const hl = $derived(computeHighlights(session, legal));
  const previewFor = $derived(session.localActor ?? viewer);
  const preview = $derived(previewFor ? getHarvestPreview(session.ctx, gs, previewFor, ui.bannerDraft) : null);
  const me = $derived(viewer ? gs.players[viewer] : undefined);
  let panelOpen = $state(false);
  let savedNote: string | null = $state(null);
  /** Settings opened from the game menu return to it when closed. */
  let settingsFromMenu = false;

  const layout = $derived(layoutFor(innerWidth.current ?? 0, innerHeight.current ?? 0));
  const slideOver = $derived(hasSlideOverPanel(layout));
  const cardsEnabled = $derived(gs.ruleset.enableCards);
  const bannerPhase = $derived(legal?.mode === "banner_assignment" || legal?.mode === "setup_banners");
  let panelToggle: HTMLButtonElement | undefined = $state();
  let sidePanel: HTMLElement | undefined = $state();

  // Phone action sheet: the tray (harvest preview and hand) opens over the
  // board on demand. A discard needs the hand, so it opens by itself then;
  // arming a tool needs the board, so it closes.
  let trayOpen = $state(false);
  let trayToggle: HTMLButtonElement | undefined = $state();
  // How far the sheet currently reaches over the board (a long status line,
  // the open tray), so the board's own controls can stay clear of it.
  let slotHeight = $state(0);
  let dockHeight = $state(0);
  const sheetOverlap = $derived(layout === "sheet" ? Math.max(0, dockHeight - slotHeight) : 0);
  $effect(() => {
    if (ui.tool !== "none") trayOpen = false;
  });

  // Reset transient UI gs when the acting mode changes.
  let lastMode = "";
  $effect(() => {
    const mode = `${legal?.mode ?? "none"}:${legal?.playerId ?? ""}`;
    if (mode !== lastMode) {
      lastMode = mode;
      resetTool();
      ui.bannerDraft = {};
      trayOpen = legal?.mode === "end" && legal.mustDiscard > 0;
    }
  });

  async function openPanel() {
    panelOpen = true;
    await tick();
    sidePanel?.querySelector<HTMLElement>("[role='tab'][aria-selected='true']")?.focus();
  }
  function closePanel() {
    panelOpen = false;
    panelToggle?.focus();
  }
  function closeTray() {
    const hadFocus = !!document.activeElement?.closest("#dock-tray");
    trayOpen = false;
    if (hadFocus) trayToggle?.focus();
  }

  function zoomToMine() {
    const pid = session.localActor ?? viewer;
    if (!pid) return;
    const pts = Object.values(gs.holdings)
      .filter((h) => h.ownerId === pid)
      .map((h) => session.map.sites.find((s) => s.id === h.siteId))
      .filter((s): s is NonNullable<typeof s> => !!s);
    zoomTo(pts);
  }
  async function save() {
    try {
      await session.save();
      savedNote = t("ui.saved");
    } catch {
      savedNote = t("ui.not_saved");
    }
    setTimeout(() => (savedNote = null), 1800);
  }
  // The tab may be closed or frozen once hidden: write the autosave now.
  function onhidden() {
    if (document.visibilityState === "hidden") void session.flushAutosave();
  }
  // Arrow keys pan the board by a tenth of the view.
  const PAN_KEYS: Record<string, [number, number]> = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1] };
  // With nothing focused, the browser scrolls the box around whatever was
  // last clicked, so remember it.
  let lastPressed: Element | null = null;
  /** Whether the browser would scroll a box around `from` along this axis. */
  function scrollsNatively(from: Element | null, vertical: boolean): boolean {
    for (let el = from; el && el !== document.body; el = el.parentElement) {
      const style = getComputedStyle(el);
      const overflow = vertical ? style.overflowY : style.overflowX;
      const room = vertical ? el.scrollHeight > el.clientHeight : el.scrollWidth > el.clientWidth;
      if (room && /auto|scroll|overlay/.test(overflow)) return true;
    }
    return false;
  }
  function keydown(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.closest("input, select, textarea, [contenteditable]")) return;
    const pan = PAN_KEYS[e.key];
    if (pan) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      // Leave the key to a dialog, a tablist or a scrollable panel (Chronicle,
      // side panel, hand), including one clicked without taking focus. A
      // pressed element that has since closed (the curtain's button) is gone.
      const focus = document.activeElement && document.activeElement !== document.body ? document.activeElement : lastPressed?.isConnected ? lastPressed : null;
      if (focus?.closest("[role=dialog], [role=tablist]") || scrollsNatively(focus, pan[1] !== 0)) return;
      e.preventDefault();
      nudge(...pan);
      return;
    }
    if (e.key === "Escape" && slideOver && panelOpen) closePanel();
    else if (e.key === "Escape" && layout === "sheet" && trayOpen) closeTray();
    else if (e.key === "Escape") {
      resetTool();
      ui.inspect = null;
    } else if ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      session.undo();
    } else if (e.key === "+" || e.key === "=") zoomBy(1.2);
    else if (e.key === "-") zoomBy(1 / 1.2);
    else if (e.key === "0") resetView();
  }
</script>

<svelte:window onkeydown={keydown} onpagehide={() => void session.flushAutosave()} onpointerdowncapture={(e) => (lastPressed = e.target as Element | null)} />
<svelte:document onvisibilitychange={onhidden} />

<!-- Your resources: over the board on wide screens (BoardHud), at the head
     of the dock in rail and sheet. -->
{#snippet mine()}
  {#if me}
    <div class="mine" aria-label={t("ui.your_resources")}>
      <ResourcePurse {session} playerId={viewer ?? ""} />
    </div>
  {/if}
{/snippet}

<div class="game" inert={!!session.curtainFor} data-layout={layout} class:no-cards={!cardsEnabled} class:tray-open={trayOpen} style="--sheet-overlap: {sheetOverlap}px">
  <header class="topbar">
    <button class="ghost icon" onclick={() => (ui.dialog = "menu")} aria-label={t("ui.main_menu")} aria-haspopup="dialog"><ToolIcon name="menu" /></button>
    <img class="brand-mark" src={`${import.meta.env.BASE_URL}art/manor-troll.png`} alt="" width="40" height="40" />
    <h1>{t("app.title")}</h1>
    <span class="round">{t("ui.round_n", { n: Math.max(1, gs.round) })}</span>
    <div class="score"><ScoreStrip {session} /></div>
    <span class="spacer"></span>
    {#if session.transport.kind === "local" && !tutorial}<button class="ghost" onclick={save}>{savedNote ?? t("ui.save")}</button>{/if}
    <button class="ghost icon" onclick={() => (ui.dialog = "settings")} aria-label={t("ui.settings")}><ToolIcon name="gear" /></button>
    {#if import.meta.env.DEV}<button class="ghost" onclick={() => (ui.showDebug = true)}>{t("ui.debug")}</button>{/if}
    {#if slideOver}
      <button
        class="ghost panel-toggle"
        bind:this={panelToggle}
        onclick={() => (panelOpen ? closePanel() : openPanel())}
        aria-expanded={panelOpen}
        aria-controls="side-panel"
        title={t("ui.panels")}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
          <rect x="2" y="3" width="18" height="16" rx="2.5" fill="none" stroke="currentColor" stroke-width="2" />
          <path d="M13 4v14" stroke="currentColor" stroke-width="2" />
          <path d="M15.5 8h2.5M15.5 11h2.5M15.5 14h2.5" stroke="currentColor" stroke-width="1.6" />
        </svg>
        <span class="panels-label">{t("ui.panels")}</span>
      </button>
    {/if}
  </header>

  <main class="board-wrap">
    <Board {session} {legal} {hl} preview={session.localActor ? preview : null} />
    <div class="camera" role="group" aria-label={t("ui.board_camera")}>
      <button onclick={() => zoomBy(1.25)} aria-label={t("ui.zoom_in")}><ToolIcon name="plus" /></button>
      <button onclick={() => zoomBy(0.8)} aria-label={t("ui.zoom_out")}><ToolIcon name="minus" /></button>
      <button onclick={() => resetView()} aria-label={t("ui.reset_view")}><ToolIcon name="fit" /></button>
      <button onclick={zoomToMine} aria-label={t("ui.zoom_to_my_holdings")}><ToolIcon name="locate" /></button>
    </div>
    <BoardHud {session} />
    <RivalQuips {session} />
    <Overlays {session} {tutorial} {onexit} {onrematch} />
    {#if tutorial}<TutorialCoach {session} onfinish={onexit} />{/if}
  </main>

  <aside id="side-panel" class="side" class:open={panelOpen} inert={slideOver && !panelOpen} bind:this={sidePanel}>
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected={ui.panel === "players"} onclick={() => (ui.panel = "players")}>{t("ui.players")}</button>
      <button role="tab" aria-selected={ui.panel === "quests"} onclick={() => (ui.panel = "quests")}>
        {t("ui.quests")}{#if legal?.claimableQuests.length}<span class="badge" title={t("status.claimable_quests", { count: legal.claimableQuests.length })}>{legal.claimableQuests.length}</span>{/if}
      </button>
      <button role="tab" aria-selected={ui.panel === "log"} onclick={() => (ui.panel = "log")}>{t("ui.chronicle")}</button>
    </div>
    <div class="tabpanel">
      {#if ui.panel === "players"}
        <PlayersPanel {session} />
      {:else if ui.panel === "quests"}
        <QuestPanel {session} {legal} />
      {:else}
        <LogPanel {session} />
      {/if}
    </div>
  </aside>
  {#if slideOver && panelOpen}
    <button class="scrim" tabindex="-1" aria-label={t("ui.close_panels")} onclick={closePanel}></button>
  {/if}

  <footer class="bottom" bind:clientHeight={slotHeight}>
    <div class="dock" bind:clientHeight={dockHeight}>
      {#if layout !== "wide"}
        <div class="dock-head">
          {@render mine()}
          {#if layout === "sheet"}
            <button class="ghost tray-toggle" bind:this={trayToggle} aria-expanded={trayOpen} aria-controls={trayOpen ? "dock-tray" : undefined} onclick={() => (trayOpen = !trayOpen)}>
              {cardsEnabled && me ? t("ui.hand_tray", { count: me.hand.length, limit: gs.ruleset.handLimit }) : t("ui.harvest_tray")}
              <span class="chevron" aria-hidden="true">▴</span>
            </button>
          {/if}
        </div>
      {/if}
      {#if layout === "sheet" && !trayOpen && bannerPhase && previewFor && preview}
        <!-- While you place Banners the harvest they will bring stays in view. -->
        <div class="preview glance"><HarvestPreview {session} playerId={previewFor} {preview} /></div>
      {/if}
      <div class="actions"><ActionBar {session} {legal} hints={hl} /></div>
      {#if layout !== "sheet" || trayOpen}
        <div class="tray" id="dock-tray">
          {#if previewFor && preview}
            <div class="preview"><HarvestPreview {session} playerId={previewFor} {preview} /></div>
          {/if}
          {#if cardsEnabled}<div class="hand"><HandPanel {session} {legal} /></div>{/if}
        </div>
      {/if}
    </div>
  </footer>
</div>

<PrivacyCurtain {session} />
<Announcer {session} />
<Dialogs {session} {legal} />
{#if ui.dialog === "menu"}<GameMenu {session} {tutorial} {onexit} onsettings={() => ((settingsFromMenu = true), (ui.dialog = "settings"))} onclose={() => (ui.dialog = null)} />{/if}
{#if ui.dialog === "settings"}<SettingsDialog onclose={() => ((ui.dialog = settingsFromMenu ? "menu" : null), (settingsFromMenu = false))} />{/if}
{#if ui.showDebug}<DebugPanel {session} onclose={() => (ui.showDebug = false)} />{/if}

<style>
  /* Sizes of the dock. They depend only on the layout and on whether the game
     uses cards, never on the phase or the hand, so the board keeps its size.
     They are in rem, so the Text size setting scales them; the dock is still
     capped so large text cannot starve the board. */
  .game {
    /* The action bar's two rows: the turn status (#11) and the tools. */
    --bar-h: 5.1rem;
    --tray-h: 8.75rem;
    --peek-h: 12rem;
    --dock-rule: 3px solid var(--edge);
    position: relative;
    height: 100dvh;
    /* clip, not hidden: a hidden overflow box can still be scrolled by focus. */
    overflow: clip;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(17rem, 22rem);
    grid-template-rows: auto minmax(0, 1fr) min(calc(var(--bar-h) + var(--tray-h) + 1.4rem + 3px + env(safe-area-inset-bottom)), 42dvh);
    grid-template-areas:
      "top top"
      "board side"
      "bottom bottom";
  }
  .game.no-cards {
    --tray-h: 4.75rem;
  }
  .topbar {
    grid-area: top;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
    padding: max(0.3rem, env(safe-area-inset-top)) max(0.6rem, env(safe-area-inset-right)) 0.3rem max(0.6rem, env(safe-area-inset-left));
    background: var(--forest-panel);
    color: #fffaf0;
    box-shadow: inset 0 -2px 0 #c79a4b, 0 2px 8px #182a2340;
  }
  .topbar h1 {
    margin: 0;
    font: 700 1.2rem/1 var(--font-display);
    white-space: nowrap;
  }
  .brand-mark {
    flex: none;
    object-fit: contain;
  }
  @media (max-width: 700px) {
    .brand-mark {
      display: none;
    }
  }
  .topbar .ghost {
    color: #fffaf0;
    border-color: #fff5;
  }
  .topbar .ghost:hover:not(:disabled),
  .topbar .ghost[aria-expanded="true"] {
    background: #fff2;
  }
  .topbar .icon {
    width: 44px;
    padding: 0;
    font-size: 1.15rem;
  }
  .round {
    opacity: 0.85;
    font-size: 0.9rem;
    white-space: nowrap;
  }
  /* The scoreboard takes the free space in the bar and shrinks (names
     first) rather than wrapping the bar onto a second row. */
  .score {
    container: score / inline-size;
    flex: 1 1 0;
    min-width: 0;
  }
  .mine {
    display: flex;
    gap: 0.5rem;
    font-variant-numeric: tabular-nums;
  }
  .spacer {
    display: none;
    flex: 1;
  }
  .board-wrap {
    grid-area: board;
    position: relative;
    min-height: 0;
    overflow: hidden;
  }
  .camera {
    position: absolute;
    left: max(0.75rem, env(safe-area-inset-left));
    bottom: 0.75rem;
    display: grid;
    gap: 0.3rem;
  }
  .camera button {
    width: 44px;
    height: 44px;
    padding: 0;
    font-size: 1.2rem;
  }
  .side {
    grid-area: side;
    background: var(--panel-face);
    border-left: var(--dock-rule);
    overflow-y: auto;
    padding: 0.65rem;
    box-shadow: inset 4px 0 12px #59432c15;
  }
  .tabs {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 0.5rem;
  }
  .tabs button {
    flex: 1;
    min-height: 44px;
  }
  .tabs button[aria-selected="true"] {
    background: var(--primary-face);
    color: #fff;
  }
  .badge {
    display: inline-grid;
    place-items: center;
    min-width: 1.3em;
    height: 1.3em;
    margin-left: 0.35em;
    padding: 0 0.3em;
    border-radius: 999px;
    background: #d19a12;
    color: #2b1f00;
    font-size: 0.75em;
    font-weight: 700;
    vertical-align: 0.1em;
  }

  /* ------------------------------------------------------------ dock */
  .bottom {
    grid-area: bottom;
    position: relative;
    min-width: 0;
    min-height: 0;
  }
  /* The dock never scrolls itself: toasts from the action bar float outside
     it, so only its inner parts (tray, hand, preview) scroll. */
  .dock {
    position: relative;
    height: 100%;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0.4rem;
    padding: 0.5rem max(0.75rem, env(safe-area-inset-right)) calc(0.5rem + env(safe-area-inset-bottom)) max(0.75rem, env(safe-area-inset-left));
    background: var(--panel-face);
    border-top: var(--dock-rule);
    box-shadow: inset 0 2px 0 #fff7df, 0 -3px 12px #3b30231a;
  }
  .actions {
    container: actionbar / inline-size;
    min-height: var(--bar-h);
    display: grid;
    align-items: center;
  }
  .tray {
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 17rem;
    grid-template-areas: "hand preview";
    gap: 1rem;
  }
  .no-cards .tray {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "preview";
  }
  .tray .preview {
    grid-area: preview;
    min-width: 0;
    overflow-y: auto;
  }
  .game[data-layout="wide"]:not(.no-cards) .tray .preview {
    border-left: 1px solid #8a765066;
    padding-left: 0.9rem;
  }
  .hand {
    grid-area: hand;
    min-width: 0;
    min-height: 0;
  }
  /* Instructions float above BoardHud's purse (bottom centre of the board)
     rather than over it. */
  [data-layout="wide"] .dock {
    --toast-inset: auto auto calc(100% + 4.1rem) 50%;
  }
  [data-layout="wide"] .hand {
    --cards-container: size;
  }
  /* Large text on a small phone moves the tray toggle onto its own row
     rather than pushing it off screen. */
  .dock-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  .dock-head .mine {
    flex: 1;
    max-width: 26rem;
    justify-content: space-around;
  }
  .tray-toggle {
    flex: none;
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-weight: 600;
  }
  .chevron {
    display: inline-block;
    transition: transform 0.2s;
  }
  .tray-open .chevron {
    transform: rotate(180deg);
  }
  .glance :global(section) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.2rem 0.7rem;
  }
  .glance :global(h3) {
    margin: 0;
  }
  .glance :global(.name) {
    display: none;
  }
  .glance :global(.warnings) {
    flex-basis: 100%;
    margin: 0;
  }

  /* ------------------------------------------------------------ slide-over
     In rail and sheet the panels slide over the board from the right, below
     the top bar. Closed, they are hidden (and inert) so neither focus nor
     their shadow leaks into view. */
  .scrim {
    grid-row: 2 / -1;
    grid-column: 1 / -1;
    z-index: 19;
    min-height: 0;
    padding: 0;
    border: none;
    border-radius: 0;
    background: #1c160d55;
    cursor: default;
  }
  .scrim:hover:not(:disabled) {
    background: #1c160d55;
  }
  .game:not([data-layout="wide"]) .side {
    grid-area: auto;
    grid-row: 2 / -1;
    grid-column: 1 / -1;
    justify-self: end;
    z-index: 20;
    width: min(22rem, 90vw);
    padding-right: max(0.5rem, env(safe-area-inset-right));
    padding-bottom: calc(0.5rem + env(safe-area-inset-bottom));
    transform: translateX(100%);
    visibility: hidden;
    transition:
      transform 0.2s,
      visibility 0s 0.2s;
  }
  .game:not([data-layout="wide"]) .side.open {
    transform: none;
    visibility: visible;
    box-shadow: -8px 0 24px #0003;
    transition: transform 0.2s;
  }
  /* An icon tile, so the top bar stays on one row. */
  .panel-toggle {
    display: grid;
    place-items: center;
    width: 44px;
    padding: 0;
  }
  .panels-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  /* ------------------------------------------------------------ rail
     Short landscape screens (phones on their side, the smallest desktop
     window): the dock becomes a column on the right, full height. */
  .game[data-layout="rail"] {
    grid-template-columns: minmax(0, 1fr) calc(min(20rem, 40vw) + env(safe-area-inset-right));
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas:
      "top top"
      "board bottom";
  }
  [data-layout="rail"] .topbar h1 {
    display: none;
  }
  [data-layout="rail"] .topbar {
    padding-top: max(0.25rem, env(safe-area-inset-top));
    padding-bottom: 0.25rem;
  }
  [data-layout="rail"] .dock {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem max(0.6rem, env(safe-area-inset-right)) calc(0.5rem + env(safe-area-inset-bottom)) 0.6rem;
    border-top: none;
    border-left: var(--dock-rule);
    /* Instructions float over the board, next to the rail and clear of the
       camera. */
    --toast-inset: auto calc(100% + 0.75rem) 0.75rem auto;
    --toast-shift: 0 0;
    --toast-max: calc(100vw - min(20rem, 40vw) - 6rem);
  }
  [data-layout="rail"] .actions {
    min-height: 0;
  }
  [data-layout="rail"] .tray {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    overflow-y: auto;
    overscroll-behavior: contain;
    /* The tray scrolls, so there is room to read whole cards. */
    --rules-lines: none;
    --flavor-display: block;
  }
  [data-layout="rail"] .tray .preview {
    flex: none;
    overflow: visible;
    border-left: none;
    padding-left: 0;
  }
  [data-layout="rail"] .hand {
    flex: none;
  }

  /* ------------------------------------------------------------ sheet
     Portrait phones and tablets: a fixed peek row (resources, status and the
     turn's actions). The tray grows upward over the board instead of
     pushing it, so the board never rescales. */
  .game[data-layout="sheet"] {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr) calc(var(--peek-h) + env(safe-area-inset-bottom));
    grid-template-areas:
      "top"
      "board"
      "bottom";
  }
  /* Tablets fit the action bar on one row, so the peek can be lower. */
  @media (min-width: 600px) {
    .game[data-layout="sheet"] {
      --peek-h: 9.25rem;
    }
  }
  /* Top bar: buttons on the first row, the scoreboard on its own row. */
  [data-layout="sheet"] .topbar {
    container: topbar / inline-size;
    gap: 0.35rem;
    padding-bottom: 0.2rem;
  }
  [data-layout="sheet"] .topbar h1 {
    display: none;
  }
  @container topbar (max-width: 24rem) {
    .round {
      display: none;
    }
  }
  [data-layout="sheet"] .spacer {
    display: block;
  }
  [data-layout="sheet"] .score {
    order: 10;
    flex-basis: 100%;
  }
  [data-layout="sheet"] .score :global(.scoreboard) {
    justify-content: safe center;
  }
  /* The board's controls sit just above the sheet, wherever its top is:
     the camera in a row, instructions from the action bar above it. */
  [data-layout="sheet"] .board-wrap {
    --overlay-bottom: calc(var(--sheet-overlap) + 3.6rem);
  }
  [data-layout="sheet"] .camera {
    bottom: calc(0.6rem + var(--sheet-overlap));
    grid-auto-flow: column;
  }
  [data-layout="sheet"] .dock {
    position: absolute;
    inset: auto 0 0;
    z-index: 12;
    height: auto;
    min-height: 100%;
    max-height: 85dvh;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding-top: 0.25rem;
    border-radius: 14px 14px 0 0;
    --toast-inset: auto auto calc(100% + 3.9rem) 50%;
  }
  .game[data-layout="sheet"].tray-open .dock {
    box-shadow: 0 -10px 30px #0004;
  }
  [data-layout="sheet"] .actions {
    min-height: 0;
  }
  [data-layout="sheet"] .tray {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    overflow-y: auto;
    overscroll-behavior: contain;
    border-top: 1px solid #8a765066;
    padding-top: 0.5rem;
    /* Room to read whole cards here. */
    --rules-lines: none;
    --flavor-display: block;
  }
  [data-layout="sheet"] .tray .preview {
    flex: none;
    overflow: visible;
    border-left: none;
    padding-left: 0;
  }
  [data-layout="sheet"] .hand {
    flex: none;
  }
</style>
