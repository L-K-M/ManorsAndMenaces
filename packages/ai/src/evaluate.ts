// Heuristic state evaluation (spec §57.2). Weights are tunable placeholders.

import {
  BALANCE,
  addCost,
  computeBannerHarvest,
  RESOURCE_TYPES,
  getHarvestPreview,
  getNetworkSites,
  getPlayerBanners,
  getPlayerHoldings,
  getQuestProgress,
  getRenown,
  checkBuildManor,
  HIDDEN_CARD,
  insurancePolicyOf,
  isCardUsableInRuleset,
  menaceInRegion,
  type CardEffectId,
  type CardId,
  type GameState,
  type PlayerId,
  type ResourceType,
  type RulesContext,
} from "@manors-menaces/rules";
import { BASE_NEED, planExpansion } from "./expansion.js";

export const WEIGHTS = {
  renown: 8,
  nextHarvest: 1.2,
  questProgress: 1.5,
  networkReach: 1.2,
  diversity: 1,
  menacePressureOnOpponents: 0.15,
  menacePressureOnSelf: 1,
  wasted: 0.8,
  stock: 0.6,
  buildOptions: 0.9,
  /** Per Route of progress toward the planned Site (see `ExpansionPlan.score`). */
  expansion: 1.5,
  denial: 0.12,
  /**
   * A Royal Insurance Policy in front of the player (§19.19): a little more
   * than the card in hand, so a policy gets played once nothing better is on.
   */
  insurance: 1.2,
  /**
   * Per rival Route, scaled by that rival's threat: a burned Route costs its
   * owner the resources to rebuild it and may cut their network. Without
   * this Fire Bolt scores nothing.
   */
  rivalRoutes: 0.8,
  /** Per card in a rival's hand (up to 4), scaled by threat, for Changeling. */
  rivalCards: 0.3,
  /**
   * Per point of each rival's Renown, scaled by threat, on top of the leader's
   * Renown below: enough that Dragon's Landing on the leader beats keeping
   * the card, not enough to chase every rival's Manor.
   */
  rivalRenown: 0.6,
  win: 1000,
};

/** Below this many cards in hand, the next card is a (minor) goal. */
export const CARD_GOAL_HAND = 3;
/**
 * Cards become a goal only once the player has this many Holdings. Saving
 * for them from the start slowed every opening, which in 200-game runs
 * widened the first seat's lead (2p 57% to 64%, 3p 36% to 44%).
 */
const CARD_GOAL_HOLDINGS = 3;
/** Weight of that goal against building (0.45 each). */
const CARD_GOAL_WEIGHT = 0.3;

/**
 * How much the player currently wants each resource, based on what their next
 * builds need. Scarce inputs for the next affordable goal weigh more.
 */
export function resourceNeeds(ctx: RulesContext, state: GameState, playerId: PlayerId): Record<ResourceType, number> {
  const p = state.players[playerId];
  const need: Record<ResourceType, number> = { ...BASE_NEED };
  if (!p) return need;
  const holdings = getPlayerHoldings(state, playerId);
  const manors = holdings.filter((h) => h.type === "manor").length;
  const buildable = ctx.board.topology.sites.some((s) => checkBuildManor(ctx, state, playerId, s.id).legal);
  // Building goals drive demand. Cards are a side goal: only when a card can
  // actually be drawn and the hand is small, and at a lower weight (buying
  // cards as a standing goal made the AI hoard Iron/Essence instead of building).
  const goals: { cost: Partial<Record<ResourceType, number>>; weight: number }[] = [];
  if (manors > 0) goals.push({ cost: BALANCE.costs.stronghold, weight: 0.45 });
  // With no Site to build on, save for the next Route plus the Manor. Only one
  // Route is counted however far the planned Site is: saving for the whole
  // path at once made the AI hoard instead of building step by step.
  goals.push({ cost: buildable ? BALANCE.costs.manor : addCost(BALANCE.costs.route, BALANCE.costs.manor), weight: 0.45 });
  if (state.ruleset.enableCards && state.cardDeck.length + state.discardPile.length > 0 && p.hand.length < CARD_GOAL_HAND && holdings.length >= CARD_GOAL_HOLDINGS) {
    goals.push({ cost: BALANCE.costs.card, weight: CARD_GOAL_WEIGHT });
  }
  for (const goal of goals) {
    for (const r of RESOURCE_TYPES) {
      const missing = Math.max(0, (goal.cost[r] ?? 0) - p.resources[r]);
      need[r] += goal.weight * missing;
    }
  }
  if (state.ruleset.writ.enabled || state.ruleset.warden.enabled) need.essence += 0.3;
  return need;
}

