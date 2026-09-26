import { describe, expect, it } from "vitest";
import { GREENVALE_MAP as map, LEGACY_GREENVALE_MAP, rulesContentFor, toBoardTopology } from "@manors-menaces/content";
import { polygonPoints } from "../src/lib/art/geometry.js";

import { RULESET_VERSION, getLegalActions, mvpRuleset } from "@manors-menaces/rules";
import { engineFor, mapFor } from "../src/lib/game/engine.js";
import { routeGeometry } from "../src/lib/art/routes.js";

const config = { matchId: "coast", seed: "coast", rulesetVersion: RULESET_VERSION, ruleset: mvpRuleset(), players: ["P1", "P2"].map((id) => ({ id, displayName: id })) };
const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
const regionsAt = new Map<string, Set<string>>();
const borders = new Map<string, { a: string; b: string; count: number }>();
for (const region of map.regions) {
  const points = polygonPoints(region.path);
  points.forEach((p, i) => {
    const a = key(p), b = key(points[(i + 1) % points.length]!);
    if (!regionsAt.has(a)) regionsAt.set(a, new Set());
    regionsAt.get(a)!.add(region.id);
    const id = [a, b].sort().join("|");
    const edge = borders.get(id) ?? { a, b, count: 0 };
    edge.count++;
    borders.set(id, edge);
  });
}
const beach = new Set([...borders.values()].filter((e) => e.count === 1).flatMap((e) => [e.a, e.b]));
const junctions = [...beach].filter((p) => regionsAt.get(p)!.size >= 2);

describe("coastal building network", () => {
  it("has a manor Site wherever a shared region border meets the beach", () => {
    for (const point of junctions) {
      const site = map.sites.find((s) => key(s) === point);
      expect(site, `missing beach Site at ${point}`).toBeDefined();
      expect(new Set(site!.adjacentRegionIds)).toEqual(regionsAt.get(point));
    }
  });

  it("connects every beach Site to two neighbouring beach Sites", () => {
    const coastalIds = new Set(map.sites.filter((s) => beach.has(key(s))).map((s) => s.id));
    for (const id of coastalIds) {
      const roads = map.routes.filter((r) => (r.siteA === id && coastalIds.has(r.siteB)) || (r.siteB === id && coastalIds.has(r.siteA)));
      expect(roads, id).toHaveLength(2);
    }
  });

  it("covers every shoreline segment exactly once without crossing water", () => {
    const drawn = map.routes.flatMap((r) => (r.points ?? []).slice(1).map((p, i) => [key(r.points![i]!), key(p)].sort().join("|")));
    const boundary = [...borders].filter(([, e]) => e.count === 1).map(([id]) => id);
    expect(drawn.sort()).toEqual(boundary.sort());
  });

  it("lets each beach Site place a Manor and build either coastal road", () => {
    const engine = engineFor();
    for (const site of map.sites.filter((s) => beach.has(key(s)))) {
      const initial = engine.createGame(config);
      const placed = engine.applyCommand(initial, { type: "place_initial_manor", siteId: site.id, commandId: "manor", matchId: initial.matchId, playerId: initial.activePlayerId });
      expect(placed.accepted, site.id).toBe(true);
      const state = placed.newState!;
      const legal = getLegalActions(engine.ctx, state, state.activePlayerId);
      for (const road of map.routes.filter((r) => r.points && (r.siteA === site.id || r.siteB === site.id))) {
        expect(legal.initialRoutes).toContain(road.id);
        expect(engine.applyCommand(state, { type: "place_initial_route", routeId: road.id, commandId: road.id, matchId: state.matchId, playerId: state.activePlayerId }).accepted).toBe(true);
      }
    }
  });

  it("retains the published topology for existing saves and defaults new games to the coast", () => {
    expect(mapFor("greenvale")).toEqual(LEGACY_GREENVALE_MAP);
    expect(engineFor("greenvale").ctx.board.topology).toEqual(toBoardTopology(LEGACY_GREENVALE_MAP));
    expect(rulesContentFor().board).toEqual(toBoardTopology(map));
    expect(mapFor().id).toBe("greenvale-coastal-v2");
  });

  it("places route markers at half the travelled distance, not the endpoint chord", () => {
    const a = { x: 0, y: 0 }, b = { x: 30, y: 40 };
    const route = { id: "bend", siteA: "a", siteB: "b", kind: "road" as const, points: [a, { x: 30, y: 0 }, b] };
    expect(routeGeometry(route, a, b).mid).toEqual({ x: 30, y: 5 });
    expect(routeGeometry({ id: route.id, siteA: "a", siteB: "b", kind: "road" }, a, b).mid).toEqual({ x: 15, y: 20 });
  });
});
