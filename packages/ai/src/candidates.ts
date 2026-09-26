// Candidate generation (spec §57.1): every plausible action intent in the
// current state. The engine is the judge of legality; candidates that it
// rejects are simply dropped by the planner.

import {
  BALANCE,
  RESOURCE_TYPES,
  canAffordBuild,
  checkBuildManor,
  checkBuildRoute,
  checkUpgrade,
  computeBannerHarvest,
  enumerateCardTargets,
  getLegalActions,
  getLegalMenaceDestinations,
  getPlayerBanners,
  holdingAt,
  insurancePolicyOf,
  menaceOfType,
  plagueBanners,
  canAfford,
  type Banner,
  type CardEffectId,
  type CardTarget,
  type CommandIntent,
  type GameState,
  type PlayerId,
  type ResourceType,
  type RulesContext,
} from "@manors-menaces/rules";
import { WEIGHTS, resourceNeeds, stockWorth, threat } from "./evaluate.js";

/**
 * Most targets the planner simulates for one card whose target set can grow
 * large: Transmutation Magic has up to 110, The Plague one per Site, Treasure
 * Hunter one per Hoard resource and Region, Fire Bolt one per rival Route.
 * Each simulated target costs a full evaluation (more on Hard), so these are
 * ranked by a cheap estimate and cut to the best few before the evaluator
 * judges them. Other cards keep every target.
 */
export const MAX_CARD_TARGETS = 6;
const PRUNED_EFFECTS: ReadonlySet<CardEffectId> = new Set(["transmutation_magic", "the_plague", "treasure_hunter", "fire_bolt"]);

/** Cheapest-to-spare resource for tolls/surcharges/bribes. */
export function spareResource(state: GameState, playerId: PlayerId, exclude: Partial<Record<ResourceType, number>> = {}): ResourceType | null {
  const p = state.players[playerId];
  if (!p) return null;
  let best: ResourceType | null = null;
  for (const r of RESOURCE_TYPES) {
    const left = p.resources[r] - (exclude[r] ?? 0);
    if (left <= 0) continue;
    if (!best || left > p.resources[best] - (exclude[best] ?? 0)) best = r;
  }
  return best;
}

export function mainPhaseCandidates(ctx: RulesContext, state: GameState, playerId: PlayerId, opts: { menaces: boolean; cards: boolean }): CommandIntent[] {
  const legal = getLegalActions(ctx, state, playerId);
  const out: CommandIntent[] = [];
  for (const routeId of legal.routes) {
    const c = checkBuildRoute(ctx, state, playerId, routeId);
    if (!c.legal) continue;
    const toll = c.needsToll ? spareResource(state, playerId, c.cost) : undefined;
    if (c.needsToll && !toll) continue;
    out.push(toll ? { type: "build_route", routeId, tollPayment: toll } : { type: "build_route", routeId });
  }
  for (const siteId of legal.manorSites) {
    const c = checkBuildManor(ctx, state, playerId, siteId);
    if (!c.legal || !canAffordBuild(state, playerId, c)) continue;
    const toll = c.needsToll ? spareResource(state, playerId, c.cost) : undefined;
    const extra = c.needsSurcharge ? spareResource(state, playerId, { ...c.cost, ...(toll ? { [toll]: (c.cost[toll] ?? 0) + 1 } : {}) }) : undefined;
    out.push({ type: "build_manor", siteId, ...(toll ? { tollPayment: toll } : {}), ...(extra ? { extraPayment: extra } : {}) });
  }
  for (const siteId of legal.upgradeSites) {
    const c = checkUpgrade(state, playerId, siteId);
    if (!c.legal) continue;
    const extra = c.needsSurcharge ? spareResource(state, playerId, c.cost) : undefined;
    out.push({ type: "upgrade_holding", siteId, ...(extra ? { extraPayment: extra } : {}) });
  }
  for (const q of legal.claimableQuests) out.push({ type: "claim_quest", questId: q });
  for (const give of legal.marketGive)
    for (const receive of RESOURCE_TYPES) if (receive !== give) out.push({ type: "trade", give, receive });
  for (const post of legal.tradePosts)
    for (const receive of RESOURCE_TYPES) if (receive !== post.resource) out.push({ type: "trade", give: post.resource, receive, tradePostSiteId: post.siteId });
  if (opts.menaces && legal.canIssueWrit) {
    for (const targetBannerId of legal.writTargets) {
      const bribe = spareResource(state, playerId, BALANCE.costs.royalWrit);
      if (bribe) out.push({ type: "issue_royal_writ", targetBannerId, bribe });
    }
  }
  if (opts.menaces && legal.canHireWarden) {
    for (const menaceId of legal.wardenMenaces)
      for (const destination of getLegalMenaceDestinations(ctx, state, menaceId)) out.push({ type: "hire_warden", menaceId, destination });
  }
  if (opts.cards) {
    if (legal.canBuyCard) out.push({ type: "buy_card" });
    // Copies of one card lead to the same states: offer the first only.
    const seen = new Set<string>();
    for (const cardId of legal.playableCards) {
      const defId = ctx.cardOf(cardId).id;
      if (seen.has(defId)) continue;
      seen.add(defId);
      for (const target of pruneCardTargets(ctx, state, playerId, enumerateCardTargets(ctx, state, playerId, cardId)))
        out.push({ type: "play_card", cardId, target });
    }
  }
  return out;
}

