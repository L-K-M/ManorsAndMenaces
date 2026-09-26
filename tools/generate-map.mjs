#!/usr/bin/env node
// Generates the fixed v0.1 map ("The Greenvale") as a TypeScript data module.
//
// The board is an irregular Voronoi subdivision of an island (spec §10–11):
//   - each Voronoi cell is a Region;
//   - each point where 2+ cells meet (inside the island) is a Site;
//   - each shared cell border between two Sites is a Route.
// The output is deterministic for a given SEED and is committed; re-run only
// when the map should change:  node tools/generate-map.mjs
//
// Usage: node tools/generate-map.mjs [--seed N] [--check] [--out FILE]
//   --check     do not write; exit 1 unless the committed file equals a fresh
//               generation byte for byte and the map passes validateMap (CI).
//   --out FILE  write (or with --check, compare) FILE instead of greenvale.ts.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tsImport } from "tsx/esm/api";

const args = process.argv.slice(2);
const flagValue = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const SEED = Number(flagValue("--seed")) || 14;
const CHECK_ONLY = args.includes("--check");
const OUT = flagValue("--out");

const W = 1600;
const H = 1000;
const CX = W / 2;
const CY = H / 2;
const RX = 700;
const RY = 430;
const REGION_COUNT = 24;
const TARGET_ROUTES = 52;

// ---------------------------------------------------------------- RNG (sfc32)
function sfc32(a, b, c, d) {
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
const rand = sfc32(SEED, SEED ^ 0x9e3779b9, SEED ^ 0x85ebca6b, SEED ^ 0xc2b2ae35);
for (let i = 0; i < 20; i++) rand();
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ------------------------------------------------------------ geometry utils
// Stable layout envelope. Keep its RNG draws and geometry unchanged: published
// saves use the site/route IDs extracted below. Geography is shaped separately
// at emission, after all gameplay identities and connections are established.
const PHASES = [rand() * 6.28, rand() * 6.28, rand() * 6.28];
const coastRadius = (a) =>
  1 + 0.075 * Math.sin(3 * a + PHASES[0]) + 0.045 * Math.sin(5 * a + PHASES[1]) + 0.025 * Math.sin(9 * a + PHASES[2]);
const island = [];
for (let i = 0; i < 180; i++) {
  const a = (i / 180) * Math.PI * 2;
  const k = coastRadius(a);
  island.push([CX + RX * k * Math.cos(a), CY + RY * k * Math.sin(a)]);
}
const insideEllipse = ([x, y], shrink = 1) => {
  const a = Math.atan2((y - CY) / RY, (x - CX) / RX);
  const k = coastRadius(a) * shrink;
  return ((x - CX) / (RX * k)) ** 2 + ((y - CY) / (RY * k)) ** 2 <= 1;
};

function clipHalfPlane(poly, p, q) {
  // Keep the side of the perpendicular bisector of p–q that contains p.
  const mx = (p[0] + q[0]) / 2;
  const my = (p[1] + q[1]) / 2;
  const nx = q[0] - p[0];
  const ny = q[1] - p[1];
  const side = (v) => (v[0] - mx) * nx + (v[1] - my) * ny; // <= 0 keeps
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);
    if (sa <= 0) out.push(a);
    if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) {
      const t = sa / (sa - sb);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}
function voronoi(points) {
  return points.map((p, i) => {
    let cell = island;
    points.forEach((q, j) => {
      if (i !== j) cell = clipHalfPlane(cell, p, q);
    });
    return cell;
  });
}
function centroid(poly) {
  let a = 0, x = 0, y = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    const f = x0 * y1 - x1 * y0;
    a += f; x += (x0 + x1) * f; y += (y0 + y1) * f;
  }
  a *= 0.5;
  return [x / (6 * a), y / (6 * a)];
}

// --------------------------------------------------------- seed + relaxation
let pts = [];
while (pts.length < REGION_COUNT) {
  const p = [CX + (rand() * 2 - 1) * RX, CY + (rand() * 2 - 1) * RY];
  if (insideEllipse(p, 0.92)) pts.push(p);
}
for (let iter = 0; iter < 4; iter++) pts = voronoi(pts).map(centroid);
const cells = voronoi(pts);

