// Summary of what a player can do right now (spec §36 getLegalCommands).
// Drives UI highlighting and AI candidate generation.

import { BALANCE } from "./balance.js";
import { validateCardTarget } from "./cards.js";
import type { RulesContext } from "./context.js";
import { RuleViolation } from "./errors.js";
import { getQuestProgress } from "./quests.js";
import { canAfford, totalResources } from "./resources.js";
import {
  canAffordBuild,
  type BuildCheck,
  checkBuildManor,
  checkBuildRoute,
  checkUpgrade,
  getLegalInitialManorSites,
  getLegalInitialRoutes,
  getPlayerHoldings,
  getWritTargets,
  holdingAt,
} from "./selectors.js";
import {
  RESOURCE_TYPES,
  type CardId,
  type CardTarget,
  type GameState,
  type PlayerId,
  type QuestId,
  type ResourceCost,
  type ResourceType,
  type Resources,
  type RouteId,
  type SiteId,
} from "./types.js";

export type ActionMode =
  | "none"
  | "setup_manor"
  | "setup_route"
  | "setup_banners"
  | "main"
  | "banner_assignment"
  | "end"
  | "reaction"
  | "prophecy"
  | "finished";

export interface LegalActionSummary {
  playerId: PlayerId;
  mode: ActionMode;
  initialManorSites: SiteId[];
  initialRoutes: RouteId[];
  /** Legal and affordable. */
  routes: RouteId[];
  manorSites: SiteId[];
  upgradeSites: SiteId[];
  canBuyCard: boolean;
  playableCards: CardId[];
  marketTradesLeft: number;
  /** Resources the player can give at the Market (has enough of). */
  marketGive: ResourceType[];
  /** Trading Posts the player holds, with the resource they accept. */
  tradePosts: { siteId: SiteId; resource: ResourceType; give: number }[];
  writTargets: string[];
  canIssueWrit: boolean;
  canHireWarden: boolean;
  /** Menaces a Warden may move (not guarded by another player's Warden). */
  wardenMenaces: string[];
  claimableQuests: QuestId[];
  mustDiscard: number;
  reactionCards: CardId[];
}

