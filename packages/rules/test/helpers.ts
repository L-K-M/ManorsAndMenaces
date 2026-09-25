import { expect } from "vitest";
import {
  createRulesEngine,
  mvpRuleset,
  standardRuleset,
  RULESET_VERSION,
  type BoardTopology,
  type CommandIntent,
  type GameCommand,
  type GameEvent,
  type GameState,
  type PlayerId,
  type RulesContent,
  type RulesetConfig,
} from "../src/index.js";

// A 3×3 test board.
//
//   s1 ─ s2 ─ s3        R5 (essence) above the top row
//   │ R1 │ R2 │         R6 (timber) left of the left column
//   s4 ─ s5 ─ s6        R7 (grain)  right of the right column
//   │ R3 │ R4 │         R8 (stone)  below the bottom row
//   s7 ─ s8 ─ s9
//
// R1 grain, R2 timber (capacity 2), R3 stone, R4 iron.
const S = (n: number): string => `s${n}`;
const face = (id: string, resource: RulesContent["board"]["regions"][number]["resource"], sites: number[], capacity = 1) => ({
  id,
  resource,
  capacity,
  adjacentSiteIds: sites.map(S),
});
const regions = [
  face("R1", "grain", [1, 2, 4, 5]),
  face("R2", "timber", [2, 3, 5, 6], 2),
  face("R3", "stone", [4, 5, 7, 8]),
  face("R4", "iron", [5, 6, 8, 9]),
  face("R5", "essence", [1, 2, 3]),
  face("R6", "timber", [1, 4, 7]),
  face("R7", "grain", [3, 6, 9]),
  face("R8", "stone", [7, 8, 9]),
];
const edges: [number, number][] = [
  [1, 2], [2, 3], [4, 5], [5, 6], [7, 8], [8, 9],
  [1, 4], [4, 7], [2, 5], [5, 8], [3, 6], [6, 9],
];
export const routeId = (a: number, b: number): string => `r${Math.min(a, b)}${Math.max(a, b)}`;

export const TEST_BOARD: BoardTopology = {
  id: "test",
  sites: Array.from({ length: 9 }, (_, i) => {
    const id = S(i + 1);
    return {
      id,
      adjacentRegionIds: regions.filter((r) => r.adjacentSiteIds.includes(id)).map((r) => r.id),
      ...(id === "s1" ? { landmarkId: "royal_castle" } : {}),
      ...(id === "s9" ? { landmarkId: "wizard_tower" } : {}),
      ...(id === "s3" ? { landmarkId: "adventurers_inn" } : {}),
      ...(id === "s7" ? { tradePost: { resource: "stone" as const, give: 2 } } : {}),
    };
  }),
  routes: edges.map(([a, b]) => ({ id: routeId(a, b), siteA: S(a), siteB: S(b), kind: "road" as const })),
  regions,
  landmarks: [
    { id: "royal_castle", siteId: "s1" },
    { id: "wizard_tower", siteId: "s9" },
    { id: "adventurers_inn", siteId: "s3" },
  ],
  menaceStarts: [
    { menaceType: "toll_troll", location: { kind: "region", regionId: "R4" } },
    { menaceType: "young_dragon", location: { kind: "region", regionId: "R8" } },
    { menaceType: "bog_witch", location: { kind: "region", regionId: "R7" } },
    { menaceType: "highwayman", location: { kind: "route", routeId: "r56" } },
    { menaceType: "goblin_tinkers", location: { kind: "site", siteId: "s8" } },
  ],
  questParams: { kingsHighway: ["s1", "s9"] },
};

export function testContent(): RulesContent {
  return {
    board: TEST_BOARD,
    cards: [
      { id: "wizard_interference", type: "spell", timing: ["main"], effectId: "wizard_interference", copies: 3 },
      { id: "counterspell", type: "spell", timing: ["reaction"], effectId: "counterspell", copies: 2 },
      { id: "knight_errant", type: "hero", timing: ["main"], effectId: "knight_errant", copies: 3 },
      { id: "druids_blessing", type: "spell", timing: ["main"], effectId: "druids_blessing", copies: 2 },
      { id: "teleportation_mishap", type: "spell", timing: ["main"], effectId: "teleportation_mishap", copies: 2, requiresMenacePair: true },
      { id: "bribe_the_troll", type: "trick", timing: ["main"], effectId: "bribe_the_troll", copies: 2, requiresMenace: "toll_troll" },
      { id: "arcane_exchange", type: "spell", timing: ["main"], effectId: "arcane_exchange", copies: 2 },
      { id: "festival_at_the_inn", type: "story", timing: ["main"], effectId: "festival_at_the_inn", copies: 2 },
      { id: "very_minor_prophecy", type: "spell", timing: ["main"], effectId: "very_minor_prophecy", copies: 2 },
      { id: "fog_of_confusion", type: "spell", timing: ["main"], effectId: "fog_of_confusion", copies: 2 },
      { id: "dragon_whisperer", type: "hero", timing: ["main"], effectId: "dragon_whisperer", copies: 2, requiresMenace: "young_dragon" },
    ],
    quests: [
      { id: "kings_highway", renown: 2, conditionId: "kings_highway", exclusive: true },
      { id: "monster_problems", renown: 1, conditionId: "monster_problems", exclusive: true },
      { id: "stone_and_timber", renown: 1, conditionId: "stone_and_timber", exclusive: true },
      { id: "prosperous_estates", renown: 1, conditionId: "prosperous_estates", exclusive: true },
      { id: "the_safer_road", renown: 1, conditionId: "the_safer_road", exclusive: true },
    ],
  };
}

