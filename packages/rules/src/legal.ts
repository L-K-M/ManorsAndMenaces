// Summary of what a player can do right now (spec §36 getLegalCommands).
// Drives UI highlighting and AI candidate generation.

import { BALANCE } from "./balance.js";
import { validateCardTarget } from "./cards.js";
import type { RulesContext } from "./context.js";
import { RuleViolation } from "./errors.js";
import { getQuestProgress } from "./quests.js";
import { canAfford } from "./resources.js";
import {
  canAffordBuild,
  checkBuildManor,
  checkBuildRoute,
  checkUpgrade,
  getLegalInitialManorSites,
  getLegalInitialRoutes,
  getPlayerHoldings,
  getWritTargets,
  holdingAt,
  menaceOfType,
} from "./selectors.js";
import type { CardId, CardTarget, GameState, PlayerId, QuestId, ResourceType, RouteId, SiteId } from "./types.js";
import { HIDDEN_CARD } from "./views.js";
import { RESOURCE_TYPES } from "./types.js";

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

/**
 * Works on redacted views too (§105): HIDDEN_CARD entries are never offered
 * as playable or reaction cards.
 */
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
      return { ...empty, mode: "reaction", reactionCards: p.hand.filter((c) => c !== HIDDEN_CARD && ctx.cardOf(c).timing.includes("reaction")) };
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
  const tradePosts = r.enableTradePosts
    ? getPlayerHoldings(state, playerId)
        .map((h) => ({ siteId: h.siteId, post: ctx.board.site(h.siteId).tradePost }))
        .filter((x): x is { siteId: SiteId; post: NonNullable<typeof x.post> } => !!x.post)
        .map((x) => ({ siteId: x.siteId, resource: x.post.resource, give: x.post.give }))
    : [];
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
      ? p.hand.filter((c) => c !== HIDDEN_CARD && ctx.cardOf(c).timing.includes("main") && enumerateCardTargets(ctx, state, playerId, c).length > 0)
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
      // Banners at home count too: bless one now, assign it this turn, and it pays at the next Harvest.
      for (const b of Object.values(state.banners)) if (b.ownerId === playerId) candidates.push({ effect: "druids_blessing", bannerId: b.id });
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
    case "dragon_whisperer": {
      // With a mixed Hoard the player chooses what to take: one variant per
      // resource type. A single-type (or empty) Hoard needs no choice.
      const dragon = menaceOfType(state, "young_dragon");
      const hoardTypes = RESOURCE_TYPES.filter((r) => (dragon?.state.hoard?.[r] ?? 0) > 0);
      for (const d of regionDests) {
        if (hoardTypes.length > 1) for (const take of hoardTypes) candidates.push({ effect: "dragon_whisperer", destination: d, take });
        else candidates.push({ effect: "dragon_whisperer", destination: d });
      }
      break;
    }
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

export { holdingAt };