export function getLegalActions(ctx: RulesContext, state: GameState, playerId: PlayerId): LegalActionSummary {
  const p = state.players[playerId];
  const empty: LegalActionSummary = {
    playerId,
    mode: "none",
    initialManorSites: [],
    initialRoutes: [],
    routes: [],
    manorSites: [],
    upgradeSites: [],
    canBuyCard: false,
    playableCards: [],
    marketTradesLeft: 0,
    marketGive: [],
    tradePosts: [],
    writTargets: [],
    canIssueWrit: false,
    canHireWarden: false,
    wardenMenaces: [],
    claimableQuests: [],
    mustDiscard: 0,
    reactionCards: [],
  };
  if (!p) return empty;
  if (state.status === "finished") return { ...empty, mode: "finished" };

  if (state.pending) {
    if (state.pending.kind === "reaction" && state.pending.eligiblePlayerIds[0] === playerId) {
      return { ...empty, mode: "reaction", reactionCards: p.hand.filter((c) => ctx.cardOf(c).timing.includes("reaction")) };
    }
    if (state.pending.kind === "prophecy" && state.pending.playerId === playerId) return { ...empty, mode: "prophecy" };
    return empty;
  }
  if (state.activePlayerId !== playerId) return empty;

  if (state.status === "setup" && state.setup) {
    switch (state.setup.step) {
      case "place_manor":
        return { ...empty, mode: "setup_manor", initialManorSites: getLegalInitialManorSites(ctx, state) };
      case "place_route":
        return { ...empty, mode: "setup_route", initialRoutes: getLegalInitialRoutes(ctx, state) };
      case "assign_banners":
        return { ...empty, mode: "setup_banners" };
    }
  }
  if (state.phase === "banner_assignment") return { ...empty, mode: "banner_assignment" };
  if (state.phase === "end") return { ...empty, mode: "end", mustDiscard: Math.max(0, p.hand.length - state.ruleset.handLimit) };

  const r = state.ruleset;
  const routes = ctx.board.topology.routes
    .map((x) => x.id)
    .filter((id) => {
      const c = checkBuildRoute(ctx, state, playerId, id);
      return c.legal && canAffordBuild(state, playerId, c);
    });
  const manorSites = ctx.board.topology.sites
    .map((x) => x.id)
    .filter((id) => {
      const c = checkBuildManor(ctx, state, playerId, id);
      return c.legal && canAffordBuild(state, playerId, c);
    });
  const upgradeSites = getPlayerHoldings(state, playerId)
    .map((h) => h.siteId)
    .filter((id) => {
      const c = checkUpgrade(state, playerId, id);
      return c.legal && canAffordBuild(state, playerId, c);
    });
  const marketTradesLeft = Math.max(0, r.market.maxTradesPerTurn - p.marketTradesThisTurn);
  const marketGive = (Object.keys(p.resources) as ResourceType[]).filter((res) => p.resources[res] >= r.market.give);
  const tradePosts = ownedTradePosts(ctx, state, playerId);
  const writTargets = r.writ.enabled ? getWritTargets(ctx, state, playerId) : [];
  const canIssueWrit =
    r.writ.enabled &&
    p.writsIssuedThisTurn < r.writ.maxPerTurn &&
    writTargets.length > 0 &&
    p.resources.essence >= 1 &&
    Object.values(p.resources).reduce((a, b) => a + b, 0) >= 2;
  const wardenMenaces = Object.values(state.menaces)
    .filter((m) => !(r.warden.guard && m.state.guardedBy && m.state.guardedBy !== playerId))
    .map((m) => m.id);
  const canHireWarden = r.warden.enabled && p.wardensHiredThisTurn < r.warden.maxPerTurn && wardenMenaces.length > 0 && canAfford(p.resources, BALANCE.costs.warden);
  const canBuyCard = r.enableCards && state.cardDeck.length + state.discardPile.length > 0 && canAfford(p.resources, BALANCE.costs.card);
  const playableCards =
    r.enableCards && p.nonReactionCardsPlayedThisTurn < r.maxNonReactionCardsPerTurn
      ? p.hand.filter((c) => ctx.cardOf(c).timing.includes("main") && enumerateCardTargets(ctx, state, playerId, c).length > 0)
      : [];
  const claimableQuests = r.enableQuests
    ? state.revealedQuestIds.filter((q) => !p.claimedQuestIds.includes(q) && getQuestProgress(ctx, state, playerId, q).complete)
    : [];
  return {
    ...empty,
    mode: "main",
    routes,
    manorSites,
    upgradeSites,
    canBuyCard,
    playableCards,
    marketTradesLeft,
    marketGive: marketTradesLeft > 0 ? marketGive : [],
    tradePosts: marketTradesLeft > 0 ? tradePosts.filter((t) => p.resources[t.resource] >= t.give) : [],
    writTargets,
    canIssueWrit,
    canHireWarden,
    wardenMenaces,
    claimableQuests,
  };
}

/** Trading Posts the player holds, whether or not they can pay for a trade now. */
function ownedTradePosts(ctx: RulesContext, state: GameState, playerId: PlayerId): LegalActionSummary["tradePosts"] {
  if (!state.ruleset.enableTradePosts) return [];
  return getPlayerHoldings(state, playerId)
    .map((h) => ({ siteId: h.siteId, post: ctx.board.site(h.siteId).tradePost }))
    .filter((x): x is { siteId: SiteId; post: NonNullable<typeof x.post> } => !!x.post)
    .map((x) => ({ siteId: x.siteId, resource: x.post.resource, give: x.post.give }));
}

