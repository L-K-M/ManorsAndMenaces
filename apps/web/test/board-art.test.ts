import { describe, expect, it, vi } from "vitest";
import { GREENVALE_MAP } from "@manors-menaces/content";
import { CLEARANCE, terrainArt } from "../src/lib/art/terrain.js";
import { CARTOUCHE, RIPPLES, coastArt } from "../src/lib/art/coast.js";
import { edgeDistance, inside, offsetPolygon, polygonPoints, segmentDistance } from "../src/lib/art/geometry.js";
import { RIVER_HALF, riverAcross } from "../src/lib/art/routes.js";

const map = GREENVALE_MAP;
const coast = polygonPoints(map.coastline);
const regions = new Map(map.regions.map((r) => [r.id, r]));
const sites = new Map(map.sites.map((s) => [s.id, s]));
const art = terrainArt(map);

describe("terrain illustration", () => {
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
    expect(art.motifs.length).toBeGreaterThan(150);
    expect(art.motifs.length).toBeLessThan(700);
    for (const r of map.regions) expect(art.motifs.filter((m) => m.regionId === r.id).length, r.id).toBeGreaterThanOrEqual(3);
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
        expect(Math.hypot(m.x - r.labelX - CLEARANCE.menace.dx, m.y - r.labelY - CLEARANCE.menace.dy)).toBeGreaterThanOrEqual(CLEARANCE.menace.r + m.r - 0.1);
        const half = r.name.length * CLEARANCE.name.perChar + CLEARANCE.name.pad;
        const inName = Math.abs(m.x - r.labelX) < half && m.y > r.labelY + CLEARANCE.name.top && m.y < r.labelY + CLEARANCE.name.bottom;
        expect(inName, `${m.kind} on the name of ${r.id}`).toBe(false);
      }
      for (const s of map.sites) expect(Math.hypot(m.x - s.x, m.y - s.y - CLEARANCE.site.dy)).toBeGreaterThanOrEqual(CLEARANCE.site.r + m.r - 0.1);
      for (const route of map.routes) {
        const a = sites.get(route.siteA)!;
        const b = sites.get(route.siteB)!;
        expect(segmentDistance(m, a, b)).toBeGreaterThanOrEqual(CLEARANCE.route + m.r - 0.1);
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

describe("shoreline and sea ornaments", () => {
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
