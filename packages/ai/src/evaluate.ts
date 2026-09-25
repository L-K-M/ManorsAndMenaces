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
  menaceInRegion,
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
  cardValue: 0.8,
  menacePressureOnOpponents: 0.15,
  menacePressureOnSelf: 1,
  wasted: 0.8,
  stock: 0.6,
  buildOptions: 0.9,
  /** Per Route of progress toward the planned Site (see `ExpansionPlan.score`). */
  expansion: 1.5,
  denial: 0.12,
  win: 1000,
};

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
  if (state.ruleset.enableCards && state.cardDeck.length + state.discardPile.length > 0 && p.hand.length < 2) {
    goals.push({ cost: BALANCE.costs.card, weight: 0.15 });
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
    // Concave: the first few of each resource matter most, but spending a
    // surplus is never free (otherwise the AI burns resources on interference).
    // Beyond 8 more is worth nothing, so a hoard gets traded toward the goal.
    stock += (Math.min(n, 4) + 0.3 * Math.max(0, Math.min(n, 8) - 4)) * need[r];
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
  const cards = p.hand.length;

  let opponents = 0;
  let opponentRenown = 0;
  let opponentHarvest = 0;
  for (const id of state.turnOrder) {
    if (id === playerId) continue;
    // Interference is worth more against whoever is closest to winning, as
    // human players aim trouble at the leader.
    const theirRenown = getRenown(ctx, state, id);
    const threat = 0.5 + theirRenown / state.ruleset.targetRenown;
    opponents += threat * menacePressure(ctx, state, id);
    opponentRenown = Math.max(opponentRenown, theirRenown);
    opponentHarvest += threat * getHarvestPreview(ctx, state, id).total;
  }

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
    WEIGHTS.cardValue * Math.min(cards, 4) +
    WEIGHTS.menacePressureOnOpponents * opponents -
    WEIGHTS.menacePressureOnSelf * menacePressure(ctx, state, playerId) -
    WEIGHTS.wasted * 0.3 * wasted -
    0.5 * opponentRenown
  );
}
