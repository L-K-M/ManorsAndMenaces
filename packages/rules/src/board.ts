import type { BoardTopology, RegionId, RegionTopology, RouteId, RouteTopology, SiteId, SiteTopology } from "./types.js";

/** Precomputed lookups over an immutable board topology. */
export interface BoardIndex {
  topology: BoardTopology;
  site(id: SiteId): SiteTopology;
  route(id: RouteId): RouteTopology;
  region(id: RegionId): RegionTopology;
  hasSite(id: string): boolean;
  hasRoute(id: string): boolean;
  hasRegion(id: string): boolean;
  /** Routes touching a site. */
  routesAt(id: SiteId): RouteTopology[];
  /** Sites one route away. */
  neighbours(id: SiteId): SiteId[];
  otherEnd(route: RouteTopology, siteId: SiteId): SiteId;
  /** Unweighted shortest-path distance over all routes (graph distance). */
  distance(a: SiteId, b: SiteId): number;
  landmarkSiteIds: SiteId[];
}

const cache = new WeakMap<BoardTopology, BoardIndex>();

export function indexBoard(topology: BoardTopology): BoardIndex {
  const cached = cache.get(topology);
  if (cached) return cached;
  const sites = new Map(topology.sites.map((s) => [s.id, s]));
  const routes = new Map(topology.routes.map((r) => [r.id, r]));
  const regions = new Map(topology.regions.map((r) => [r.id, r]));
  const routesAt = new Map<SiteId, RouteTopology[]>(topology.sites.map((s) => [s.id, []]));
  for (const r of topology.routes) {
    routesAt.get(r.siteA)?.push(r);
    routesAt.get(r.siteB)?.push(r);
  }
  const neighbours = new Map<SiteId, SiteId[]>(
    topology.sites.map((s) => [s.id, (routesAt.get(s.id) ?? []).map((r) => (r.siteA === s.id ? r.siteB : r.siteA))]),
  );
  const distances = new Map<SiteId, Map<SiteId, number>>();
  const bfs = (from: SiteId): Map<SiteId, number> => {
    const known = distances.get(from);
    if (known) return known;
    const dist = new Map<SiteId, number>([[from, 0]]);
    const queue = [from];
    for (let i = 0; i < queue.length; i++) {
      const cur = queue[i] as SiteId;
      const d = dist.get(cur) as number;
      for (const n of neighbours.get(cur) ?? []) {
        if (!dist.has(n)) {
          dist.set(n, d + 1);
          queue.push(n);
        }
      }
    }
    distances.set(from, dist);
    return dist;
  };
  const get = <T>(m: Map<string, T>, id: string, what: string): T => {
    const v = m.get(id);
    if (v === undefined) throw new Error(`Unknown ${what}: ${id}`);
    return v;
  };
  const index: BoardIndex = {
    topology,
    site: (id) => get(sites, id, "site"),
    route: (id) => get(routes, id, "route"),
    region: (id) => get(regions, id, "region"),
    hasSite: (id) => sites.has(id),
    hasRoute: (id) => routes.has(id),
    hasRegion: (id) => regions.has(id),
    routesAt: (id) => routesAt.get(id) ?? [],
    neighbours: (id) => neighbours.get(id) ?? [],
    otherEnd: (route, siteId) => (route.siteA === siteId ? route.siteB : route.siteA),
    distance: (a, b) => bfs(a).get(b) ?? Infinity,
    landmarkSiteIds: topology.landmarks.map((l) => l.siteId),
  };
  cache.set(topology, index);
  return index;
}