/** All valid targets for a card in hand (used by the AI and UI pickers). */
export function enumerateCardTargets(ctx: RulesContext, state: GameState, playerId: PlayerId, cardId: CardId): CardTarget[] {
  const def = ctx.cardOf(cardId);
  const candidates: CardTarget[] = [];
  const menaces = Object.values(state.menaces);
  const regionDests = ctx.board.topology.regions.map((r) => ({ kind: "region" as const, regionId: r.id }));
  const destsFor = (kind: string) =>
    kind === "region"
      ? regionDests
      : kind === "route"
        ? ctx.board.topology.routes.map((r) => ({ kind: "route" as const, routeId: r.id }))
        : ctx.board.topology.sites.map((s) => ({ kind: "site" as const, siteId: s.id }));
  switch (def.effectId) {
    case "wizard_interference":
      for (const b of Object.values(state.banners)) {
        const holding = state.holdings[b.holdingId];
        if (b.ownerId === playerId || !b.regionId || !holding) continue;
        for (const regionId of ctx.board.site(holding.siteId).adjacentRegionIds)
          candidates.push({ effect: "wizard_interference", bannerId: b.id, regionId });
      }
      break;
    case "knight_errant":
      for (const m of menaces) for (const d of destsFor(m.location.kind)) candidates.push({ effect: "knight_errant", menaceId: m.id, destination: d });
      break;
    case "druids_blessing":
      for (const b of Object.values(state.banners)) if (b.ownerId === playerId && b.regionId) candidates.push({ effect: "druids_blessing", bannerId: b.id });
      break;
    case "teleportation_mishap":
      for (const a of menaces) for (const b of menaces) if (a.id < b.id) candidates.push({ effect: "teleportation_mishap", menaceIdA: a.id, menaceIdB: b.id });
      break;
    case "bribe_the_troll":
      for (const d of regionDests) candidates.push({ effect: "bribe_the_troll", destination: d });
      break;
    case "arcane_exchange":
      for (const res of ["grain", "timber", "stone", "iron"] as const) {
        candidates.push({ effect: "arcane_exchange", give: res, receive: "essence" });
        candidates.push({ effect: "arcane_exchange", give: "essence", receive: res });
      }
      break;
    case "festival_at_the_inn":
      for (const res of ["grain", "timber", "stone", "iron", "essence"] as const) candidates.push({ effect: "festival_at_the_inn", choice: res });
      break;
    case "very_minor_prophecy":
      candidates.push({ effect: "very_minor_prophecy" });
      break;
    case "fog_of_confusion":
      for (const r of ctx.board.topology.routes) candidates.push({ effect: "fog_of_confusion", routeId: r.id });
      break;
    case "dragon_whisperer":
      for (const d of regionDests) candidates.push({ effect: "dragon_whisperer", destination: d });
      break;
    case "counterspell":
      return [];
  }
  return candidates.filter((t) => {
    try {
      validateCardTarget(ctx, state, playerId, cardId, t);
      return true;
    } catch (e) {
      if (e instanceof RuleViolation) return false;
      throw e;
    }
  });
}

// ------------------------------------------------------------------ availability

/** The Main-phase actions a UI offers as tools. */
export type PlayerAction = "route" | "manor" | "upgrade" | "market" | "writ" | "warden" | "card";

export const PLAYER_ACTIONS: readonly PlayerAction[] = ["route", "manor", "upgrade", "market", "writ", "warden", "card"];

/** Why an action is unavailable right now, most fundamental first. */
export type UnavailableReason =
  | "WRONG_PHASE"
  | "FEATURE_DISABLED"
  | "LIMIT_REACHED"
  | "NO_TARGET"
  | "DECK_EMPTY"
  | "NO_TRADE_GIVE"
  | "NEED_RESOURCES";

export interface MarketTrade {
  give: ResourceType;
  receive: ResourceType;
  tradePostSiteId?: SiteId;
}

export interface ActionAvailability {
  ok: boolean;
  reason?: UnavailableReason;
  /** Fixed price (without tolls or surcharges), for have/need displays. */
  cost: ResourceCost;
  /** Resources of the payer's choice always owed on top (the Writ bribe). */
  extraAny: number;
  /** NEED_RESOURCES: the shortfall for the cheapest legal target. */
  missing?: ResourceCost;
  /** NEED_RESOURCES: resources of any kind still owed (toll, surcharge, bribe). */
  missingAny?: number;
  /** Trades this turn still allows after which the action is affordable. */
  fixByTrade?: MarketTrade[];
  /** Market only: trades left this turn. */
  tradesLeft?: number;
}

/** A price: a fixed cost plus some resources of the payer's choice. */
interface Price {
  cost: ResourceCost;
  any: number;
}

