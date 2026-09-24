import type { MapDefinition } from "./types.js";

// Map validation (spec §102). Errors are fatal in dev; warnings report the
// balance heuristics of §11.1.

export interface MapValidation {
  errors: string[];
  warnings: string[];
  stats: { sites: number; routes: number; regions: number; capacity: number; maxIndependentSites: number };
}

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

  for (const r of map.routes) {
    if (!sites.has(r.siteA) || !sites.has(r.siteB)) errors.push(`route ${r.id} has an unknown endpoint`);
    if (r.siteA === r.siteB) errors.push(`route ${r.id} is a loop`);
  }
  for (const s of map.sites) {
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) errors.push(`site ${s.id} has no coordinates`);
    if (s.adjacentRegionIds.length === 0) errors.push(`site ${s.id} touches no Region`);
    for (const rid of s.adjacentRegionIds) {
      const region = regions.get(rid);
      if (!region) errors.push(`site ${s.id} references unknown region ${rid}`);
      else if (!region.adjacentSiteIds.includes(s.id)) errors.push(`adjacency ${s.id}–${rid} is not symmetric`);
    }
    if (s.tradePost && s.landmarkId) errors.push(`site ${s.id} is both a landmark and a Trading Post`);
  }
  for (const r of map.regions) {
    if (!(r.capacity >= 1)) errors.push(`region ${r.id} has capacity < 1`);
    for (const sid of r.adjacentSiteIds) {
      const site = sites.get(sid);
      if (!site) errors.push(`region ${r.id} references unknown site ${sid}`);
      else if (!site.adjacentRegionIds.includes(r.id)) errors.push(`adjacency ${r.id}–${sid} is not symmetric`);
    }
  }
  for (const res of ["grain", "timber", "stone", "iron", "essence"] as const) {
    if (!map.regions.some((r) => r.resource === res)) errors.push(`no ${res} Region`);
  }
  for (const l of map.landmarks) {
    const s = sites.get(l.siteId);
    if (!s || s.landmarkId !== l.id) errors.push(`landmark ${l.id} does not match its site`);
  }
  for (const sid of map.questParams.kingsHighway) {
    if (!sites.get(sid)?.landmarkId) errors.push(`King's Highway endpoint ${sid} is not a landmark`);
  }
  const occupied = new Set<string>();
  for (const m of map.menaceStarts) {
    const loc = m.location;
    const key = `${loc.kind}:${loc.kind === "region" ? loc.regionId : loc.kind === "route" ? loc.routeId : loc.siteId}`;
    if (occupied.has(key)) errors.push(`two Menaces start at ${key}`);
    occupied.add(key);
    const exists = loc.kind === "region" ? regions.has(loc.regionId) : loc.kind === "route" ? routes.has(loc.routeId) : sites.has(loc.siteId);
    if (!exists) errors.push(`Menace start for ${m.menaceType} is not on the map`);
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
  return { errors, warnings, stats: { sites: map.sites.length, routes: map.routes.length, regions: map.regions.length, capacity, maxIndependentSites } };
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
