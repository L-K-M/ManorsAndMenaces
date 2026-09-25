// Expansion planning (spec §57.2). A Manor needs a free Site at the end of one
// of the player's Routes, and the nearest such Site is often two or three
// Routes away. Without a plan, every single Route looks like a loss (it costs
// resources and builds nothing yet), so the AI used to stall with a hoard.
// The planner finds the best Site within reach and how many Routes it still
// needs; the evaluator rewards each step toward it.

import {
  getNetworkSites,
  isRouteUsable,
  menaceInRegion,
  passesSpacing,
  type GameState,
  type Holding,
  type PlayerId,
  type RegionId,
  type ResourceType,
  type RouteId,
  type RulesContext,
  type SiteId,
} from "@manors-menaces/rules";

/**
 * Farthest the planner looks, in unbuilt Routes. Each step of a plan must be
 * worth more than the Route's resources, yet a finished plan (a Site ready
 * for a Manor) must stay worth well under the Manor itself, or the AI would
 * rather keep the option than build; three steps is the most that fits.
 */
const MAX_PLAN_ROUTES = 3;

/**
 * Long-term worth of each resource when judging a Site. Deliberately static:
 * a Site is a lasting source, so the player's momentary shortages (which
 * `resourceNeeds` tracks) should not swing the choice of goal.
 */
export const BASE_NEED: Readonly<Record<ResourceType, number>> = { grain: 1, timber: 1, stone: 1, iron: 0.9, essence: 0.6 };

export interface ExpansionPlan {
  /** The Site the player is expanding toward. */
  siteId: SiteId;
  /** Unbuilt Routes between the player's network and the Site; 0 when a Manor can go there now. */
  routes: number;
  /** The unbuilt Routes to build, in order from the network outward. */
  path: RouteId[];
  /** `siteValue` of the target. */
  value: number;
  /**
   * Worth of the plan in Routes of progress: one point for each Route closer
   * than `MAX_PLAN_ROUTES`, plus a small bonus for the target's value that
   * decides between Sites at the same distance.
   */
  score: number;
}

/** `siteValue` of a typical Greenvale Site. */
const TYPICAL_SITE_VALUE = 4;
/** Weight of a typical Site's value against one Route of distance. */
const SITE_VALUE_WEIGHT = 0.4;

function planScore(routes: number, value: number): number {
  return MAX_PLAN_ROUTES - routes + (SITE_VALUE_WEIGHT * value) / TYPICAL_SITE_VALUE;
}

/** How many Banners (of anyone) sit in each Region. */
export function regionOccupancy(state: GameState): Map<RegionId, number> {
  const occupied = new Map<RegionId, number>();
  for (const b of Object.values(state.banners)) if (b.regionId) occupied.set(b.regionId, (occupied.get(b.regionId) ?? 0) + 1);
  return occupied;
}

/** Worth of a Holding on `siteId`: the Regions it could harvest, weighted by `need`. */
export function siteValue(
  ctx: RulesContext,
  state: GameState,
  siteId: SiteId,
  need: Readonly<Record<ResourceType, number>>,
  occupied: Map<RegionId, number> = regionOccupancy(state),
): number {
  const site = ctx.board.site(siteId);
  let v = 0;
  const seen = new Set<string>();
  for (const regionId of site.adjacentRegionIds) {
    const region = ctx.board.region(regionId);
    const free = region.capacity - (occupied.get(regionId) ?? 0);
    const troll = menaceInRegion(state, regionId)?.type === "toll_troll";
    let rv = need[region.resource] * (free > 0 ? 1 : 0.35) * (troll ? 0.2 : 1) * (region.capacity > 1 ? 1.25 : 1);
    if (!seen.has(region.resource)) rv += 0.3;
    seen.add(region.resource);
    v += rv;
  }
  if (site.tradePost) v += 0.6;
  if (site.landmarkId) v += 0.2;
  return v;
}

/**
 * The most attractive Site the player can reach within `MAX_PLAN_ROUTES`
 * unbuilt Routes, trading value against distance (see `ExpansionPlan.score`),
 * or null when no free Site is in reach.
 *
 * Distances come from a 0-1 shortest-path search: the player's own Routes
 * cost nothing, unbuilt Routes cost one, and opponents' Routes and Holdings
 * block the way, exactly as they block building (§13). An own Route under
 * Fog blocks too while it lasts; a Highwayman only charges a toll, so it
 * does not (the same `allowHighwayman` view `checkBuildManor` takes).
 */
export function planExpansion(ctx: RulesContext, state: GameState, playerId: PlayerId): ExpansionPlan | null {
  const network = { allowHighwayman: true };
  const sources = getNetworkSites(ctx, state, playerId, network);
  if (sources.length === 0) return null;

  const holdingAtSite = new Map<SiteId, Holding>();
  for (const h of Object.values(state.holdings)) holdingAtSite.set(h.siteId, h);

  // Dial's algorithm with one bucket per distance: equivalent to a 0-1 BFS
  // and settles Sites in a fixed order, so the plan is deterministic.
  const dist = new Map<SiteId, number>();
  const via = new Map<SiteId, { routeId: RouteId; from: SiteId }>();
  const buckets: SiteId[][] = Array.from({ length: MAX_PLAN_ROUTES + 1 }, () => []);
  for (const id of sources) {
    dist.set(id, 0);
    buckets[0]?.push(id);
  }
  const settled = new Set<SiteId>();
  const occupied = regionOccupancy(state);
  let best: Omit<ExpansionPlan, "path"> | null = null;

  for (let d = 0; d <= MAX_PLAN_ROUTES; d++) {
    const bucket = buckets[d] ?? [];
    for (let i = 0; i < bucket.length; i++) {
      const x = bucket[i] as SiteId;
      if (settled.has(x) || dist.get(x) !== d) continue;
      settled.add(x);

      const holding = holdingAtSite.get(x);
      if (!holding && passesSpacing(ctx, state, x)) {
        const value = siteValue(ctx, state, x, BASE_NEED, occupied);
        const score = planScore(d, value);
        if (!best || score > best.score) best = { siteId: x, routes: d, value, score };
      }
      // A network cannot run through an opponent's Holding.
      if (holding && holding.ownerId !== playerId) continue;

      for (const route of ctx.board.routesAt(x)) {
        const owner = state.routeOwners[route.id];
        if (owner !== undefined && owner !== playerId) continue;
        if (owner === playerId && !isRouteUsable(state, route.id, network)) continue;
        const y = ctx.board.otherEnd(route, x);
        const nd = d + (owner === playerId ? 0 : 1);
        if (nd > MAX_PLAN_ROUTES || nd >= (dist.get(y) ?? Infinity)) continue;
        dist.set(y, nd);
        via.set(y, { routeId: route.id, from: x });
        buckets[nd]?.push(y);
      }
    }
  }
  if (!best) return null;

  const path: RouteId[] = [];
  for (let at = best.siteId; dist.get(at) !== 0;) {
    const step = via.get(at);
    if (!step) break;
    if (state.routeOwners[step.routeId] === undefined) path.unshift(step.routeId);
    at = step.from;
  }
  return { ...best, path };
}