function costTotal(cost: ResourceCost): number {
  return RESOURCE_TYPES.reduce((s, r) => s + (cost[r] ?? 0), 0);
}

function canPay(have: Resources, price: Price): boolean {
  return canAfford(have, price.cost) && totalResources(have) - costTotal(price.cost) >= price.any;
}

function shortfall(have: Resources, price: Price): { missing: ResourceCost; missingAny: number } {
  const missing: ResourceCost = {};
  let leftover = 0;
  for (const r of RESOURCE_TYPES) {
    const need = price.cost[r] ?? 0;
    if (have[r] < need) missing[r] = need - have[r];
    else leftover += have[r] - need;
  }
  return { missing, missingAny: Math.max(0, price.any - leftover) };
}

/** Distinct prices of a build's legal targets (tolls and surcharges vary per target). */
function buildPrices(checks: BuildCheck[]): Price[] {
  const seen = new Map<string, Price>();
  for (const c of checks) {
    if (!c.legal) continue;
    const any = (c.needsToll ? BALANCE.costs.toll : 0) + (c.needsSurcharge ? BALANCE.costs.goblinSurcharge : 0);
    seen.set(`${JSON.stringify(c.cost)}:${any}`, { cost: c.cost, any });
  }
  return [...seen.values()];
}

/**
 * Trades payable from `have`: Trading Posts first because they are cheaper,
 * then the Market, giving away what the player holds most of.
 */
function tradeOptions(state: GameState, have: Resources, posts: LegalActionSummary["tradePosts"]): { trade: MarketTrade; give: number }[] {
  const out: { trade: MarketTrade; give: number }[] = [];
  for (const p of posts) {
    if (have[p.resource] < p.give) continue;
    for (const r of RESOURCE_TYPES) if (r !== p.resource) out.push({ trade: { give: p.resource, receive: r, tradePostSiteId: p.siteId }, give: p.give });
  }
  const give = state.ruleset.market.give;
  const byStock = [...RESOURCE_TYPES].sort((a, b) => have[b] - have[a]);
  for (const g of byStock) {
    if (have[g] < give) continue;
    for (const r of RESOURCE_TYPES) if (r !== g) out.push({ trade: { give: g, receive: r }, give });
  }
  return out;
}

/** The shortest run of at most `left` trades after which one of `prices` is payable. */
function findTradeFix(
  state: GameState,
  have: Resources,
  prices: Price[],
  posts: LegalActionSummary["tradePosts"],
  left: number,
): MarketTrade[] | undefined {
  const receive = state.ruleset.market.receive;
  let frontier: { have: Resources; trades: MarketTrade[] }[] = [{ have, trades: [] }];
  // Whether a fix exists from here depends only on the resource vector
  // (Trading Posts are reusable within a turn), so each vector is expanded
  // once, at the shallowest depth BFS reaches it. Without this, paths that
  // differ only in trade order multiply by ~20 per extra trade allowed.
  const vectorKey = (res: Resources) => RESOURCE_TYPES.map((r) => res[r]).join(",");
  const seen = new Set([vectorKey(have)]);
  for (let depth = 0; depth < left; depth++) {
    const next: typeof frontier = [];
    for (const node of frontier) {
      for (const o of tradeOptions(state, node.have, posts)) {
        const after = { ...node.have, [o.trade.give]: node.have[o.trade.give] - o.give };
        after[o.trade.receive] += receive;
        const key = vectorKey(after);
        if (seen.has(key)) continue;
        seen.add(key);
        const trades = [...node.trades, o.trade];
        if (prices.some((p) => canPay(after, p))) return trades;
        next.push({ have: after, trades });
      }
    }
    frontier = next;
  }
  return undefined;
}

/**
 * Whether each Main-phase action is available to the player and, if not, why.
 * UIs render the reason instead of re-deriving legality (spec §103). For
 * NEED_RESOURCES it adds the shortfall of the cheapest target and, when the
 * trades left this turn would cover it, which trades to make.
 */
