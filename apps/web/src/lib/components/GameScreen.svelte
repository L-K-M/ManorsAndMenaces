<script lang="ts">
  // In-game layout (spec §53): board first, side panel for players/quests/log,
  // bottom bar for hand, actions and harvest preview. On phones the side panel
  // becomes a slide-over and the bottom bar an action sheet.
  import { RESOURCE_TYPES, getHarvestPreview } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import { computeHighlights, legalFor } from "../game/interaction.js";
  import type { GameSession } from "../game/session.svelte.js";
  import { resetTool, ui } from "../stores/ui.svelte.js";
  import { resetView, zoomAt, zoomTo, viewport } from "../stores/viewport.svelte.js";
  import ActionBar from "./ActionBar.svelte";
  import Board from "./Board.svelte";
  import DebugPanel from "./DebugPanel.svelte";
  import Dialogs from "./Dialogs.svelte";
  import GameMenu from "./GameMenu.svelte";
  import HandPanel from "./HandPanel.svelte";
  import HarvestPreview from "./HarvestPreview.svelte";
  import LogPanel from "./LogPanel.svelte";
  import Overlays from "./Overlays.svelte";
  import PlayersPanel from "./PlayersPanel.svelte";
  import QuestPanel from "./QuestPanel.svelte";
  import ResourceIcon from "./ResourceIcon.svelte";
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

  // Reset transient UI gs when the acting mode changes.
  let lastMode = "";
  $effect(() => {
    const mode = `${legal?.mode ?? "none"}:${legal?.playerId ?? ""}`;
    if (mode !== lastMode) {
      lastMode = mode;
      resetTool();
      ui.bannerDraft = {};
    }
  });

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
  function keydown(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.closest("input, select, textarea")) return;
    if (e.key === "Escape") {
      resetTool();
      ui.inspect = null;
    } else if ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      session.undo();
    } else if (e.key === "+" || e.key === "=") zoomAt(1.2, viewport.box.x + viewport.box.w / 2, viewport.box.y + viewport.box.h / 2);
    else if (e.key === "-") zoomAt(1 / 1.2, viewport.box.x + viewport.box.w / 2, viewport.box.y + viewport.box.h / 2);
    else if (e.key === "0") resetView();
  }
</script>

<svelte:window onkeydown={keydown} onpagehide={() => void session.flushAutosave()} />
<svelte:document onvisibilitychange={onhidden} />

