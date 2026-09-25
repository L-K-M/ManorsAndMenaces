import { describe, expect, it } from "vitest";
import { chooseAction } from "../src/index.js";
import {
  RULESET_VERSION,
  createRng,
  createRulesEngine,
  seedRng,
  standardRuleset,
  type CommandIntent,
  type GameCommand,
  type GameState,
  type PlayerId,
  type BoardTopology,
  type RulesContent,
} from "@manors-menaces/rules";

// A minimal 8-site ring, enough for a full 2-player setup with spacing.
//
//   s1 ─ s2 ─ s3 ─ s4 ─ s5 ─ s6 ─ s7 ─ s8 ─ s1
//
// Holdings end up on s1, s7 (P1) and s3, s5 (P2). Each site feeds one region.
const S = (n: number): string => `s${n}`;
const edges: [number, number][] = [
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [8, 1],
];
const routeId = (a: number, b: number): string => `r${Math.min(a, b)}${Math.max(a, b)}`;

// Site number → region id. R_A is Grain; every other region is Timber (no Iron income anywhere).
const FEED: Record<number, string> = { 1: "R_A", 2: "R_T2", 3: "R_T3", 4: "R_T4", 5: "R_B", 6: "R_T6", 7: "R_T7", 8: "R_T8" };
const board: BoardTopology = {
  id: "ai-test",
  sites: Array.from({ length: 8 }, (_, i) => ({ id: S(i + 1), adjacentRegionIds: [FEED[i + 1]!] })),
  routes: edges.map(([a, b]) => ({ id: routeId(a, b), siteA: S(a), siteB: S(b), kind: "road" as const })),
  regions: [
    { id: "R_A", resource: "grain" as const, capacity: 1, adjacentSiteIds: ["s1"] },
    { id: "R_B", resource: "timber" as const, capacity: 1, adjacentSiteIds: ["s5"] },
    ...Object.entries(FEED)
      .filter(([, r]) => r.startsWith("R_T"))
      .map(([site, r]) => ({ id: r, resource: "timber" as const, capacity: 1, adjacentSiteIds: [S(Number(site))] })),
  ],
  landmarks: [],
  menaceStarts: [{ menaceType: "young_dragon" as const, location: { kind: "region" as const, regionId: "R_A" } }],
  questParams: { kingsHighway: ["s1", "s1"] },
};

const content: RulesContent = {
  board,
  cards: [{ id: "dragon_whisperer", type: "hero", timing: ["main"], effectId: "dragon_whisperer", copies: 2, requiresMenace: "young_dragon" }],
  quests: [],
};
const engine = createRulesEngine(content);

let seq = 0;
const apply = (s: GameState, p: PlayerId, intent: CommandIntent): GameState => {
  const command = { ...intent, commandId: `t${++seq}`, matchId: s.matchId, playerId: p } as GameCommand;
  const r = engine.applyCommand(s, command);
  if (!r.accepted || !r.newState) throw new Error(`${intent.type} rejected: ${r.error?.code}`);
  return r.newState;
};

/** Full 2-player setup: P1 manors s1+s7, P2 manors s3+s5, banners assigned. */
function started(ruleset: ReturnType<typeof standardRuleset>): GameState {
  let s = engine.createGame({
    matchId: "ai-m",
    seed: "seed",
    rulesetVersion: RULESET_VERSION,
    ruleset,
    players: [
      { id: "P1", displayName: "AI" },
      { id: "P2", displayName: "Other" },
    ],
  });
  // The first player is drawn from the seed, so follow the snake order.
  const siteFor: Record<string, string[]> = { P1: ["s1", "s7"], P2: ["s3", "s5"] };
  const placed = { P1: 0, P2: 0 };
  const order = s.setup!.placementOrder;
  for (const pid of order) {
    const site = siteFor[pid]![placed[pid as keyof typeof placed]++]!;
    s = apply(s, pid, { type: "place_initial_manor", siteId: site });
    const route = engine.ctx.board.routesAt(site).find((r) => s.routeOwners[r.id] === undefined)!;
    s = apply(s, pid, { type: "place_initial_route", routeId: route.id });
  }
  const feed: Record<string, string> = { s1: "R_A", s3: "R_T3", s5: "R_B", s7: "R_T7" };
  for (const pid of s.setup!.bannerAssignmentOrder) {
    const banners = Object.keys(s.banners).filter((b) => s.banners[b]?.ownerId === pid);
    const assignments: Record<string, string> = {};
    for (const b of banners) assignments[b] = feed[s.holdings[s.banners[b]!.holdingId]!.siteId]!;
    s = apply(s, pid, { type: "assign_initial_banners", assignments });
  }
  return s;
}

describe("Dragon Whisperer (rules-dragon-whisperer-take-choice)", () => {
  it("the AI takes the Hoard resource it needs most", () => {
    const ruleset = { ...standardRuleset(2), enableQuests: false, activeMenaces: ["young_dragon" as const] };
    let s = started(ruleset);
    // The dragon blocks the active player's Timber Banner and its Hoard
    // holds Grain and Iron. The player has Grain but no Iron, so the Iron
    // take must score higher (Iron feeds their Stronghold goal).
    const p = s.activePlayerId;
    const dragon = s.menaces["menace_young_dragon"]!;
    // Relocate the dragon onto one of the active player's Banner regions.
    const ownRegion = Object.values(s.banners).find((b) => b.ownerId === p && b.regionId)?.regionId ?? "R_A";
    s = {
      ...s,
      menaces: {
        ...s.menaces,
        menace_young_dragon: { ...dragon, location: { kind: "region", regionId: ownRegion }, state: { hoard: { grain: 1, iron: 1 } } },
      },
      players: {
        ...s.players,
        [p]: { ...s.players[p]!, hand: ["dragon_whisperer#1"], resources: { grain: 4, timber: 0, stone: 0, iron: 0, essence: 0 } },
      },
      cardDeck: [],
    };
    const intent = chooseAction(engine, s, p, { level: "normal", rng: createRng(seedRng("ai")) });
    expect(intent?.type).toBe("play_card");
    if (intent?.type !== "play_card") return;
    expect(intent.target.effect).toBe("dragon_whisperer");
    expect((intent.target as { take?: string }).take).toBe("iron");
  });
});
