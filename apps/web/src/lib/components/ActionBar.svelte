<script lang="ts">
  import { getPlayerBanners, type LegalActionSummary } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import { confirmBanners, computeHighlights } from "../game/interaction.js";
  import { currentActor, type GameSession } from "../game/session.svelte.js";
  import { resetTool, ui, type Tool } from "../stores/ui.svelte.js";
  import ToolIcon from "./ToolIcon.svelte";

  let { session, legal }: { session: GameSession; legal: LegalActionSummary | null } = $props();

  const gs = $derived(session.draft);
  const actor = $derived(currentActor(gs));
  const hints = $derived(computeHighlights(session, legal));

  function tool(t_: Tool) {
    if (ui.tool === t_) return resetTool();
    resetTool();
    ui.tool = t_;
  }
  function sendHome() {
    if (!ui.selectedBannerId) return;
    ui.bannerDraft = { ...ui.bannerDraft, [ui.selectedBannerId]: null };
    ui.selectedBannerId = null;
  }
  function resetBanners() {
    ui.bannerDraft = {};
    ui.selectedBannerId = null;
  }
  async function endMain() {
    resetTool();
    await session.perform({ type: "end_main_phase" });
  }
  async function endTurn() {
    await session.perform({ type: "end_turn" });
  }
  const draftChanges = $derived(
    Object.entries(ui.bannerDraft).filter(([b, r]) => gs.banners[b]?.regionId !== r).length,
  );
  const waitingName = $derived(actor ? (gs.players[actor]?.displayName ?? "") : "");
</script>

