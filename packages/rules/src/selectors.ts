// Pure read-only helpers over GameState (spec §108). The UI and AI use these
// for previews and highlighting; the engine uses the same functions to
// validate commands, so what the UI shows as legal is exactly what is legal.

import { BALANCE } from "./balance.js";
import type { RulesContext } from "./context.js";
import type { HarvestNote } from "./events.js";
import { own } from "./clone.js";
import { compareIds } from "./ids.js";
import { addCost, canAfford } from "./resources.js";
import {
  RESOURCE_TYPES,
  type ActiveEffect,
  type Banner,
  type BannerId,
  type CardId,
  type ChargeId,
  type GameState,
  type Holding,
  type MenaceId,
  type MenaceInstance,
  type MenaceLocation,
  type MenaceType,
  type PlayerId,
  type QuestId,
  type RegionId,
  type ResourceCost,
  type ResourceType,
  type RouteId,
  type SiteId,
} from "./types.js";

// ------------------------------------------------------------------ basics

export function getPlayerHoldings(state: GameState, playerId: PlayerId): Holding[] {
  return (state.players[playerId]?.holdingIds ?? []).map((id) => state.holdings[id]).filter((h): h is Holding => !!h);
}

export function getPlayerRoutes(state: GameState, playerId: PlayerId): RouteId[] {
  return state.players[playerId]?.routeIds ?? [];
}

export function getPlayerBanners(state: GameState, playerId: PlayerId): Banner[] {
  return Object.values(state.banners)
    .filter((b) => b.ownerId === playerId)
    .sort((a, b) => compareIds(a.id, b.id));
}

export function holdingAt(state: GameState, siteId: SiteId): Holding | undefined {
  for (const h of Object.values(state.holdings)) if (h.siteId === siteId) return h;
  return undefined;
}

export function sameLocation(a: MenaceLocation, b: MenaceLocation): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "region":
      return a.regionId === (b as typeof a).regionId;
    case "route":
      return a.routeId === (b as typeof a).routeId;
    case "site":
      return a.siteId === (b as typeof a).siteId;
  }
}

export function menaceAt(state: GameState, location: MenaceLocation): MenaceInstance | undefined {
  for (const m of Object.values(state.menaces)) if (sameLocation(m.location, location)) return m;
  return undefined;
}

export function menaceOfType(state: GameState, type: MenaceType): MenaceInstance | undefined {
  return Object.values(state.menaces).find((m) => m.type === type);
}

export function menaceInRegion(state: GameState, regionId: RegionId): MenaceInstance | undefined {
  return menaceAt(state, { kind: "region", regionId });
}

export function getRegionOccupancy(state: GameState, regionId: RegionId): Banner[] {
  return Object.values(state.banners).filter((b) => b.regionId === regionId);
}

export function bannersSupported(holding: Holding): number {
  return holding.type === "manor" ? BALANCE.banners.manor : BALANCE.banners.stronghold;
}

// ------------------------------------------------------------------ renown

export function getRenown(ctx: RulesContext, state: GameState, playerId: PlayerId): number {
  const p = state.players[playerId];
  if (!p) return 0;
  let renown = p.bonusRenown + (p.levyRenown ?? 0) + (p.favour ?? 0) - (p.lostRenown ?? 0);
  for (const h of getPlayerHoldings(state, playerId)) renown += h.type === "manor" ? BALANCE.renown.manor : BALANCE.renown.stronghold;
  for (const q of p.claimedQuestIds) renown += ctx.quest(q).renown;
  renown += (p.revealedChargeIds?.length ?? 0) * BALANCE.sealedCharges.renown;
  return renown;
}

/** Where a player's Renown comes from (§7). The parts sum to `getRenown`. */
export interface RenownSources {
  total: number;
  manors: { count: number; renown: number };
  strongholds: { count: number; renown: number };
  /** Claimed Royal Quests, in the order they were claimed. */
  quests: { questId: QuestId; renown: number }[];
  /** Renown from answering the Crown's Levy (§27.3). */
  levy: number;
  /** Sealed Charges met and revealed (§27A), in the order they were revealed. */
  charges: { chargeId: ChargeId; renown: number }[];
  /** Renown granted outright, such as by the Unreliable Bard. */
  bonus: number;
  /** Renown lost for the rest of the game (Disgrace, Stolen Glory), subtracted from the total. */
  lost: number;
  /** Favour won through the Crown's Voice (§129.10). */
  favour: number;
}

// Kept apart from getRenown, which the AI calls in its inner loops.
export function getRenownSources(ctx: RulesContext, state: GameState, playerId: PlayerId): RenownSources {
  const p = state.players[playerId];
  const holdings = getPlayerHoldings(state, playerId);
  const manors = holdings.filter((h) => h.type === "manor").length;
  const strongholds = holdings.filter((h) => h.type === "stronghold").length;
  const quests = (p?.claimedQuestIds ?? []).map((questId) => ({ questId, renown: ctx.quest(questId).renown }));
  return {
    total: getRenown(ctx, state, playerId),
    manors: { count: manors, renown: manors * BALANCE.renown.manor },
    strongholds: { count: strongholds, renown: strongholds * BALANCE.renown.stronghold },
    quests,
    levy: p?.levyRenown ?? 0,
    charges: (p?.revealedChargeIds ?? []).map((chargeId) => ({ chargeId, renown: BALANCE.sealedCharges.renown })),
    bonus: p?.bonusRenown ?? 0,
    lost: p?.lostRenown ?? 0,
    favour: p?.favour ?? 0,
  };
}

// ------------------------------------------------------------------ the Crown's Levy (§27.3)

/**
 * Why the player may not answer this round's Levy now, resources aside; null
 * if they may. The phase and whose turn it is are the caller's to check.
 */
