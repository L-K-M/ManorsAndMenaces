<script lang="ts">
  import { BALANCE, RESOURCE_TYPES, cardDefIdOf, type LegalActionSummary, type ResourceType } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import { finishCardWith } from "../game/interaction.js";
  import { regionName } from "../game/log.js";
  import type { GameSession } from "../game/session.svelte.js";
  import { resetTool, ui } from "../stores/ui.svelte.js";
  import Modal from "./Modal.svelte";
  import ResourceIcon from "./ResourceIcon.svelte";

  let { session, legal }: { session: GameSession; legal: LegalActionSummary | null } = $props();
  const gs = $derived(session.draft);
  const me = $derived(legal ? gs.players[legal.playerId] : undefined);

  // ---------------------------------------------------------------- market
  let give: ResourceType | null = $state(null);
  let via: string | null = $state(null); // trade post site id, or null for the Market
  const giveOptions = $derived.by(() => {
    if (!legal) return [] as { resource: ResourceType; amount: number; via: string | null }[];
    const out = legal.marketGive.map((r) => ({ resource: r, amount: gs.ruleset.market.give, via: null as string | null }));
    for (const p of legal.tradePosts) out.push({ resource: p.resource, amount: p.give, via: p.siteId });
    return out;
  });
  async function trade(receive: ResourceType) {
    if (!give) return;
    const ok = await session.perform({ type: "trade", give, receive, ...(via ? { tradePostSiteId: via } : {}) });
    if (ok) {
      give = null;
      via = null;
      if ((legal?.marketTradesLeft ?? 1) <= 1) ui.dialog = null;
    }
  }

  // ---------------------------------------------------------------- writ
  const writBanner = $derived(ui.writTargetId ? gs.banners[ui.writTargetId] : undefined);
  const canBribe = (r: ResourceType) => !!me && me.resources[r] >= (r === "essence" ? BALANCE.costs.royalWrit.essence + 1 : 1);
  async function issueWrit(bribe: ResourceType) {
    if (!ui.writTargetId) return;
    const target = ui.writTargetId;
    ui.dialog = null;
    resetTool();
    await session.perform({ type: "issue_royal_writ", targetBannerId: target, bribe });
  }

  // ---------------------------------------------------------------- arcane / festival
  let arcaneGive: ResourceType | null = $state(null);

  // ---------------------------------------------------------------- prophecy
  let order: string[] = $state([]);
  $effect(() => {
    if (gs.pending?.kind === "prophecy" && legal?.mode === "prophecy") order = [...gs.pending.cardIds];
  });
  function move(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j] as string, next[i] as string];
    order = next;
  }

  const pendingReaction = $derived(gs.pending?.kind === "reaction" ? gs.pending : null);
  function describeTarget(): string {
    const p = pendingReaction;
    if (!p) return "";
    const tg = p.target;
    switch (tg.effect) {
      case "wizard_interference":
        return `${gs.players[gs.banners[tg.bannerId]?.ownerId ?? ""]?.displayName}'s Banner → ${regionName(session.map, tg.regionId)}`;
      case "fog_of_confusion":
        return `a Route ${gs.routeOwners[tg.routeId] ? `of ${gs.players[gs.routeOwners[tg.routeId] ?? ""]?.displayName}` : ""}`;
      default:
        return "";
    }
  }
  const close = () => {
    ui.dialog = null;
    give = null;
    via = null;
  };
</script>

