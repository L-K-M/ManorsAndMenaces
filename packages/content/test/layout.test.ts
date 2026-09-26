import { describe, expect, it } from "vitest";
import type { ResourceType } from "@manors-menaces/rules";
import { GREENVALE_MAP, ISLANDS, LEGACY_GREENVALE_MAP, drawLayout, mapById, mapIdForNewGame, parseMapId, rulesContentFor, validateMap, type MapDefinition } from "../src/index.js";

// Every new game draws its own arrangement of an island's land (spec §11):
// which Resource each Region yields, which Regions are rich and where the
// Trading Posts stand. The island itself, its Routes and landmarks stay put.

const LAYOUTS = 60;

function neighbourPairs(map: MapDefinition): [string, string][] {
  const pairs = new Set<string>();
  for (const s of map.sites) for (const a of s.adjacentRegionIds) for (const b of s.adjacentRegionIds) if (a < b) pairs.add(`${a}|${b}`);
  return [...pairs].map((p) => p.split("|") as [string, string]);
}
function clashes(map: MapDefinition): number {
  const res = new Map(map.regions.map((r) => [r.id, r.resource]));
  return neighbourPairs(map).filter(([a, b]) => res.get(a) === res.get(b)).length;
}
function distances(map: MapDefinition, from: string): Map<string, number> {
  const adj = new Map(map.sites.map((s) => [s.id, [] as string[]]));
  for (const r of map.routes) {
    adj.get(r.siteA)?.push(r.siteB);
    adj.get(r.siteB)?.push(r.siteA);
  }
  const dist = new Map([[from, 0]]);
  const queue = [from];
  while (queue.length) {
    const n = queue.shift() as string;
    for (const m of adj.get(n) ?? []) {
      if (dist.has(m)) continue;
      dist.set(m, (dist.get(n) ?? 0) + 1);
      queue.push(m);
    }
  }
  return dist;
}
const byResource = (map: MapDefinition) => {
  const out: Partial<Record<ResourceType, { names: string[]; capacities: number[] }>> = {};
  for (const r of map.regions) {
    const e = (out[r.resource] ??= { names: [], capacities: [] });
    e.names.push(r.name);
    e.capacities.push(r.capacity);
  }
  for (const e of Object.values(out)) {
    e.names.sort();
    e.capacities.sort();
  }
  return out;
};
const posts = (map: MapDefinition) => map.sites.filter((s) => s.tradePost);
const regionStart = (map: MapDefinition, menace: string) => {
  const loc = map.menaceStarts.find((m) => m.menaceType === menace)?.location;
  return loc?.kind === "region" ? map.regions.find((r) => r.id === loc.regionId) : undefined;
};