function menacePressure(ctx: RulesContext, state: GameState, playerId: PlayerId): number {
  let pressure = 0;
  for (const b of getPlayerBanners(state, playerId)) {
    if (!b.regionId) continue;
    const m = menaceInRegion(state, b.regionId);
    if (m?.type === "toll_troll" || m?.type === "young_dragon") pressure += 1;
    else if (m?.type === "bog_witch" && ctx.board.region(b.regionId).resource !== "essence") pressure += 0.4;
  }
  return pressure;
}

/**
 * Value of the best Banner assignment the player could make at their next
 * Banner Assignment phase (greedy). Using potential rather than current
 * placement lets the AI see the value of freeing a Region (Royal Writ),
 * moving a Menace, or building next to good Regions.
 */
export function potentialHarvest(ctx: RulesContext, state: GameState, playerId: PlayerId, need: Record<ResourceType, number>): number {
  const mine = getPlayerBanners(state, playerId);
  const occupied = new Map<string, number>();
  for (const b of Object.values(state.banners)) if (b.ownerId !== playerId && b.regionId) occupied.set(b.regionId, (occupied.get(b.regionId) ?? 0) + 1);
  const options: { bannerId: string; holdingId: string; regionId: string; value: number }[] = [];
  for (const b of mine) {
    const h = state.holdings[b.holdingId];
    if (!h) continue;
    for (const regionId of ctx.board.site(h.siteId).adjacentRegionIds) {
      const out = computeBannerHarvest(ctx, state, b, regionId);
      const value = out.produced && out.amount > 0 ? need[out.produced] * out.amount : 0;
      if (value > 0) options.push({ bannerId: b.id, holdingId: b.holdingId, regionId, value: value + (b.regionId === regionId ? 0.05 : 0) });
    }
  }
  options.sort((a, b) => b.value - a.value);
  const used = new Set<string>();
  const holdingRegions = new Set<string>();
  let total = 0;
  for (const o of options) {
    if (used.has(o.bannerId) || holdingRegions.has(`${o.holdingId}:${o.regionId}`)) continue;
    const cap = ctx.board.region(o.regionId).capacity;
    if ((occupied.get(o.regionId) ?? 0) >= cap) continue;
    occupied.set(o.regionId, (occupied.get(o.regionId) ?? 0) + 1);
    used.add(o.bannerId);
    holdingRegions.add(`${o.holdingId}:${o.regionId}`);
    total += o.value;
  }
  return total;
}

/**
 * Worth of holding `n` of one resource, before weighting by need. Concave:
 * the first few of each resource matter most, but spending a surplus is never
 * free (otherwise the AI burns resources on interference). Beyond 8 more is
 * worth nothing, so a hoard gets traded toward the goal.
 */
export function stockWorth(n: number): number {
  return Math.min(n, 4) + 0.3 * Math.max(0, Math.min(n, 8) - 4);
}

/**
 * How much interference against `playerId` is worth: more against whoever is
 * closest to winning, as human players aim trouble at the leader.
 */
export function threat(ctx: RulesContext, state: GameState, playerId: PlayerId): number {
  return 0.5 + getRenown(ctx, state, playerId) / state.ruleset.targetRenown;
}

/**
 * Scale from measured gains to hand worth. Above 1 because a card held now
 * is also a choice later and progress toward the card Quests (Arcane
 * Scholar, Patron of Heroes), which a single measurement misses. Tuned with
 * `pnpm simulate` so the AI buys cards when it has resources to spare and
 * plays most of what it buys.
 */
const WORTH_SCALE = 1.5;

function scaleWorth(base: Record<CardEffectId, number>): Record<CardEffectId, number> {
  return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v * WORTH_SCALE])) as Record<CardEffectId, number>;
}

