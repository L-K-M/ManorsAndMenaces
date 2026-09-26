import { describe, expect, it } from "vitest";
import {
  checkBuildManor,
  createRng,
  createRulesEngine,
  mvpRuleset,
  seedRng,
  RESOURCE_TYPES,
  RULESET_VERSION,
  type BoardTopology,
  type CommandIntent,
  type GameCommand,
  type GameState,
  type PlayerId,
  type RegionTopology,
  type ResourceType,
} from "@manors-menaces/rules";
import { chooseAction, planExpansion } from "../src/index.js";

// A board where the only free Site is two Routes away from the first player.
//
//        ┌─── s11 ───┐
//   s1 ─ s2 ─ s3 ─ s4       s7 ─ s8
//             │    │
//             s5 ─ s6       s9 ─ s10
//
// The first player holds s1 (+ s1–s2) and s7 (+ s7–s8); the second holds s4
// (+ s4–s6) and s9 (+ s9–s10). s3, s6 and s11 touch s4 and fail the spacing
// rule, so the first player's only goal is s5, via s2–s3 and s3–s5; the
// s2–s11 Route is a decoy that leads nowhere.
const edges: [number, number][] = [
  [1, 2],
  [2, 3],
  [3, 4],
  [2, 11],
  [11, 4],
  [3, 5],
  [5, 6],
  [4, 6],
  [7, 8],
  [9, 10],
];
const routeId = (a: number, b: number): string => `r${Math.min(a, b)}-${Math.max(a, b)}`;
const region = (id: string, resource: RegionTopology["resource"], sites: number[]): RegionTopology => ({
  id,
  resource,
  capacity: 1,
  adjacentSiteIds: sites.map((n) => `s${n}`),
});
const regions = [
  region("R1", "grain", [1, 2, 11]),
  region("R2", "timber", [2, 3, 5]),
  region("R3", "stone", [3, 4, 11]),
  region("R4", "iron", [5, 6]),
  region("R5", "grain", [4, 6]),
  region("R6", "timber", [7, 8]),
  region("R7", "stone", [9, 10]),
  region("R8", "essence", [5]),
];
const siteIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => `s${n}`);
const BOARD: BoardTopology = {
  id: "ai-expansion-test",
  sites: siteIds.map((id) => ({ id, adjacentRegionIds: regions.filter((r) => r.adjacentSiteIds.includes(id)).map((r) => r.id) })),
  routes: edges.map(([a, b]) => ({ id: routeId(a, b), siteA: `s${a}`, siteB: `s${b}`, kind: "road" as const })),
  regions,
  landmarks: [],
  menaceStarts: [{ menaceType: "toll_troll", location: { kind: "region", regionId: "R7" } }],
  questParams: { kingsHighway: ["s1", "s4"] },
};
const engine = createRulesEngine({ board: BOARD, cards: [], quests: [] });

let counter = 0;
function act(state: GameState, playerId: PlayerId, intent: CommandIntent): GameState {
  const command = { ...intent, commandId: `t${++counter}`, matchId: state.matchId, playerId } as GameCommand;
  const r = engine.applyCommand(state, command);
  if (!r.accepted || !r.newState) throw new Error(`rejected ${intent.type}: ${r.error?.code}`);
  return r.newState;
}

/** Turn 1 of the first player, holding exactly `resources`. */
function position(resources: Partial<Record<ResourceType, number>>): { state: GameState; me: PlayerId } {
  let s = engine.createGame({
    matchId: "m",
    seed: "expansion",
    rulesetVersion: RULESET_VERSION,
    ruleset: mvpRuleset(),
    players: [
      { id: "A", displayName: "A" },
      { id: "B", displayName: "B" },
    ],
  });
  const [me, other] = s.turnOrder as [PlayerId, PlayerId];
  s = act(s, me, { type: "place_initial_manor", siteId: "s1" });
  s = act(s, me, { type: "place_initial_route", routeId: routeId(1, 2) });
  s = act(s, other, { type: "place_initial_manor", siteId: "s4" });
  s = act(s, other, { type: "place_initial_route", routeId: routeId(4, 6) });
  s = act(s, other, { type: "place_initial_manor", siteId: "s9" });
  s = act(s, other, { type: "place_initial_route", routeId: routeId(9, 10) });
  s = act(s, me, { type: "place_initial_manor", siteId: "s7" });
  s = act(s, me, { type: "place_initial_route", routeId: routeId(7, 8) });
  s = act(s, other, { type: "assign_initial_banners", assignments: {} });
  s = act(s, me, { type: "assign_initial_banners", assignments: {} });
  // Top up what setup produced (s7 yields a Timber) to exactly `resources`.
  const have = s.players[me]?.resources;
  if (!have) throw new Error("no player");
  const topUp = Object.fromEntries(RESOURCE_TYPES.map((r) => [r, (resources[r] ?? 0) - have[r]]));
  if (Object.values(topUp).some((n) => n < 0)) throw new Error(`setup produced more than ${JSON.stringify(resources)}`);
  const grant = engine.applyDebugCommand(s, { type: "debug_grant", commandId: "g", matchId: s.matchId, playerId: me, targetPlayerId: me, resources: topUp });
  if (!grant.newState) throw new Error("grant failed");
  s = grant.newState;
  if (s.activePlayerId !== me || s.phase !== "main") throw new Error(`expected ${me}'s Main Actions, got ${s.activePlayerId} ${s.phase}`);
  return { state: s, me };
}

