import { describe, expect, it, vi } from "vitest";
import { ISLANDS, mapById, type MapDefinition, type RegionDefinition } from "@manors-menaces/content";
import { CLEARANCE, terrainArt } from "../src/lib/art/terrain.js";
import { CARTOUCHE, RIPPLES, coastArt } from "../src/lib/art/coast.js";
import { edgeDistance, inside, offsetPolygon, polygonPoints, segmentDistance } from "../src/lib/art/geometry.js";
import { RIVER_HALF, riverAcross, routeGeometry } from "../src/lib/art/routes.js";
import { EDGE_CLEARANCE, boardSpots } from "../src/lib/art/board-spots.js";
import {
  DISC_FOOTPRINT,
  FLAG_FOOTPRINT,
  FLAG_HIT,
  LABEL,
  MENACE_BODY,
  MENACE_FOOTPRINT,
  MENACE_OFFSET,
  bannerSlot,
  pipsFootprint,
  pointRectDistance,
  segmentRectDistance,
  type BoxFootprint,
  type Footprint,
} from "../src/lib/game/board-view.js";
import type { Pt } from "../src/lib/art/geometry.js";

// Every island, and a layout drawn on each: the art follows each Region's
// Resource and name, which a layout changes.
const BOARDS = ISLANDS.flatMap((island) => [island, mapById(`${island.id}@1`) as MapDefinition]).map((m) => [m.id, m] as const);

/** Banners a Region may hold: layouts give any Region capacity 1 or 2. */
const MOST_BANNERS = 2;

/**
 * Regions with no room anywhere for two Banners EDGE_CLEARANCE off their
 * border, clear of the disc and each other (a search on a 2-unit grid finds
 * no such pair), so a row of two stands just inside the border.
 */
const TOO_THIN_FOR_TWO = new Set(["emberreach/region_05"]);

const placed = <F extends Footprint>(f: F, p: Pt): F => ({ ...f, x: f.x + p.x, y: f.y + p.y });

/** How far a placed footprint stays inside the polygon's border; negative when it crosses it. */
function clearance(f: Footprint, poly: Pt[]): number {
  if (f.kind === "disc") return (inside(f, poly) ? edgeDistance(f, poly) : -edgeDistance(f, poly)) - f.r;
  const corners = [f, { x: f.x + f.w, y: f.y }, { x: f.x, y: f.y + f.h }, { x: f.x + f.w, y: f.y + f.h }];
  const out = corners.filter((c) => !inside(c, poly));
  if (out.length) return -Math.max(...out.map((c) => edgeDistance(c, poly)));
  let least = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    least = Math.min(least, segmentRectDistance({ ax: poly[j]!.x, ay: poly[j]!.y, bx: poly[i]!.x, by: poly[i]!.y, r: 0 }, f));
  }
  return least;
}