/**
 * The targets of one card worth simulating, best estimate first (see
 * `MAX_CARD_TARGETS`). The order matters beyond the cut: the planner keeps
 * the first of equally scored candidates, and `evaluate` values every Route
 * of one rival alike, so the estimate picks which of them Fire Bolt burns.
 */
function pruneCardTargets(ctx: RulesContext, state: GameState, playerId: PlayerId, targets: CardTarget[]): CardTarget[] {
  const effect = targets[0]?.effect;
  if (!effect || !PRUNED_EFFECTS.has(effect)) return targets;
  // Sites around the same Regions sicken the same Banners: one of each will do.
  const sickened = (t: CardTarget): string => {
    const ids = t.effect === "the_plague" ? plagueBanners(ctx, state, t.siteId).map((b) => b.id) : [];
    return ids.join();
  };
  const pool = effect === "the_plague" ? uniqueBy(targets, sickened) : targets;
  const need = resourceNeeds(ctx, state, playerId);
  return pool
    .map((target) => ({ target, v: estimateTarget(ctx, state, playerId, target, need) }))
    .sort((a, b) => b.v - a.v)
    .slice(0, MAX_CARD_TARGETS)
    .map((x) => x.target);
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Rough worth of a pruned card's target to `playerId`, on the evaluator's scale where it can be. */
function estimateTarget(ctx: RulesContext, state: GameState, playerId: PlayerId, t: CardTarget, need: Record<ResourceType, number>): number {
  // What a Banner yields where it stands: raw for a rival, as `evaluate`
  // counts their Harvest, and weighted by need for the player.
  const amountOf = (b: Banner): number => (b.regionId ? computeBannerHarvest(ctx, state, b, b.regionId).amount : 0);
  const worthOf = (b: Banner): number => {
    const h = b.regionId ? computeBannerHarvest(ctx, state, b, b.regionId) : null;
    return h?.produced && h.amount > 0 ? need[h.produced] * h.amount : 0;
  };
  switch (t.effect) {
    case "transmutation_magic": {
      const have = state.players[playerId]?.resources;
      if (!have) return 0;
      const after = { ...have };
      for (const r of t.give) after[r] -= 1;
      for (const r of t.receive) after[r] += 1;
      return RESOURCE_TYPES.reduce((v, r) => v + need[r] * (stockWorth(after[r]) - stockWorth(have[r])), 0);
    }
    case "the_plague": {
      let v = 0;
      for (const b of plagueBanners(ctx, state, t.siteId)) {
        // A policy spares all of its owner's Banners.
        if (insurancePolicyOf(ctx, state, b.ownerId)) continue;
        if (b.ownerId === playerId) v -= WEIGHTS.nextHarvest * worthOf(b);
        else v += WEIGHTS.denial * threat(ctx, state, b.ownerId) * amountOf(b);
      }
      return v;
    }
    case "treasure_hunter": {
      const hoard = menaceOfType(state, "young_dragon")?.state.hoard ?? {};
      const taken = Math.min(BALANCE.treasureHunter.take, hoard[t.take] ?? 0);
      // The Dragon then lands on one of the player's Banners: best where it costs least.
      const dest = t.destination;
      const blocked = getPlayerBanners(state, playerId)
        .filter((b) => dest.kind === "region" && b.regionId === dest.regionId)
        .reduce((v, b) => v + worthOf(b), 0);
      return need[t.take] * taken - blocked;
    }
    case "fire_bolt": {
      const owner = state.routeOwners[t.routeId];
      // A policy absorbs the bolt: rank these below every uninsured Route,
      // which scores at least the minimum threat of 0.5.
      if (owner === undefined || insurancePolicyOf(ctx, state, owner)) return 0;
      // Ends the owner reaches only through this Route leave their network with it.
      const route = ctx.board.route(t.routeId);
      const cut = [route.siteA, route.siteB].filter(
        (x) => holdingAt(state, x)?.ownerId !== owner && !ctx.board.routesAt(x).some((r) => r.id !== t.routeId && state.routeOwners[r.id] === owner),
      ).length;
      return threat(ctx, state, owner) * (1 + cut);
    }
    default:
      return 0;
  }
}

export function canAffordCard(state: GameState, playerId: PlayerId): boolean {
  const p = state.players[playerId];
  return !!p && canAfford(p.resources, BALANCE.costs.card);
}