export function levyClosedReason(state: GameState, playerId: PlayerId): "FEATURE_DISABLED" | "LEVY_NOT_ACTIVE" | "LEVY_LIMIT_REACHED" | null {
  if (!state.ruleset.crownLevy) return "FEATURE_DISABLED";
  if (!state.crownLevy?.current) return "LEVY_NOT_ACTIVE";
  if (state.crownLevy.answeredBy.includes(playerId)) return "LEVY_LIMIT_REACHED";
  return null;
}

/** What answering this round's Levy costs, or null when there is none to answer (§27.3). */
export function levyCost(state: GameState): ResourceCost | null {
  const current = state.crownLevy?.current;
  const rules = state.ruleset.crownLevy;
  return current && rules ? { [current]: rules.price } : null;
}

// ------------------------------------------------------------------ network (§13)

export interface NetworkOptions {
  /** Treat a Highwayman Route as usable (the build will pay the toll). */
  allowHighwayman?: boolean;
}

export function isRouteUsable(state: GameState, routeId: RouteId, opts: NetworkOptions = {}): boolean {
  if (state.activeEffects.some((e) => e.kind === "fog" && e.routeId === routeId)) return false;
  const m = menaceAt(state, { kind: "route", routeId });
  if (m?.type === "highwayman" && !opts.allowHighwayman) return false;
  return true;
}

export function isNetworkSite(ctx: RulesContext, state: GameState, playerId: PlayerId, siteId: SiteId, opts: NetworkOptions = {}): boolean {
  const h = holdingAt(state, siteId);
  if (h?.ownerId === playerId) return true;
  if (h && h.ownerId !== playerId) return false;
  return isRouteEndpointSite(ctx, state, playerId, siteId, opts);
}

/** Endpoint of one of the player's usable Routes and not an opponent's Holding. */
export function isRouteEndpointSite(ctx: RulesContext, state: GameState, playerId: PlayerId, siteId: SiteId, opts: NetworkOptions = {}): boolean {
  const h = holdingAt(state, siteId);
  if (h && h.ownerId !== playerId) return false;
  return ctx.board.routesAt(siteId).some((r) => state.routeOwners[r.id] === playerId && isRouteUsable(state, r.id, opts));
}

export function getNetworkSites(ctx: RulesContext, state: GameState, playerId: PlayerId, opts: NetworkOptions = {}): SiteId[] {
  return ctx.board.topology.sites.map((s) => s.id).filter((id) => isNetworkSite(ctx, state, playerId, id, opts));
}

/** §10.3 one-edge spacing rule. */
export function passesSpacing(ctx: RulesContext, state: GameState, siteId: SiteId): boolean {
  if (holdingAt(state, siteId)) return false;
  return ctx.board.neighbours(siteId).every((n) => !holdingAt(state, n));
}

/**
 * A full board (§7): no Site could take a new Manor, whoever builds, because
 * each is built on, in ruins or too close to a Holding (§10.3), and every
 * Holding is a Stronghold, so no build can gain Renown. A razed Site (§19.24)
 * counts as open, since its owner may rebuild there, even beside their own
 * Holdings (§19.28): its mark ends with the owner's next turn, so they always
 * have that turn to rebuild.
 *
 * A Site The Dowager (§19.28) could still take does not count as open. Hands
 * are hidden, and this runs on redacted views too (clients, AI planning), so
 * a test that looked into hands would disagree with the server's; and a card
 * held back would keep the game open for good. Once played, her Manor makes
 * the board not full until it is raised to a Stronghold.
 */
export function isBoardFull(ctx: RulesContext, state: GameState): boolean {
  if (state.activeEffects.some((e) => e.kind === "razed")) return false;
  const occupied = new Set<SiteId>();
  for (const h of Object.values(state.holdings)) {
    if (h.type === "manor") return false;
    occupied.add(h.siteId);
  }
  // passesSpacing, for every Site at once.
  return ctx.board.topology.sites.every(({ id }) => occupied.has(id) || isRuinedSite(state, id) || ctx.board.neighbours(id).some((n) => occupied.has(n)));
}

// ------------------------------------------------------------------ game end (§7)
// The End Turn checks (engine.ts endTurn) and hasNextHarvest (nextHarvest.ts)
// share these.

/** Whether the player takes the round's last turn, so their End Turn ends the round. */
export function isLastSeat(state: GameState, playerId: PlayerId): boolean {
  return state.turnOrder.indexOf(playerId) === state.turnOrder.length - 1;
}

/**
 * Whether the round in play is the game's last (§7): the game ends when it
 * ends. Never in games created without one (before ruleset 0.8.0).
 */
export function isLastRound(state: GameState): boolean {
  const lastRound = state.ruleset.lastRound ?? 0;
  return lastRound > 0 && state.round >= lastRound;
}

/** Players with the target Renown, in turn order: an End Turn now ends the game (§7). */
export function playersAtTarget(ctx: RulesContext, state: GameState): PlayerId[] {
  return state.turnOrder.filter((id) => getRenown(ctx, state, id) >= state.ruleset.targetRenown);
}

/** Whether a round that ends now ends the game on a full board (§7). */
export function endsOnFullBoard(ctx: RulesContext, state: GameState): boolean {
  return state.ruleset.endOnFullBoard === true && isBoardFull(ctx, state);
}

// ------------------------------------------------------------------ build requirements

export type BuildCheck =
  | { legal: true; cost: ResourceCost; needsToll: boolean; needsSurcharge: boolean }
  | { legal: false; reason: import("./errors.js").RuleErrorCode };