/**
 * What holding each card is worth, in evaluation units: roughly what playing
 * it at a good moment gains, discounted because that moment may not come.
 * Playing a card gives this up, so the AI plays one when its effect beats
 * keeping it, and buys one when the cards it could draw are worth more than
 * the Grain, Iron and Essence they cost.
 */
export const CARD_WORTH: Record<CardEffectId, number> = scaleWorth({
  // Measured: the typical evaluation gain of playing each card at the start
  // of a Main phase, over AI-vs-AI games, discounted so a card is played at
  // a decent moment rather than held for a perfect one. Fog and Prophecy
  // are valued by what `FOGGED_ROUTE` and `foresightWorth` credit them.
  wizard_interference: 0.35,
  // Defensive: its worth is the Spells it may stop.
  counterspell: 1,
  knight_errant: 0.8,
  druids_blessing: 0.9,
  teleportation_mishap: 0.35,
  bribe_the_troll: 0.45,
  arcane_exchange: 0.6,
  festival_at_the_inn: 0.65,
  very_minor_prophecy: 0.2,
  fog_of_confusion: 0.25,
  dragon_whisperer: 0.8,
  changeling: 0.6,
  // Wins the game when it can be played; held for that moment.
  ragnarok: 3,
  fire_bolt: 0.5,
  dragons_landing: 0.75,
  transmutation_magic: 1.2,
  the_plague: 0.3,
  royal_insurance_policy: 0.7,
  robin_of_the_glade: 0.55,
  // +1 Renown, but only while a rival leads by 2 or more.
  unreliable_bard: 3,
  treasure_hunter: 0.4,
});

/**
 * A rival's fogged Route counts this much of an open one: it still stands,
 * but cannot extend their network until the fog lifts (§19.10).
 */
const FOGGED_ROUTE = 0.5;

/**
 * What seeing the top 3 cards and ordering them is worth (Very Minor
 * Prophecy, §19.9), which the evaluator cannot see: the best of three
 * random draws over an average one, for the one draw of them the player is
 * likely to get.
 */
export function foresightWorth(ctx: RulesContext, state: GameState): number {
  const worths: number[] = [];
  for (const def of ctx.content.cards) {
    if (!isCardUsableInRuleset(def, state.ruleset)) continue;
    for (let i = 0; i < def.copies; i++) worths.push(CARD_WORTH[def.effectId]);
  }
  const n = worths.length;
  if (n < 3) return 0;
  worths.sort((a, b) => a - b);
  // E[max of 3 drawn without replacement]: the i-th smallest is the max when both others are below it.
  const triples = (n * (n - 1) * (n - 2)) / 6;
  let best = 0;
  worths.forEach((w, i) => (best += (w * ((i * (i - 1)) / 2)) / triples));
  const mean = worths.reduce((a, b) => a + b, 0) / n;
  return FORESIGHT_SHARE * (best - mean);
}

/** Share of the ordered cards' edge the prophet keeps: rivals may draw first. */
const FORESIGHT_SHARE = 0.5;

/** Cards beyond this many add nothing: one can be played per turn. */
const VALUED_CARDS = 4;

/**
 * Worth of a card whose identity the player does not know (a rival's card
 * after Changeling, or the next draw): the average over the cards this
 * ruleset deals, by copies.
 */
function unknownCardWorth(ctx: RulesContext, state: GameState): number {
  let total = 0;
  let copies = 0;
  for (const def of ctx.content.cards) {
    if (!isCardUsableInRuleset(def, state.ruleset)) continue;
    // A set-aside Ragnarök cannot be drawn until the omen (§19.13).
    if (def.setAside && (state.setAsideCardIds ?? []).length > 0) continue;
    total += CARD_WORTH[def.effectId] * def.copies;
    copies += def.copies;
  }
  return copies > 0 ? total / copies : 0;
}

export function cardWorth(ctx: RulesContext, state: GameState, cardId: CardId): number {
  return cardId === HIDDEN_CARD ? unknownCardWorth(ctx, state) : CARD_WORTH[ctx.cardOf(cardId).effectId];
}

/** Worth of the player's hand: its best few cards. */
export function handValue(ctx: RulesContext, state: GameState, playerId: PlayerId): number {
  const worths = (state.players[playerId]?.hand ?? []).map((c) => cardWorth(ctx, state, c)).sort((a, b) => b - a);
  return worths.slice(0, VALUED_CARDS).reduce((a, b) => a + b, 0);
}

