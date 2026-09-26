<script lang="ts">
  import { tick } from "svelte";
  import {
    BALANCE,
    RESOURCE_TYPES,
    cardDefIdOf,
    getRenown,
    insurancePolicyOf,
    menaceOfType,
    rankPlayers,
    type CardTarget,
    type LegalActionSummary,
    type PlayerId,
    type ResourceType,
  } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import {
    ACTION_LABEL,
    availabilityFor,
    backCardStep,
    cardCandidates,
    currentCardStep,
    finishCardWith,
    landingRisks,
    legalFor,
    pendingCardTarget,
    plagueVictims,
    playPickedCard,
    robinPayers,
    startAction,
  } from "../game/interaction.js";
  import { gainsText, listText, siteName } from "../game/feed.js";
  import { regionName } from "../game/log.js";
  import type { GameSession } from "../game/session.svelte.js";
  import { isCardDialog, resetTool, ui, valueKey } from "../stores/ui.svelte.js";
  import Modal from "./Modal.svelte";
  import ResourceIcon from "./ResourceIcon.svelte";
  import ToolIcon from "./ToolIcon.svelte";

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
  // "Trade to afford": the next trade that makes the goal action affordable.
  const goal = $derived(ui.dialog === "market" && ui.marketGoal ? ui.marketGoal : null);
  const goalAvailability = $derived(goal ? availabilityFor(session, legal)?.[goal] : undefined);
  const suggestion = $derived(goalAvailability?.fixByTrade?.[0] ?? null);
  function preselect() {
    if (!suggestion) return;
    give = suggestion.give;
    via = suggestion.tradePostSiteId ?? null;
  }
  $effect(preselect);
  async function trade(receive: ResourceType) {
    if (!give || !legal) return;
    // Read before trading: `legal` is recomputed as soon as the trade applies.
    const leftBefore = legal.marketTradesLeft;
    const target = goal;
    const ok = await session.perform({ type: "trade", give, receive, ...(via ? { tradePostSiteId: via } : {}) });
    if (!ok) return;
    give = null;
    via = null;
    if (target && availabilityFor(session, legalFor(session))?.[target].ok) {
      // The goal is affordable now: close and get on with it (a card is not bought unasked).
      close();
      if (target !== "card" && target !== "market") await startAction(session, target);
      return;
    }
    if (leftBefore <= 1) close();
    else preselect();
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

  // ---------------------------------------------------------------- card dialogs
  // Each offers exactly the options enumerateCardTargets leaves for its step.
  const cardStep = $derived(ui.cardId && isCardDialog(ui.dialog) ? currentCardStep(session) : null);
  const cardEffect = $derived(ui.cardId ? session.ctx.cardOf(ui.cardId).effectId : null);
  const cardTitle = $derived(ui.cardId ? t(`card.${cardDefIdOf(ui.cardId)}.name`) : "");
  const cardRules = $derived(ui.cardId ? t(`card.${cardDefIdOf(ui.cardId)}.rules`) : "");
  // The resource and hoard dialogs offer resources, the player dialog players.
  const resourceOptions = $derived((cardStep?.options ?? []) as ResourceType[]);
  const pick = (value: unknown) => cardStep && finishCardWith(session, { [cardStep.field]: value });
  const nameOf = (id: PlayerId) => (id === legal?.playerId ? t("target.you") : (gs.players[id]?.displayName ?? ""));
  const policyName = $derived(t("card.royal_insurance_policy.name"));

  // Arcane Exchange and Transmutation Magic: pick what to give, then what to receive.
  let arcaneGive: ResourceType | null = $state(null);
  let transmuteGive: string | null = $state(null);
  $effect(() => {
    if (ui.dialog !== "arcane") arcaneGive = null;
    if (ui.dialog !== "transmutation") transmuteGive = null;
  });
  type Transmutation = Extract<CardTarget, { effect: "transmutation_magic" }>;
  const transmutations = $derived(
    ui.dialog === "transmutation" ? cardCandidates(session).filter((c): c is Transmutation => c.effect === "transmutation_magic") : [],
  );
  const transmuteGives = $derived([...new Map(transmutations.map((c) => [valueKey(c.give), c.give])).entries()]);
  // Up to ten pairs each way: on a short screen the second list starts below the fold.
  let transmuteReceive: HTMLElement | undefined = $state();
  async function chooseTransmuteGive(key: string) {
    transmuteGive = key;
    await tick();
    transmuteReceive?.scrollIntoView({ block: "nearest" });
  }

  const hoard = $derived(menaceOfType(gs, "young_dragon")?.state.hoard ?? {});

  // Confirmation: what the card will do, spelled out before it is played.
  const confirmTarget = $derived(ui.dialog === "card_confirm" ? pendingCardTarget(session) : undefined);

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
      case "changeling":
        return t("tip.spell_target_hand", { owner: gs.players[tg.opponentId]?.displayName ?? "" });
      case "fire_bolt":
        return t("tip.spell_target_route", { owner: gs.players[gs.routeOwners[tg.routeId] ?? ""]?.displayName ?? "" });
      case "the_plague":
        return t("tip.spell_target_plague", { place: siteName(session.map, tg.siteId) });
      case "wizard_interference":
        return t("tip.spell_target_banner", {
          owner: gs.players[gs.banners[tg.bannerId]?.ownerId ?? ""]?.displayName ?? "",
          region: regionName(session.map, tg.regionId),
        });
      case "fog_of_confusion": {
        const routeOwner = gs.routeOwners[tg.routeId];
        return routeOwner
          ? t("tip.spell_target_route", { owner: gs.players[routeOwner]?.displayName ?? "" })
          : t("tip.spell_target_route_unowned");
      }
      default:
        return "";
    }
  }
  /** What the Spell would do, when its target alone does not say. */
  function describeOutcome(): string {
    const p = pendingReaction;
    if (!p) return "";
    const tg = p.target;
    switch (tg.effect) {
      case "ragnarok": {
        const winner = rankPlayers(session.ctx, gs, gs.turnOrder)[0];
        if (winner === legal?.playerId) return t("tip.spell_ragnarok_you");
        return t("tip.spell_ragnarok", { name: gs.players[winner ?? ""]?.displayName ?? "" });
      }
      case "transmutation_magic": {
        const count = (rs: ResourceType[]) => gainsText(Object.fromEntries(RESOURCE_TYPES.map((r) => [r, rs.filter((x) => x === r).length])));
        return t("tip.spell_exchange", { name: gs.players[p.sourcePlayerId]?.displayName ?? "", give: count(tg.give), receive: count(tg.receive) });
      }
      case "the_plague": {
        const hit = plagueVictims(session.ctx, gs, tg.siteId).filter((v) => !v.insured);
        return hit.length ? t("tip.spell_plague_victims", { names: listText(hit.map((v) => gs.players[v.ownerId]?.displayName ?? "")) }) : "";
      }
      default:
        return "";
    }
  }
  const close = () => {
    ui.dialog = null;
    ui.marketGoal = null;
    give = null;
    via = null;
  };
