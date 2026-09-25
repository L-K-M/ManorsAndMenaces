<script lang="ts">
  import {
    RESOURCE_TYPES,
    getPlayerBanners,
    type ActionAvailability,
    type LegalActionSummary,
    type PlayerAction,
    type ResourceCost,
  } from "@manors-menaces/rules";
  import { tick } from "svelte";
  import { hasKey, t } from "../i18n.js";
  import {
    ACTION_LABEL,
    availabilityFor,
    computeHighlights,
    confirmBanners,
    confirmBannersAndEndTurn,
    startAction,
    tradeToAfford,
  } from "../game/interaction.js";
  import { currentActor, type GameSession } from "../game/session.svelte.js";
  import { animationScale } from "../stores/settings.svelte.js";
  import { resetTool, ui } from "../stores/ui.svelte.js";
  import { PLAYER_THEMES, emblemPath } from "../theme.js";
  import ResourceIcon from "./ResourceIcon.svelte";
  import ToolIcon from "./ToolIcon.svelte";

  let { session, legal }: { session: GameSession; legal: LegalActionSummary | null } = $props();

  const gs = $derived(session.draft);
  const actor = $derived(currentActor(gs));
  const hints = $derived(computeHighlights(session, legal));
  const avail = $derived(availabilityFor(session, legal));
  const me = $derived(legal ? gs.players[legal.playerId] : undefined);

  // ------------------------------------------------------------ safe clicks
  // A phase change swaps the buttons under the pointer, so the follow-up
  // clicks of a double or triple click would land on the next phase's button
  // (and could end the turn). Phase buttons stay inert for a moment after
  // every change and ignore the 2nd+ click of a multi-click.
  const ARM_MS = 350;
  const phaseKey = $derived(`${legal?.mode ?? "none"}:${legal?.playerId ?? ""}`);
  let arming = $state(true);
  let bar: HTMLDivElement | undefined = $state();
  // Keyboard activation removes the focused button with the phase, dropping
  // focus to <body>, where a repeated Enter would reach the End Turn shortcut.
  // Focus lands on the button that takes the old one's place instead.
  let refocus = false;
  $effect(() => {
    void phaseKey;
    arming = true;
    const timer = setTimeout(async () => {
      arming = false;
      if (!refocus) return;
      refocus = false;
      await tick();
      const lost = !document.activeElement || document.activeElement === document.body;
      if (lost) bar?.querySelector<HTMLButtonElement>("[data-refocus]:not(:disabled)")?.focus();
    }, ARM_MS);
    return () => clearTimeout(timer);
  });
  const once = (fn: () => unknown) => (e: MouseEvent) => {
    if (e.detail > 1 || arming) return;
    // detail 0: activated by Enter or Space rather than a pointer.
    refocus = e.detail === 0;
    void fn();
  };

  // ------------------------------------------------------------ turn status
  const PHASES = ["harvest", "main", "banner_assignment", "end"] as const;
  const activeTheme = $derived(PLAYER_THEMES[session.seat(gs.activePlayerId)?.color ?? 0] ?? PLAYER_THEMES[0]!);
  const isMyTurn = $derived(gs.activePlayerId === (session.localActor ?? session.viewerId) && !session.curtainFor);
  const phaseIndex = $derived(PHASES.indexOf(gs.phase));

  // ------------------------------------------------------------ main phase tools
  const TOOLS: { action: PlayerAction; icon: "route" | "manor" | "stronghold" | "market" | "writ" | "warden" | "card"; help: string }[] = [
    { action: "route", icon: "route", help: "help.route" },
    { action: "manor", icon: "manor", help: "help.manor" },
    { action: "upgrade", icon: "stronghold", help: "help.stronghold" },
    { action: "market", icon: "market", help: "help.market" },
    { action: "writ", icon: "writ", help: "help.writ" },
    { action: "warden", icon: "warden", help: "help.warden" },
    { action: "card", icon: "card", help: "cost.card" },
  ];
  const shownTools = $derived(TOOLS.filter((x) => avail?.[x.action].reason !== "FEATURE_DISABLED"));

  const costList = (cost: ResourceCost, any = 0): string =>
    [
      ...RESOURCE_TYPES.filter((r) => (cost[r] ?? 0) > 0).map((r) => `${cost[r]} ${t(`resource.${r}`)}`),
      ...(any > 0 ? [t("why.any_resource", { count: any })] : []),
    ].join(", ");

  /** One line on why an action is unavailable, from the rules reason code. */
  function why(action: PlayerAction, a: ActionAvailability): string {
    if (!a.reason) return "";
    if (a.reason === "NEED_RESOURCES") return t("why.NEED_RESOURCES", { list: costList(a.missing ?? {}, a.missingAny ?? 0) });
    const specific = `why.${a.reason}.${action}`;
    return t(hasKey(specific) ? specific : `why.${a.reason}`, { count: gs.ruleset.market.give });
  }
  const toolDetail = (action: PlayerAction, a: ActionAvailability): string =>
    a.ok ? (action === "market" ? t("status.market_trades_left", { count: a.tradesLeft ?? 0 }) : costList(a.cost, a.extraAny)) : why(action, a);

  // ------------------------------------------------------------ quests
  const claimable = $derived(legal?.mode === "main" ? legal.claimableQuests : []);
  /** Quests that were claimable when the player left Main (non-blocking reminder). */
  let questReminder: string[] = $state([]);
  $effect(() => {
    if (legal?.mode !== "banner_assignment") questReminder = [];
  });
  async function claim(questId: string) {
    await session.perform({ type: "claim_quest", questId });
  }
  async function backAndClaim(questId: string) {
    questReminder = [];
    session.undo();
    await claim(questId);
  }

  // ------------------------------------------------------------ phase actions
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
    const reminder = [...claimable];
    resetTool();
    if (await session.perform({ type: "end_main_phase" })) questReminder = reminder;
  }
  async function endTurn() {
    await session.perform({ type: "end_turn" });
  }
  function finishBanners() {
    if (legal?.mode === "banner_assignment") return confirmBannersAndEndTurn(session, legal);
  }
  const draftChanges = $derived(
    Object.entries(ui.bannerDraft).filter(([b, r]) => gs.banners[b]?.regionId !== r).length,
  );
  const waitingName = $derived(actor ? (gs.players[actor]?.displayName ?? "") : "");

  // Enter runs the button marked ⏎ (Banner Assignment and End phase only, so
  // it can never skip the Main phase), unless focus is on another control or
  // a board entity, which handle Enter themselves.
  function keydown(e: KeyboardEvent) {
    if (e.key !== "Enter" || e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (arming || session.busy || ui.dialog || ui.showDebug || document.querySelector("[role=dialog]")) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest?.("button, a, input, select, textarea, [role=button], [role=tab], [contenteditable]")) return;
    if (legal?.mode === "banner_assignment") {
      e.preventDefault();
      void finishBanners();
    } else if (legal?.mode === "end" && legal.mustDiscard === 0) {
      e.preventDefault();
      void endTurn();
    }
  }