/** Value of the state for `playerId` (higher is better). */
export function evaluate(ctx: RulesContext, state: GameState, playerId: PlayerId): number {
  const p = state.players[playerId];
  if (!p) return -Infinity;
  if (state.status === "finished") return state.winnerId === playerId ? WEIGHTS.win : -WEIGHTS.win;
  const need = resourceNeeds(ctx, state, playerId);
  const renown = getRenown(ctx, state, playerId);

  const preview = getHarvestPreview(ctx, state, playerId);
  // During Main Actions the player can still re-assign Banners this turn.
  const harvestValue = state.activePlayerId === playerId && state.phase === "main" ? potentialHarvest(ctx, state, playerId, need) : (() => {
    let v = 0;
    for (const r of RESOURCE_TYPES) v += preview.totals[r] * need[r];
    return v;
  })();

  let stock = 0;
  let wasted = 0;
  for (const r of RESOURCE_TYPES) {
    const n = p.resources[r];
    stock += stockWorth(n) * need[r];
    if (n > 6) wasted += n - 6;
  }
  const diversity = RESOURCE_TYPES.filter((r) => preview.totals[r] > 0).length;
  const reach = getNetworkSites(ctx, state, playerId).length;
  const buildOptions = ctx.board.topology.sites.filter((s) => checkBuildManor(ctx, state, playerId, s.id).legal).length;
  // Each Route toward the planned Site is worth a bit more than the resources
  // it costs, so a multi-Route expansion pays off step by step instead of
  // only at the final Manor.
  const expansion = planExpansion(ctx, state, playerId)?.score ?? 0;

  let quest = 0;
  for (const q of state.revealedQuestIds) {
    const prog = getQuestProgress(ctx, state, playerId, q);
    quest += (prog.current / prog.target) * ctx.quest(q).renown;
  }

  let opponents = 0;
  let opponentRenown = 0;
  let opponentHarvest = 0;
  // Only interference cards change these (Fire Bolt, Fog of Confusion,
  // Changeling, Dragon's Landing), so they leave every other comparison
  // between candidates as it was.
  let rivalRoutes = 0;
  const fogged = new Set(state.activeEffects.flatMap((e) => (e.kind === "fog" ? [e.routeId] : [])));
  let rivalCards = 0;
  let rivalRenown = 0;
  for (const id of state.turnOrder) {
    if (id === playerId) continue;
    const weight = threat(ctx, state, id);
    const theirRenown = getRenown(ctx, state, id);
    opponents += weight * menacePressure(ctx, state, id);
    opponentRenown = Math.max(opponentRenown, theirRenown);
    rivalRenown += weight * theirRenown;
    opponentHarvest += weight * getHarvestPreview(ctx, state, id).total;
    rivalRoutes += weight * (state.players[id]?.routeIds ?? []).reduce((n, r) => n + (fogged.has(r) ? FOGGED_ROUTE : 1), 0);
    rivalCards += weight * Math.min(state.players[id]?.hand.length ?? 0, 4);
  }
  const insured = insurancePolicyOf(ctx, state, playerId) ? 1 : 0;

  return (
    WEIGHTS.renown * renown +
    WEIGHTS.nextHarvest * harvestValue -
    WEIGHTS.denial * opponentHarvest +
    WEIGHTS.stock * stock +
    WEIGHTS.questProgress * quest +
    WEIGHTS.networkReach * 0.25 * reach +
    WEIGHTS.buildOptions * Math.min(buildOptions, 2) +
    WEIGHTS.expansion * expansion +
    WEIGHTS.diversity * 0.5 * diversity +
    handValue(ctx, state, playerId) +
    WEIGHTS.insurance * insured +
    WEIGHTS.menacePressureOnOpponents * opponents -
    WEIGHTS.rivalRoutes * rivalRoutes -
    WEIGHTS.rivalCards * rivalCards -
    WEIGHTS.rivalRenown * rivalRenown -
    WEIGHTS.menacePressureOnSelf * menacePressure(ctx, state, playerId) -
    WEIGHTS.wasted * 0.3 * wasted -
    0.5 * opponentRenown
  );
}