</script>

{#if ui.dialog === "market" && legal?.mode === "main"}
  <Modal title={t("action.trade")} onclose={close}>
    <p class="help">{t("help.market", { give: gs.ruleset.market.give, receive: gs.ruleset.market.receive, limit: gs.ruleset.market.maxTradesPerTurn })} <b class="left">{t("status.trades_left", { count: legal.marketTradesLeft })}</b></p>
    {#if goal && suggestion}
      <p class="goal">
        {t("ui.market_goal", {
          action: t(ACTION_LABEL[goal]),
          give: `${giveOptions.find((o) => o.resource === suggestion.give && o.via === (suggestion.tradePostSiteId ?? null))?.amount ?? gs.ruleset.market.give} ${t(`resource.${suggestion.give}`)}`,
          receive: t(`resource.${suggestion.receive}`),
        })}
      </p>
    {/if}
    <h4>{t("ui.give")}</h4>
    <div class="grid">
      {#each giveOptions as o}
        <button class:on={give === o.resource && via === o.via} onclick={() => ((give = o.resource), (via = o.via))}>
          {o.amount}× <ResourceIcon resource={o.resource} /> {t(`resource.${o.resource}`)}{o.via ? ` (${t("ui.trading_post")})` : ""}
          <small class="have">{t("ui.you_have", { count: me?.resources[o.resource] ?? 0 })}</small>
        </button>
      {/each}
      {#if giveOptions.length === 0}<p>{t("ui.you_need_3_of_one", { give: gs.ruleset.market.give })}</p>{/if}
    </div>
    {#if give}
      <h4>{t("ui.receive_1")}</h4>
      <div class="grid">
        {#each RESOURCE_TYPES.filter((r) => r !== give) as r}
          {@const suggested = !!suggestion && suggestion.give === give && (suggestion.tradePostSiteId ?? null) === via && suggestion.receive === r}
          <button class:suggested onclick={() => trade(r)}>
            <ResourceIcon resource={r} /> {t(`resource.${r}`)}{#if suggested}<small class="have">{t("ui.suggested")}</small>{/if}
          </button>
        {/each}
      </div>
    {/if}
  </Modal>
{/if}

{#if ui.dialog === "writ" && writBanner}
  <Modal title={t("action.royal_writ")} onclose={() => ((ui.dialog = null), (ui.writTargetId = null))}>
    <p class="help">
      {t("writ.help", {
        owner: gs.players[writBanner.ownerId]?.displayName ?? "",
        region: regionName(session.map, writBanner.regionId),
      })}
    </p>
    <h4>{t("ui.choose_the_bribe")}</h4>
    <div class="grid">
      {#each RESOURCE_TYPES as r}
        <button disabled={!canBribe(r)} onclick={() => issueWrit(r)}><ResourceIcon resource={r} /> {t(`resource.${r}`)}</button>
      {/each}
    </div>
  </Modal>
{/if}

{#snippet resourcePair(pair: [ResourceType, ResourceType])}
  {#if pair[0] === pair[1]}
    2× <ResourceIcon resource={pair[0]} label={false} /> {t(`resource.${pair[0]}`)}
  {:else}
    <ResourceIcon resource={pair[0]} label={false} /> {t(`resource.${pair[0]}`)} + <ResourceIcon resource={pair[1]} label={false} /> {t(`resource.${pair[1]}`)}
  {/if}
{/snippet}

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

{#if ui.dialog === "transmutation" && cardStep}
  <Modal title={cardTitle} onclose={resetTool} wide>
    <p class="help">{cardRules}</p>
    <h4>{t("target.give_2")}</h4>
    <div class="grid">
      {#each transmuteGives as [key, pair] (key)}
        <button class:on={transmuteGive === key} aria-pressed={transmuteGive === key} onclick={() => chooseTransmuteGive(key)}>{@render resourcePair(pair)}</button>
      {/each}
    </div>
    {#if transmuteGive}
      <h4>{t("target.receive_2")}</h4>
      <div class="grid" bind:this={transmuteReceive}>
        {#each transmutations.filter((c) => valueKey(c.give) === transmuteGive) as c (valueKey(c.receive))}
          <button onclick={() => finishCardWith(session, { give: c.give, receive: c.receive })}>{@render resourcePair(c.receive)}</button>
        {/each}
      </div>
    {/if}
  </Modal>
{/if}

<!-- Festival at the Inn and Robin of the Glade: name a resource. -->
{#if ui.dialog === "resource" && cardStep && legal}
  <Modal title={cardTitle} onclose={resetTool}>
    <p class="help">{cardRules}</p>
    <div class="grid">
      {#each resourceOptions as r (r)}
        {@const payers = cardEffect === "robin_of_the_glade" ? robinPayers(session.ctx, gs, legal.playerId, r) : []}
        <button onclick={() => pick(r)}>
          <ResourceIcon resource={r} label={false} /> {t(`resource.${r}`)}
          {#if payers.length}<small class="have">{t("target.paid_by", { names: listText(payers.map(nameOf)) })}</small>{/if}
        </button>
      {/each}
    </div>
  </Modal>
{/if}

<!-- Dragon Whisperer and Treasure Hunter: take from the Young Dragon's Hoard. -->
{#if ui.dialog === "hoard" && cardStep}
  <Modal title={cardTitle} onclose={resetTool}>
    <p class="help">
      {cardEffect === "treasure_hunter" ? t("target.hoard_take_up_to", { count: BALANCE.treasureHunter.take }) : t("ui.choose_hoard_take")}
    </p>
    <div class="grid">
      {#each resourceOptions as r (r)}
        {@const n = hoard[r] ?? 0}
        <button onclick={() => pick(r)}>
          <ResourceIcon resource={r} label={false} /> {t(`resource.${r}`)} ×{n}
          {#if cardEffect === "treasure_hunter"}<small class="have">{t("target.you_take", { count: Math.min(BALANCE.treasureHunter.take, n) })}</small>{/if}
        </button>
      {/each}
    </div>
  </Modal>
{/if}

<!-- Changeling: an opponent to swap hands with. -->
{#if ui.dialog === "player" && cardStep && legal}
  {@const opponents = gs.turnOrder.filter((id) => id !== legal.playerId)}
  <Modal title={cardTitle} onclose={resetTool}>
    <p class="help">{cardRules}</p>
    <div class="grid">
      {#each opponents as id (id)}
        {@const insured = !!insurancePolicyOf(session.ctx, gs, id)}
        <button disabled={!cardStep.options.includes(id)} onclick={() => pick(id)}>
          {gs.players[id]?.displayName ?? ""}
          <small class="have">{t("ui.cards_count", { count: gs.players[id]?.hand.length ?? 0 })}{#if insured}, {t("target.insured")}{/if}</small>
        </button>
      {/each}
    </div>
    {#if opponents.some((id) => insurancePolicyOf(session.ctx, gs, id))}<p class="help">{t("target.insured_help", { card: policyName })}</p>{/if}
  </Modal>
{/if}

{#if ui.dialog === "card_confirm" && confirmTarget && legal}
  <Modal title={cardTitle} onclose={resetTool}>
    {#if confirmTarget.effect === "ragnarok"}
      {@const winner = rankPlayers(session.ctx, gs, gs.turnOrder)[0] ?? legal.playerId}
      {@const renown = getRenown(session.ctx, gs, winner)}
      <!-- Only a match with reaction cards gives rivals a chance to counter it. -->
      <p class="help">{t(gs.ruleset.enableReactionCards ? "target.ragnarok_counterable" : "target.ragnarok")}</p>
      <p class="goal">
        {winner === legal.playerId
          ? t("target.ragnarok_winner_you", { renown })
          : t("target.ragnarok_winner", { name: gs.players[winner]?.displayName ?? "", renown })}
      </p>
    {:else if confirmTarget.effect === "dragons_landing"}
      {@const risks = landingRisks(session.ctx, gs)}
      {@const total = risks.reduce((n, v) => n + v.ids.length, 0)}
      <p class="help">{t("target.landing")}</p>
      <ul class="victims">
        {#each risks as v (v.ownerId)}
          <li>
            {t("target.landing_share", { name: nameOf(v.ownerId), count: v.ids.length, total })}{#if v.insured}, <b>{t("target.insured")}</b>{/if}
          </li>
        {/each}
      </ul>
      {#if risks.some((v) => v.insured)}<p class="help">{t("target.landing_insured_help", { card: policyName })}</p>{/if}
    {:else if confirmTarget.effect === "the_plague"}
      {@const victims = plagueVictims(session.ctx, gs, confirmTarget.siteId)}
      <p class="help">{t("target.plague", { place: siteName(session.map, confirmTarget.siteId) })}</p>
      <ul class="victims">
        {#each victims as v (v.ownerId)}
          <li>
            {t("target.plague_share", { name: nameOf(v.ownerId), regions: listText(v.ids.map((b) => regionName(session.map, gs.banners[b]?.regionId))) })}{#if v.insured}, <b>{t("target.insured")}</b>{/if}
          </li>
        {/each}
      </ul>
      {#if victims.some((v) => v.insured)}<p class="help">{t("target.plague_insured_help", { card: policyName })}</p>{/if}
    {/if}
    <div class="grid">
      <button class="primary" onclick={() => playPickedCard(session)}>{t("target.play", { card: cardTitle })}</button>
      {#if Object.keys(ui.cardPicks).length > 0}<button onclick={() => backCardStep(session)}>{t("ui.back")}</button>{/if}
    </div>
  </Modal>
{/if}

{#if legal?.mode === "reaction" && pendingReaction}
  <Modal title={t("ui.counterspell")}>
    <p class="help">
      {t("ui.reaction_intro", { name: gs.players[pendingReaction.sourcePlayerId]?.displayName ?? "" })}
      <b>{t(`card.${cardDefIdOf(pendingReaction.cardId)}.name`)}</b>{describeTarget() ? ` ${t("ui.reaction_on", { target: describeTarget() })}` : ""}.
    </p>
    {@const outcome = describeOutcome()}
    {#if outcome}<p class="help">{outcome}</p>{/if}
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
          <button aria-label={t("ui.move_up")} disabled={i === 0} onclick={() => move(i, -1)}><ToolIcon name="arrow-up" size={20} /></button>
          <button aria-label={t("ui.move_down")} disabled={i === order.length - 1} onclick={() => move(i, 1)}><ToolIcon name="arrow-down" size={20} /></button>
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
  .grid button.suggested {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent);
  }
  .have {
    font-size: 0.72rem;
    opacity: 0.8;
  }
  .grid button.on .have {
    opacity: 0.9;
  }
  .left {
    white-space: nowrap;
  }
  .goal {
    margin: 0.2rem 0 0.4rem;
    padding: 0.35rem 0.55rem;
    border-left: 4px solid var(--accent);
    background: #eaf3e6;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 600;
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
  .victims {
    margin: 0.2rem 0 0.6rem;
    padding-left: 1.2rem;
    font-size: 0.9rem;
  }
</style>
