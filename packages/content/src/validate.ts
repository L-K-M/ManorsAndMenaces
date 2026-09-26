import { ALL_MENACES, RESOURCE_TYPES, isResourceType, menaceLocationKind, type ResourceType } from "@manors-menaces/rules";
import type { MapDefinition } from "./types.js";

// Map validation (spec §102). Errors are fatal in dev; warnings report the
// balance heuristics of §11.1.

export interface MapValidation {
  errors: string[];
  warnings: string[];
  stats: { sites: number; routes: number; regions: number; capacity: number; maxIndependentSites: number; byResource: Record<ResourceType, number> };
}

/** §11.1: fewer Regions of a resource than this makes it a bottleneck. */
const MIN_REGIONS_PER_RESOURCE = 3;
/** §17.3: a Trading Post should serve a real neighbourhood of Regions. */
const MIN_TRADE_POST_REGIONS = 3;

export function validateMap(map: MapDefinition, maxPlayers = 4): MapValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  const dup = (id: string): void => {
    if (ids.has(id)) errors.push(`duplicate id ${id}`);
    ids.add(id);
  };
  map.sites.forEach((s) => dup(s.id));
  map.routes.forEach((r) => dup(r.id));
  map.regions.forEach((r) => dup(r.id));

  const sites = new Map(map.sites.map((s) => [s.id, s]));
  const regions = new Map(map.regions.map((r) => [r.id, r]));
  const routes = new Map(map.routes.map((r) => [r.id, r]));

  const sitePairs = new Map<string, string>();
  for (const r of map.routes) {
    if (!sites.has(r.siteA) || !sites.has(r.siteB)) errors.push(`route ${r.id} has an unknown endpoint`);
    if (r.points) {
      const a = sites.get(r.siteA), b = sites.get(r.siteB);
      const first = r.points[0], last = r.points.at(-1);
      if (r.points.length < 2 || r.points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)) ||
          first?.x !== a?.x || first?.y !== a?.y || last?.x !== b?.x || last?.y !== b?.y ||
          r.points.some((p, i) => i > 0 && p.x === r.points![i - 1]!.x && p.y === r.points![i - 1]!.y)) {
        errors.push(`route ${r.id} has invalid drawing points`);
      }
    }
    if (r.siteA === r.siteB) errors.push(`route ${r.id} is a loop`);
    const pair = [r.siteA, r.siteB].sort().join("|");
    const twin = sitePairs.get(pair);
    if (twin) errors.push(`route ${r.id} duplicates ${twin}`);
    else sitePairs.set(pair, r.id);
  }
  const landmarkIds = new Set(map.landmarks.map((l) => l.id));
  const landmarkSites = new Map<string, string>();
  for (const s of map.sites) {
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) errors.push(`site ${s.id} has no coordinates`);
    if (s.adjacentRegionIds.length === 0) errors.push(`site ${s.id} touches no Region`);
    for (const rid of s.adjacentRegionIds) {
      const region = regions.get(rid);
      if (!region) errors.push(`site ${s.id} references unknown region ${rid}`);
      else if (!region.adjacentSiteIds.includes(s.id)) errors.push(`adjacency ${s.id}–${rid} is not symmetric`);
    }
    if (s.tradePost && s.landmarkId) errors.push(`site ${s.id} is both a landmark and a Trading Post`);
    if (s.tradePost) {
      const { resource, give } = s.tradePost;
      if (!isResourceType(resource)) errors.push(`Trading Post at ${s.id} trades unknown resource ${String(resource)}`);
      if (!Number.isInteger(give) || give < 2) errors.push(`Trading Post at ${s.id} must give a whole number ≥ 2, not ${give}`);
      if (s.adjacentRegionIds.length < MIN_TRADE_POST_REGIONS) warnings.push(`Trading Post at ${s.id} touches only ${s.adjacentRegionIds.length} Regions`);
    }
    if (s.landmarkId) {
      if (!landmarkIds.has(s.landmarkId)) errors.push(`site ${s.id} names unknown landmark ${s.landmarkId}`);
      const other = landmarkSites.get(s.landmarkId);
      if (other) errors.push(`landmark ${s.landmarkId} is on more than one Site (${other}, ${s.id})`);
      landmarkSites.set(s.landmarkId, s.id);
    }
  }
  for (const r of map.regions) {
    if (!Number.isInteger(r.capacity) || r.capacity < 1) errors.push(`region ${r.id} capacity ${r.capacity} is not a whole number ≥ 1`);
    if (!isResourceType(r.resource)) errors.push(`region ${r.id} has unknown resource ${String(r.resource)}`);
    if (r.adjacentSiteIds.length === 0) errors.push(`region ${r.id} touches no Site`);
    // A Royal Writ needs a Holding next to the Region, so one Site's owner keeps it for good.
    // Keep this a warning for the legacy Greenvale map used by existing saves;
    // its Honeydew Pastures has only one Site.
    else if (r.adjacentSiteIds.length === 1) warnings.push(`region ${r.id} touches only one Site, so no Writ can contest it`);
    for (const sid of r.adjacentSiteIds) {
      const site = sites.get(sid);
      if (!site) errors.push(`region ${r.id} references unknown site ${sid}`);
      else if (!site.adjacentRegionIds.includes(r.id)) errors.push(`adjacency ${r.id}–${sid} is not symmetric`);
    }
  }
  const byResource = {} as Record<ResourceType, number>;
  for (const res of RESOURCE_TYPES) byResource[res] = map.regions.filter((r) => r.resource === res).length;
  for (const res of RESOURCE_TYPES) {
    if (byResource[res] === 0) errors.push(`no ${res} Region`);
    else if (byResource[res] < MIN_REGIONS_PER_RESOURCE) warnings.push(`only ${byResource[res]} ${res} Regions`);
  }
  for (const l of map.landmarks) {
    const s = sites.get(l.siteId);
    if (!s || s.landmarkId !== l.id) errors.push(`landmark ${l.id} does not match its site`);
  }
  for (const sid of map.questParams.kingsHighway) {
    if (!sites.get(sid)?.landmarkId) errors.push(`King's Highway endpoint ${sid} is not a landmark`);
  }
  if (map.questParams.kingsHighway[0] === map.questParams.kingsHighway[1]) errors.push("King's Highway endpoints are the same Site");
  const occupied = new Set<string>();
  for (const m of map.menaceStarts) {
    const loc = m.location;
    const key = `${loc.kind}:${loc.kind === "region" ? loc.regionId : loc.kind === "route" ? loc.routeId : loc.siteId}`;
    if (occupied.has(key)) errors.push(`two Menaces start at ${key}`);
    occupied.add(key);
    const exists = loc.kind === "region" ? regions.has(loc.regionId) : loc.kind === "route" ? routes.has(loc.routeId) : sites.has(loc.siteId);
    if (!exists) errors.push(`Menace start for ${m.menaceType} is not on the map`);
    if (loc.kind !== menaceLocationKind(m.menaceType)) errors.push(`${m.menaceType} must start on a ${menaceLocationKind(m.menaceType)}, not a ${loc.kind}`);
  }
  // Any Menace may be drawn for a game (§118), so each needs a start.
  for (const type of ALL_MENACES) {
    if (!map.menaceStarts.some((m) => m.menaceType === type)) errors.push(`no start for ${type}`);
  }

  // Connectivity.
  const adj = new Map<string, string[]>(map.sites.map((s) => [s.id, []]));
  for (const r of map.routes) {
    adj.get(r.siteA)?.push(r.siteB);
    adj.get(r.siteB)?.push(r.siteA);
  }
  const start = map.sites[0]?.id;
  if (start) {
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length) {
      for (const n of adj.get(stack.pop() as string) ?? []) {
        if (seen.has(n)) continue;
        seen.add(n);
        stack.push(n);
      }
    }
    if (seen.size !== map.sites.length) errors.push("the Route network is not connected");
  }

  const maxIndependentSites = maximumIndependentSet(adj);
  const capacity = map.regions.reduce((s, r) => s + r.capacity, 0);
  if (maxIndependentSites < 4 * maxPlayers)
    warnings.push(`only ${maxIndependentSites} Sites can hold Holdings at once; §11.1 wants ≥ ${4 * maxPlayers}`);
  const midGameBanners = 3 * 6.5;
  if (capacity < 1.3 * midGameBanners) warnings.push(`Banner capacity ${capacity} is below 1.3× the mid-game estimate`);
  return {
    errors,
    warnings,
    stats: { sites: map.sites.length, routes: map.routes.length, regions: map.regions.length, capacity, maxIndependentSites, byResource },
  };
}

/** Exact maximum independent set by branch and bound (fine for ≤ ~60 nodes). */
export function maximumIndependentSet(adj: Map<string, string[]>): number {
  const nbr = new Map([...adj].map(([k, v]) => [k, new Set(v)]));
  let best = 0;
  const rec = (cands: string[], size: number): void => {
    if (size + cands.length <= best) return;
    if (cands.length === 0) {
      best = Math.max(best, size);
      return;
    }
    let v = cands[0] as string;
    let vd = Infinity;
    for (const c of cands) {
      const d = cands.filter((x) => nbr.get(c)?.has(x)).length;
      if (d < vd) {
        vd = d;
        v = c;
      }
    }
    // Any maximal independent set contains v or one of its neighbours.
    for (const u of [v, ...cands.filter((x) => nbr.get(v)?.has(x))]) {
      rec(
        cands.filter((x) => x !== u && !nbr.get(u)?.has(x)),
        size + 1,
      );
    }
  };
  rec([...adj.keys()], 0);
  return best;
}