// ------------------------------------------------------- topology extraction
const KEY_EPS = 2;
const vkey = ([x, y]) => `${Math.round(x / KEY_EPS)}:${Math.round(y / KEY_EPS)}`;
const vertices = new Map(); // key -> {x,y,cells:Set, onCoast:boolean}
cells.forEach((cell, ci) => {
  cell.forEach((v) => {
    const k = vkey(v);
    if (!vertices.has(k)) vertices.set(k, { x: v[0], y: v[1], cells: new Set(), onCoast: !insideEllipse(v, 0.999) });
    vertices.get(k).cells.add(ci);
  });
});
// Sites: vertices shared by at least 2 cells.
const siteList = [...vertices.entries()].filter(([, v]) => v.cells.size >= 2);
const siteIndex = new Map(siteList.map(([k], i) => [k, i]));
// Routes: consecutive vertices along a cell border where both endpoints are
// sites and the edge is shared by two cells (i.e. not coastline).
const edgeMap = new Map();
cells.forEach((cell) => {
  for (let i = 0; i < cell.length; i++) {
    const ka = vkey(cell[i]);
    const kb = vkey(cell[(i + 1) % cell.length]);
    if (ka === kb) continue;
    const a = siteIndex.get(ka);
    const b = siteIndex.get(kb);
    if (a === undefined || b === undefined) continue;
    const va = vertices.get(ka);
    const vb = vertices.get(kb);
    const shared = [...va.cells].filter((c) => vb.cells.has(c));
    if (shared.length < 2) continue;
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!edgeMap.has(k)) edgeMap.set(k, [Math.min(a, b), Math.max(a, b)]);
  }
});
let edges = [...edgeMap.values()];