<div class="game">
  <header class="topbar">
    <button class="ghost" onclick={() => (ui.dialog = "menu")} aria-label={t("ui.main_menu")} aria-haspopup="dialog">☰</button>
    <h1>{t("app.title")}</h1>
    <span class="round">{t("ui.round_n", { n: Math.max(1, gs.round) })}</span>
    {#if me}
      <div class="mine" aria-label={t("ui.your_resources")}>
        {#each RESOURCE_TYPES as r}<span><ResourceIcon resource={r} size={18} />{me.resources[r]}</span>{/each}
      </div>
    {/if}
    <span class="spacer"></span>
    {#if session.transport.kind === "local" && !tutorial}<button class="ghost" onclick={save}>{savedNote ?? t("ui.save")}</button>{/if}
    <button class="ghost" onclick={() => (ui.dialog = "settings")} aria-label={t("ui.settings")}>⚙</button>
    {#if import.meta.env.DEV}<button class="ghost" onclick={() => (ui.showDebug = true)}>{t("ui.debug")}</button>{/if}
    <button class="ghost panel-toggle" onclick={() => (panelOpen = !panelOpen)} aria-expanded={panelOpen}>{t("ui.panels")}</button>
  </header>

  <main class="board-wrap">
    <Board {session} {legal} {hl} preview={session.localActor ? preview : null} />
    <div class="camera" role="group" aria-label={t("ui.board_camera")}>
      <button onclick={() => zoomAt(1.25, viewport.box.x + viewport.box.w / 2, viewport.box.y + viewport.box.h / 2)} aria-label={t("ui.zoom_in")}>+</button>
      <button onclick={() => zoomAt(0.8, viewport.box.x + viewport.box.w / 2, viewport.box.y + viewport.box.h / 2)} aria-label={t("ui.zoom_out")}>−</button>
      <button onclick={resetView} aria-label={t("ui.reset_view")}>⤢</button>
      <button onclick={zoomToMine} aria-label={t("ui.zoom_to_my_holdings")}>◎</button>
    </div>
    {#each session.floaters.filter((f) => f.playerId === viewer) as f (f.id)}
      <div class="floater" style="--i: {f.id % 5}"><ResourceIcon resource={f.resource as never} size={22} /> {f.text}</div>
    {/each}
    <Overlays {session} {onexit} {onrematch} />
    {#if tutorial}<TutorialCoach {session} onfinish={onexit} />{/if}
  </main>

  <aside class="side" class:open={panelOpen}>
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected={ui.panel === "players"} onclick={() => (ui.panel = "players")}>{t("ui.players")}</button>
      <button role="tab" aria-selected={ui.panel === "quests"} onclick={() => (ui.panel = "quests")}>{t("ui.quests")}</button>
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

  <footer class="bottom">
    <div class="actions"><ActionBar {session} {legal} hints={hl} /></div>
    {#if previewFor && preview}
      <div class="preview"><HarvestPreview {session} playerId={previewFor} {preview} /></div>
    {/if}
    <div class="hand"><HandPanel {session} {legal} /></div>
  </footer>
</div>

<Dialogs {session} {legal} />
{#if ui.dialog === "menu"}<GameMenu {session} {tutorial} {onexit} onsettings={() => ((settingsFromMenu = true), (ui.dialog = "settings"))} onclose={() => (ui.dialog = null)} />{/if}
{#if ui.dialog === "settings"}<SettingsDialog onclose={() => ((ui.dialog = settingsFromMenu ? "menu" : null), (settingsFromMenu = false))} />{/if}
{#if ui.showDebug}<DebugPanel {session} onclose={() => (ui.showDebug = false)} />{/if}

<style>
  .game {
    height: 100dvh;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(17rem, 22rem);
    grid-template-rows: auto 1fr auto;
    grid-template-areas:
      "top top"
      "board side"
      "bottom bottom";
  }
  .topbar {
    grid-area: top;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
    padding: 0.3rem 0.6rem;
    background: var(--wood);
    color: #fffaf0;
  }
  .topbar h1 {
    margin: 0;
    font: 700 1.2rem/1 var(--font-display);
  }
  .topbar .ghost {
    color: #fffaf0;
    border-color: #fff5;
  }
  .topbar .ghost:hover:not(:disabled),
  .topbar .ghost[aria-expanded="true"] {
    background: #fff2;
  }
  .round {
    opacity: 0.85;
    font-size: 0.9rem;
  }
  .mine {
    display: none;
    gap: 0.5rem;
    font-variant-numeric: tabular-nums;
  }
  .mine span {
    display: inline-flex;
    gap: 0.15rem;
    align-items: center;
  }
  .spacer {
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
    left: 0.75rem;
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
  .floater {
    position: absolute;
    left: 50%;
    bottom: 1rem;
    transform: translateX(calc(var(--i) * 60px - 120px));
    background: var(--paper);
    border-radius: 999px;
    padding: 0.2rem 0.6rem;
    font-weight: 700;
    animation: float 1.5s ease-out forwards;
    pointer-events: none;
  }
  @keyframes float {
    from {
      opacity: 0;
      translate: 0 20px;
    }
    20% {
      opacity: 1;
    }
    to {
      opacity: 0;
      translate: 0 -80px;
    }
  }
  .side {
    grid-area: side;
    background: var(--parchment);
    border-left: 3px solid #8a7650;
    overflow-y: auto;
    padding: 0.5rem;
  }
  .tabs {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 0.5rem;
  }
  .tabs button {
    flex: 1;
    min-height: 40px;
  }
  .tabs button[aria-selected="true"] {
    background: var(--accent);
    color: #fff;
  }
  .panel-toggle {
    display: none;
  }
  .bottom {
    grid-area: bottom;
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "actions preview"
      "hand hand";
    gap: 0.4rem 1rem;
    padding: 0.5rem 0.75rem;
    background: var(--parchment);
    border-top: 3px solid #8a7650;
  }
  .actions {
    grid-area: actions;
  }
  .preview {
    grid-area: preview;
    min-width: 14rem;
  }
  .hand {
    grid-area: hand;
  }
  .hand:empty {
    display: none;
  }

  @media (max-width: 900px) {
    .game {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        "top"
        "board"
        "bottom";
    }
    .mine {
      display: flex;
    }
    .topbar h1,
    .round {
      display: none;
    }
    .panel-toggle {
      display: inline-flex;
    }
    .side {
      position: fixed;
      right: 0;
      top: 3rem;
      bottom: 0;
      width: min(22rem, 90vw);
      transform: translateX(100%);
      transition: transform 0.2s;
      z-index: 20;
      box-shadow: -8px 0 24px #0003;
    }
    .side.open {
      transform: none;
    }
    .topbar {
      gap: 0.35rem;
      padding: 0.25rem 0.4rem;
    }
    .topbar button {
      min-height: 40px;
      padding: 0.2rem 0.5rem;
    }
    .mine {
      order: 10;
      width: 100%;
      justify-content: space-around;
    }
    .preview {
      min-width: 0;
    }
    .bottom {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        "actions"
        "preview"
        "hand";
      max-height: 45dvh;
      overflow-y: auto;
    }
  }
</style>