</script>

<svelte:window onkeydown={keydown} />

<div class="actions" role="toolbar" aria-label={t("ui.actions")} bind:this={bar} style="--arm-ms: {ARM_MS}ms">
  {#if gs.status !== "finished"}
    <div class="turnline" data-testid="turn-status" style="--pc: {activeTheme.color}; --pd: {activeTheme.dark}; --pl: {activeTheme.light}">
      <span class="who" class:mine={isMyTurn}>
        <svg width="16" height="16" viewBox="-9 -9 18 18" aria-hidden="true"><path d={emblemPath(activeTheme.shape, 7)} fill={activeTheme.color} stroke={activeTheme.dark} stroke-width="1.5" /></svg>
        {isMyTurn ? t("status.your_turn") : t("status.turn_of", { name: gs.players[gs.activePlayerId]?.displayName ?? "" })}
      </span>
      {#if gs.status === "setup"}
        <span class="setup-tag">{t("status.setup")}</span>
      {:else}
        <ol class="stepper" aria-label={t("status.turn_phases")}>
          {#each PHASES as p, i}
            <li class:done={i < phaseIndex} class:now={i === phaseIndex} aria-current={i === phaseIndex ? "step" : undefined} title={t(`phase.${p}`)}>
              {#if i < phaseIndex}<span class="tick" aria-hidden="true">✓</span>{/if}{t(`phase_short.${p}`)}
            </li>
          {/each}
        </ol>
      {/if}
    </div>
  {/if}

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
  {:else if legal.mode === "setup_banners"}
    <p class="status">
      {t("setup.assign_banners", { name: gs.players[legal.playerId]?.displayName ?? "" })}
      — {hints.hint ? t(hints.hint) : ""}
    </p>
    <button class="ghost" disabled={!ui.selectedBannerId} onclick={sendHome}>⌂ {t("action.send_home")}</button>
    <button class="ghost" disabled={draftChanges === 0} onclick={resetBanners}>{t("action.reset")}</button>
    <button class="primary" class:arming disabled={arming} onclick={once(() => legal && confirmBanners(session, legal))}>
      ✓ {t("action.confirm_banners")}{draftChanges ? ` (${draftChanges})` : ""}
    </button>
  {:else if legal.mode === "banner_assignment"}
    <p class="status">
      {t("phase.banner_assignment")} — {hints.hint ? t(hints.hint) : ""}
      <small class="sub">{draftChanges ? t("status.banners_changed", { count: draftChanges }) : t("status.banners_unchanged")}</small>
    </p>
    {#if questReminder.length}
      <p class="notice" role="status">
        <span aria-hidden="true">★</span>
        {t("status.quest_still_claimable", { quest: questReminder.map((q) => t(`quest.${q}.name`)).join(", ") })}
        {#if session.canUndo}<button class="link" onclick={() => backAndClaim(questReminder[0] as string)}>{t("status.back_and_claim")}</button>{/if}
        <button class="link dismiss" aria-label={t("status.dismiss")} onclick={() => (questReminder = [])}>✕</button>
      </p>
    {/if}
    <!-- "Back to actions" takes the spot of "Assign Banners →" and End Turn
         sits apart from it, so re-clicking that spot can never end the turn. -->
    <div class="end">
      <button class="ghost" disabled={!ui.selectedBannerId} onclick={sendHome}>⌂ {t("action.send_home")}</button>
      <button class="ghost" disabled={draftChanges === 0} onclick={resetBanners}>{t("action.reset")}</button>
      <button class="primary" class:arming disabled={arming} onclick={once(finishBanners)}>
        {draftChanges ? `✓ ${t("action.confirm_end_turn")}` : t("action.end_turn_keep")}<kbd aria-hidden="true">⏎</kbd>
      </button>
      <button class="ghost" class:arming disabled={arming || !session.canUndo} onclick={once(() => session.undo())} data-refocus>← {t("action.back_to_main")}</button>
    </div>
  {:else if legal.mode === "main" && avail}
    <div class="tools">
      {#each shownTools as tool (tool.action)}
        {@const a = avail[tool.action]}
        {@const detail = toolDetail(tool.action, a)}
        <div class="tool" class:fixable={!!a.fixByTrade}>
          <button
            class:on={ui.tool === tool.action}
            class:short={a.reason === "NEED_RESOURCES"}
            disabled={!a.ok}
            onclick={() => startAction(session, tool.action)}
            title={`${detail} — ${t(tool.help)}`}
          >
            <span class="i"><ToolIcon name={tool.icon} /></span>
            <span class="label">{t(ACTION_LABEL[tool.action])}</span>
            {#if tool.action !== "market" && (a.ok || a.reason === "NEED_RESOURCES")}
              <span class="chips" aria-hidden="true">
                {#each RESOURCE_TYPES.filter((r) => (a.cost[r] ?? 0) > 0) as r}
                  {@const have = me?.resources[r] ?? 0}
                  {@const need = a.cost[r] ?? 0}
                  <span class="chip" class:lack={have < need}><ResourceIcon resource={r} size={14} label={false} />{have}/{need}</span>
                {/each}
                {#if a.extraAny}<span class="chip any" class:lack={(a.missingAny ?? 0) > 0}>+{a.extraAny} {t("ui.any_resource")}</span>{/if}
              </span>
              <span class="sr">{detail}</span>
            {:else}
              <small class="why">{detail}</small>
            {/if}
          </button>
          {#if a.fixByTrade}
            <button class="fix" onclick={() => tradeToAfford(tool.action)} title={t("action.trade_to_afford_help", { action: t(ACTION_LABEL[tool.action]) })} aria-label={t("action.trade_to_afford_help", { action: t(ACTION_LABEL[tool.action]) })}>
              <span aria-hidden="true">⇄</span><small aria-hidden="true">{t("action.trade_short")}</small>
            </button>
          {/if}
        </div>
      {/each}
    </div>
    <div class="end">
      {#if hints.hint && ui.tool !== "none"}<p class="hint">{t(hints.hint)} <button class="link" onclick={resetTool}>{t("action.cancel")}</button></p>{/if}
      {#each claimable as q (q)}
        <button class="claim" class:glow={animationScale() > 0} onclick={() => claim(q)}>
          <span aria-hidden="true">★</span> {t("action.claim_quest", { quest: t(`quest.${q}.name`) })} <small>+{session.ctx.quest(q).renown} ♛</small>
        </button>
      {/each}
      <button class="ghost" disabled={!session.canUndo} onclick={() => session.undo()} aria-label={t("action.undo")}>↶ {t("action.undo")}</button>
      <button class="primary" class:arming disabled={arming} onclick={once(endMain)} data-refocus>{t("action.end_main")} →</button>
    </div>
  {:else if legal.mode === "end"}
    <p class="status">
      {#if legal.mustDiscard > 0}{t("error.HAND_OVER_LIMIT", { limit: gs.ruleset.handLimit })}{:else}{t("phase.end")}{/if}
    </p>
    <div class="end">
      <button class="ghost" class:arming disabled={arming || !session.canUndo} onclick={once(() => session.undo())}>↶ {t("action.undo")}</button>
      <button class="primary" class:arming disabled={arming || legal.mustDiscard > 0} onclick={once(endTurn)}>{t("action.end_turn")}<kbd aria-hidden="true">⏎</kbd></button>
    </div>
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

  /* ---------------------------------------------------------- turn status */
  .turnline {
    flex: 0 1 auto;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem 0.6rem;
    font-size: 0.78rem;
    line-height: 1.2;
  }
  .who {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.12rem 0.55rem 0.12rem 0.3rem;
    border-radius: 999px;
    border: 1.5px solid var(--pc);
    background: #fffdf6;
    font-weight: 700;
    color: var(--pd);
  }
  .who.mine {
    background: var(--pl);
  }
  .setup-tag {
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    opacity: 0.75;
  }
  .stepper {
    display: flex;
    align-items: center;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .stepper li {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
    color: #6b5a3e;
  }
  .stepper li + li {
    margin-left: 0.8rem;
  }
  .stepper li + li::before {
    content: "›" / "";
    position: absolute;
    left: -0.6rem;
    width: 0.4rem;
    text-align: center;
    color: #a8987a;
    font-weight: 400;
  }
  .stepper li.done {
    color: #5c7a52;
  }
  .stepper li.now {
    /* The dark shade keeps white text readable for every player colour. */
    background: var(--pd);
    color: #fff;
    font-weight: 700;
  }
  .tick {
    font-size: 0.7rem;
  }

  /* ---------------------------------------------------------- tools */
  .tools {
    /* Tools first, so the turn status shares a row with the phase buttons. */
    order: -1;
    flex: 1 1 100%;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .tool {
    display: flex;
    align-items: stretch;
  }
  .tools button:not(.fix) {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    column-gap: 0.35rem;
    row-gap: 0.1rem;
    text-align: left;
    min-height: 44px;
    padding: 0.3rem 0.6rem;
  }
  .tool.fixable button:not(.fix) {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  .tools .i {
    grid-row: span 2;
    display: grid;
    align-self: center;
  }
  .tools button:disabled {
    opacity: 1;
    background: #f6eedb;
    border-color: #c9b995;
    color: #8a7a5c;
  }
  .tools button:disabled .i {
    opacity: 0.5;
  }
  .tools button.on {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent-dark);
  }
  /* A tool that is still armed but no longer available must not look active. */
  .tools button.on:disabled {
    background: #f6eedb;
    border-color: #c9b995;
    color: #8a7a5c;
  }
  .why {
    font-size: 0.7rem;
    font-style: italic;
    color: #7a5a2e;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
    padding: 0 0.3rem 0 0.1rem;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    background: #e3f0dc;
    color: #1f5a2a;
  }
  .chip.any {
    padding-left: 0.3rem;
    font-weight: 600;
  }
  .chip.lack {
    background: #fbe0dc;
    color: #a3190c;
  }
  .tools button.on .chip {
    background: #ffffff2e;
    color: #fff;
  }
  .fix {
    display: grid;
    place-content: center;
    justify-items: center;
    line-height: 1;
    min-height: 44px;
    min-width: 44px;
    padding: 0 0.4rem;
    margin-left: -2px;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    border-color: var(--accent);
    background: #eaf3e6;
    color: var(--accent-dark);
    font-size: 1.1rem;
    font-weight: 700;
  }
  .fix small {
    margin-top: 0.15rem;
    font-size: 0.6rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .fix:hover {
    background: #d6ead0 !important;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* ---------------------------------------------------------- phase controls */
  .end {
    margin-left: auto;
    display: flex;
    gap: 0.4rem;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .status {
    margin: 0;
    font-weight: 600;
    flex: 1 1 14rem;
  }
  .sub {
    display: block;
    font-weight: 400;
    font-size: 0.8rem;
    opacity: 0.8;
  }
  .notice {
    margin: 0;
    flex: 1 1 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.2rem 0.5rem;
    padding: 0.3rem 0.4rem 0.3rem 0.6rem;
    border-radius: 8px;
    background: #fff3c4;
    border: 1.5px solid #d19a12;
    font-size: 0.85rem;
    font-weight: 600;
    color: #5a4200;
  }
  .notice .dismiss {
    margin-left: auto;
    text-decoration: none;
    min-width: 32px;
    min-height: 32px;
  }
  .claim {
    border-color: #b8860b;
    background: linear-gradient(#fff6d8, #f7e3a2);
    color: #5a4200;
    font-weight: 700;
  }
  /* Off with reduced motion or animations disabled (see animationScale). */
  .claim.glow {
    animation: glow 1.8s ease-in-out infinite;
  }
  .claim:hover:not(:disabled) {
    background: #ffeeb8;
  }
  .claim small {
    color: #8a6400;
  }
  @keyframes glow {
    50% {
      box-shadow: 0 0 0 4px #f2c94c66;
    }
  }
  button.arming {
    animation: arm var(--arm-ms) ease-out;
  }
  button.arming:disabled {
    cursor: default;
  }
  button.primary.arming:disabled {
    opacity: 1;
  }
  @keyframes arm {
    from {
      opacity: 0.35;
    }
    to {
      opacity: 1;
    }
  }
  kbd {
    margin-left: 0.45rem;
    padding: 0 0.3rem;
    border: 1px solid #ffffff80;
    border-radius: 4px;
    font: inherit;
    font-size: 0.8em;
    opacity: 0.85;
  }
  @media (hover: none) {
    kbd {
      display: none;
    }
  }
  @media (max-width: 900px) {
    /* The dock scrolls at this width (GameScreen): keep the phase buttons in
       view at its bottom edge instead of below the fold. */
    .end {
      position: sticky;
      bottom: 0;
      z-index: 1;
      flex: 1 1 100%;
      padding: 0.3rem 0;
      background: var(--parchment);
      box-shadow: 0 -8px 8px -8px #5a3e2280;
    }
  }
  @media (max-width: 600px) {
    /* Two even columns keep the phone action sheet short. */
    .tools {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      width: 100%;
    }
    .tool > button:first-child {
      flex: 1;
      min-width: 0;
    }
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