/** Whether a Route can be built, ignoring resources; and what payment it needs. */
export function checkBuildRoute(ctx: RulesContext, state: GameState, playerId: PlayerId, routeId: RouteId): BuildCheck {
  if (!ctx.board.hasRoute(routeId)) return { legal: false, reason: "UNKNOWN_ENTITY" };
  if (state.routeOwners[routeId] !== undefined) return { legal: false, reason: "ROUTE_OCCUPIED" };
  if (isSmoulderingFor(state, routeId, playerId)) return { legal: false, reason: "ROUTE_SMOULDERING" };
  const r = ctx.board.route(routeId);
  const connected = (opts: NetworkOptions): boolean =>
    isNetworkSite(ctx, state, playerId, r.siteA, opts) || isNetworkSite(ctx, state, playerId, r.siteB, opts);
  if (connected({})) return { legal: true, cost: { ...BALANCE.costs.route }, needsToll: false, needsSurcharge: false };
  if (connected({ allowHighwayman: true })) return { legal: true, cost: { ...BALANCE.costs.route }, needsToll: true, needsSurcharge: false };
  return { legal: false, reason: "NOT_CONNECTED" };
}

/** How the spacing rule (§10.3) applies to a new Manor. */
enum Spacing {
  /** No Holding may stand next to the Site. */
  Ordinary = "ordinary",
  /** Only a rival's Holding may not: The Dowager's Manor, and its owner's rebuild of a Manor burned beside their own Holdings (§19.28). */
  BesideOwnHoldings = "beside_own_holdings",
}

export type SiteClosedReason = "SITE_OCCUPIED" | "SITE_RUINED" | "SITE_RAZED" | "SITE_TOO_CLOSE";

/**
 * Why the player may not put a Manor on the Site whatever their network: it
 * is built on, in ruins (Siege Fireball), razed for someone else or next to
 * such a Site (Raiders), or too close to a Holding (§10.3). Null if open.
 */
function siteClosedReason(
  ctx: RulesContext,
  state: GameState,
  playerId: PlayerId,
  siteId: SiteId,
  spacing = Spacing.Ordinary,
): SiteClosedReason | null {
  if (holdingAt(state, siteId)) return "SITE_OCCUPIED";
  if (isRuinedSite(state, siteId)) return "SITE_RUINED";
  if ([siteId, ...ctx.board.neighbours(siteId)].some((id) => isRazedFor(state, id, playerId))) return "SITE_RAZED";
  const tooClose = (n: SiteId): boolean => {
    const h = holdingAt(state, n);
    return !!h && (spacing === Spacing.Ordinary || h.ownerId !== playerId);
  };
  if (ctx.board.neighbours(siteId).some(tooClose)) return "SITE_TOO_CLOSE";
  return null;
}

/**
 * The player's own razed mark on the Site: Raiders burned their Manor there
 * and their rebuild window is still open (§19.24).
 */
export function ownRazedMark(state: GameState, playerId: PlayerId, siteId: SiteId): Extract<ActiveEffect, { kind: "razed" }> | undefined {
  return state.activeEffects.find((e): e is Extract<ActiveEffect, { kind: "razed" }> => e.kind === "razed" && e.siteId === siteId && e.ownerId === playerId);
}

/**
 * Why no ordinary Manor may go on the Site whatever the builder's network and
 * purse, or null if one may once a network reaches it: for the player, or
 * with no player, for anyone in the game (then the first player's reason).
 * The rebuild of a Manor burned beside its owner's Holdings waives spacing
 * toward them (§19.24). The Dowager's waiver is left out, as in isBoardFull:
 * a card in a hand is not public.
 */
export function manorSiteClosedReason(ctx: RulesContext, state: GameState, playerId: PlayerId | null, siteId: SiteId): SiteClosedReason | null {
  if (playerId === null) {
    const reasons = state.turnOrder.map((p) => manorSiteClosedReason(ctx, state, p, siteId));
    return reasons.includes(null) ? null : (reasons[0] ?? null);
  }
  const spacing = ownRazedMark(state, playerId, siteId)?.besideOwnHoldings ? Spacing.BesideOwnHoldings : Spacing.Ordinary;
  return siteClosedReason(ctx, state, playerId, siteId, spacing);
}

/** Whether the player could build a Manor on the Site once their network reaches it (for planning ahead). */
export function isSiteOpenFor(ctx: RulesContext, state: GameState, playerId: PlayerId, siteId: SiteId): boolean {
  return manorSiteClosedReason(ctx, state, playerId, siteId) === null;
}

export function checkBuildManor(ctx: RulesContext, state: GameState, playerId: PlayerId, siteId: SiteId): BuildCheck {
  if (!ctx.board.hasSite(siteId)) return { legal: false, reason: "UNKNOWN_ENTITY" };
  const closed = manorSiteClosedReason(ctx, state, playerId, siteId);
  if (closed) return { legal: false, reason: closed };
  const needsSurcharge = menaceAt(state, { kind: "site", siteId })?.type === "goblin_tinkers";
  const base = { cost: { ...BALANCE.costs.manor }, needsSurcharge };
  if (isRouteEndpointSite(ctx, state, playerId, siteId)) return { legal: true, ...base, needsToll: false };
  if (isRouteEndpointSite(ctx, state, playerId, siteId, { allowHighwayman: true })) return { legal: true, ...base, needsToll: true };
  return { legal: false, reason: "NOT_CONNECTED" };
}

/**
 * The Dowager (§19.28): whether the player may build her Manor on the Site,
 * ignoring resources, and what payment it needs. One of their usable Routes
 * must join one of their Strongholds to the empty Site, and no rival's
 * Holding may stand next to it; their own may. The toll and surcharge are
 * those of any Manor there.
 */
export function checkDowerHouse(ctx: RulesContext, state: GameState, playerId: PlayerId, siteId: SiteId): BuildCheck {
  if (!ctx.board.hasSite(siteId)) return { legal: false, reason: "UNKNOWN_ENTITY" };
  const closed = siteClosedReason(ctx, state, playerId, siteId, Spacing.BesideOwnHoldings);
  if (closed && closed !== "SITE_TOO_CLOSE") return { legal: false, reason: closed };
  const fromStronghold = (opts: NetworkOptions): boolean =>
    ctx.board.routesAt(siteId).some((r) => {
      if (state.routeOwners[r.id] !== playerId || !isRouteUsable(state, r.id, opts)) return false;
      const h = holdingAt(state, ctx.board.otherEnd(r, siteId));
      return h?.ownerId === playerId && h.type === "stronghold";
    });
  const needsToll = !fromStronghold({});
  if (needsToll && !fromStronghold({ allowHighwayman: true })) return { legal: false, reason: "NOT_CONNECTED" };
  // A rival's Holding next door: checked after the Route, which the card names first.
  if (closed) return { legal: false, reason: closed };
  const needsSurcharge = menaceAt(state, { kind: "site", siteId })?.type === "goblin_tinkers";
  return { legal: true, cost: { ...BALANCE.costs.manor }, needsToll, needsSurcharge };
}

