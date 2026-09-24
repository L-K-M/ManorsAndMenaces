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
  enumerateCardTargets,
  getLegalActions,
  getLegalMenaceDestinations,
  canAfford,
  type CommandIntent,
  type GameState,
  type PlayerId,
  type ResourceType,
  type RulesContext,
} from "@manors-menaces/rules";

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
    for (const cardId of legal.playableCards)
      for (const target of enumerateCardTargets(ctx, state, playerId, cardId)) out.push({ type: "play_card", cardId, target });
  }
  return out;
}

export function canAffordCard(state: GameState, playerId: PlayerId): boolean {
  const p = state.players[playerId];
  return !!p && canAfford(p.resources, BALANCE.costs.card);
}