{#if ui.dialog === "market" && legal?.mode === "main"}
  <Modal title={t("action.trade")} onclose={close}>
    <p class="help">{t("help.market", { give: gs.ruleset.market.give, receive: gs.ruleset.market.receive, limit: gs.ruleset.market.maxTradesPerTurn })} {t("status.trades_left", { count: legal.marketTradesLeft })}.</p>
    <h4>{t("ui.give")}</h4>
    <div class="grid">
      {#each giveOptions as o}
        <button class:on={give === o.resource && via === o.via} onclick={() => ((give = o.resource), (via = o.via))}>
          {o.amount}× <ResourceIcon resource={o.resource} /> {t(`resource.${o.resource}`)}{o.via ? " (Trading Post)" : ""}
        </button>
      {/each}
      {#if giveOptions.length === 0}<p>{t("ui.you_need_3_of_one")}</p>{/if}
    </div>
    {#if give}
      <h4>{t("ui.receive_1")}</h4>
      <div class="grid">
        {#each RESOURCE_TYPES.filter((r) => r !== give) as r}
          <button onclick={() => trade(r)}><ResourceIcon resource={r} /> {t(`resource.${r}`)}</button>
        {/each}
      </div>
    {/if}
  </Modal>
{/if}

{#if ui.dialog === "writ" && writBanner}
  <Modal title={t("action.royal_writ")} onclose={() => ((ui.dialog = null), (ui.writTargetId = null))}>
    <p class="help">
      Send {gs.players[writBanner.ownerId]?.displayName}'s Banner in <b>{regionName(session.map, writBanner.regionId)}</b> home.
      You pay 1 Essence to the Crown and a bribe of 1 resource to {gs.players[writBanner.ownerId]?.displayName}.
    </p>
    <h4>{t("ui.choose_the_bribe")}</h4>
    <div class="grid">
      {#each RESOURCE_TYPES as r}
        <button disabled={!canBribe(r)} onclick={() => issueWrit(r)}><ResourceIcon resource={r} /> {t(`resource.${r}`)}</button>
      {/each}
    </div>
  </Modal>
{/if}

{#if ui.dialog === "arcane"}
  <Modal title={t("card.arcane_exchange.name")} onclose={() => ((ui.dialog = null), resetTool())}>
    <p class="help">{t("card.arcane_exchange.rules")}</p>
    <h4>{t("ui.give_1")}</h4>
    <div class="grid">
      {#each RESOURCE_TYPES as r}
        <button class:on={arcaneGive === r} disabled={(me?.resources[r] ?? 0) < 1} onclick={() => (arcaneGive = r)}><ResourceIcon resource={r} /> {t(`resource.${r}`)}</button>
      {/each}
    </div>
    {#if arcaneGive}
      <h4>{t("ui.receive_1")}</h4>
      <div class="grid">
        {#each RESOURCE_TYPES.filter((r) => r !== arcaneGive && (r === "essence" || arcaneGive === "essence")) as r}
          <button onclick={() => finishCardWith(session, { give: arcaneGive, receive: r }).then(() => (arcaneGive = null))}><ResourceIcon resource={r} /> {t(`resource.${r}`)}</button>
        {/each}
      </div>
    {/if}
  </Modal>
{/if}

{#if ui.dialog === "festival"}
  <Modal title={t("card.festival_at_the_inn.name")} onclose={() => ((ui.dialog = null), resetTool())}>
    <p class="help">{t("card.festival_at_the_inn.rules")}</p>
    <div class="grid">
      {#each RESOURCE_TYPES as r}
        <button onclick={() => finishCardWith(session, { choice: r })}><ResourceIcon resource={r} /> {t(`resource.${r}`)}</button>
      {/each}
    </div>
  </Modal>
{/if}

{#if legal?.mode === "reaction" && pendingReaction}
  <Modal title={t("ui.counterspell")}>
    <p class="help">
      {gs.players[pendingReaction.sourcePlayerId]?.displayName} plays
      <b>{t(`card.${cardDefIdOf(pendingReaction.cardId)}.name`)}</b>{describeTarget() ? ` on ${describeTarget()}` : ""}.
    </p>
    <div class="grid">
      {#each legal.reactionCards as c}
        <button class="primary" onclick={() => session.perform({ type: "react", cardId: c })}>{t(`card.${cardDefIdOf(c)}.name`)}</button>
      {/each}
      <button onclick={() => session.perform({ type: "pass_reaction" })}>{t("action.pass")}</button>
    </div>
  </Modal>
{/if}

{#if legal?.mode === "prophecy"}
  <Modal title={t("card.very_minor_prophecy.name")}>
    <p class="help">{t("ui.the_top_of_the_draw")}</p>
    <ol class="order">
      {#each order as c, i (c)}
        <li>
          <span>{t(`card.${cardDefIdOf(c)}.name`)}</span>
          <button aria-label={t("ui.move_up")} disabled={i === 0} onclick={() => move(i, -1)}>↑</button>
          <button aria-label={t("ui.move_down")} disabled={i === order.length - 1} onclick={() => move(i, 1)}>↓</button>
        </li>
      {/each}
    </ol>
    <button class="primary" onclick={() => session.perform({ type: "resolve_prophecy", order })}>{t("action.confirm")}</button>
  </Modal>
{/if}

<style>
  .help {
    font-size: 0.9rem;
  }
  h4 {
    margin: 0.6rem 0 0.3rem;
  }
  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .grid button {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .grid button.on {
    background: var(--accent);
    color: #fff;
  }
  .order {
    padding-left: 1.2rem;
  }
  .order li {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    margin-bottom: 0.3rem;
  }
  .order span {
    flex: 1;
  }
</style>