export function checkUpgrade(state: GameState, playerId: PlayerId, siteId: SiteId): BuildCheck {
  const h = holdingAt(state, siteId);
  if (!h || h.ownerId !== playerId) return { legal: false, reason: "UNKNOWN_ENTITY" };
  // A distinct code from SITE_OCCUPIED: the site is yours, it is just fully upgraded.
  if (h.type !== "manor") return { legal: false, reason: "ALREADY_STRONGHOLD" };
  const needsSurcharge = menaceAt(state, { kind: "site", siteId })?.type === "goblin_tinkers";
  return { legal: true, cost: { ...BALANCE.costs.stronghold }, needsToll: false, needsSurcharge };
}

/** Total payment for a build, including chosen toll/surcharge resources. */
export function totalBuildCost(check: Extract<BuildCheck, { legal: true }>, toll?: ResourceType, surcharge?: ResourceType): ResourceCost {
  let cost = check.cost;
  if (check.needsToll && toll) cost = addCost(cost, { [toll]: BALANCE.costs.toll });
  if (check.needsSurcharge && surcharge) cost = addCost(cost, { [surcharge]: BALANCE.costs.goblinSurcharge });
  return cost;
}

/** Whether the player can pay the build given some choice of toll/surcharge. */
export function canAffordBuild(state: GameState, playerId: PlayerId, check: Extract<BuildCheck, { legal: true }>): boolean {
  const have = state.players[playerId]?.resources;
  if (!have) return false;
  const tolls: (ResourceType | undefined)[] = check.needsToll ? [...RESOURCE_TYPES] : [undefined];
  const surcharges: (ResourceType | undefined)[] = check.needsSurcharge ? [...RESOURCE_TYPES] : [undefined];
  return tolls.some((t) => surcharges.some((s) => canAfford(have, totalBuildCost(check, t, s))));
}

export function getLegalBuildSites(ctx: RulesContext, state: GameState, playerId: PlayerId): SiteId[] {
  return ctx.board.topology.sites.map((s) => s.id).filter((id) => checkBuildManor(ctx, state, playerId, id).legal);
}

export function getLegalRoutes(ctx: RulesContext, state: GameState, playerId: PlayerId): RouteId[] {
  return ctx.board.topology.routes.map((r) => r.id).filter((id) => checkBuildRoute(ctx, state, playerId, id).legal);
}

// ------------------------------------------------------------------ setup legality

/** Why a starting Manor can't go on the Site (§28), in the engine's order, or null if it can. */
export function initialManorClosedReason(ctx: RulesContext, state: GameState, siteId: SiteId): "SITE_OCCUPIED" | "SITE_RUINED" | "SITE_TOO_CLOSE" | null {
  if (holdingAt(state, siteId)) return "SITE_OCCUPIED";
  if (isRuinedSite(state, siteId)) return "SITE_RUINED";
  if (!passesSpacing(ctx, state, siteId)) return "SITE_TOO_CLOSE";
  return null;
}

/** Why a starting Route can't be built (§28): it is taken, or does not touch the Manor just placed. Null if it can. */
export function initialRouteClosedReason(ctx: RulesContext, state: GameState, routeId: RouteId): "ROUTE_OCCUPIED" | "NOT_CONNECTED" | null {
  if (state.routeOwners[routeId] !== undefined) return "ROUTE_OCCUPIED";
  const siteId = state.setup?.lastPlacedSiteId;
  const r = ctx.board.route(routeId);
  if (!siteId || (r.siteA !== siteId && r.siteB !== siteId)) return "NOT_CONNECTED";
  return null;
}

export function getLegalInitialManorSites(ctx: RulesContext, state: GameState): SiteId[] {
  return ctx.board.topology.sites.map((s) => s.id).filter((id) => initialManorClosedReason(ctx, state, id) === null);
}

export function getLegalInitialRoutes(ctx: RulesContext, state: GameState): RouteId[] {
  const siteId = state.setup?.lastPlacedSiteId;
  if (!siteId) return [];
  return ctx.board.routesAt(siteId).filter((r) => initialRouteClosedReason(ctx, state, r.id) === null).map((r) => r.id);
}

// ------------------------------------------------------------------ banners (§14)

/** Why a Region next to a Banner's Holding can't take that Banner. */
export type BannerRegionBlock =
  /** Full, and one of the Banners filling it belongs to the same player. */
  | "full_own"
  /** Full of other players' Banners. */
  | "full_rival"
  /** The other Banner of the same Stronghold is there (§14). */
  | "stronghold_pair";

export interface BannerRegionOption {
  regionId: RegionId;
  blockedBy: BannerRegionBlock | null;
}

/**
 * Every Region next to a Banner's Holding and whether the Banner may occupy
 * it, given a (possibly draft) assignment map that overrides current
 * positions. Lets a UI explain why a Banner has nowhere to go.
 */
