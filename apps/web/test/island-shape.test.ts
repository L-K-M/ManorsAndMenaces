import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GREENVALE_MAP as map } from "@manors-menaces/content";
import { edgeDistance, inside, polygonPoints, signedArea, type Pt } from "../src/lib/art/geometry.js";

const coast = polygonPoints(map.coastline);
const cross = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function convexHull(points: Pt[]): Pt[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const half = (ps: Pt[]) => {
    const out: Pt[] = [];
    for (const p of ps) {
      while (out.length > 1 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half(sorted.reverse())];
}
const onLand = (p: Pt) => inside(p, coast) || edgeDistance(p, coast) < 1;

describe("island geography", () => {
  it("has substantial bays rather than small ripples around an oval", () => {
    const hull = convexHull(coast);
    expect(signedArea(coast) / signedArea(hull)).toBeLessThan(0.9);
    expect(Math.max(...coast.map((p) => edgeDistance(p, hull)))).toBeGreaterThan(100);
  });

  it("preserves the published board's connections and save-game identities", () => {
    const { coastline: _coastline, sites, regions, ...rest } = map;
    const gameplay = {
      ...rest,
      sites: sites.map(({ x: _x, y: _y, ...s }) => s),
      regions: regions.map(({ path: _path, labelX: _x, labelY: _y, ...r }) => r),
    };
    // Geometry may evolve; changing this fingerprint requires a new map ID or
    // migration, since existing saves refer to these routes, sites and regions.
    expect(createHash("sha256").update(JSON.stringify(gameplay)).digest("hex"))
      .toBe("3e3f4064e00754e6873e0c1444980c51ae7e214075ac984b03e352d8476144c2");
  });

  it("keeps regions simple and tiled, with their labels on land", () => {
    const polygons = [coast, ...map.regions.map((r) => polygonPoints(r.path))];
    for (const poly of polygons) {
      expect(signedArea(poly)).toBeGreaterThan(0);
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!;
        const b = poly[(i + 1) % poly.length]!;
        for (let j = i + 2; j < poly.length; j++) {
          if (i === 0 && j === poly.length - 1) continue;
          const c = poly[j]!;
          const d = poly[(j + 1) % poly.length]!;
          const crosses = cross(a, b, c) * cross(a, b, d) < -0.01 && cross(c, d, a) * cross(c, d, b) < -0.01;
          expect(crosses, `crossed polygon edges ${i}, ${j}`).toBe(false);
        }
      }
    }
    const regionArea = polygons.slice(1).reduce((sum, poly) => sum + signedArea(poly), 0);
    expect(Math.abs(regionArea - signedArea(coast)) / signedArea(coast)).toBeLessThan(0.001);
    for (const r of map.regions) {
      expect(inside({ x: r.labelX, y: r.labelY }, polygonPoints(r.path)), r.id).toBe(true);
    }
  });

  it("places every Site at the shared corner of all its Regions", () => {
    for (const site of map.sites) {
      for (const id of site.adjacentRegionIds) {
        const poly = polygonPoints(map.regions.find((r) => r.id === id)!.path);
        expect(poly.some((p) => p.x === site.x && p.y === site.y), `${site.id} must be a corner of ${id}`).toBe(true);
      }
    }
  });

  it("draws shared-border Routes on the same segment as both Regions", () => {
    for (const route of map.routes) {
      const a = map.sites.find((s) => s.id === route.siteA)!;
      const b = map.sites.find((s) => s.id === route.siteB)!;
      const common = a.adjacentRegionIds.filter((id) => b.adjacentRegionIds.includes(id));
      if (common.length < 2) continue;
      for (const id of common) {
        const poly = polygonPoints(map.regions.find((r) => r.id === id)!.path);
        const joins = poly.some((p, i) => {
          const q = poly[(i + 1) % poly.length]!;
          return (p.x === a.x && p.y === a.y && q.x === b.x && q.y === b.y)
            || (p.x === b.x && p.y === b.y && q.x === a.x && q.y === a.y);
        });
        expect(joins, `${route.id} must follow the border of ${id}`).toBe(true);
      }
    }
  });

  it("keeps sites and the full length of every route on land", () => {
    for (const p of coast) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(map.width);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(map.height);
    }
    for (const s of map.sites) expect(onLand(s), s.id).toBe(true);
    for (const route of map.routes) {
      const a = map.sites.find((s) => s.id === route.siteA)!;
      const b = map.sites.find((s) => s.id === route.siteB)!;
      for (let step = 0; step <= 100; step++) {
        const t = step / 100;
        expect(onLand({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }), route.id).toBe(true);
      }
    }
  });
});