describe.each(ISLANDS.map((island) => [island.id, island] as const))("layouts drawn on %s", (_, island) => {
  const drawn = Array.from({ length: LAYOUTS }, (_, i) => drawLayout(island, i * 7919));

  it("pass map validation", () => {
    for (const map of drawn) expect(validateMap(map).errors, map.id).toEqual([]);
  });

  it("leave the island, its Routes, landmarks and Menace roads where they are", () => {
    for (const map of drawn) {
      expect(map.coastline).toBe(island.coastline);
      expect(map.routes).toEqual(island.routes);
      expect(map.landmarks).toEqual(island.landmarks);
      expect(map.questParams).toEqual(island.questParams);
      expect(map.regions.map(({ id, path, labelX, labelY, adjacentSiteIds }) => ({ id, path, labelX, labelY, adjacentSiteIds }))).toEqual(
        island.regions.map(({ id, path, labelX, labelY, adjacentSiteIds }) => ({ id, path, labelX, labelY, adjacentSiteIds })),
      );
      expect(map.sites.map(({ tradePost: _, ...s }) => s)).toEqual(island.sites.map(({ tradePost: _, ...s }) => s));
      for (const kind of ["route", "site"]) {
        expect(map.menaceStarts.filter((m) => m.location.kind === kind)).toEqual(island.menaceStarts.filter((m) => m.location.kind === kind));
      }
    }
  });

  it("keep each Resource's Regions, rich Regions and names, only elsewhere", () => {
    for (const map of drawn) expect(byResource(map)).toEqual(byResource(island));
  });

  it("really rearrange the land, differently for each layout", () => {
    const signature = (map: MapDefinition) => map.regions.map((r) => `${r.resource}${r.capacity}`).join() + posts(map).map((s) => s.id).join();
    expect(new Set(drawn.map(signature)).size).toBe(LAYOUTS);
    for (const region of island.regions) {
      expect(new Set(drawn.map((m) => m.regions.find((r) => r.id === region.id)?.resource)).size, region.id).toBeGreaterThan(1);
    }
    expect(new Set(drawn.flatMap((m) => posts(m).map((s) => s.id))).size).toBeGreaterThan(4);
  });

  it("are the same for the same layout number and named for it", () => {
    expect(drawLayout(island, 42)).toEqual(drawLayout(island, 42));
    expect(drawLayout(island, 42).id).toBe(`${island.id}@42`);
  });

  it("keep neighbouring Regions mostly on different Resources", () => {
    for (const map of drawn) expect(clashes(map), map.id).toBeLessThanOrEqual(clashes(island) + 2);
  });

  it("put the Trading Posts on the coast, clear of landmarks and of each other", () => {
    for (const map of drawn) {
      const trades = (m: MapDefinition) => posts(m).map((s) => JSON.stringify(s.tradePost)).sort();
      expect(trades(map)).toEqual(trades(island));
      const landmarks = map.sites.filter((s) => s.landmarkId).map((s) => s.id);
      for (const post of posts(map)) {
        expect(post.adjacentRegionIds.length, `${map.id} ${post.id} is inland`).toBeLessThan(3);
        const dist = distances(map, post.id);
        for (const l of landmarks) expect(dist.get(l), `${map.id} ${post.id} next to ${l}`).toBeGreaterThanOrEqual(2);
        for (const other of posts(map)) if (other !== post) expect(dist.get(other.id), `${map.id} posts too close`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("start each Region Menace on the most central ordinary Region of its island Resource", () => {
    const centre = (map: MapDefinition, id: string) => {
      const r = map.regions.find((x) => x.id === id);
      if (!r) return Infinity;
      const [dx, dy] = [r.labelX - map.width / 2, r.labelY - map.height / 2];
      return dx * dx + dy * dy;
    };
    for (const map of drawn) {
      const taken: string[] = [];
      for (const start of island.menaceStarts) {
        if (start.location.kind !== "region") continue;
        const resource = regionStart(island, start.menaceType)?.resource;
        const region = regionStart(map, start.menaceType);
        expect(region?.resource, `${map.id} ${start.menaceType}`).toBe(resource);
        expect(region?.capacity).toBe(1);
        const closer = map.regions.filter((r) => r.resource === resource && r.capacity === 1 && !taken.includes(r.id) && centre(map, r.id) < centre(map, region?.id ?? ""));
        expect(closer.map((r) => r.id), `${map.id} ${start.menaceType}`).toEqual([]);
        taken.push(region?.id ?? "");
      }
    }
  });
});

describe("map ids", () => {
  const island = GREENVALE_MAP;

  it("name an island as published, or a layout drawn on it", () => {
    expect(mapById(island.id)).toBe(island);
    expect(mapById(LEGACY_GREENVALE_MAP.id)).toBe(LEGACY_GREENVALE_MAP);
    expect(mapById(`${island.id}@7`)).toEqual(drawLayout(island, 7));
    expect(mapById(`${island.id}@4294967295`)?.id).toBe(`${island.id}@4294967295`);
    expect(parseMapId(`${island.id}@7`)).toEqual({ islandId: island.id, layout: 7 });
    expect(parseMapId(island.id)).toEqual({ islandId: island.id, layout: null });
  });

  it("refuse unknown islands and malformed layouts", () => {
    for (const id of ["nowhere", "nowhere@1", `${island.id}@`, `${island.id}@-1`, `${island.id}@01`, `${island.id}@1.5`, `${island.id}@4294967296`, `${island.id}@1@2`, `${LEGACY_GREENVALE_MAP.id}@3`]) {
      expect(mapById(id), id).toBeUndefined();
    }
  });

  it("give drawn layouts their own rules content", () => {
    const content = rulesContentFor(`${island.id}@7`);
    expect(content.board.id).toBe(`${island.id}@7`);
    expect(content.board.regions.map((r) => r.resource)).toEqual(drawLayout(island, 7).regions.map((r) => r.resource));
    expect(rulesContentFor(`${island.id}@7`)).toBe(content);
    expect(() => rulesContentFor("nowhere@1")).toThrow(/Unknown map/);
  });
});

describe("a new game's map", () => {
  it("is drawn from the game's seed, so the same seed gives the same map", () => {
    const id = mapIdForNewGame("seed-1");
    expect(mapIdForNewGame("seed-1")).toBe(id);
    expect(mapById(id)).toBeDefined();
    expect(ISLANDS.map((i) => i.id)).toContain(parseMapId(id)?.islandId);
  });

  it("uses every island and many layouts across seeds", () => {
    const ids = Array.from({ length: 40 * ISLANDS.length }, (_, i) => mapIdForNewGame(`seed-${i}`));
    expect(new Set(ids.map((id) => parseMapId(id)?.islandId)).size).toBe(ISLANDS.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("stays on a chosen island", () => {
    for (const island of ISLANDS) expect(parseMapId(mapIdForNewGame("seed-1", island.id))?.islandId).toBe(island.id);
    expect(() => mapIdForNewGame("seed-1", LEGACY_GREENVALE_MAP.id)).toThrow(/island/);
  });
});