export function getBannerRegionOptions(
  ctx: RulesContext,
  state: GameState,
  bannerId: BannerId,
  draft: Readonly<Record<BannerId, RegionId | null>> = {},
): BannerRegionOption[] {
  const banner = own(state.banners, bannerId);
  if (!banner) return [];
  const holding = state.holdings[banner.holdingId];
  if (!holding) return [];
  const positionOf = (b: Banner): RegionId | null => (b.id in draft ? (draft[b.id] ?? null) : b.regionId);
  const siblings = Object.values(state.banners).filter((b) => b.holdingId === banner.holdingId && b.id !== bannerId);
  return ctx.board.site(holding.siteId).adjacentRegionIds.map((regionId): BannerRegionOption => {
    const region = ctx.board.region(regionId);
    const occupants = Object.values(state.banners).filter((b) => b.id !== bannerId && positionOf(b) === regionId);
    if (occupants.length >= region.capacity) {
      const ownFull = occupants.some((b) => b.ownerId === banner.ownerId);
      return { regionId, blockedBy: ownFull ? "full_own" : "full_rival" };
    }
    if (siblings.some((s) => positionOf(s) === regionId)) return { regionId, blockedBy: "stronghold_pair" };
    return { regionId, blockedBy: null };
  });
}

/**
 * Regions a Banner may legally occupy given a (possibly draft) assignment map
 * that overrides current positions. Does not include `null` (always legal).
 */
export function getLegalBannerRegions(
  ctx: RulesContext,
  state: GameState,
  bannerId: BannerId,
  draft: Readonly<Record<BannerId, RegionId | null>> = {},
): RegionId[] {
  return getBannerRegionOptions(ctx, state, bannerId, draft)
    .filter((o) => o.blockedBy === null)
    .map((o) => o.regionId);
}

