// Sealed Charges (spec §27A) for the AI: how far it is toward its own
// Charge, which of those drawn to keep, when to Recommission, and what its
// Banner Assignment and savings make of it. Rivals' Charges are hidden
// (§105); `evaluate` counts each as `SEALED_CHARGE_RENOWN` instead.

import {
  BALANCE,
  HIDDEN_CHARGE,
  canRecommission,
  getChargeProgress,
  getNetworkSites,
  getPlayerHoldings,
  holdingAt,
  isSiteOpenFor,
  reachedSites,
  type ChargeGoal,
  type ChargeId,
  type GameState,
  type PlayerId,
  type RegionId,
  type ResourceCost,
  type RulesContext,
  type SealedCharge,
  type SiteId,
} from "@manors-menaces/rules";

/**
 * Renown a rival's sealed Charge is worth to the AI before it is revealed:
 * about half of `BALANCE.sealedCharges.renown`, since a Charge may never be
 * met (§27A).
 */
export const SEALED_CHARGE_RENOWN = 1;

/** Farthest a landmark not yet reached pulls the network toward it, in Routes. */
const LANDMARK_PULL = 4;

/** Worth of a Banner in a Region that serves the Charge: enough to outweigh its best Harvest elsewhere. */
const BANNER_BONUS = 5;

/**
 * How readily the AI meets each kind of Charge, to choose between two it
 * has made no progress on (at setup nothing is built yet). From `pnpm
 * simulate` runs with the option on: the share of each kind met.
 */
const EASE: Record<ChargeGoal["kind"], number> = { landmark: 0.1, banners: 0.05, deed: 0.1, menace: 0.15 };

function landmarkSite(ctx: RulesContext, landmarkId: string): SiteId | undefined {
  return ctx.board.topology.landmarks.find((l) => l.id === landmarkId)?.siteId;
}

/** Whether one more of the player's Banners fits in the Region: other players' Banners do not fill it. */
function hasRoom(ctx: RulesContext, state: GameState, playerId: PlayerId, regionId: RegionId): boolean {
  let others = 0;
  for (const b of Object.values(state.banners)) if (b.regionId === regionId && b.ownerId !== playerId) others++;
  return others < ctx.board.region(regionId).capacity;
}

/** Regions a Banner of the player could stand in at their next Banner Assignment. */
function bannerRegions(ctx: RulesContext, state: GameState, playerId: PlayerId): Set<RegionId> {
  const out = new Set<RegionId>();
  for (const h of getPlayerHoldings(state, playerId)) for (const r of ctx.board.site(h.siteId).adjacentRegionIds) if (hasRoom(ctx, state, playerId, r)) out.add(r);
  return out;
}

/**
 * The player's progress toward a Charge, 0 to 1, as the AI plans it. Banners
 * count where the next Banner Assignment could put them, and a landmark not
 * yet reached pulls by distance, so each Route toward it pays. Deeds count
 * as the rules count them.
 */
export function chargeOutlook(ctx: RulesContext, state: GameState, playerId: PlayerId, charge: SealedCharge): number {
  if (!state.players[playerId] || charge.id === HIDDEN_CHARGE) return 0;
  const goal = ctx.charge(charge.id).goal;
  switch (goal.kind) {
    case "landmark": {
      const siteId = landmarkSite(ctx, goal.landmarkId);
      if (!siteId) return 0;
      const reached = reachedSites(ctx, state, playerId);
      let reach = 1;
      if (!reached.has(siteId)) {
        let nearest = Infinity;
        for (const s of reached) nearest = Math.min(nearest, ctx.board.distance(s, siteId));
        reach = 0.5 * Math.max(0, 1 - nearest / LANDMARK_PULL);
      }
      const regions = bannerRegions(ctx, state, playerId);
      const banner = ctx.board.site(siteId).adjacentRegionIds.some((r) => regions.has(r)) ? 1 : 0;
      return (reach + banner) / 2;
    }
    case "banners": {
      let regions = 0;
      for (const r of bannerRegions(ctx, state, playerId)) if (ctx.board.region(r).resource === goal.resource) regions++;
      const banners = Object.values(state.banners).filter((b) => b.ownerId === playerId).length;
      return Math.min(regions, banners, goal.count) / goal.count;
    }
    case "deed":
    case "menace": {
      const prog = getChargeProgress(ctx, state, playerId, charge);
      return prog.current / prog.target;
    }
  }
}

/** The Charge to keep of those drawn: the one with more progress, then the kind the AI meets more readily. */
export function pickCharge(ctx: RulesContext, state: GameState, playerId: PlayerId, chargeIds: readonly ChargeId[]): ChargeId | undefined {
  let best: { id: ChargeId; score: number } | undefined;
  for (const id of chargeIds) {
    const goal = ctx.charge(id).goal;
    // Deeds count from the draw, so a deed or Menace Charge starts from nothing.
    const counted = goal.kind === "deed" || goal.kind === "menace";
    const score = (counted ? 0 : chargeOutlook(ctx, state, playerId, { id })) + EASE[goal.kind];
    if (!best || score > best.score) best = { id, score };
  }
  return best?.id;
}

