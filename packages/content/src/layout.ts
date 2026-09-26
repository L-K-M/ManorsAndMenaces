import { clone, createRng, seedRng, type GameRng, type ResourceType } from "@manors-menaces/rules";
import type { MapDefinition, RegionDefinition, SiteDefinition } from "./types.js";

// A fresh arrangement of an island's land for each game (spec §11): which
// Resource each Region yields, which Regions are rich, what they are called and
// where the Trading Posts stand, and so where the Region Menaces start. The
// coast, Sites, Routes, landmarks and the King's Highway stay as the island was
// drawn, and the island keeps its own share of each Resource and of rich
// Regions, so layouts vary without changing the sizing the island was checked
// for (§11.1, §102).
//
// A layout is decided by its number alone, through the match RNG (§30) and
// integer or exactly rounded arithmetic, so the server and every client draw
// the same one.

/** Shuffles tried when spreading out the Resources; the one with the fewest like neighbours wins. */
const RESOURCE_ATTEMPTS = 300;

/**
 * Trading Post spacing in Route steps: clear of landmarks and of each other.
 * Relaxed in this order on a coast that cannot meet it.
 */
const POST_SPACING = [
  { fromLandmark: 2, fromPost: 3 },
  { fromLandmark: 2, fromPost: 1 },
  { fromLandmark: 1, fromPost: 1 },
] as const;

/** The layout numbered `layout` of `island`, with the id `<island>@<layout>`. */
export function drawLayout(island: MapDefinition, layout: number): MapDefinition {
  const rng = createRng(seedRng(`${island.id}@${layout}`));
  const map: MapDefinition = { ...clone(island), id: `${island.id}@${layout}` };
  map.regions = drawRegions(island, rng);
  map.sites = drawTradePosts(island, rng);
  map.menaceStarts = placeRegionMenaces(island, map);
  return map;
}

/** Deals each Region a Resource, keeping like Regions apart, then that Resource's rich slots and names. */
function drawRegions(island: MapDefinition, rng: GameRng): RegionDefinition[] {
  const index = new Map(island.regions.map((r, i) => [r.id, i]));
  const pairs = new Set<string>();
  for (const s of island.sites) {
    for (const a of s.adjacentRegionIds) for (const b of s.adjacentRegionIds) if (a < b) pairs.add(`${index.get(a)}|${index.get(b)}`);
  }
  const neighbours = [...pairs].map((p) => p.split("|").map(Number) as [number, number]);

  const pool = island.regions.map((r) => r.resource);
  let best = pool;
  let bestClashes = Infinity;
  for (let attempt = 0; attempt < RESOURCE_ATTEMPTS && bestClashes > 0; attempt++) {
    const deal = rng.shuffle(pool);
    const clashes = neighbours.filter(([a, b]) => deal[a] === deal[b]).length;
    if (clashes < bestClashes) {
      best = deal;
      bestClashes = clashes;
    }
  }

  const hands = new Map<ResourceType, { capacities: number[]; names: string[] }>();
  for (const r of island.regions) {
    const hand = hands.get(r.resource) ?? { capacities: [], names: [] };
    hand.capacities.push(r.capacity);
    hand.names.push(r.name);
    hands.set(r.resource, hand);
  }
  for (const hand of hands.values()) {
    hand.capacities = rng.shuffle(hand.capacities);
    hand.names = rng.shuffle(hand.names);
  }
  return island.regions.map((r, i) => {
    const resource = best[i] as ResourceType;
    const hand = hands.get(resource);
    const capacity = hand?.capacities.pop();
    const name = hand?.names.pop();
    // The deal only permutes the island's own Resources, so a hand is never short.
    if (capacity === undefined || name === undefined) throw new Error(`layout ran out of ${resource} Regions`);
    return { ...clone(r), resource, capacity, name };
  });
}