export const engine = createRulesEngine(testContent());

let counter = 0;
export function cmd(state: GameState, playerId: PlayerId, intent: CommandIntent): GameCommand {
  return { ...intent, commandId: `c${++counter}`, matchId: state.matchId, playerId } as GameCommand;
}

/** Apply a command and assert that it was accepted. */
export function act(state: GameState, playerId: PlayerId, intent: CommandIntent): { state: GameState; events: GameEvent[] } {
  const r = engine.applyCommand(state, cmd(state, playerId, intent));
  if (!r.accepted || !r.newState) throw new Error(`rejected ${intent.type}: ${r.error?.code} ${r.error?.detail ?? ""}`);
  return { state: r.newState, events: r.events };
}

/** Debug-draws a card of definition `card` into `p`'s hand. */
export function give(s: GameState, p: PlayerId, card: string): GameState {
  const r = engine.applyDebugCommand(s, { type: "debug_draw_card", commandId: "d", matchId: s.matchId, playerId: p, targetPlayerId: p, cardDefId: card });
  if (!r.newState) throw new Error(r.error?.code);
  return r.newState;
}

/** Apply a command and assert that it was rejected with the given code. */
export function reject(state: GameState, playerId: PlayerId, intent: CommandIntent, code: string): void {
  const r = engine.applyCommand(state, cmd(state, playerId, intent));
  expect(r.accepted, `expected ${intent.type} to be rejected`).toBe(false);
  expect(r.error?.code).toBe(code);
}

export function newGame(ruleset: RulesetConfig = mvpRuleset(), seed = "test-seed"): GameState {
  return engine.createGame({
    matchId: "m1",
    seed,
    rulesetVersion: RULESET_VERSION,
    ruleset,
    players: [
      { id: "A", displayName: "Alice" },
      { id: "B", displayName: "Bob" },
    ],
  });
}

/**
 * Standard 2-player setup on the test board, returning the state at the start
 * of turn 1. First player (p1): Manors on s1 (+Route s1–s2) and s9 (+s6–s9),
 * Banners on R1 (grain) and R8 (stone). Second player (p2): Manors on s3
 * (+s3–s6) and s7 (+s7–s8), Banners on R5 (essence) and R3 (stone).
 */
export function setupGame(ruleset: RulesetConfig = mvpRuleset(), banners?: Record<string, string | null>[]) {
  let s = newGame(ruleset);
  const [p1, p2] = s.turnOrder as [PlayerId, PlayerId];
  // Snake: p1, p2, p2, p1.
  s = act(s, p1, { type: "place_initial_manor", siteId: "s1" }).state;
  s = act(s, p1, { type: "place_initial_route", routeId: routeId(1, 2) }).state;
  s = act(s, p2, { type: "place_initial_manor", siteId: "s3" }).state;
  s = act(s, p2, { type: "place_initial_route", routeId: routeId(3, 6) }).state;
  s = act(s, p2, { type: "place_initial_manor", siteId: "s7" }).state;
  s = act(s, p2, { type: "place_initial_route", routeId: routeId(7, 8) }).state;
  s = act(s, p1, { type: "place_initial_manor", siteId: "s9" }).state;
  s = act(s, p1, { type: "place_initial_route", routeId: routeId(6, 9) }).state;
  // Banners in reverse turn order: p2 first.
  const bannerOf = (pid: PlayerId, site: string) =>
    Object.values(s.banners).find((b) => b.ownerId === pid && s.holdings[b.holdingId]?.siteId === site)?.id as string;
  const [bp2, bp1] = banners ?? [
    { [bannerOf(p2, "s3")]: "R5", [bannerOf(p2, "s7")]: "R3" },
    { [bannerOf(p1, "s1")]: "R1", [bannerOf(p1, "s9")]: "R8" },
  ];
  s = act(s, p2, { type: "assign_initial_banners", assignments: bp2 as Record<string, string | null> }).state;
  s = act(s, p1, { type: "assign_initial_banners", assignments: bp1 as Record<string, string | null> }).state;
  return { state: s, p1, p2, bannerOf: (pid: PlayerId, site: string) => bannerOf(pid, site) };
}

/** End the active player's turn with no changes. */
export function passTurn(state: GameState): GameState {
  const p = state.activePlayerId;
  let s = state;
  if (s.phase === "main") s = act(s, p, { type: "end_main_phase" }).state;
  if (s.phase === "banner_assignment") s = act(s, p, { type: "assign_banners", assignments: {} }).state;
  return act(s, p, { type: "end_turn" }).state;
}

/** Give a player resources directly (test-only shortcut). */
export function grant(state: GameState, playerId: PlayerId, res: Partial<Record<string, number>>): GameState {
  const r = engine.applyDebugCommand(state, {
    type: "debug_grant",
    commandId: "g",
    matchId: state.matchId,
    playerId,
    targetPlayerId: playerId,
    resources: res,
  });
  if (!r.newState) throw new Error("grant failed");
  return r.newState;
}

export { mvpRuleset, standardRuleset };