/**
 * Sites the player's network could still grow to: through their own and
 * unowned Routes, never through a rival's Holding (§13).
 */
function growthSites(ctx: RulesContext, state: GameState, playerId: PlayerId): Set<SiteId> {
  const seen = new Set<SiteId>(getNetworkSites(ctx, state, playerId, { allowHighwayman: true }));
  const stack = [...seen];
  while (stack.length) {
    const cur = stack.pop() as SiteId;
    const h = holdingAt(state, cur);
    if (h && h.ownerId !== playerId) continue;
    for (const r of ctx.board.routesAt(cur)) {
      const owner = state.routeOwners[r.id];
      if (owner !== undefined && owner !== playerId) continue;
      const next = ctx.board.otherEnd(r, cur);
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(next);
    }
  }
  return seen;
}

/** Regions the player could get a Banner into some day: next to their Holdings or to a Site they could still build on. */
function futureRegions(ctx: RulesContext, state: GameState, playerId: PlayerId): Set<RegionId> {
  const out = bannerRegions(ctx, state, playerId);
  for (const siteId of growthSites(ctx, state, playerId)) {
    if (holdingAt(state, siteId) || !isSiteOpenFor(ctx, state, playerId, siteId)) continue;
    for (const r of ctx.board.site(siteId).adjacentRegionIds) if (hasRoom(ctx, state, playerId, r)) out.add(r);
  }
  return out;
}

/**
 * Whether the player's Charge can no longer be met, so that Recommission is
 * worth its Essence: a landmark their network cannot grow to or place a
 * Banner beside, Banners in Regions they can never reach, or cards to buy
 * from an empty deck.
 */
export function chargeHopeless(ctx: RulesContext, state: GameState, playerId: PlayerId): boolean {
  const charge = state.players[playerId]?.sealedCharge;
  if (!charge || charge.id === HIDDEN_CHARGE) return false;
  const goal = ctx.charge(charge.id).goal;
  switch (goal.kind) {
    case "landmark": {
      const siteId = landmarkSite(ctx, goal.landmarkId);
      if (!siteId) return true;
      if (!reachedSites(ctx, state, playerId).has(siteId) && !growthSites(ctx, state, playerId).has(siteId)) return true;
      const regions = futureRegions(ctx, state, playerId);
      return !ctx.board.site(siteId).adjacentRegionIds.some((r) => regions.has(r));
    }
    case "banners": {
      let regions = 0;
      for (const r of futureRegions(ctx, state, playerId)) if (ctx.board.region(r).resource === goal.resource) regions++;
      return regions < goal.count;
    }
    case "deed":
      return goal.deed === "cards_bought" && state.cardDeck.length + state.discardPile.length === 0;
    case "menace":
      return false;
  }
}

/** Whether the AI should Recommission now. */
export function wantsRecommission(ctx: RulesContext, state: GameState, playerId: PlayerId): boolean {
  return canRecommission(ctx, state, playerId) && chargeHopeless(ctx, state, playerId);
}

/** What the player should save for to work on their Charge: a Writ, a card or a Warden; null otherwise. */
export function chargeSavings(ctx: RulesContext, state: GameState, playerId: PlayerId): ResourceCost | null {
  const charge = state.players[playerId]?.sealedCharge;
  if (!charge || charge.id === HIDDEN_CHARGE || getChargeProgress(ctx, state, playerId, charge).complete) return null;
  const goal = ctx.charge(charge.id).goal;
  if (goal.kind === "menace") return BALANCE.costs.warden;
  if (goal.kind !== "deed") return null;
  if (goal.deed === "writs") return BALANCE.costs.royalWrit;
  if (goal.deed === "cards_bought") return BALANCE.costs.card;
  return null;
}

/**
 * Worth, at Banner Assignment, of putting a Banner in a Region toward the
 * player's Banner or landmark Charge; null when this assignment cannot meet
 * it, so the Banners harvest as usual.
 */
export function chargeBannerBonus(ctx: RulesContext, state: GameState, playerId: PlayerId): ((regionId: RegionId) => number) | null {
  const charge = state.players[playerId]?.sealedCharge;
  if (!charge || charge.id === HIDDEN_CHARGE) return null;
  const goal = ctx.charge(charge.id).goal;
  const regions = bannerRegions(ctx, state, playerId);
  if (goal.kind === "banners") {
    const matching = new Set([...regions].filter((r) => ctx.board.region(r).resource === goal.resource));
    return matching.size >= goal.count ? (r) => (matching.has(r) ? BANNER_BONUS : 0) : null;
  }
  if (goal.kind === "landmark") {
    const siteId = landmarkSite(ctx, goal.landmarkId);
    if (!siteId || !reachedSites(ctx, state, playerId).has(siteId)) return null;
    const touching = new Set(ctx.board.site(siteId).adjacentRegionIds.filter((r) => regions.has(r)));
    return touching.size > 0 ? (r) => (touching.has(r) ? BANNER_BONUS : 0) : null;
  }
  return null;
}
