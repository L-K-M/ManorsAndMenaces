// Pure read-only helpers over GameState (spec §108). The UI and AI use these
// for previews and highlighting; the engine uses the same functions to
// validate commands, so what the UI shows as legal is exactly what is legal.

import { BALANCE } from "./balance.js";
import type { RulesContext } from "./context.js";
import type { HarvestNote } from "./events.js";
import { own } from "./clone.js";
import { addCost, canAfford } from "./resources.js";
import {
  RESOURCE_TYPES,
  type Banner,
  type BannerId,
  type GameState,
  type Holding,
  type MenaceId,
  type MenaceInstance,
  type MenaceLocation,
  type MenaceType,
  type PlayerId,
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
    .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
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
  let renown = p.bonusRenown;
  for (const h of getPlayerHoldings(state, playerId)) renown += h.type === "manor" ? BALANCE.renown.manor : BALANCE.renown.stronghold;
  for (const q of p.claimedQuestIds) renown += ctx.quest(q).renown;
  return renown;
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

// ------------------------------------------------------------------ build requirements

export type BuildCheck =
  | { legal: true; cost: ResourceCost; needsToll: boolean; needsSurcharge: boolean }
  | { legal: false; reason: import("./errors.js").RuleErrorCode };

/** Whether a Route can be built, ignoring resources; and what payment it needs. */
export function checkBuildRoute(ctx: RulesContext, state: GameState, playerId: PlayerId, routeId: RouteId): BuildCheck {
  if (!ctx.board.hasRoute(routeId)) return { legal: false, reason: "UNKNOWN_ENTITY" };
  if (state.routeOwners[routeId] !== undefined) return { legal: false, reason: "ROUTE_OCCUPIED" };
  const r = ctx.board.route(routeId);
  const connected = (opts: NetworkOptions): boolean =>
    isNetworkSite(ctx, state, playerId, r.siteA, opts) || isNetworkSite(ctx, state, playerId, r.siteB, opts);
  if (connected({})) return { legal: true, cost: { ...BALANCE.costs.route }, needsToll: false, needsSurcharge: false };
  if (connected({ allowHighwayman: true })) return { legal: true, cost: { ...BALANCE.costs.route }, needsToll: true, needsSurcharge: false };
  return { legal: false, reason: "NOT_CONNECTED" };
}

export function checkBuildManor(ctx: RulesContext, state: GameState, playerId: PlayerId, siteId: SiteId): BuildCheck {
  if (!ctx.board.hasSite(siteId)) return { legal: false, reason: "UNKNOWN_ENTITY" };
  if (holdingAt(state, siteId)) return { legal: false, reason: "SITE_OCCUPIED" };
  if (!passesSpacing(ctx, state, siteId)) return { legal: false, reason: "SITE_TOO_CLOSE" };
  const needsSurcharge = menaceAt(state, { kind: "site", siteId })?.type === "goblin_tinkers";
  const base = { cost: { ...BALANCE.costs.manor }, needsSurcharge };
  if (isRouteEndpointSite(ctx, state, playerId, siteId)) return { legal: true, ...base, needsToll: false };
  if (isRouteEndpointSite(ctx, state, playerId, siteId, { allowHighwayman: true })) return { legal: true, ...base, needsToll: true };
  return { legal: false, reason: "NOT_CONNECTED" };
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

export function getLegalInitialManorSites(ctx: RulesContext, state: GameState): SiteId[] {
  return ctx.board.topology.sites.map((s) => s.id).filter((id) => passesSpacing(ctx, state, id));
}

export function getLegalInitialRoutes(ctx: RulesContext, state: GameState): RouteId[] {
  const siteId = state.setup?.lastPlacedSiteId;
  if (!siteId) return [];
  return ctx.board.routesAt(siteId).filter((r) => state.routeOwners[r.id] === undefined).map((r) => r.id);
}

// ------------------------------------------------------------------ banners (§14)

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
  const banner = own(state.banners, bannerId);
  if (!banner) return [];
  const holding = state.holdings[banner.holdingId];
  if (!holding) return [];
  const positionOf = (b: Banner): RegionId | null => (b.id in draft ? (draft[b.id] ?? null) : b.regionId);
  const siblings = Object.values(state.banners).filter((b) => b.holdingId === banner.holdingId && b.id !== bannerId);
  return ctx.board.site(holding.siteId).adjacentRegionIds.filter((regionId) => {
    const region = ctx.board.region(regionId);
    const occupants = Object.values(state.banners).filter((b) => b.id !== bannerId && positionOf(b) === regionId);
    if (occupants.length >= region.capacity) return false;
    if (siblings.some((s) => positionOf(s) === regionId)) return false;
    return true;
  });
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

export { canAfford };