/** Moves each Trading Post to a coastal Site away from the landmarks and the other posts. */
function drawTradePosts(island: MapDefinition, rng: GameRng): SiteDefinition[] {
  const posts = island.sites.flatMap((s) => (s.tradePost ? [s.tradePost] : []));
  const landmarks = island.sites.filter((s) => s.landmarkId).map((s) => s.id);
  const open = island.sites.filter((s) => !s.landmarkId);
  // A coastal junction touches the sea and fewer than three Regions.
  const coast = open.filter((s) => s.adjacentRegionIds.length < 3).map((s) => s.id);
  const steps = routeSteps(island);
  const distance = (a: string, b: string) => steps.get(a)?.get(b) ?? Infinity;

  const placed: string[] = [];
  for (const _ of posts) {
    let site: string | undefined;
    for (const rule of POST_SPACING) {
      const options = coast.filter(
        (id) => !placed.includes(id) && landmarks.every((l) => distance(l, id) >= rule.fromLandmark) && placed.every((p) => distance(p, id) >= rule.fromPost),
      );
      if (options.length > 0) {
        site = rng.pick(options);
        break;
      }
    }
    // An island with too little coast still gets its posts, inland if need be.
    site ??= open.find((s) => !placed.includes(s.id))?.id;
    if (!site) throw new Error(`${island.id} has no room for its Trading Posts`);
    placed.push(site);
  }

  return island.sites.map((s) => {
    const { tradePost: _, ...site } = clone(s);
    const post = posts[placed.indexOf(s.id)];
    return post ? { ...site, tradePost: { ...post } } : site;
  });
}

/** Route steps between every pair of Sites. */
function routeSteps(map: MapDefinition): Map<string, Map<string, number>> {
  const adjacent = new Map(map.sites.map((s) => [s.id, [] as string[]]));
  for (const r of map.routes) {
    adjacent.get(r.siteA)?.push(r.siteB);
    adjacent.get(r.siteB)?.push(r.siteA);
  }
  const all = new Map<string, Map<string, number>>();
  for (const from of adjacent.keys()) {
    const dist = new Map([[from, 0]]);
    const queue = [from];
    for (let head = 0; head < queue.length; head++) {
      const here = queue[head] as string;
      for (const next of adjacent.get(here) ?? []) {
        if (dist.has(next)) continue;
        dist.set(next, (dist.get(here) ?? 0) + 1);
        queue.push(next);
      }
    }
    all.set(from, dist);
  }
  return all;
}

/**
 * The island's Region Menaces start on the Resource they started on there, on
 * the most central ordinary (not rich) Region of it that is still free, as the
 * generator placed them. Route and Site Menaces keep their places.
 */
function placeRegionMenaces(island: MapDefinition, map: MapDefinition): MapDefinition["menaceStarts"] {
  const cx = map.width / 2;
  const cy = map.height / 2;
  // Multiplication, not **, so every JavaScript engine orders them alike.
  const offCentre = (r: RegionDefinition) => (r.labelX - cx) * (r.labelX - cx) + (r.labelY - cy) * (r.labelY - cy);
  const mostCentral = (regions: RegionDefinition[]) => regions.reduce<RegionDefinition | undefined>((best, r) => (!best || offCentre(r) < offCentre(best) ? r : best), undefined);

  const taken = new Set<string>();
  return island.menaceStarts.map((start) => {
    const location = start.location;
    if (location.kind !== "region") return clone(start);
    const home = island.regions.find((r) => r.id === location.regionId)?.resource;
    const free = map.regions.filter((r) => !taken.has(r.id));
    const region = mostCentral(free.filter((r) => r.resource === home && r.capacity === 1)) ?? mostCentral(free.filter((r) => r.resource === home)) ?? mostCentral(free);
    if (!region) throw new Error(`${island.id} has no Region left for the ${start.menaceType}`);
    taken.add(region.id);
    return { menaceType: start.menaceType, location: { kind: "region", regionId: region.id } };
  });
}
