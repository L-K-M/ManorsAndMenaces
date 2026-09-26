import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ISLANDS, LEGACY_GREENVALE_MAP, type MapDefinition } from "@manors-menaces/content";
import { edgeDistance, inside, polygonPoints, signedArea, type Pt } from "../src/lib/art/geometry.js";

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

/** Everything a save relies on (ids, connections, Resources, landmarks, Menace starts), without the drawing. */
function fingerprint(map: MapDefinition): string {
  const { coastline: _coastline, sites, routes, regions, ...rest } = map;
  const gameplay = {
    ...rest,
    sites: sites.map(({ x: _x, y: _y, ...s }) => s),
    routes: routes.map(({ points: _points, ...r }) => r),
    regions: regions.map(({ path: _path, labelX: _x, labelY: _y, ...r }) => r),
  };
  return createHash("sha256").update(JSON.stringify(gameplay)).digest("hex");
}

describe("published boards", () => {
  it("keeps every island's connections and save-game identities", () => {
    // As above: saves and online matches name these islands, so a change here
    // needs a new island id rather than a new fingerprint.
    expect(Object.fromEntries(ISLANDS.map((m) => [m.id, fingerprint(m)]))).toEqual(ISLAND_FINGERPRINTS);
  });
});

const ISLAND_FINGERPRINTS: Record<string, string> = {
  "greenvale-coastal-v2": "c0ca0eb72ca57ac843fdc2833eb50b74cbbae90cd69e7b92d353d7e9c3c64a4b",
  "ashmere": "bdd3e8cf281457f645adadfb13d187586c524b884b6a287a6880cd49553aa9c3",
  "brightwater": "2fa415b0f5d7e456738c2f54e10893c45f13231096f794d29577fb49ed18c305",
  "dunmarrow": "917ed2714801f487f5eabe4667f8c53b7f7147f7a8f434d14607bf89f92643e7",
  "emberreach": "74d92475e5e65b31ca7cc4bab5d8326fec474d180d1bc988b536c05d222beb12",
  "hollowmere": "188fbf65314229b79078d5b7a8bff6f6b2cefa69248cfbbd97b03b02ba6065e0",
  "kingsbarrow": "1dd3dc645af52207b041f7093a379a98eea88851375389871cf78cf18a3ba03e",
  "mistholm": "98b211f54bf0ccacfe2ed2bd3792854f7181c52f83564d4e520228d0b841770c",
  "ravensholt": "e24e13c31c578e294334d8db8a18f55925fa9be9dd194e325dc95421bf8d7533",
  "silverfen": "c01dd9cf97dea0ab620f027e360adc88d58df614fa27de85f9a75a7266e87b9c",
  "stagmoor": "4030d74f26625c84eee7af74ee6914299752b50b84fe20384785a2f91972aec3",
  "thornwold": "0e608093a555d2ca04fd1c7243606099d5ae21a34986101ee833cb1058055bdc",
  "wyrmsend": "4d337769089131bf784a6e47543bdb67933f94d7a3d24212cfe778e81e47956b",
};

describe.each(ISLANDS.map((m) => [m.id, m] as const))("island geography of %s", (_, map) => {
  const coast = polygonPoints(map.coastline);
  const onLand = (p: Pt) => inside(p, coast) || edgeDistance(p, coast) < 1;

  it("has substantial bays rather than small ripples around an oval", () => {
    const hull = convexHull(coast);
    expect(signedArea(coast) / signedArea(hull)).toBeLessThan(0.9);
    expect(Math.max(...coast.map((p) => edgeDistance(p, hull)))).toBeGreaterThan(100);
  });

  it("preserves the published board's connections and save-game identities", () => {
    const { coastline: _coastline, sites, regions, ...rest } = LEGACY_GREENVALE_MAP;
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
      const points = route.points ?? [a, b];
      for (let i = 1; i < points.length; i++) {
        const from = points[i - 1]!, to = points[i]!;
        for (let step = 0; step <= 100; step++) {
          const t = step / 100;
          expect(onLand({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }), route.id).toBe(true);
        }
      }
    }
  });
});