export function getActionAvailability(ctx: RulesContext, state: GameState, playerId: PlayerId): Record<PlayerAction, ActionAvailability> {
  const legal = getLegalActions(ctx, state, playerId);
  const p = state.players[playerId];
  const r = state.ruleset;
  const fixed: Record<PlayerAction, Price> = {
    route: { cost: BALANCE.costs.route, any: 0 },
    manor: { cost: BALANCE.costs.manor, any: 0 },
    upgrade: { cost: BALANCE.costs.stronghold, any: 0 },
    market: { cost: {}, any: 0 },
    writ: { cost: BALANCE.costs.royalWrit, any: BALANCE.costs.royalWritBribe },
    warden: { cost: BALANCE.costs.warden, any: 0 },
    card: { cost: BALANCE.costs.card, any: 0 },
  };
  const tradesLeft = legal.mode === "main" ? legal.marketTradesLeft : 0;
  const out = Object.fromEntries(
    PLAYER_ACTIONS.map((a): [PlayerAction, ActionAvailability] => [
      a,
      { ok: false, cost: { ...fixed[a].cost }, extraAny: fixed[a].any, ...(a === "market" ? { tradesLeft } : {}) },
    ]),
  ) as Record<PlayerAction, ActionAvailability>;
  if (!p || legal.mode !== "main") {
    for (const a of PLAYER_ACTIONS) out[a].reason = "WRONG_PHASE";
    return out;
  }

  // Obstacles that resources cannot fix come first; `prices` holds what the
  // remaining actions would cost (one entry per distinct target price).
  const blocked: Partial<Record<PlayerAction, UnavailableReason>> = {};
  const prices: Partial<Record<PlayerAction, Price[]>> = {
    route: buildPrices(ctx.board.topology.routes.map((x) => checkBuildRoute(ctx, state, playerId, x.id))),
    manor: buildPrices(ctx.board.topology.sites.map((x) => checkBuildManor(ctx, state, playerId, x.id))),
    upgrade: buildPrices(getPlayerHoldings(state, playerId).map((h) => checkUpgrade(state, playerId, h.siteId))),
  };
  for (const a of ["route", "manor", "upgrade"] as const) if (prices[a]?.length === 0) blocked[a] = "NO_TARGET";

  if (tradesLeft === 0) blocked.market = "LIMIT_REACHED";
  else if (legal.marketGive.length + legal.tradePosts.length === 0) blocked.market = "NO_TRADE_GIVE";

  if (!r.writ.enabled) blocked.writ = "FEATURE_DISABLED";
  else if (p.writsIssuedThisTurn >= r.writ.maxPerTurn) blocked.writ = "LIMIT_REACHED";
  else if (legal.writTargets.length === 0) blocked.writ = "NO_TARGET";
  else prices.writ = [fixed.writ];

  if (!r.warden.enabled) blocked.warden = "FEATURE_DISABLED";
  else if (p.wardensHiredThisTurn >= r.warden.maxPerTurn) blocked.warden = "LIMIT_REACHED";
  else if (legal.wardenMenaces.length === 0) blocked.warden = "NO_TARGET";
  else prices.warden = [fixed.warden];

  if (!r.enableCards) blocked.card = "FEATURE_DISABLED";
  else if (state.cardDeck.length + state.discardPile.length === 0) blocked.card = "DECK_EMPTY";
  else prices.card = [fixed.card];

  const posts = ownedTradePosts(ctx, state, playerId);
  for (const a of PLAYER_ACTIONS) {
    const reason = blocked[a];
    if (reason) {
      out[a].reason = reason;
      continue;
    }
    const options = prices[a];
    if (!options || options.some((price) => canPay(p.resources, price))) {
      out[a].ok = true;
      continue;
    }
    const gaps = options.map((price) => shortfall(p.resources, price));
    const size = (g: (typeof gaps)[number]) => costTotal(g.missing) + g.missingAny;
    const best = gaps.reduce((x, y) => (size(y) < size(x) ? y : x));
    out[a].reason = "NEED_RESOURCES";
    out[a].missing = best.missing;
    out[a].missingAny = best.missingAny;
    const fix = findTradeFix(state, p.resources, options, posts, tradesLeft);
    if (fix) out[a].fixByTrade = fix;
  }
  return out;
}

export { holdingAt };
