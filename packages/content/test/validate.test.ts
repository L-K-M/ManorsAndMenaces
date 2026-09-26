import { describe, expect, it } from "vitest";
import { clone } from "@manors-menaces/rules";
import { GREENVALE_MAP, MAPS, validateMap, type MapDefinition } from "../src/index.js";

// Each case breaks one rule of §101–102 on a copy of Greenvale and expects
// validateMap to name it.
const mutate = (change: (m: MapDefinition) => void): MapDefinition => {
  const m = clone(GREENVALE_MAP);
  change(m);
  return m;
};
const errorsOf = (m: MapDefinition): string[] => validateMap(m).errors;
const site = (m: MapDefinition, pred: (s: MapDefinition["sites"][number]) => boolean) => {
  const s = m.sites.find(pred);
  if (!s) throw new Error("fixture: no such site");
  return s;
};

describe("validateMap", () => {
  it("accepts every shipped map", () => {
    for (const map of Object.values(MAPS)) expect(validateMap(map).errors, map.id).toEqual([]);
  });

  it("rejects invalid road drawing points", () => {
    for (const points of [[], [{ x: 0, y: 0 }], [{ x: NaN, y: 0 }, { x: 1, y: 1 }], [{ x: 0, y: 0 }, { x: 1, y: 1 }]]) {
      expect(errorsOf(mutate((m) => { m.routes[0]!.points = points; }))).toContainEqual(expect.stringMatching(/route .* drawing/));
    }
  });

  it("rejects a Menace starting on the wrong kind of place", () => {
    const m = mutate((m) => {
      const troll = m.menaceStarts.find((s) => s.menaceType === "toll_troll");
      if (troll) troll.location = { kind: "route", routeId: m.routes[0]!.id };
    });
    expect(errorsOf(m)).toContainEqual(expect.stringMatching(/toll_troll.*must start on a region/));
  });

  it("rejects a map without a start for every Menace", () => {
    const m = mutate((m) => {
      m.menaceStarts = m.menaceStarts.filter((s) => s.menaceType !== "goblin_tinkers");
    });
    expect(errorsOf(m)).toContainEqual(expect.stringMatching(/no start for goblin_tinkers/));
  });

  it("rejects two Routes between the same Sites", () => {
    const m = mutate((m) => {
      const r = m.routes[0]!;
      m.routes.push({ ...r, id: "route_dup", siteA: r.siteB, siteB: r.siteA });
    });
    expect(errorsOf(m)).toContainEqual(expect.stringMatching(/route_dup duplicates/));
  });

  it("rejects a Region that touches no Site, and warns about one only a single Site can reach", () => {
    const empty = mutate((m) => {
      const r = m.regions[0]!;
      for (const sid of r.adjacentSiteIds) {
        const s = site(m, (x) => x.id === sid);
        s.adjacentRegionIds = s.adjacentRegionIds.filter((id) => id !== r.id);
      }
      r.adjacentSiteIds = [];
    });
    expect(errorsOf(empty)).toContainEqual(expect.stringMatching(/region_01 touches no Site/));
    let lonelyId = "";
    const lonely = mutate((m) => {
      const r = m.regions.find((x) => x.adjacentSiteIds.length >= 2)!;
      lonelyId = r.id;
      for (const sid of r.adjacentSiteIds.slice(1)) {
        const s = site(m, (x) => x.id === sid);
        s.adjacentRegionIds = s.adjacentRegionIds.filter((id) => id !== r.id);
      }
      r.adjacentSiteIds = r.adjacentSiteIds.slice(0, 1);
    });
    expect(validateMap(lonely).warnings).toContainEqual(expect.stringContaining(`${lonelyId} touches only one Site`));
    expect(errorsOf(lonely).filter((e) => e.includes(lonelyId))).toEqual([]);
  });

  it("rejects a Trading Post with an unknown resource or a bad rate", () => {
    const badResource = mutate((m) => {
      const post = site(m, (s) => !!s.tradePost);
      post.tradePost = { resource: "mithril" as never, give: 2 };
    });
    expect(errorsOf(badResource)).toContainEqual(expect.stringMatching(/Trading Post .* resource mithril/));
    for (const give of [0, 1, 1.5]) {
      const badRate = mutate((m) => {
        const post = site(m, (s) => !!s.tradePost);
        post.tradePost = { resource: "stone", give };
      });
      expect(errorsOf(badRate)).toContainEqual(expect.stringMatching(/Trading Post .* give/));
    }
  });

  it("rejects an unknown or repeated landmark", () => {
    const unknown = mutate((m) => {
      site(m, (s) => !s.landmarkId && !s.tradePost).landmarkId = "moon_base";
    });
    expect(errorsOf(unknown)).toContainEqual(expect.stringMatching(/unknown landmark moon_base/));
    const repeated = mutate((m) => {
      const first = site(m, (s) => !!s.landmarkId);
      site(m, (s) => !s.landmarkId && !s.tradePost).landmarkId = first.landmarkId as string;
    });
    expect(errorsOf(repeated)).toContainEqual(expect.stringMatching(/landmark .* is on more than one Site/));
  });

  it("rejects identical King's Highway endpoints", () => {
    const m = mutate((m) => {
      m.questParams.kingsHighway = [m.questParams.kingsHighway[0], m.questParams.kingsHighway[0]];
    });
    expect(errorsOf(m)).toContainEqual(expect.stringMatching(/King's Highway endpoints are the same Site/));
  });

  it("rejects a fractional capacity and an unknown resource", () => {
    const m = mutate((m) => {
      m.regions[0]!.capacity = 1.5;
      m.regions[1]!.resource = "wood" as never;
    });
    expect(errorsOf(m)).toContainEqual(expect.stringMatching(/region_01 capacity 1.5/));
    expect(errorsOf(m)).toContainEqual(expect.stringMatching(/region_02 has unknown resource wood/));
  });

  it("counts Regions by resource and warns when a resource is scarce", () => {
    const v = validateMap(GREENVALE_MAP);
    expect(Object.values(v.stats.byResource).reduce((a, b) => a + b, 0)).toBe(GREENVALE_MAP.regions.length);
    const scarce = mutate((m) => {
      let kept = 0;
      for (const r of m.regions) if (r.resource === "iron" && ++kept > 2) r.resource = "grain";
    });
    expect(validateMap(scarce).warnings).toContainEqual(expect.stringMatching(/only 2 iron Regions/));
  });
});
