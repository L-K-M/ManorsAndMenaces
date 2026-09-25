<script lang="ts">
  import { getPlayerBanners, type LegalActionSummary } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import { confirmBanners, type Highlights } from "../game/interaction.js";
  import { currentActor, type GameSession } from "../game/session.svelte.js";
  import { resetTool, ui, type Tool } from "../stores/ui.svelte.js";
  import ToolIcon from "./ToolIcon.svelte";

  let { session, legal, hints }: { session: GameSession; legal: LegalActionSummary | null; hints: Highlights } = $props();

  const gs = $derived(session.draft);
  const actor = $derived(currentActor(gs));

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
        <span class="i"><ToolIcon name="route" /></span>{t("action.build_route")}<small>{t("cost.route")}</small>
      </button>
      <button class:on={ui.tool === "manor"} disabled={legal.manorSites.length === 0} onclick={() => tool("manor")} title={`${t("cost.manor")} — ${t("help.manor")}`}>
        <span class="i"><ToolIcon name="manor" /></span>{t("action.build_manor")}<small>{t("cost.manor")}</small>
      </button>
      <button class:on={ui.tool === "upgrade"} disabled={legal.upgradeSites.length === 0} onclick={() => tool("upgrade")} title={`${t("cost.stronghold")} — ${t("help.stronghold")}`}>
        <span class="i"><ToolIcon name="stronghold" /></span>{t("action.upgrade")}<small>{t("cost.stronghold")}</small>
      </button>
      <button disabled={legal.marketTradesLeft === 0 || (legal.marketGive.length === 0 && legal.tradePosts.length === 0)} onclick={() => ((ui.dialog = "market"), resetTool())} title={t("help.market", { give: gs.ruleset.market.give, receive: gs.ruleset.market.receive, limit: gs.ruleset.market.maxTradesPerTurn })}>
        <span class="i"><ToolIcon name="market" /></span>{t("action.trade")}<small>{t("status.trades_left", { count: legal.marketTradesLeft })}</small>
      </button>
      {#if gs.ruleset.writ.enabled}
        <button class:on={ui.tool === "writ"} disabled={!legal.canIssueWrit} onclick={() => tool("writ")} title={`${t("cost.writ")} — ${t("help.writ")}`}>
          <span class="i"><ToolIcon name="writ" /></span>{t("action.royal_writ")}<small>{t("cost.writ")}</small>
        </button>
      {/if}
      {#if gs.ruleset.warden.enabled}
        <button class:on={ui.tool === "warden"} disabled={!legal.canHireWarden} onclick={() => tool("warden")} title={`${t("cost.warden")} — ${t("help.warden")}`}>
          <span class="i"><ToolIcon name="warden" /></span>{t("action.warden")}<small>{t("cost.warden")}</small>
        </button>
      {/if}
      {#if gs.ruleset.enableCards}
        <button disabled={!legal.canBuyCard} onclick={() => session.perform({ type: "buy_card" })} title={t("cost.card")}>
          <span class="i"><ToolIcon name="card" /></span>{t("action.buy_card")}<small>{t("cost.card")}</small>
        </button>
      {/if}
    </div>
    <div class="end">
      {#if hints.hint && ui.tool !== "none"}<p class="hint">{t(hints.hint)} <button class="link" onclick={resetTool}>{t("action.cancel")}</button></p>{/if}
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
  {#if session.error}<p class="error" role="alert">{session.error}</p>{/if}
  {#if legal?.mode === "banner_assignment" && getPlayerBanners(gs, legal.playerId).length === 0}
    <p class="hint">{t("status.no_banners")}</p>
  {/if}
</div>

<style>
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .tools button {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    column-gap: 0.35rem;
    text-align: left;
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
    flex-wrap: wrap;
  }
  .status {
    margin: 0;
    font-weight: 600;
    flex: 1 1 14rem;
  }
  .hint {
    margin: 0;
    font-size: 0.85rem;
    font-style: italic;
  }
  .error {
    margin: 0;
    color: #a3190c;
    font-weight: 600;
    width: 100%;
  }
  .link {
    background: none;
    border: none;
    text-decoration: underline;
    padding: 0;
    min-height: 0;
    color: inherit;
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
