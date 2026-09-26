// Expand the published board without renumbering its existing content. Geometry
// comes from the region boundaries, including junctions the old graph pruned.
export function withCoastalNetwork(legacy, id) {
  const map = structuredClone(legacy);
  map.id = id;
  const key = (p) => `${p.x},${p.y}`;
  const vertex = new Map();
  const edges = new Map();
  for (const region of map.regions) {
    const points = [...region.path.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)]
      .map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
    points.forEach((p, i) => {
      const a = key(p), b = key(points[(i + 1) % points.length]);
      if (!vertex.has(a)) vertex.set(a, { point: p, regions: new Set() });
      vertex.get(a).regions.add(region.id);
      const id = [a, b].sort().join("|");
      if (!edges.has(id)) edges.set(id, { a, b, count: 0 });
      edges.get(id).count++;
    });
  }
  const boundary = new Map();
  for (const { a, b, count } of edges.values()) {
    if (count !== 1) continue;
    if (!boundary.has(a)) boundary.set(a, []);
    if (!boundary.has(b)) boundary.set(b, []);
    boundary.get(a).push(b);
    boundary.get(b).push(a);
  }
  for (const [p, neighbours] of boundary) {
    if (neighbours.length !== 2) throw new Error(`Coast is not a closed simple ring at ${p}`);
  }
  const coastalCorners = [...boundary.keys()].filter((p) => vertex.get(p).regions.size >= 2);
  if (coastalCorners.length < 3) throw new Error("Coast needs at least three building junctions");
  const sitesAt = new Map(map.sites.map((s) => [key(s), s]));
  const restored = new Set();
  for (const p of coastalCorners) {
    if (sitesAt.has(p)) continue;
    const v = vertex.get(p);
    const site = { id: `site_${String(map.sites.length + 1).padStart(2, "0")}`, ...v.point, adjacentRegionIds: [...v.regions].sort() };
    map.sites.push(site);
    sitesAt.set(p, site);
    restored.add(site.id);
    for (const r of map.regions) if (v.regions.has(r.id)) r.adjacentSiteIds.push(site.id);
  }
  const pairs = new Set(map.routes.map((r) => [r.siteA, r.siteB].sort().join("|")));
  const addRoute = (a, b, points) => {
    const pair = [a.id, b.id].sort().join("|");
    if (pairs.has(pair)) throw new Error(`Duplicate coastal connection ${pair}`);
    pairs.add(pair);
    map.routes.push({ id: `route_${String(map.routes.length + 1).padStart(2, "0")}`, siteA: a.id, siteB: b.id, kind: "road", ...(points ? { points } : {}) });
  };
  for (const { a, b, count } of edges.values()) {
    const from = sitesAt.get(a), to = sitesAt.get(b);
    if (count === 2 && from && to && (restored.has(from.id) || restored.has(to.id))) addRoute(from, to);
  }
  // Walk the boundary itself, not a straight chord across a bay. Every segment
  // belongs to one region; each route ends at the next building junction.
  const start = coastalCorners[0];
  let previous, current = start, routeStart = start;
  let points = [vertex.get(start).point];
  const visited = new Set();
  const coast = [];
  do {
    if (visited.has(current)) throw new Error("Coast repeats before closing");
    visited.add(current);
    coast.push(vertex.get(current).point);
    const next = boundary.get(current).find((p) => p !== previous);
    points.push(vertex.get(next).point);
    if (sitesAt.has(next)) {
      addRoute(sitesAt.get(routeStart), sitesAt.get(next), points);
      routeStart = next;
      points = [vertex.get(next).point];
    }
    previous = current;
    current = next;
  } while (current !== start);
  if (visited.size !== boundary.size) throw new Error("Coast has disconnected boundary loops");
  // Match the coastline to the exact region boundary (including merged corners).
  const area = coast.reduce((sum, p, i) => { const q = coast[(i + 1) % coast.length]; return sum + p.x * q.y - p.y * q.x; }, 0);
  if (area < 0) coast.reverse();
  map.coastline = `M${coast.map(key).join("L")}Z`;
  return map;
}