/** Whether two placed footprints overlap (touching is fine). */
function overlap(a: Footprint, b: Footprint): boolean {
  if (a.kind === "disc") return b.kind === "disc" ? Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r : pointRectDistance(a.x, a.y, b) < a.r;
  if (b.kind === "disc") return pointRectDistance(b.x, b.y, a) < b.r;
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe.each(BOARDS)("terrain illustration on %s", (_, map) => {
  const coast = polygonPoints(map.coastline);
  const regions = new Map(map.regions.map((r) => [r.id, r]));
  const sites = new Map(map.sites.map((s) => [s.id, s]));
  const art = terrainArt(map);
  const spots = boardSpots(map);

  /** Every mark a Region can show, placed: the pips, a Menace and each Banner of a row of 1 and of 2. */
  function marksOf(r: RegionDefinition): { what: string; row: number; stands: Footprint; covers: Footprint[] }[] {
    const s = spots.get(r.id)!;
    const pips = placed(pipsFootprint(r.capacity), s.pips);
    const menace = placed(MENACE_FOOTPRINT, s.menace);
    return [
      { what: "pips", row: 0, stands: pips, covers: [pips] },
      { what: "Menace", row: 0, stands: menace, covers: [menace, placed(MENACE_BODY, s.menace)] },
      ...s.banners.slice(0, MOST_BANNERS).flatMap((row, k) =>
        row.map((p, i) => {
          const flag = placed(FLAG_FOOTPRINT, p);
          return { what: `Banner ${i + 1} of ${k + 1}`, row: k + 1, stands: flag, covers: [flag] };
        }),
      ),
    ];
  }

  it("works out each Region's spots once per map object", () => {
    expect(boardSpots({ ...map })).not.toBe(spots);
    expect(boardSpots({ ...map })).toEqual(spots);
    expect(boardSpots(map)).toBe(spots);
    for (const r of map.regions) {
      const rows = spots.get(r.id)!.banners.map((row) => row.length);
      expect(rows, r.id).toEqual(Array.from({ length: Math.max(MOST_BANNERS, r.capacity) }, (_, k) => k + 1));
    }
  });

  it("stands every Banner, Menace and pip row inside its Region, clear of the border", () => {
    const island = map.id.split("@")[0];
    for (const r of map.regions) {
      const poly = polygonPoints(r.path);
      for (const m of marksOf(r)) {
        const room = clearance(m.stands, poly);
        if (m.row === 2 && TOO_THIN_FOR_TWO.has(`${island}/${r.id}`)) expect(room, `${m.what} in ${r.id}`).toBeGreaterThan(0);
        else expect(room, `${m.what} in ${r.id}`).toBeGreaterThanOrEqual(EDGE_CLEARANCE);
      }
    }
  });

  it("keeps the marks of a Region off its resource disc and each other", () => {
    for (const r of map.regions) {
      const disc = placed(DISC_FOOTPRINT, { x: r.labelX, y: r.labelY });
      const marks = marksOf(r);
      for (const m of marks) for (const c of m.covers) expect(overlap(c, disc), `${m.what} on the disc of ${r.id}`).toBe(false);
      for (const [i, a] of marks.entries()) {
        for (const b of marks.slice(i + 1)) {
          // Rows for different numbers of Banners never show together.
          if (a.row && b.row && a.row !== b.row) continue;
          const hit = a.covers.some((ca) => b.covers.some((cb) => overlap(ca, cb)));
          expect(hit, `${a.what} on ${b.what} in ${r.id}`).toBe(false);
        }
      }
    }
  });

  it("leaves every mark that fits where it always stood", () => {
    let kept = 0;
    for (const r of map.regions) {
      const poly = polygonPoints(r.path);
      const label = { x: r.labelX, y: r.labelY };
      const s = spots.get(r.id)!;
      const before: [string, Footprint, Pt, Pt][] = [
        ["pips", pipsFootprint(r.capacity), { x: label.x, y: label.y + LABEL.pipY }, s.pips],
        ["Menace", MENACE_FOOTPRINT, { x: label.x + MENACE_OFFSET.region.x, y: label.y + MENACE_OFFSET.region.y }, s.menace],
      ];
      for (let n = 1; n <= MOST_BANNERS; n++) {
        for (let i = 0; i < n; i++) before.push([`Banner ${i + 1} of ${n}`, FLAG_FOOTPRINT, bannerSlot(label, i, n), s.banners[n - 1]![i]!]);
      }
      for (const [what, f, then, now] of before) {
        if (clearance(placed(f, then), poly) < EDGE_CLEARANCE) continue;
        kept++;
        expect(now, `${what} in ${r.id}`).toEqual(then);
      }
    }
    // Most Regions fit every mark where it always stood.
    expect(kept).toBeGreaterThan(map.regions.length * 3);
  });

  it("is deterministic per map and cached per map object", () => {
    const again = terrainArt({ ...map });
    expect(again).not.toBe(art);
    expect(again).toEqual(art);
    expect(terrainArt(map)).toBe(art);
  });

  it("never draws on the match RNG or Math.random", () => {
    const spy = vi.spyOn(Math, "random");
    terrainArt({ ...map });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("scatters a bounded number of motifs, some in every Region", () => {
    // About four per Region on average, whichever Resources a layout deals where.
    expect(art.motifs.length).toBeGreaterThan(4 * map.regions.length);
    expect(art.motifs.length).toBeLessThan(700);
    // The smallest Regions give most of their room to the label stack (name,
    // disc, pips and the Banner row below them), so two motifs is the floor.
    for (const r of map.regions) expect(art.motifs.filter((m) => m.regionId === r.id).length, r.id).toBeGreaterThanOrEqual(2);
    for (const r of map.regions.filter((x) => x.resource === "iron")) {
      expect(
        art.motifs.some((m) => m.regionId === r.id && m.kind === "mine"),
        r.id,
      ).toBe(true);
    }
  });

  it("keeps every motif inside its Region and the shore", () => {
    for (const m of art.motifs) {
      const poly = polygonPoints(regions.get(m.regionId)!.path);
      expect(inside(m, poly), `${m.kind} in ${m.regionId}`).toBe(true);
      expect(edgeDistance(m, poly)).toBeGreaterThanOrEqual(m.r);
      expect(inside(m, coast)).toBe(true);
      expect(edgeDistance(m, coast)).toBeGreaterThanOrEqual(m.r + CLEARANCE.shore - 0.1);
    }
  });

  it("keeps clear of labels, the Menace spot, Sites and Routes", () => {
    for (const m of art.motifs) {
      for (const r of map.regions) {
        expect(Math.hypot(m.x - r.labelX, m.y - r.labelY), `${m.regionId} vs label of ${r.id}`).toBeGreaterThanOrEqual(CLEARANCE.disc + m.r - 0.1);
        const menace = spots.get(r.id)!.menace;
        expect(Math.hypot(m.x - menace.x, m.y - menace.y - CLEARANCE.menace.dy), `${m.kind} on the Menace of ${r.id}`).toBeGreaterThanOrEqual(CLEARANCE.menace.r + m.r - 0.1);
        const half = r.name.length * CLEARANCE.name.perChar + CLEARANCE.name.pad;
        const inName = Math.abs(m.x - r.labelX) < half && m.y > r.labelY + CLEARANCE.name.top && m.y < r.labelY + CLEARANCE.name.bottom;
        expect(inName, `${m.kind} on the name of ${r.id}`).toBe(false);
      }
      for (const s of map.sites) expect(Math.hypot(m.x - s.x, m.y - s.y - CLEARANCE.site.dy)).toBeGreaterThanOrEqual(CLEARANCE.site.r + m.r - 0.1);
      for (const route of map.routes) {
        const a = sites.get(route.siteA)!;
        const b = sites.get(route.siteB)!;
        for (const segment of routeGeometry(route, a, b).segments) {
          expect(segmentDistance(m, segment.a, segment.b)).toBeGreaterThanOrEqual(CLEARANCE.route + m.r - 0.1);
        }
      }
    }
  });

  it("keeps the art off the pips and every Banner, wherever they stand", () => {
    // Each Banner's hit box and the pip row, in every spot a Region with one
    // or two Banners uses, so no art hides under a flag.
    for (const r of map.regions) {
      const s = spots.get(r.id)!;
      const boxes: [string, BoxFootprint][] = [
        ["pips", placed(pipsFootprint(r.capacity), s.pips)],
        ...s.banners.slice(0, MOST_BANNERS).flatMap((row, k) => row.map((p, i): [string, BoxFootprint] => [`Banner ${i + 1} of ${k + 1}`, placed({ kind: "box", ...FLAG_HIT }, p)])),
      ];
      for (const m of art.motifs) {
        for (const [what, box] of boxes) {
          expect(pointRectDistance(m.x, m.y, box), `${m.kind} under the ${what} of ${r.id}`).toBeGreaterThanOrEqual(m.r - 0.1);
        }
      }
    }
  });

  it("keeps field furrows off the labels", () => {
    const furrows = art.layers
      .filter((l) => l.id.endsWith(".furrow"))
      .map((l) => l.d)
      .join("");
    const ends = polygonPoints(furrows.replace(/M/g, "L").replace(/^L/, "M"));
    expect(ends.length).toBeGreaterThan(50);
    for (const p of ends) {
      expect(inside(p, coast)).toBe(true);
      for (const r of map.regions) expect(Math.hypot(p.x - r.labelX, p.y - r.labelY)).toBeGreaterThanOrEqual(CLEARANCE.disc);
    }
  });

  it("merges the art into a few paths per Region", () => {
    for (const r of map.regions) {
      const own = art.layers.filter((l) => l.id.startsWith(`${r.id}.`));
      expect(own.length, r.id).toBeGreaterThan(0);
      expect(own.length, r.id).toBeLessThanOrEqual(8);
    }
    expect(art.layers.length).toBeLessThan(160);
    for (const l of art.layers) {
      expect(l.d.length, l.id).toBeGreaterThan(0);
      expect(l.d, l.id).toMatch(/^[MLQCZa\d\s,.-]+$/);
    }
    const bridges = map.routes.filter((r) => r.kind === "bridge").length;
    expect(art.streams[0].match(/M/g)?.length).toBe(bridges);
  });

  it("rejects map paths it cannot read as polygons", () => {
    expect(() => polygonPoints("M0,0 C1,1 2,2 3,3 Z")).toThrow(/M\/L\/Z/);
  });
});

describe("terrain on the layouts games draw", () => {
  it.each(ISLANDS.map((m) => [m.id, m] as const))("leaves no Region of %s bare and shows every iron mine", (_, island) => {
    for (let layout = 0; layout < 10; layout++) {
      const map = mapById(`${island.id}@${layout * 104729}`) as MapDefinition;
      const art = terrainArt(map);
      for (const r of map.regions) {
        const own = art.motifs.filter((m) => m.regionId === r.id);
        expect(own.length, `${map.id} ${r.id}`).toBeGreaterThan(0);
        if (r.resource === "iron") expect(own.some((m) => m.kind === "mine"), `${map.id} ${r.id}`).toBe(true);
      }
    }
  });
});

describe.each(ISLANDS.map((m) => [m.id, m] as const))("shoreline and sea ornaments on %s", (_, map) => {
  const coast = polygonPoints(map.coastline);
  const sea = coastArt(map);

  it("draws ripples outside the island", () => {
    expect(sea.ripples).toHaveLength(RIPPLES.length);
    for (const d of RIPPLES) for (const p of offsetPolygon(coast, d)) expect(inside(p, coast)).toBe(false);
  });

  it("finds open sea for the name cartouche, the compass and the ship", () => {
    const spots = [sea.cartouche, sea.compass, sea.ship];
    for (const s of spots) {
      expect(s).not.toBeNull();
      const corners = [
        { x: s!.x - s!.w / 2, y: s!.y - s!.h / 2 },
        { x: s!.x + s!.w / 2, y: s!.y - s!.h / 2 },
        { x: s!.x - s!.w / 2, y: s!.y + s!.h / 2 },
        { x: s!.x + s!.w / 2, y: s!.y + s!.h / 2 },
      ];
      for (const c of corners) {
        expect(inside(c, coast)).toBe(false);
        expect(edgeDistance(c, coast)).toBeGreaterThan(10);
      }
    }
    expect(sea.cartouche).toMatchObject({ w: CARTOUCHE.w, h: CARTOUCHE.h });
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const a = spots[i]!;
        const b = spots[j]!;
        const apart = Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2;
        expect(apart).toBe(true);
      }
    }
  });
});

describe("route scenery", () => {
  it("lays a stream across the bridge's midpoint", () => {
    const [water, shine] = riverAcross({ x: 0, y: 0 }, { x: 100, y: 0 });
    const pts = polygonPoints(water);
    expect(water.endsWith("Z")).toBe(true);
    expect(shine.startsWith("M")).toBe(true);
    const ys = pts.map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(-RIVER_HALF, 0);
    expect(Math.max(...ys)).toBeCloseTo(RIVER_HALF, 0);
    for (const p of pts) expect(Math.abs(p.x - 50)).toBeLessThan(12);
  });
});