// Merge sites that sit too close together (tiny Voronoi edges) — they read as
// one point on the board. Collapse the shorter edge into its midpoint.
const sites = siteList.map(([, v]) => ({ x: v.x, y: v.y, cells: new Set(v.cells), coast: v.onCoast }));
// Keep the original polygon vertices attached to the surviving junction, too.
// Moving only the graph leaves a tiny border behind under the merged Site.
const mergedInto = sites.map((_, i) => i);
const MIN_EDGE = 38;
for (;;) {
  let shortest = null;
  for (const [a, b] of edges) {
    const d = Math.hypot(sites[a].x - sites[b].x, sites[a].y - sites[b].y);
    if (d < MIN_EDGE && (!shortest || d < shortest.d)) shortest = { a, b, d };
  }
  if (!shortest) break;
  const { a, b } = shortest;
  sites[a].x = (sites[a].x + sites[b].x) / 2;
  sites[a].y = (sites[a].y + sites[b].y) / 2;
  sites[b].cells.forEach((c) => sites[a].cells.add(c));
  sites[a].coast = sites[a].coast || sites[b].coast;
  sites[b].dead = true;
  mergedInto[b] = a;
  edges = edges
    .map(([x, y]) => [x === b ? a : x, y === b ? a : y])
    .filter(([x, y]) => x !== y);
  const seen = new Set();
  edges = edges.filter(([x, y]) => {
    const k = x < y ? `${x}-${y}` : `${y}-${x}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const junctionPoint = (point) => {
  let site = siteIndex.get(vkey(point));
  if (site === undefined) return point;
  while (mergedInto[site] !== site) site = mergedInto[site];
  return [sites[site].x, sites[site].y];
};
// This is display geometry only. Keep the original cells for the resource,
// landmark and identity decisions below so published saves keep their graph.
const displayCells = cells.map((cell) => {
  const points = cell.map(junctionPoint);
  return points.filter((p, i) => {
    const previous = points[(i + points.length - 1) % points.length];
    return p[0] !== previous[0] || p[1] !== previous[1];
  });
});

// Drop coast sites that touch only 2 regions until the site count is 36,
// preferring those with the lowest degree (least important to the network).
const TARGET_SITES = 36;
const degree = (s) => edges.filter(([x, y]) => x === s || y === s).length;
let alive = sites.map((s, i) => i).filter((i) => !sites[i].dead);
while (alive.length > TARGET_SITES) {
  const candidates = alive
    .filter((i) => sites[i].coast && sites[i].cells.size <= 2)
    .sort((p, q) => degree(p) - degree(q));
  const victim = candidates[0] ?? alive.sort((p, q) => degree(p) - degree(q))[0];
  // Reconnect neighbours of a degree-2 victim so the network stays continuous.
  const nbrs = edges.filter(([x, y]) => x === victim || y === victim).map(([x, y]) => (x === victim ? y : x));
  edges = edges.filter(([x, y]) => x !== victim && y !== victim);
  if (nbrs.length === 2) edges.push([Math.min(...nbrs), Math.max(...nbrs)]);
  sites[victim].dead = true;
  alive = alive.filter((i) => i !== victim);
}

// Prune routes toward TARGET_ROUTES, never disconnecting the graph and never
// leaving a site with fewer than 2 routes.
const connected = (es) => {
  const adj = new Map(alive.map((i) => [i, []]));
  es.forEach(([a, b]) => { adj.get(a).push(b); adj.get(b).push(a); });
  const seen = new Set([alive[0]]);
  const stack = [alive[0]];
  while (stack.length) for (const n of adj.get(stack.pop())) if (!seen.has(n)) { seen.add(n); stack.push(n); }
  return seen.size === alive.length;
};
for (const e of shuffle(edges)) {
  if (edges.length <= TARGET_ROUTES) break;
  const [a, b] = e;
  if (degree(a) <= 2 || degree(b) <= 2) continue;
  const next = edges.filter((x) => x !== e);
  if (connected(next)) edges = next;
}

// ----------------------------------------------------------------- resources
const RES = [
  ...Array(6).fill("grain"),
  ...Array(5).fill("timber"),
  ...Array(5).fill("stone"),
  ...Array(4).fill("iron"),
  ...Array(4).fill("essence"),
];
const cellNeighbours = cells.map(() => new Set());
alive.forEach((s) => {
  const cs = [...sites[s].cells];
  cs.forEach((a) => cs.forEach((b) => a !== b && cellNeighbours[a].add(b)));
});
let best = null;
for (let attempt = 0; attempt < 400; attempt++) {
  const assign = shuffle(RES);
  let clashes = 0;
  cells.forEach((_, i) => cellNeighbours[i].forEach((j) => { if (j > i && assign[i] === assign[j]) clashes++; }));
  if (!best || clashes < best.clashes) best = { assign, clashes };
}
const resources = best.assign;
const rich = new Set();
for (const r of ["grain", "timber", "stone", "iron", "essence"]) {
  const idx = shuffle(resources.map((x, i) => (x === r ? i : -1)).filter((i) => i >= 0))[0];
  rich.add(idx);
}

// ------------------------------------------------------------- final numbering
const siteId = new Map();
alive.sort((a, b) => sites[a].y - sites[b].y || sites[a].x - sites[b].x);
alive.forEach((s, i) => siteId.set(s, `site_${String(i + 1).padStart(2, "0")}`));
const regionOrder = cells.map((c, i) => i).sort((a, b) => pts[a][1] - pts[b][1] || pts[a][0] - pts[b][0]);
const regionId = new Map(regionOrder.map((c, i) => [c, `region_${String(i + 1).padStart(2, "0")}`]));
edges.sort((p, q) => siteId.get(p[0]).localeCompare(siteId.get(q[0])) || siteId.get(p[1]).localeCompare(siteId.get(q[1])));

// Graph helpers for landmarks / stats.
const adjOf = (s) => edges.filter(([x, y]) => x === s || y === s).map(([x, y]) => (x === s ? y : x));
const bfs = (from) => {
  const dist = new Map([[from, 0]]);
  const q = [from];
  while (q.length) {
    const n = q.shift();
    for (const m of adjOf(n)) if (!dist.has(m)) { dist.set(m, dist.get(n) + 1); q.push(m); }
  }
  return dist;
};

// Landmarks: 5 well-spread interior sites (farthest-point sampling).
const interior = alive.filter((s) => !sites[s].coast);
const landmarks = [interior.reduce((b, s) => (Math.hypot(sites[s].x - CX, sites[s].y - CY) < Math.hypot(sites[b].x - CX, sites[b].y - CY) ? s : b))];
while (landmarks.length < 5) {
  let far = null;
  for (const s of interior) {
    if (landmarks.includes(s)) continue;
    const d = Math.min(...landmarks.map((l) => bfs(l).get(s)));
    if (!far || d > far.d) far = { s, d };
  }
  landmarks.push(far.s);
}
const LANDMARK_NAMES = [
  ["royal_castle", "Royal Castle"],
  ["wizard_tower", "Wizard Tower"],
  ["adventurers_inn", "Adventurers' Inn"],
  ["dwarven_hall", "Dwarven Hall"],
  ["sacred_grove", "Sacred Grove"],
];
// Trade posts: coastal sites far from landmarks and from each other.
const posts = [];
for (let k = 0; k < 2; k++) {
  let bestPost = null;
  for (const s of alive.filter((x) => sites[x].coast && !landmarks.includes(x) && !posts.includes(x))) {
    const d = Math.min(...[...landmarks, ...posts].map((l) => bfs(l).get(s)));
    if (!bestPost || d > bestPost.d) bestPost = { s, d };
  }
  posts.push(bestPost.s);
}
// King's Highway: the landmark pair whose graph distance is closest to 6.
let hw = null;
for (let i = 0; i < landmarks.length; i++)
  for (let j = i + 1; j < landmarks.length; j++) {
    const d = bfs(landmarks[i]).get(landmarks[j]);
    if (!hw || Math.abs(d - 6) < Math.abs(hw.d - 6)) hw = { a: landmarks[i], b: landmarks[j], d };
  }

// Menace starts: regions/route/site away from the landmarks' neighbourhoods.
const regionsByDistFromCenter = regionOrder
  .map((c) => ({ c, d: Math.hypot(pts[c][0] - CX, pts[c][1] - CY) }))
  .sort((a, b) => a.d - b.d);
const pickRegion = (res, taken) =>
  regionsByDistFromCenter.find(({ c }) => resources[c] === res && !taken.includes(c) && !rich.has(c)).c;
const trollRegion = pickRegion("stone", []);
const dragonRegion = pickRegion("grain", [trollRegion]);
const witchRegion = pickRegion("timber", [trollRegion, dragonRegion]);
const highwayRoute = edges[Math.floor(edges.length / 2)];
const goblinSite = interior.find((s) => !landmarks.includes(s) && !posts.includes(s) && adjOf(s).length >= 3);

// ------------------------------------------------------------------ stats
function maxIndependentSet() {
  const nodes = [...alive];
  const nbr = new Map(nodes.map((n) => [n, new Set(adjOf(n))]));
  let bestSize = 0;
  const rec = (cands, size) => {
    if (size + cands.length <= bestSize) return;
    if (cands.length === 0) { bestSize = Math.max(bestSize, size); return; }
    // pick min-degree vertex within candidates
    let v = cands[0];
    let vd = Infinity;
    for (const c of cands) { const d = cands.filter((x) => nbr.get(c).has(x)).length; if (d < vd) { vd = d; v = c; } }
    // include v
    rec(cands.filter((x) => x !== v && !nbr.get(v).has(x)), size + 1);
    // exclude v only if it has neighbours (otherwise including is always optimal)
    if (vd > 0) {
      for (const u of cands.filter((x) => nbr.get(v).has(x))) {
        // branch: include some neighbour u instead
        rec(cands.filter((x) => x !== u && x !== v && !nbr.get(u).has(x)), size + 1);
      }
    }
  };
  rec(nodes, 0);
  return bestSize;
}
const stats = {
  sites: alive.length,
  routes: edges.length,
  regions: cells.length,
  capacity: cells.length + rich.size,
  mis: maxIndependentSet(),
  sameResourceNeighbours: best.clashes,
  kingsHighwayDistance: hw.d,
  minRegionsPerSite: Math.min(...alive.map((s) => sites[s].cells.size)),
};
console.log(stats);

// ------------------------------------------------------------------ emit
const REGION_NAMES = {
  grain: ["Goldenfurrow Fields", "Millbrook Meadows", "Hayward Farms", "Barleycombe", "Sheaf Hollow", "Honeydew Pastures"],
  timber: ["Oakenshaw Wood", "Whisperpine Forest", "Brackenwold", "Elderbough Thicket", "Hartwood"],
  stone: ["Greystone Quarry", "Cragmoor Hills", "Flintridge", "Slatefell Scarp", "Boulderbrook"],
  iron: ["Deepdelve Mine", "Rustvein Pits", "Anvilhold Mine", "Cinderholm Shafts"],
  essence: ["Moonglade", "Faerie Ring", "Shimmermere Ruins", "Starwell Grove"],
};
const nameCursor = { grain: 0, timber: 0, stone: 0, iron: 0, essence: 0 };
const regionName = new Map(regionOrder.map((c) => [c, REGION_NAMES[resources[c]][nameCursor[resources[c]]++]]));
const ROUTE_KINDS = ["road", "road", "road", "road", "road", "road", "trail", "trail", "bridge", "pass"];
const r1 = (n) => Math.round(n * 10) / 10;

// Coastlines need features at distinct scales: broad asymmetric land masses,
// deep sheltered bays, and smaller rocky coves. Radial deformation keeps one
// connected island; fading it toward the centre leaves room for the interior
// Regions. Use a separate seed-derived phase so art never changes the layout
// RNG, resource assignments, route kinds, or the identities in existing saves.
const geographyPhase = (SEED - 14) * 2.399963229728653;
const bay = (angle, centre, width) => {
  const distance = Math.atan2(Math.sin(angle - centre), Math.cos(angle - centre));
  return Math.exp(-0.5 * (distance / width) ** 2);
};
const shapePoint = ([x, y]) => {
  const dx = (x - CX) / RX;
  const dy = (y - CY) / RY;
  const angle = Math.atan2(dy, dx);
  const a = angle + geographyPhase;
  const envelope = coastRadius(angle);
  const radius = Math.hypot(dx, dy) / envelope;
  const relief =
    0.06 * Math.sin(2 * a + 0.4) + 0.045 * Math.cos(a - 0.4)
    - 0.49 * bay(a, 4.65, 0.22)
    - 0.30 * bay(a, 0.68, 0.24)
    - 0.12 * bay(a, 3.12, 0.18)
    - 0.18 * bay(a, 6.05, 0.16)
    + 0.055 * bay(a, 5.6, 0.3)
    + 0.024 * Math.sin(17 * a + 1.2) + 0.012 * Math.sin(29 * a - 0.7);
  // Keep the radial mapping monotone even when another seed aligns a bay
  // with a narrow part of the envelope; the shoreline must not fold inland.
  const displacement = Math.max(-0.55, relief / envelope);
  const scale = 1 + displacement * Math.sqrt(radius);
  return [CX + (x - CX) * scale, CY + (y - CY) * scale];
};
const pathOf = (poly) => "M" + poly.map(shapePoint).map(([x, y]) => `${r1(x)},${r1(y)}`).join("L") + "Z";

const siteDefs = alive.map((s) => {
  const lmIdx = landmarks.indexOf(s);
  const postIdx = posts.indexOf(s);
  const [x, y] = shapePoint([sites[s].x, sites[s].y]);
  return {
    id: siteId.get(s),
    x: r1(x),
    y: r1(y),
    adjacentRegionIds: [...sites[s].cells].map((c) => regionId.get(c)).sort(),
    ...(lmIdx >= 0 ? { landmarkId: LANDMARK_NAMES[lmIdx][0] } : {}),
    ...(postIdx >= 0 ? { tradePost: { resource: postIdx === 0 ? "stone" : "iron", give: 2 } } : {}),
  };
});
const routeDefs = edges.map(([a, b], i) => ({
  id: `route_${String(i + 1).padStart(2, "0")}`,
  siteA: siteId.get(a),
  siteB: siteId.get(b),
  kind: ROUTE_KINDS[Math.floor(rand() * ROUTE_KINDS.length)],
}));
const regionDefs = regionOrder.map((c) => {
  const [lx, ly] = centroid(displayCells[c].map(shapePoint));
  return {
    id: regionId.get(c),
    name: regionName.get(c),
    resource: resources[c],
    capacity: rich.has(c) ? 2 : 1,
    path: pathOf(displayCells[c]),
    labelX: r1(lx),
    labelY: r1(ly),
    adjacentSiteIds: alive.filter((s) => sites[s].cells.has(c)).map((s) => siteId.get(s)).sort(),
  };
});
const highwayRouteId = routeDefs.find((r) => r.siteA === siteId.get(highwayRoute[0]) && r.siteB === siteId.get(highwayRoute[1])).id;

const map = {
  id: "greenvale",
  name: "The Greenvale",
  width: W,
  height: H,
  coastline: pathOf(island),
  sites: siteDefs,
  routes: routeDefs,
  regions: regionDefs,
  landmarks: landmarks.map((s, i) => ({ id: LANDMARK_NAMES[i][0], name: LANDMARK_NAMES[i][1], siteId: siteId.get(s) })),
  menaceStarts: [
    { menaceType: "toll_troll", location: { kind: "region", regionId: regionId.get(trollRegion) } },
    { menaceType: "young_dragon", location: { kind: "region", regionId: regionId.get(dragonRegion) } },
    { menaceType: "bog_witch", location: { kind: "region", regionId: regionId.get(witchRegion) } },
    { menaceType: "highwayman", location: { kind: "route", routeId: highwayRouteId } },
    { menaceType: "goblin_tinkers", location: { kind: "site", siteId: siteId.get(goblinSite) } },
  ],
  questParams: { kingsHighway: [siteId.get(hw.a), siteId.get(hw.b)] },
};

const out = `// GENERATED by tools/generate-map.mjs (seed ${SEED}). Do not edit by hand;
// change the generator and re-run \`pnpm map:generate\`.
// Stats: ${JSON.stringify(stats)}
import type { MapDefinition } from "../types.js";

export const GREENVALE_MAP: MapDefinition = ${JSON.stringify(map, null, 2)};
`;
const here = dirname(fileURLToPath(import.meta.url));
const target = OUT ?? join(here, "..", "packages", "content", "src", "maps", "greenvale.ts");
if (!CHECK_ONLY) {
  writeFileSync(target, out);
  console.log("wrote", target);
  process.exit(0);
}

// ------------------------------------------------------------------ check
const problems = [];
let committed;
try {
  committed = readFileSync(target, "utf8");
} catch (e) {
  problems.push(`cannot read ${target}: ${e.message}`);
}
// Compare with LF endings so a Windows checkout (core.autocrlf) does not fail.
if (committed !== undefined && committed.replace(/\r\n/g, "\n") !== out) {
  problems.push(`${target} differs from a fresh generation (seed ${SEED}); run \`pnpm map:generate\` and commit the result`);
}
// Validate with the same code the app uses. Errors fail the check. Warnings
// are the §11.1 balance heuristics, which a hand-tuned map may trip on
// purpose, so they are printed but do not fail it.
const { validateMap } = await tsImport("../packages/content/src/validate.ts", import.meta.url);
const validation = validateMap(map);
problems.push(...validation.errors);
for (const w of validation.warnings) console.warn("map check warning:", w);
if (stats.minRegionsPerSite < 2) problems.push(`a Site touches only ${stats.minRegionsPerSite} Region; every Site needs at least 2`);

if (problems.length > 0) {
  for (const p of problems) console.error("map check failed:", p);
  process.exit(1);
}
console.log("map check passed:", target, "matches a fresh generation and passes validateMap");