<div class="actions" role="toolbar" aria-label={t("ui.actions")}>
  {#if !legal || legal.mode === "none"}
    <p class="status">
      {#if gs.status === "finished"}
        {t("status.game_over")}
      {:else if session.curtainFor}
        {t("status.waiting_device", { name: gs.players[session.curtainFor]?.displayName ?? "" })}
      {:else if session.isHuman(actor)}
        <span class="spinner" aria-hidden="true"></span> {t("status.waiting_remote", { name: waitingName })}
      {:else}
        <span class="spinner" aria-hidden="true"></span> {t("status.thinking", { name: waitingName })}
      {/if}
    </p>
  {:else if legal.mode === "setup_manor" || legal.mode === "setup_route"}
    <p class="status">{t(legal.mode === "setup_manor" ? "setup.place_manor" : "setup.place_route", { name: gs.players[legal.playerId]?.displayName ?? "" })}</p>
    <button class="ghost" disabled={!session.canUndo} onclick={() => session.undo()}>↶ {t("action.undo")}</button>
  {:else if legal.mode === "setup_banners" || legal.mode === "banner_assignment"}
    <p class="status">
      {legal.mode === "setup_banners" ? t("setup.assign_banners", { name: gs.players[legal.playerId]?.displayName ?? "" }) : t("phase.banner_assignment")}
      — {hints.hint ? t(hints.hint) : ""}
    </p>
    <button class="ghost" disabled={!ui.selectedBannerId} onclick={sendHome}>⌂ {t("action.send_home")}</button>
    <button class="ghost" disabled={draftChanges === 0} onclick={resetBanners}>{t("action.reset")}</button>
    <button class="primary" onclick={() => legal && confirmBanners(session, legal)}>
      ✓ {t("action.confirm_banners")}{draftChanges ? ` (${draftChanges})` : ""}
    </button>
  {:else if legal.mode === "main"}
    <div class="tools">
      <button class:on={ui.tool === "route"} disabled={legal.routes.length === 0} onclick={() => tool("route")} title={`${t("cost.route")} — ${t("help.route")}`}>
        <span class="i"><ToolIcon name="route" /></span><span class="label">{t("action.build_route")}</span><span class="short" aria-hidden="true">{t("action.short.route")}</span><small>{t("cost.route")}</small>
      </button>
      <button class:on={ui.tool === "manor"} disabled={legal.manorSites.length === 0} onclick={() => tool("manor")} title={`${t("cost.manor")} — ${t("help.manor")}`}>
        <span class="i"><ToolIcon name="manor" /></span><span class="label">{t("action.build_manor")}</span><span class="short" aria-hidden="true">{t("action.short.manor")}</span><small>{t("cost.manor")}</small>
      </button>
      <button class:on={ui.tool === "upgrade"} disabled={legal.upgradeSites.length === 0} onclick={() => tool("upgrade")} title={`${t("cost.stronghold")} — ${t("help.stronghold")}`}>
        <span class="i"><ToolIcon name="stronghold" /></span><span class="label">{t("action.upgrade")}</span><span class="short" aria-hidden="true">{t("action.short.upgrade")}</span><small>{t("cost.stronghold")}</small>
      </button>
      <button disabled={legal.marketTradesLeft === 0 || (legal.marketGive.length === 0 && legal.tradePosts.length === 0)} onclick={() => ((ui.dialog = "market"), resetTool())} title={t("help.market")}>
        <span class="i"><ToolIcon name="market" /></span><span class="label">{t("action.trade")}</span><span class="short" aria-hidden="true">{t("action.short.trade")}</span><small>{t("status.trades_left", { count: legal.marketTradesLeft })}</small>
      </button>
      {#if gs.ruleset.writ.enabled}
        <button class:on={ui.tool === "writ"} disabled={!legal.canIssueWrit} onclick={() => tool("writ")} title={`${t("cost.writ")} — ${t("help.writ")}`}>
          <span class="i"><ToolIcon name="writ" /></span><span class="label">{t("action.royal_writ")}</span><span class="short" aria-hidden="true">{t("action.short.writ")}</span><small>{t("cost.writ")}</small>
        </button>
      {/if}
      {#if gs.ruleset.warden.enabled}
        <button class:on={ui.tool === "warden"} disabled={!legal.canHireWarden} onclick={() => tool("warden")} title={`${t("cost.warden")} — ${t("help.warden")}`}>
          <span class="i"><ToolIcon name="warden" /></span><span class="label">{t("action.warden")}</span><span class="short" aria-hidden="true">{t("action.short.warden")}</span><small>{t("cost.warden")}</small>
        </button>
      {/if}
      {#if gs.ruleset.enableCards}
        <button disabled={!legal.canBuyCard} onclick={() => session.perform({ type: "buy_card" })} title={t("cost.card")}>
          <span class="i"><ToolIcon name="card" /></span><span class="label">{t("action.buy_card")}</span><span class="short" aria-hidden="true">{t("action.short.card")}</span><small>{t("cost.card")}</small>
        </button>
      {/if}
    </div>
    <div class="end">
      <button class="ghost" disabled={!session.canUndo} onclick={() => session.undo()} aria-label={t("action.undo")}>↶ {t("action.undo")}</button>
      <button class="primary" onclick={endMain}>{t("action.end_main")} →</button>
    </div>
  {:else if legal.mode === "end"}
    <p class="status">
      {#if legal.mustDiscard > 0}{t("error.HAND_OVER_LIMIT", { limit: gs.ruleset.handLimit })}{:else}{t("phase.end")}{/if}
    </p>
    <button class="ghost" disabled={!session.canUndo} onclick={() => session.undo()}>↶ {t("action.undo")}</button>
    <button class="primary" disabled={legal.mustDiscard > 0} onclick={endTurn}>{t("action.end_turn")} ⏎</button>
  {:else if legal.mode === "reaction" || legal.mode === "prophecy"}
    <p class="status">{t("status.decision")}</p>
  {/if}
  <!-- Instructions and errors float above the bar so they never change its
       height (and with it the size of the board). -->
  <div class="toasts">
    {#if legal?.mode === "main" && hints.hint && ui.tool !== "none"}
      <p class="hint">{t(hints.hint)} <button class="ghost cancel" onclick={resetTool}>✕ {t("action.cancel")}</button></p>
    {/if}
    {#if legal?.mode === "banner_assignment" && getPlayerBanners(gs, legal.playerId).length === 0}
      <p class="hint">{t("status.no_banners")}</p>
    {/if}
    {#if session.error}<p class="error" role="alert">{session.error}</p>{/if}
  </div>
</div>

<style>
  /* On laptops and tablets one row that never wraps, so the bar keeps its
     height in every phase. GameScreen names the surrounding box `actionbar`;
     the container queries below shorten the tools to fit it and, on phones,
     give them a row of their own. */
  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .tools {
    display: flex;
    gap: 0.4rem;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: thin;
  }
  .tools button {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    column-gap: 0.35rem;
    align-items: center;
    flex: none;
    text-align: left;
    white-space: nowrap;
    min-height: 44px;
    padding: 0.3rem 0.6rem;
  }
  .tools .i {
    grid-row: span 2;
    display: grid;
    align-self: center;
  }
  .tools small {
    font-size: 0.68rem;
    opacity: 0.75;
  }
  .tools .short {
    display: none;
  }
  .tools button.on {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent-dark);
  }
  .end {
    margin-left: auto;
    display: flex;
    gap: 0.4rem;
    align-items: center;
    flex: none;
  }
  .status {
    margin: 0;
    font-weight: 600;
    flex: 1 1 14rem;
  }
  .toasts {
    position: absolute;
    inset: var(--toast-inset, auto auto calc(100% + 0.6rem) 50%);
    translate: var(--toast-shift, -50% 0);
    z-index: 15;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    width: max-content;
    max-width: var(--toast-max, min(36rem, calc(100vw - 1.5rem)));
    pointer-events: none;
  }
  .toasts > p {
    margin: 0;
    padding: 0.4rem 0.9rem;
    background: var(--paper);
    border: 2px solid #8a7650;
    border-radius: 12px;
    box-shadow: 0 6px 18px #0003;
    pointer-events: auto;
  }
  .hint {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.9rem;
    font-style: italic;
  }
  .toasts > .hint:has(.cancel) {
    padding-block: 0.2rem;
    padding-right: 0.25rem;
  }
  .cancel {
    flex: none;
    font-style: normal;
  }
  .error {
    color: #a3190c;
    font-weight: 600;
  }

  /* Laptop widths: the costs move to the tooltip. */
  @container actionbar (max-width: 105rem) {
    .tools small {
      display: none;
    }
  }
  /* Tablets and small laptops: short tool labels. The full label stays in
     the DOM (visually hidden) as the accessible name. */
  @container actionbar (max-width: 90rem) {
    .tools .label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
    .tools .short {
      display: inline;
    }
  }
  /* Small laptops, tablets and phones: tools become icon tiles. */
  @container actionbar (max-width: 68rem) {
    .tools {
      gap: 0.25rem;
    }
    .tools button {
      grid-template-columns: 1fr;
      justify-items: center;
      row-gap: 0.1rem;
      padding: 0.3rem 0.35rem 0.2rem;
      min-width: 44px;
    }
    .tools .i {
      grid-row: auto;
    }
    .tools .short {
      font-size: 0.68rem;
      line-height: 1.1;
    }
  }
  /* Phones and the side rail: the tiles get a row of their own, above the
     status line and the turn buttons. */
  @container actionbar (max-width: 34rem) {
    .actions {
      flex-wrap: wrap;
      gap: 0.4rem;
    }
    .end {
      flex: 1 1 auto;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .status {
      flex-basis: 100%;
      font-size: 0.95rem;
    }
    .tools {
      flex: 1 1 100%;
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(2.8rem, 1fr);
    }
  }
  @container actionbar (max-width: 23rem) {
    .tools button {
      padding-inline: 0.1rem;
    }
    .tools .short {
      font-size: 0.62rem;
    }
  }
  @container actionbar (max-width: 20rem) {
    .tools {
      grid-auto-flow: row;
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
  .spinner {
    display: inline-block;
    width: 0.8em;
    height: 0.8em;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    vertical-align: -0.1em;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
