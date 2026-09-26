import { describe, expect, it } from "vitest";
import { GREENVALE_MAP as map } from "@manors-menaces/content";
import {
  HARVEST_NOTES,
  RULESET_VERSION,
  UNDO_SAFE_COMMANDS,
  getLegalActions,
  standardRuleset,
  type GameCommand,
  type GameEvent,
  type GameState,
  type HarvestNote,
  type ResourceType,
} from "@manors-menaces/rules";
import { engineFor } from "../src/lib/game/engine.js";
import { arcFrames, planHarvestFlights, regionPoint } from "../src/lib/game/harvestFlights.js";

const [r1, r2, r3] = map.regions as [(typeof map.regions)[number], (typeof map.regions)[number], (typeof map.regions)[number]];

function harvested(regionId: string, produced: ResourceType | null, amount: number, notes: HarvestNote[] = [], playerId = "P1"): GameEvent {
  return { type: "banner_harvested", playerId, bannerId: `b-${regionId}`, regionId, produced, amount, notes };
}

describe("planHarvestFlights", () => {
  it("flies one token per resource from each producing Region and badges a blocked one", () => {
    const plan = planHarvestFlights([harvested(r1.id, r1.resource, 1), harvested(r2.id, null, 0, ["blocked_by_troll"]), harvested(r3.id, r3.resource, 1)], map);

    expect(plan.flights).toHaveLength(2);
    expect(plan.flights.map((f) => f.from)).toEqual([regionPoint(map, r1.id), regionPoint(map, r3.id)]);
    expect(plan.flights.map((f) => f.order)).toEqual([0, 1]);
    expect(plan.badges).toEqual([{ playerId: "P1", regionId: r2.id, at: regionPoint(map, r2.id), note: "blocked_by_troll" }]);
  });

  it("flies both tokens of a blessed harvest and marks the blessing", () => {
    const plan = planHarvestFlights([harvested(r1.id, "grain", 2, ["druids_blessing"])], map);

    expect(plan.flights.map((f) => f.resource)).toEqual(["grain", "grain"]);
    expect(plan.badges.map((b) => b.note)).toEqual(["druids_blessing"]);
  });

  it("badges every kind of Harvest note, a sick Banner above a Menace's", () => {
    for (const note of HARVEST_NOTES) expect(planHarvestFlights([harvested(r1.id, null, 0, [note])], map).badges.map((b) => b.note)).toEqual([note]);
    expect(planHarvestFlights([harvested(r1.id, null, 0, ["taken_by_dragon", "sick"])], map).badges.map((b) => b.note)).toEqual(["sick"]);
  });

  it("prefers the Menace's note when a harvest has several", () => {
    const plan = planHarvestFlights([harvested(r1.id, "grain", 0, ["druids_blessing", "taken_by_dragon"])], map);

    expect(plan.flights).toEqual([]);
    expect(plan.badges.map((b) => b.note)).toEqual(["taken_by_dragon"]);
  });

  it("flies starting resources from the Regions around the Manor that earned them", () => {
    const site = map.sites.find((s) => s.adjacentRegionIds.length >= 2)!;
    const around = site.adjacentRegionIds.map((id) => map.regions.find((r) => r.id === id)!);
    const events: GameEvent[] = [
      { type: "holding_built", playerId: "P2", holdingId: "h1", siteId: site.id, free: true },
      ...around.map((r): GameEvent => ({ type: "resource_gained", playerId: "P2", resource: r.resource, amount: 1, reason: "starting_resources" })),
    ];

    const plan = planHarvestFlights(events, map);

    expect(plan.flights.map((f) => f.from)).toEqual(around.map((r) => ({ x: r.labelX, y: r.labelY })));
    expect(plan.flights.every((f) => f.playerId === "P2")).toBe(true);
  });

  it("does not fly gains that have no Region (seat bonus, trades)", () => {
    const plan = planHarvestFlights(
      [
        { type: "resource_gained", playerId: "P1", resource: "grain", amount: 1, reason: "starting_resources" },
        { type: "resource_gained", playerId: "P1", resource: "stone", amount: 1, reason: "market" },
      ],
      map,
    );

    expect(plan.flights).toEqual([]);
  });
});

// FeedbackController drops starting resources from this client's own
// authoritative batches because they already flew when the Manor was
// buffered. That holds only while the engine keeps the two properties
// pinned here: placing a Manor is buffered (undo-safe, the same player
// acts next), and it grants one resource per adjacent Region.
describe("starting resources from a real setup", () => {
  it("are previewed with the Manor, one token per adjacent Region", () => {
    const engine = engineFor(map.id);
    const players = ["P1", "P2", "P3"].map((id) => ({ id, displayName: id }));
    let state: GameState = engine.createGame({ matchId: "flights", seed: "flights", rulesetVersion: RULESET_VERSION, ruleset: standardRuleset(3), players });
    let seq = 0;
    let checked = 0;

    // Every Manor and Route; Banner assignment grants no Region-bound gains.
    for (let step = 0; state.setup?.step !== "assign_banners" && step < 40; step++) {
      const playerId = state.activePlayerId!;
      const legal = getLegalActions(engine.ctx, state, playerId);
      const intent =
        legal.mode === "setup_manor"
          ? { type: "place_initial_manor" as const, siteId: legal.initialManorSites[0]! }
          : { type: "place_initial_route" as const, routeId: legal.initialRoutes[0]! };
      const command = { ...intent, commandId: `c${++seq}`, matchId: state.matchId, playerId } as GameCommand;
      const r = engine.applyCommand(state, command);
      expect(r.accepted).toBe(true);
      const next = r.newState!;

      if (intent.type === "place_initial_manor") {
        expect(UNDO_SAFE_COMMANDS.has(intent.type)).toBe(true);
        expect(next.activePlayerId).toBe(playerId);
        expect(next.pending ?? null).toBeNull();
        const gains = r.events.filter((e) => e.type === "resource_gained" && e.reason === "starting_resources");
        if (gains.length) {
          const site = map.sites.find((s) => s.id === intent.siteId)!;
          expect(gains.every((e) => e.type === "resource_gained" && e.amount === 1)).toBe(true);
          expect(planHarvestFlights(r.events, map).flights.map((f) => f.from)).toEqual(site.adjacentRegionIds.map((id) => regionPoint(map, id)));
          checked++;
        }
      }
      state = next;
    }

    expect(checked).toBe(players.length);
  });
});

describe("arcFrames", () => {
  it("runs from start to end and bows above both", () => {
    const frames = arcFrames({ x: 100, y: 300 }, { x: 500, y: 700 });

    expect(frames[0]).toMatchObject({ x: 100, y: 300, offset: 0 });
    expect(frames[frames.length - 1]).toMatchObject({ x: 500, y: 700, offset: 1 });
    expect(Math.min(...frames.map((f) => f.y))).toBeLessThan(300);
  });
});