/** Validates a complete assignment for all of one player's Banners. */
export function validateBannerAssignment(
  ctx: RulesContext,
  state: GameState,
  playerId: PlayerId,
  assignments: Readonly<Record<BannerId, RegionId | null>>,
): import("./errors.js").RuleValidation {
  for (const [bannerId, regionId] of Object.entries(assignments)) {
    const b = own(state.banners, bannerId);
    if (!b) return { ok: false, error: { code: "UNKNOWN_ENTITY", detail: bannerId } };
    if (b.ownerId !== playerId) return { ok: false, error: { code: "BANNER_NOT_OWNED", detail: bannerId } };
    if (regionId === null) continue;
    if (!ctx.board.hasRegion(regionId)) return { ok: false, error: { code: "UNKNOWN_ENTITY", detail: regionId } };
    const holding = state.holdings[b.holdingId];
    if (!holding || !ctx.board.site(holding.siteId).adjacentRegionIds.includes(regionId))
      return { ok: false, error: { code: "BANNER_NOT_ADJACENT", detail: bannerId } };
  }
  // Check the resulting whole board: capacity and the Stronghold restriction.
  const positionOf = (b: Banner): RegionId | null => (b.id in assignments ? (assignments[b.id] ?? null) : b.regionId);
  const counts = new Map<RegionId, number>();
  for (const b of Object.values(state.banners)) {
    const r = positionOf(b);
    if (r) counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  for (const [regionId, n] of counts) {
    if (n > ctx.board.region(regionId).capacity) return { ok: false, error: { code: "REGION_FULL", detail: regionId } };
  }
  const byHolding = new Map<string, RegionId[]>();
  for (const b of Object.values(state.banners)) {
    const r = positionOf(b);
    if (!r) continue;
    const list = byHolding.get(b.holdingId) ?? [];
    if (list.includes(r)) return { ok: false, error: { code: "STRONGHOLD_BANNERS_SAME_REGION", detail: b.holdingId } };
    list.push(r);
    byHolding.set(b.holdingId, list);
  }
  return { ok: true };
}

// ------------------------------------------------------------------ harvest (§15, §31)

export interface BannerHarvest {
  bannerId: BannerId;
  regionId: RegionId;
  /** Resource type after conversion; null when blocked. */
  produced: ResourceType | null;
  /** Amount the owner gains from this Banner. */
  amount: number;
  notes: HarvestNote[];
  /** A Dragon diverts production into its Hoard. */
  hoard?: { menaceId: MenaceId; resource: ResourceType };
}

/** Resolve one Banner's production through the layers of §31. */
export function computeBannerHarvest(ctx: RulesContext, state: GameState, banner: Banner, regionId: RegionId): BannerHarvest {
  const region = ctx.board.region(regionId);
  const notes: HarvestNote[] = [];
  const menace = menaceInRegion(state, regionId);
  // 1–2. base production, then complete blockers
  if (menace?.type === "toll_troll") {
    return { bannerId: banner.id, regionId, produced: null, amount: 0, notes: ["blocked_by_troll"] };
  }
  if (state.activeEffects.some((e) => e.kind === "sick" && e.bannerId === banner.id)) {
    return { bannerId: banner.id, regionId, produced: null, amount: 0, notes: ["sick"] };
  }
  // 3. converters
  let produced: ResourceType = region.resource;
  if (menace?.type === "bog_witch" && produced !== "essence") {
    produced = "essence";
    notes.push("converted_by_witch");
  }
  // 4. bonuses — Druid's Blessing checks the original Region resource.
  let amount = 1;
  const blessed = state.activeEffects.some((e) => e.kind === "druids_blessing" && e.bannerId === banner.id);
  if (blessed && (region.resource === "grain" || region.resource === "timber")) {
    amount += 1;
    notes.push("druids_blessing");
  }
  // 5. theft / diversion
  if (menace?.type === "young_dragon") {
    notes.push("taken_by_dragon");
    return { bannerId: banner.id, regionId, produced, amount: 0, notes, hoard: { menaceId: menace.id, resource: produced } };
  }
  return { bannerId: banner.id, regionId, produced, amount, notes };
}

export interface HarvestPreview {
  banners: BannerHarvest[];
  totals: Record<ResourceType, number>;
  total: number;
}

/** §54 — what the player's next Harvest would yield with the given assignment. */
export function getHarvestPreview(
  ctx: RulesContext,
  state: GameState,
  playerId: PlayerId,
  draft: Readonly<Record<BannerId, RegionId | null>> = {},
): HarvestPreview {
  const totals: Record<ResourceType, number> = { grain: 0, timber: 0, stone: 0, iron: 0, essence: 0 };
  const banners: BannerHarvest[] = [];
  for (const b of getPlayerBanners(state, playerId)) {
    const regionId = b.id in draft ? (draft[b.id] ?? null) : b.regionId;
    if (!regionId) continue;
    const h = computeBannerHarvest(ctx, state, b, regionId);
    banners.push(h);
    if (h.produced && h.amount > 0) totals[h.produced] += h.amount;
  }
  return { banners, totals, total: RESOURCE_TYPES.reduce((s, r) => s + totals[r], 0) };
}

/**
 * Search nodes `getBannerAdvice` visits at most. The largest position
 * measured in AI games (12 Banners) needed under 3,000.
 */
const BANNER_ADVICE_BUDGET = 50_000;

/** Why a suggested move helps: the Banner's own gain, or room for another. */
export type BannerMoveReason = "unplaced" | "blocked_by_troll" | "taken_by_dragon" | "blessing_lost" | "make_room";

export interface BannerMove {
  bannerId: BannerId;
  from: RegionId | null;
  to: RegionId | null;
  reason: BannerMoveReason;
}

export interface BannerAdviceOptions {
  /** Search nodes to visit at most; the default suits a warning shown before End Turn. */
  budget?: number;
  /** The advice is the draft or a placement this accepts. */
  keep?: (assignment: Readonly<Record<BannerId, RegionId | null>>) => boolean;
}

export interface BannerAdvice {
  /** Next Harvest total with the draft as it stands. */
  current: number;
  /** Highest next Harvest total found over legal placements of the player's own Banners. */
  best: number;
  /** A placement of every one of the player's Banners that yields `best`. */
  assignment: Record<BannerId, RegionId | null>;
  /**
   * The changes from the draft to `assignment`, ordered so each can be made
   * in turn. A Banner that goes home first to break a swap has two.
   */
  moves: BannerMove[];
}

/**
 * §16.3: the best placement of the player's own Banners for the next
 * Harvest, for a warning before the turn ends: warn when `best > current`.
 * Rival Banners stay where they are, and among placements with the same
 * total the one with the fewest moves wins. Like the Harvest preview, it
 * assumes the board does not change before that Harvest.
 *
 * A branch-and-bound over the Banners, fewest adjacent Regions first. It
 * starts from the draft when that is legal, so running out of `budget`
 * can only miss a gain, never suggest a worse or illegal placement. With
 * `keep`, a complete placement it rejects is never taken.
 */
export function getBannerAdvice(
  ctx: RulesContext,
  state: GameState,
  playerId: PlayerId,
  draft: Readonly<Record<BannerId, RegionId | null>> = {},
  { budget = BANNER_ADVICE_BUDGET, keep }: BannerAdviceOptions = {},
): BannerAdvice {
  const banners = getPlayerBanners(state, playerId);
  const placed: Record<BannerId, RegionId | null> = {};
  for (const b of banners) placed[b.id] = b.id in draft ? (draft[b.id] ?? null) : b.regionId;
  const current = getHarvestPreview(ctx, state, playerId, placed).total;

  const amounts = new Map<string, number>();
  const amountOf = (b: Banner, regionId: RegionId | null): number => {
    if (!regionId) return 0;
    const key = `${b.id} ${regionId}`;
    let amount = amounts.get(key);
    if (amount === undefined) {
      amount = computeBannerHarvest(ctx, state, b, regionId).amount;
      amounts.set(key, amount);
    }
    return amount;
  };
  // One more resource outweighs any number of Banners left where they are.
  const weight = banners.length + 1;
  const scoreOf = (b: Banner, regionId: RegionId | null): number => amountOf(b, regionId) * weight + (placed[b.id] === regionId ? 1 : 0);
  const adjacent = (b: Banner): readonly RegionId[] => {
    const holding = state.holdings[b.holdingId];
    return holding ? ctx.board.site(holding.siteId).adjacentRegionIds : [];
  };

  const order = [...banners].sort((a, b) => adjacent(a).length - adjacent(b).length);
  // What order[i..] could add at most, ignoring room in the Regions.
  const bound: number[] = new Array<number>(order.length + 1).fill(0);
  for (let i = order.length - 1; i >= 0; i--) {
    const b = order[i] as Banner;
    bound[i] = (bound[i + 1] ?? 0) + Math.max(scoreOf(b, null), ...adjacent(b).map((r) => scoreOf(b, r)));
  }

  // Banners not yet decided wait at home, where they block nothing.
  const work: Record<BannerId, RegionId | null> = {};
  for (const b of banners) work[b.id] = null;
  // getLegalBannerRegions against `work`, without scanning every Banner at
  // every step: rival Banners stay put, so the Banners in each Region are
  // counted once and kept up to date as the search places the player's own.
  const mine = new Set(banners.map((b) => b.id));
  const inRegion = new Map<RegionId, number>();
  for (const b of Object.values(state.banners)) if (!mine.has(b.id) && b.regionId) inRegion.set(b.regionId, (inRegion.get(b.regionId) ?? 0) + 1);
  const siblings = new Map(banners.map((b) => [b.id, Object.values(state.banners).filter((o) => o.holdingId === b.holdingId && o.id !== b.id)]));
  const positionOf = (b: Banner): RegionId | null => (mine.has(b.id) ? (work[b.id] ?? null) : b.regionId);
  const hasRoom = (b: Banner, r: RegionId): boolean =>
    (inRegion.get(r) ?? 0) < ctx.board.region(r).capacity && !siblings.get(b.id)?.some((o) => positionOf(o) === r);
  // Each Banner's places, best first (home last among equals); the search
  // skips those without room.
  const choices = new Map(
    banners.map((b) => [b.id, [...adjacent(b), null].map((regionId) => ({ regionId, score: scoreOf(b, regionId) })).sort((x, y) => y.score - x.score)]),
  );
  const moveTo = (b: Banner, regionId: RegionId | null): void => {
    const from = work[b.id];
    if (from) inRegion.set(from, (inRegion.get(from) ?? 0) - 1);
    if (regionId) inRegion.set(regionId, (inRegion.get(regionId) ?? 0) + 1);
    work[b.id] = regionId;
  };
  let best = validateBannerAssignment(ctx, state, playerId, placed).ok
    ? { score: banners.reduce((n, b) => n + scoreOf(b, placed[b.id] ?? null), 0), assignment: { ...placed } }
    : { score: -1, assignment: { ...work } };
  let nodes = 0;
  const visit = (i: number, score: number): void => {
    if (++nodes > budget) return;
    const b = order[i];
    if (!b) {
      if (score > best.score && (!keep || keep(work))) best = { score, assignment: { ...work } };
      return;
    }
    if (score + (bound[i] ?? 0) <= best.score) return;
    const options = (choices.get(b.id) ?? []).filter((o) => o.regionId === null || hasRoom(b, o.regionId));
    for (const o of options) {
      moveTo(b, o.regionId);
      visit(i + 1, score + o.score);
    }
    moveTo(b, null);
  };
  visit(0, 0);

  const assignment = best.assignment;
  const moves = banners
    .filter((b) => (assignment[b.id] ?? null) !== placed[b.id])
    .map((b): BannerMove => {
      const from = placed[b.id] ?? null;
      const to = assignment[b.id] ?? null;
      return { bannerId: b.id, from, to, reason: moveReason(ctx, state, b, from, to) };
    });
  return {
    current,
    best: getHarvestPreview(ctx, state, playerId, assignment).total,
    assignment,
    moves: inPlayableOrder(ctx, state, placed, moves),
  };
}

/** Why moving `banner` from `from` to `to` is part of the best placement. */
function moveReason(ctx: RulesContext, state: GameState, banner: Banner, from: RegionId | null, to: RegionId | null): BannerMoveReason {
  if (!from) return "unplaced";
  const here = computeBannerHarvest(ctx, state, banner, from);
  const there = to ? computeBannerHarvest(ctx, state, banner, to).amount : 0;
  if (there <= here.amount) return "make_room";
  if (here.notes.includes("blocked_by_troll")) return "blocked_by_troll";
  if (here.notes.includes("taken_by_dragon")) return "taken_by_dragon";
  // Nothing else changes the amount but Druid's Blessing, which adds only
  // in Grain and Timber Regions.
  return "blessing_lost";
}

/**
 * Orders the moves so a player can make them one at a time, each legal when
 * its turn comes: a move whose destination has room goes first. A cycle
 * (two Banners swapping full Regions) has none; its first Banner goes home
 * as a step of its own, and moves on once the others have made room.
 *
 * This ends: the whole placement is legal, so once every Banner still to
 * move is at home, each of their destinations has room.
 */
function inPlayableOrder(ctx: RulesContext, state: GameState, placed: Readonly<Record<BannerId, RegionId | null>>, moves: BannerMove[]): BannerMove[] {
  const at = { ...placed };
  const left = [...moves];
  const out: BannerMove[] = [];
  while (left.length > 0) {
    const next = left.findIndex((m) => m.to === null || getLegalBannerRegions(ctx, state, m.bannerId, at).includes(m.to));
    if (next < 0) {
      const i = left.findIndex((m) => at[m.bannerId] != null);
      const m = left[i] as BannerMove;
      out.push({ bannerId: m.bannerId, from: m.from, to: null, reason: "make_room" });
      at[m.bannerId] = null;
      left[i] = { ...m, from: null };
      continue;
    }
    const [m] = left.splice(next, 1) as [BannerMove];
    at[m.bannerId] = m.to;
    out.push(m);
  }
  return out;
}

// ------------------------------------------------------------------ menaces (§20–26)

export function menaceLocationKind(type: MenaceType): MenaceLocation["kind"] {
  switch (type) {
    case "toll_troll":
    case "young_dragon":
    case "bog_witch":
      return "region";
    case "highwayman":
      return "route";
    case "goblin_tinkers":
      return "site";
  }
}

/** Structural check for a Menace location from an untrusted command. */
export function isMenaceLocation(x: unknown): x is MenaceLocation {
  if (!x || typeof x !== "object") return false;
  const loc = x as Record<string, unknown>;
  switch (loc.kind) {
    case "region":
      return typeof loc.regionId === "string";
    case "route":
      return typeof loc.routeId === "string";
    case "site":
      return typeof loc.siteId === "string";
    default:
      return false;
  }
}

/** Accepts `unknown` because destinations arrive in untrusted commands. */
export function isLegalMenaceDestination(ctx: RulesContext, state: GameState, menaceId: MenaceId, dest: unknown): boolean {
  if (!isMenaceLocation(dest)) return false;
  const m = own(state.menaces, menaceId);
  if (!m) return false;
  if (dest.kind !== menaceLocationKind(m.type)) return false;
  switch (dest.kind) {
    case "region":
      if (!ctx.board.hasRegion(dest.regionId)) return false;
      break;
    case "route":
      if (!ctx.board.hasRoute(dest.routeId)) return false;
      break;
    case "site":
      if (!ctx.board.hasSite(dest.siteId)) return false;
      break;
  }
  if (sameLocation(m.location, dest)) return false;
  const other = menaceAt(state, dest);
  return !other || other.id === m.id;
}

export function getLegalMenaceDestinations(ctx: RulesContext, state: GameState, menaceId: MenaceId): MenaceLocation[] {
  const m = own(state.menaces, menaceId);
  if (!m) return [];
  const all: MenaceLocation[] = (() => {
    switch (menaceLocationKind(m.type)) {
      case "region":
        return ctx.board.topology.regions.map((r): MenaceLocation => ({ kind: "region", regionId: r.id }));
      case "route":
        return ctx.board.topology.routes.map((r): MenaceLocation => ({ kind: "route", routeId: r.id }));
      case "site":
        return ctx.board.topology.sites.map((s): MenaceLocation => ({ kind: "site", siteId: s.id }));
    }
  })();
  return all.filter((d) => isLegalMenaceDestination(ctx, state, menaceId, d));
}

/** Whether a Menace at `loc` affects the player (for The Safer Road). */
export function locationAffectsPlayer(state: GameState, loc: MenaceLocation, playerId: PlayerId): boolean {
  switch (loc.kind) {
    case "region":
      return Object.values(state.banners).some((b) => b.ownerId === playerId && b.regionId === loc.regionId);
    case "route":
      return state.routeOwners[loc.routeId] === playerId;
    case "site":
      return holdingAt(state, loc.siteId)?.ownerId === playerId;
  }
}

// ------------------------------------------------------------------ Royal Writ (§14.7)

export function checkWritTarget(ctx: RulesContext, state: GameState, playerId: PlayerId, bannerId: BannerId): import("./errors.js").RuleValidation {
  const b = own(state.banners, bannerId);
  if (!b || !b.regionId) return { ok: false, error: { code: "UNKNOWN_ENTITY", detail: bannerId } };
  if (b.ownerId === playerId) return { ok: false, error: { code: "INVALID_CARD_TARGET", detail: "own banner" } };
  if (state.ruleset.writ.requireSettled && !b.settled) return { ok: false, error: { code: "BANNER_NOT_SETTLED" } };
  const regionId = b.regionId;
  const adjacent = getPlayerHoldings(state, playerId).some((h) => ctx.board.site(h.siteId).adjacentRegionIds.includes(regionId));
  if (!adjacent) return { ok: false, error: { code: "BANNER_NOT_ADJACENT" } };
  return { ok: true };
}

export function getWritTargets(ctx: RulesContext, state: GameState, playerId: PlayerId): BannerId[] {
  return Object.keys(state.banners).filter((id) => checkWritTarget(ctx, state, playerId, id).ok);
}

// ------------------------------------------------------------------ cards

/** Banners that Wizard's Interference could move, with their legal destinations. */
export function wizardDestinations(ctx: RulesContext, state: GameState, bannerId: BannerId): RegionId[] {
  const b = own(state.banners, bannerId);
  if (!b || !b.regionId) return [];
  const current = b.regionId;
  return getLegalBannerRegions(ctx, state, bannerId).filter((r) => r !== current);
}

/**
 * Fire Bolt (§19.14): the Route is burned and, until the end of its former
 * owner's next turn, only that owner may rebuild it.
 */
export function isSmoulderingFor(state: GameState, routeId: RouteId, playerId: PlayerId): boolean {
  return state.activeEffects.some((e) => e.kind === "smouldering" && e.routeId === routeId && e.ownerId !== playerId);
}

/** Siege Fireball (§19.26): nobody may ever build on a ruined Site. */
export function isRuinedSite(state: GameState, siteId: SiteId): boolean {
  return (state.ruinedSiteIds ?? []).includes(siteId);
}

/**
 * Raiders (§19.24): until the end of the burned Manor's owner's next turn,
 * only they may build on its Site or next to it, so a rival cannot take the
 * spot, or block the rebuild, with a Manor of their own.
 */
export function isRazedFor(state: GameState, siteId: SiteId, playerId: PlayerId): boolean {
  return state.activeEffects.some((e) => e.kind === "razed" && e.siteId === siteId && e.ownerId !== playerId);
}

/**
 * The rivals Disgrace may strike (§19.22): those with the most Renown, when
 * the player is behind them. Empty when the player holds or shares the lead.
 */
export function disgraceTargets(ctx: RulesContext, state: GameState, playerId: PlayerId): PlayerId[] {
  const renown = new Map(state.turnOrder.map((id) => [id, getRenown(ctx, state, id)]));
  const top = Math.max(...renown.values());
  if ((renown.get(playerId) ?? 0) >= top) return [];
  return state.turnOrder.filter((id) => id !== playerId && renown.get(id) === top);
}

/** Whether a Route of the player's ends at the Site (Siege Engines and Raiders, §19.23–19.24). */
export function touchesOwnRoute(ctx: RulesContext, state: GameState, playerId: PlayerId, siteId: SiteId): boolean {
  return ctx.board.routesAt(siteId).some((r) => state.routeOwners[r.id] === playerId);
}

/** Whether Raiders or Siege Fireball may burn a Manor of this player (§19.24, §19.26). */
export function canLoseManor(state: GameState, ownerId: PlayerId): boolean {
  return (state.players[ownerId]?.holdingIds.length ?? 0) >= BALANCE.raid.minHoldings;
}

/** Holdings Dragon's Landing may strike (§19.15), in a deterministic order for the RNG pick. */
export function dragonsLandingTargets(state: GameState): Holding[] {
  return Object.values(state.holdings)
    .filter((h) => (state.players[h.ownerId]?.holdingIds.length ?? 0) >= BALANCE.dragonsLanding.minHoldings)
    .sort((a, b) => compareIds(a.id, b.id));
}

/** Banners The Plague would sicken around a Site (§19.17): every Banner in its Regions not already sick. */
export function plagueBanners(ctx: RulesContext, state: GameState, siteId: SiteId): Banner[] {
  const regions = new Set(ctx.board.site(siteId).adjacentRegionIds);
  return Object.values(state.banners)
    .filter((b) => b.regionId !== null && regions.has(b.regionId))
    .filter((b) => !state.activeEffects.some((e) => e.kind === "sick" && e.bannerId === b.id))
    .sort((a, b) => compareIds(a.id, b.id));
}

/** The player's Royal Insurance Policy in play, if any (§19.19). */
export function insurancePolicyOf(ctx: RulesContext, state: GameState, playerId: PlayerId): CardId | undefined {
  return (state.players[playerId]?.charters ?? []).find((c) => ctx.cardOf(c).effectId === "royal_insurance_policy");
}

export { canAfford };