describe("expansion planning", () => {
  it("plans a 2-Route expansion toward the only open Site", () => {
    const { state, me } = position({ timber: 1 });
    expect(planExpansion(engine.ctx, state, me)).toEqual({
      siteId: "s5",
      routes: 2,
      path: [routeId(2, 3), routeId(3, 5)],
      value: expect.any(Number),
      score: expect.any(Number),
    });
  });

  it("builds both Routes and the Manor instead of ending the turn", () => {
    for (const level of ["easy", "normal", "hard"] as const) {
      let { state, me } = position({ timber: 3, stone: 3, grain: 1 });
      const rng = createRng(seedRng(`plan-${level}`));
      const taken: CommandIntent[] = [];
      for (let i = 0; i < 10 && state.phase === "main"; i++) {
        const intent = chooseAction(engine, state, me, { level, rng });
        if (!intent) break;
        taken.push(intent);
        state = act(state, me, intent);
      }
      const builds = taken.filter((c) => c.type === "build_route" || c.type === "build_manor");
      expect(builds, `${level}: ${JSON.stringify(taken)}`).toEqual([
        { type: "build_route", routeId: routeId(2, 3) },
        { type: "build_route", routeId: routeId(3, 5) },
        { type: "build_manor", siteId: "s5" },
      ]);
    }
  });

  it("does not count a Site behind the player's own Fogged Route as ready", () => {
    let { state, me } = position({ timber: 2, stone: 2 });
    state = act(state, me, { type: "build_route", routeId: routeId(2, 3) });
    state = act(state, me, { type: "build_route", routeId: routeId(3, 5) });
    expect(planExpansion(engine.ctx, state, me)).toMatchObject({ siteId: "s5", routes: 0 });

    // Fog of Confusion on s3–s5 cuts s5 off from the network until it lifts.
    const other = state.turnOrder.find((id) => id !== me) as PlayerId;
    const fogged: GameState = { ...state, activeEffects: [...state.activeEffects, { kind: "fog", routeId: routeId(3, 5), sourcePlayerId: other }] };
    expect(checkBuildManor(engine.ctx, fogged, me, "s5").legal).toBe(false);
    expect(planExpansion(engine.ctx, fogged, me)).toBeNull();

    // A Highwayman only charges a toll, so s5 stays ready behind one.
    const [menace] = Object.values(state.menaces);
    if (!menace) throw new Error("no menace");
    const robbed: GameState = { ...state, menaces: { [menace.id]: { ...menace, type: "highwayman", location: { kind: "route", routeId: routeId(3, 5) } } } };
    expect(checkBuildManor(engine.ctx, robbed, me, "s5").legal).toBe(true);
    expect(planExpansion(engine.ctx, robbed, me)).toMatchObject({ siteId: "s5", routes: 0 });
  });

  it("does not plan through a Route that smoulders for someone else", () => {
    const { state, me } = position({ timber: 1 });
    const other = state.turnOrder.find((id) => id !== me) as PlayerId;
    const burned = (ownerId: PlayerId): GameState => ({
      ...state,
      activeEffects: [...state.activeEffects, { kind: "smouldering", routeId: routeId(2, 3), ownerId, sourcePlayerId: other }],
    });
    // Fire Bolt burned it from the other player: only they may rebuild it for now.
    expect(planExpansion(engine.ctx, burned(other), me)).toBeNull();
    // Burned from this player: it is theirs to rebuild.
    expect(planExpansion(engine.ctx, burned(me), me)).toMatchObject({ siteId: "s5", routes: 2 });
  });

  it("takes the first step with only enough for one Route", () => {
    const { state, me } = position({ timber: 1, stone: 1 });
    expect(chooseAction(engine, state, me, { level: "normal", rng: createRng(seedRng("one")) })).toEqual({
      type: "build_route",
      routeId: routeId(2, 3),
    });
  });

  it("trades a hoard toward the plan instead of sitting on it", () => {
    const { state, me } = position({ timber: 1, iron: 12, essence: 9 });
    const intent = chooseAction(engine, state, me, { level: "easy", rng: createRng(seedRng("hoard")) });
    expect(intent).toMatchObject({ type: "trade", receive: expect.stringMatching(/^(timber|stone|grain)$/) });
  });

  it("is deterministic", () => {
    const { state, me } = position({ timber: 3, stone: 3, grain: 1 });
    expect(planExpansion(engine.ctx, state, me)).toEqual(planExpansion(engine.ctx, JSON.parse(JSON.stringify(state)) as GameState, me));
  });
});
