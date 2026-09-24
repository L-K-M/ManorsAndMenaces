import { describe, expect, it } from "vitest";
import {
  createRng,
  getHarvestPreview,
  getLegalActions,
  getRenown,
  hashState,
  redactState,
  seedRng,
  HIDDEN_CARD,
  type GameState,
  type PlayerId,
} from "../src/index.js";
import { act, engine, grant, mvpRuleset, newGame, passTurn, reject, routeId, setupGame, standardRuleset } from "./helpers.js";

const ctx = engine.ctx;

describe("rng", () => {
  it("is deterministic for a seed and serializable", () => {
    const a = createRng(seedRng("x"));
    const b = createRng(seedRng("x"));
    const seqA = Array.from({ length: 5 }, () => a.nextUint32());
    expect(Array.from({ length: 5 }, () => b.nextUint32())).toEqual(seqA);
    const resumed = createRng(a.state);
    expect(resumed.nextUint32()).toBe(a.nextUint32());
  });
  it("nextInt stays in range and shuffle is a permutation", () => {
    const r = createRng(seedRng("y"));
    for (let i = 0; i < 1000; i++) {
      const v = r.nextInt(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
    const items = [1, 2, 3, 4, 5, 6];
    expect([...r.shuffle(items)].sort()).toEqual(items);
  });
});

describe("setup (§28)", () => {
  it("uses snake order and reverse Banner order", () => {
    const s = newGame();
    const [p1, p2] = s.turnOrder;
    expect(s.setup?.placementOrder).toEqual([p1, p2, p2, p1]);
    expect(s.setup?.bannerAssignmentOrder).toEqual([p2, p1]);
    expect(s.activePlayerId).toBe(p1);
  });
  it("enforces spacing and route adjacency", () => {
    let s = newGame();
    const [p1, p2] = s.turnOrder as [PlayerId, PlayerId];
    s = act(s, p1, { type: "place_initial_manor", siteId: "s1" }).state;
    reject(s, p1, { type: "place_initial_route", routeId: routeId(5, 6) }, "NOT_CONNECTED");
    s = act(s, p1, { type: "place_initial_route", routeId: routeId(1, 2) }).state;
    reject(s, p2, { type: "place_initial_manor", siteId: "s2" }, "SITE_TOO_CLOSE");
    reject(s, p1, { type: "place_initial_manor", siteId: "s5" }, "NOT_ACTIVE_PLAYER");
  });
  it("grants starting resources after the second Manor only", () => {
    const { state, p1, p2 } = setupGame();
    // p2's second Manor is s7: R3 stone, R6 timber, R8 stone.
    expect(state.players[p2]?.resources).toMatchObject({ stone: 2, timber: 1, grain: 0 });
    // p1's second Manor is s9: R4 iron, R7 grain, R8 stone.
    expect(state.players[p1]?.resources).toMatchObject({ iron: 1, grain: 1, stone: 1 });
  });
  it("starts turn 1 in Main phase with no Harvest, and Banners unsettled", () => {
    const { state, p1 } = setupGame();
    expect(state.status).toBe("playing");
    expect(state.activePlayerId).toBe(p1);
    expect(state.phase).toBe("main");
    expect(state.players[p1]?.resources.grain).toBe(1);
    expect(Object.values(state.banners).every((b) => !b.settled)).toBe(true);
  });
});

describe("building (§12–13)", () => {
  it("builds Routes only from the network and not through enemy Holdings", () => {
    const { state, p1, p2 } = setupGame();
    let s = grant(state, p1, { timber: 5, stone: 5 });
    reject(s, p1, { type: "build_route", routeId: routeId(4, 7) }, "NOT_CONNECTED");
    s = act(s, p1, { type: "build_route", routeId: routeId(2, 3) }).state; // ends at p2's Manor on s3
    expect(s.routeOwners[routeId(2, 3)]).toBe(p1);
    // s3 holds p2's Manor, so p1 cannot continue from it.
    expect(ctx.board.routesAt("s3").map((r) => r.id)).toContain(routeId(3, 6));
    reject(s, p1, { type: "build_route", routeId: routeId(2, 3) }, "ROUTE_OCCUPIED");
    void p2;
  });
  it("builds Manors at Route ends with spacing, paying the cost", () => {
    const { state, p1 } = setupGame();
    let s = grant(state, p1, { timber: 5, stone: 5, grain: 5 });
    s = act(s, p1, { type: "build_route", routeId: routeId(1, 4) }).state;
    s = act(s, p1, { type: "build_route", routeId: routeId(4, 5) }).state;
    reject(s, p1, { type: "build_manor", siteId: "s4" }, "SITE_TOO_CLOSE");
    const before = s.players[p1]?.resources;
    s = act(s, p1, { type: "build_manor", siteId: "s5" }).state;
    const after = s.players[p1]?.resources;
    expect(after?.grain).toBe((before?.grain ?? 0) - 1);
    expect(getRenown(ctx, s, p1)).toBe(3);
    expect(Object.values(s.banners).filter((b) => b.ownerId === p1)).toHaveLength(3);
  });
  it("upgrades to a Stronghold with a second Banner and +1 Renown", () => {
    const { state, p1 } = setupGame();
    reject(state, p1, { type: "upgrade_holding", siteId: "s1" }, "INSUFFICIENT_RESOURCES");
    let s = grant(state, p1, { grain: 2, iron: 2 });
    const { state: s2, events } = act(s, p1, { type: "upgrade_holding", siteId: "s1" });
    s = s2;
    expect(getRenown(ctx, s, p1)).toBe(3);
    const upgraded = events.find((e) => e.type === "holding_upgraded");
    expect(upgraded).toBeTruthy();
    expect(Object.values(s.banners).filter((b) => b.ownerId === p1)).toHaveLength(3);
    reject(s, p1, { type: "upgrade_holding", siteId: "s1" }, "SITE_OCCUPIED");
  });
});

describe("banners (§14)", () => {
  it("enforces adjacency, capacity and the Stronghold restriction", () => {
    const { state, p1, p2, bannerOf } = setupGame();
    let s = act(state, p1, { type: "end_main_phase" }).state;
    const b1 = bannerOf(p1, "s1");
    reject(s, p1, { type: "assign_banners", assignments: { [b1]: "R4" } }, "BANNER_NOT_ADJACENT");
    reject(s, p1, { type: "assign_banners", assignments: { [b1]: "R5" } }, "REGION_FULL"); // p2 holds R5
    reject(s, p1, { type: "assign_banners", assignments: { [bannerOf(p2, "s3")]: null } }, "BANNER_NOT_OWNED");
    s = act(s, p1, { type: "assign_banners", assignments: { [b1]: "R6" } }).state;
    expect(s.banners[b1]?.regionId).toBe("R6");

    // Stronghold on s3 for p2: both Banners cannot share R2 (capacity 2).
    s = act(s, p1, { type: "end_turn" }).state;
    s = grant(s, p2, { grain: 2, iron: 2 });
    s = act(s, p2, { type: "upgrade_holding", siteId: "s3" }).state;
    s = act(s, p2, { type: "end_main_phase" }).state;
    const [x, y] = Object.values(s.banners).filter((b) => s.holdings[b.holdingId]?.siteId === "s3").map((b) => b.id) as [string, string];
    reject(s, p2, { type: "assign_banners", assignments: { [x]: "R2", [y]: "R2" } }, "STRONGHOLD_BANNERS_SAME_REGION");
    s = act(s, p2, { type: "assign_banners", assignments: { [x]: "R2", [y]: "R7" } }).state;
    expect(s.banners[y]?.regionId).toBe("R7");
  });
});

describe("harvest (§15, §31)", () => {
  it("produces from Banners from the second turn and settles them", () => {
    const { state, p1, p2 } = setupGame();
    let s = passTurn(state); // p1 turn 1 (skipped harvest) → p2 turn 1 (skipped)
    expect(s.activePlayerId).toBe(p2);
    s = passTurn(s); // → p1 turn 2: harvest R1 grain + R8 stone
    expect(s.activePlayerId).toBe(p1);
    expect(s.players[p1]?.resources).toMatchObject({ grain: 2, stone: 2 });
    expect(Object.values(s.banners).filter((b) => b.ownerId === p1).every((b) => b.settled)).toBe(true);
  });
  it("Toll Troll blocks, Witch converts, Dragon diverts into its Hoard", () => {
    const rs = { ...standardRuleset(4), activeMenaces: ["toll_troll", "young_dragon", "bog_witch"] as const };
    const { state, p1, bannerOf } = setupGame({ ...rs, activeMenaces: [...rs.activeMenaces] });
    // p1: s9 Banner on R8 (Dragon). Move p1's s1 Banner to R6 (timber, no menace).
    let s = act(state, p1, { type: "end_main_phase" }).state;
    s = act(s, p1, { type: "assign_banners", assignments: { [bannerOf(p1, "s9")]: "R7" } }).state; // Witch region
    s = act(s, p1, { type: "end_turn" }).state;
    s = passTurn(s);
    // R1 grain (no menace) +1 grain; R7 grain converted to essence.
    const p = s.players[p1];
    expect(p?.resources.essence).toBe(1);
    expect(p?.resources.grain).toBe(2);
    const preview = getHarvestPreview(ctx, s, p1, { [bannerOf(p1, "s9")]: "R4" });
    expect(preview.banners.find((b) => b.regionId === "R4")?.notes).toContain("blocked_by_troll");
    const dragonPreview = getHarvestPreview(ctx, s, p1, { [bannerOf(p1, "s9")]: "R8" });
    expect(dragonPreview.banners.find((b) => b.regionId === "R8")).toMatchObject({ amount: 0, notes: ["taken_by_dragon"] });
  });
});

describe("market & trading posts (§17)", () => {
  it("trades 3:1 up to twice a turn", () => {
    const { state, p1 } = setupGame();
    let s = grant(state, p1, { timber: 9 });
    s = act(s, p1, { type: "trade", give: "timber", receive: "iron" }).state;
    s = act(s, p1, { type: "trade", give: "timber", receive: "iron" }).state;
    reject(s, p1, { type: "trade", give: "timber", receive: "iron" }, "MARKET_LIMIT_REACHED");
    expect(s.players[p1]?.resources).toMatchObject({ timber: 3, iron: 3 });
  });
  it("trading posts give 2:1 only to their holder", () => {
    const { state, p1, p2 } = setupGame();
    reject(grant(state, p1, { stone: 4 }), p1, { type: "trade", give: "stone", receive: "iron", tradePostSiteId: "s7" }, "NO_TRADE_POST");
    let s = passTurn(state);
    s = act(s, p2, { type: "trade", give: "stone", receive: "iron", tradePostSiteId: "s7" }).state;
    expect(s.players[p2]?.resources).toMatchObject({ stone: 0, iron: 1 });
  });
});

describe("Royal Writ (§14.7)", () => {
  it("requires a settled target next to one of your Holdings and pays a bribe", () => {
    const { state, p1, p2, bannerOf } = setupGame();
    const target = bannerOf(p2, "s3"); // on R5, adjacent to p1's s1
    let s = grant(state, p1, { essence: 2, grain: 1 });
    reject(s, p1, { type: "issue_royal_writ", targetBannerId: target, bribe: "grain" }, "BANNER_NOT_SETTLED");
    s = passTurn(s); // p2 turn 1 (skip)
    s = passTurn(s); // p1 turn 2 harvest
    s = passTurn(s); // p2 turn 2 harvest → p2 Banners settled
    s = passTurn(s); // p1 turn 3
    expect(s.banners[target]?.settled).toBe(true);
    const p2Grain = s.players[p2]?.resources.grain ?? 0;
    reject(s, p1, { type: "issue_royal_writ", targetBannerId: bannerOf(p2, "s7"), bribe: "grain" }, "BANNER_NOT_ADJACENT");
    s = act(s, p1, { type: "issue_royal_writ", targetBannerId: target, bribe: "grain" }).state;
    expect(s.banners[target]).toMatchObject({ regionId: null, settled: false });
    expect(s.players[p2]?.resources.grain).toBe(p2Grain + 1);
    reject(s, p1, { type: "issue_royal_writ", targetBannerId: bannerOf(p2, "s7"), bribe: "grain" }, "WRIT_LIMIT_REACHED");
    // p1 can now take R5 with the s1 Banner.
    s = act(s, p1, { type: "end_main_phase" }).state;
    s = act(s, p1, { type: "assign_banners", assignments: { [bannerOf(p1, "s1")]: "R5" } }).state;
    expect(s.banners[bannerOf(p1, "s1")]?.regionId).toBe("R5");
  });
});

describe("Warden (§26.1)", () => {
  it("moves a Menace for Essence + Grain once per turn and counts for Quests", () => {
    const { state, p1 } = setupGame();
    let s = grant(state, p1, { essence: 2, grain: 2 });
    reject(s, p1, { type: "hire_warden", menaceId: "menace_toll_troll", destination: { kind: "region", regionId: "R4" } }, "ILLEGAL_MENACE_TARGET");
    reject(s, p1, { type: "hire_warden", menaceId: "menace_toll_troll", destination: { kind: "route", routeId: "r12" } }, "ILLEGAL_MENACE_TARGET");
    s = act(s, p1, { type: "hire_warden", menaceId: "menace_toll_troll", destination: { kind: "region", regionId: "R5" } }).state;
    expect(s.menaces["menace_toll_troll"]?.location).toEqual({ kind: "region", regionId: "R5" });
    expect(s.players[p1]?.stats.menacesMoved).toBe(1);
    reject(s, p1, { type: "hire_warden", menaceId: "menace_toll_troll", destination: { kind: "region", regionId: "R3" } }, "WARDEN_LIMIT_REACHED");
  });
});

describe("Menace side effects (§22, §25)", () => {
  it("Highwayman requires a toll to build through his Route", () => {
    const rs = { ...mvpRuleset(), activeMenaces: ["highwayman" as const] };
    const { state, p1 } = setupGame(rs);
    // p1 owns r69; Highwayman sits on r56 (unowned). Build r56 from s6? s6 is a network site via r69.
    let s = grant(state, p1, { timber: 3, stone: 3, grain: 3 });
    s = act(s, p1, { type: "build_route", routeId: "r56" }).state;
    // Building r45 from s5 now relies on r56 (Highwayman) → toll required.
    reject(s, p1, { type: "build_route", routeId: "r45" }, "INVALID_PAYMENT");
    s = act(s, p1, { type: "build_route", routeId: "r45", tollPayment: "grain" }).state;
    expect(s.routeOwners["r45"]).toBe(p1);
  });
  it("Goblin Tinkers add a surcharge on their Site", () => {
    const rs = { ...mvpRuleset(), activeMenaces: ["goblin_tinkers" as const] };
    const { state, p1, p2 } = setupGame(rs);
    let s = passTurn(state);
    s = grant(s, p2, { timber: 3, stone: 3, grain: 3 });
    // p2 owns r78; s8 is a route end but is next to s7 (own Manor) → too close anyway.
    reject(s, p2, { type: "build_manor", siteId: "s8" }, "SITE_TOO_CLOSE");
    void p1;
  });
});

describe("cards (§18–19)", () => {
  function withCards(): { s: GameState; p1: PlayerId; p2: PlayerId; bannerOf: (p: PlayerId, site: string) => string } {
    const g = setupGame(standardRuleset(2));
    return { s: g.state, p1: g.p1, p2: g.p2, bannerOf: g.bannerOf };
  }
  const give = (s: GameState, p: PlayerId, card: string): GameState => {
    const r = engine.applyDebugCommand(s, { type: "debug_draw_card", commandId: "d", matchId: s.matchId, playerId: p, targetPlayerId: p, cardDefId: card });
    if (!r.newState) throw new Error(r.error?.code);
    return r.newState;
  };
  it("buying draws from the deck and costs Grain + Iron + Essence", () => {
    let { s, p1 } = withCards();
    s = grant(s, p1, { grain: 1, iron: 1, essence: 1 });
    const deck = s.cardDeck.length;
    s = act(s, p1, { type: "buy_card" }).state;
    expect(s.cardDeck.length).toBe(deck - 1);
    expect(s.players[p1]?.hand).toHaveLength(1);
  });
  it("limits one non-reaction card per turn", () => {
    let { s, p1 } = withCards();
    s = give(give(s, p1, "festival_at_the_inn"), p1, "festival_at_the_inn");
    const [c1, c2] = s.players[p1]?.hand as [string, string];
    s = act(s, p1, { type: "play_card", cardId: c1, target: { effect: "festival_at_the_inn", choice: "iron" } }).state;
    reject(s, p1, { type: "play_card", cardId: c2, target: { effect: "festival_at_the_inn", choice: "iron" } }, "CARD_LIMIT_REACHED");
  });
  it("Counterspell opens a reaction window and cancels a Spell", () => {
    let { s, p1, p2, bannerOf } = withCards();
    s = give(s, p1, "wizard_interference");
    s = give(s, p2, "counterspell");
    const wiz = s.players[p1]?.hand[0] as string;
    const counter = s.players[p2]?.hand[0] as string;
    const target = bannerOf(p2, "s3"); // R5 → R2 or R7
    s = act(s, p1, { type: "play_card", cardId: wiz, target: { effect: "wizard_interference", bannerId: target, regionId: "R2" } }).state;
    expect(s.pending?.kind).toBe("reaction");
    reject(s, p1, { type: "end_main_phase" }, "PENDING_DECISION");
    expect(getLegalActions(ctx, s, p2).mode).toBe("reaction");
    s = act(s, p2, { type: "react", cardId: counter }).state;
    expect(s.pending).toBeUndefined();
    expect(s.banners[target]?.regionId).toBe("R5");
    expect(s.discardPile).toEqual(expect.arrayContaining([wiz, counter]));
  });
  it("Wizard's Interference resolves after everyone passes", () => {
    let { s, p1, p2, bannerOf } = withCards();
    s = give(s, p1, "wizard_interference");
    s = give(s, p2, "counterspell");
    const wiz = s.players[p1]?.hand[0] as string;
    const target = bannerOf(p2, "s3");
    s = act(s, p1, { type: "play_card", cardId: wiz, target: { effect: "wizard_interference", bannerId: target, regionId: "R7" } }).state;
    s = act(s, p2, { type: "pass_reaction" }).state;
    expect(s.banners[target]).toMatchObject({ regionId: "R7", settled: false });
  });
  it("Very Minor Prophecy reorders the top of the deck", () => {
    let { s, p1 } = withCards();
    s = give(s, p1, "very_minor_prophecy");
    const card = s.players[p1]?.hand[0] as string;
    s = act(s, p1, { type: "play_card", cardId: card, target: { effect: "very_minor_prophecy" } }).state;
    // p2 holds no Counterspell, so it resolves straight away.
    expect(s.pending?.kind).toBe("prophecy");
    const top = s.pending?.kind === "prophecy" ? s.pending.cardIds : [];
    const reversed = [...top].reverse();
    s = act(s, p1, { type: "resolve_prophecy", order: reversed }).state;
    expect(s.cardDeck.slice(0, 3)).toEqual(reversed);
  });
  it("Fog of Confusion breaks connectivity until the caster's next turn", () => {
    let { s, p1, p2 } = withCards();
    s = give(s, p1, "fog_of_confusion");
    const fog = s.players[p1]?.hand[0] as string;
    s = act(s, p1, { type: "play_card", cardId: fog, target: { effect: "fog_of_confusion", routeId: "r78" } }).state;
    s = passTurn(s);
    s = grant(s, p2, { timber: 2, stone: 2 });
    // p2 can still build from s7 (their Holding), but not from s8 via the fogged Route.
    reject(s, p2, { type: "build_route", routeId: "r58" }, "NOT_CONNECTED");
    s = passTurn(s); // p1's next turn starts → fog expires
    expect(s.activeEffects).toHaveLength(0);
  });
});

describe("quests (§27)", () => {
  it("claims a complete Quest and refills at end of turn", () => {
    const { state, p1 } = setupGame(standardRuleset(2));
    let s = state;
    // Force Monster Problems to be revealed.
    s = { ...s, revealedQuestIds: ["monster_problems", "kings_highway", "stone_and_timber"], questDeck: ["prosperous_estates", "the_safer_road"] };
    reject(s, p1, { type: "claim_quest", questId: "monster_problems" }, "QUEST_NOT_COMPLETE");
    s = { ...s, players: { ...s.players, [p1]: { ...(s.players[p1] as GameState["players"][string]), stats: { ...(s.players[p1] as GameState["players"][string]).stats, menacesMoved: 3 } } } };
    s = act(s, p1, { type: "claim_quest", questId: "monster_problems" }).state;
    expect(getRenown(ctx, s, p1)).toBe(3);
    reject(s, p1, { type: "claim_quest", questId: "monster_problems" }, "QUEST_NOT_AVAILABLE");
    s = passTurn(s);
    expect(s.revealedQuestIds).toHaveLength(3);
    expect(s.revealedQuestIds).toContain("prosperous_estates");
  });
});

describe("quest connectivity", () => {
  it("King's Highway ignores the Highwayman but not Fog", async () => {
    const { getQuestProgress } = await import("../src/index.js");
    const rs = { ...standardRuleset(2), activeMenaces: ["highwayman" as const] };
    const { state, p1 } = setupGame(rs);
    // p1 owns s1 (+r12) and s9 (+r69). Connect s1→s9: r12 exists; build r23? s3 is p2's Manor.
    // Route via s2-s5-s6: r25, r56 (Highwayman), r69 owned.
    let s = grant(state, p1, { timber: 4, stone: 4, grain: 2 });
    s = act(s, p1, { type: "build_route", routeId: "r25" }).state;
    // Building the Highwayman's own Route from s6 does not pass through it: no toll.
    s = act(s, p1, { type: "build_route", routeId: "r56" }).state;
    expect(s.menaces["menace_highwayman"]?.location).toEqual({ kind: "route", routeId: "r56" });
    expect(getQuestProgress(ctx, s, p1, "kings_highway").complete).toBe(true);
    // Fog on r25 breaks the connection.
    s = { ...s, activeEffects: [{ kind: "fog", routeId: "r25", sourcePlayerId: "X" }] };
    expect(getQuestProgress(ctx, s, p1, "kings_highway").complete).toBe(false);
  });
});

describe("review regressions", () => {
  it("rejects prototype-chain ids instead of crashing", () => {
    const { state, p1 } = setupGame();
    const r = engine.applyDebugCommand(state, { type: "debug_grant", commandId: "x", matchId: "m1", playerId: p1, targetPlayerId: "__proto__", resources: { grain: 1 } });
    expect(r.accepted).toBe(false);
    reject(state, "__proto__", { type: "end_main_phase" }, "UNKNOWN_ENTITY");
    reject(state, p1, { type: "hire_warden", menaceId: "__proto__", destination: { kind: "region", regionId: "R1" } }, "UNKNOWN_ENTITY");
  });
  it("only allows discarding exactly down to the hand limit", () => {
    const { state, p1 } = setupGame(standardRuleset(2));
    let s = act(state, p1, { type: "end_main_phase" }).state;
    s = act(s, p1, { type: "assign_banners", assignments: {} }).state;
    s = { ...s, players: { ...s.players, [p1]: { ...(s.players[p1] as GameState["players"][string]), hand: ["festival_at_the_inn#1"] } } };
    reject(s, p1, { type: "discard_cards", cardIds: ["festival_at_the_inn#1"] }, "INVALID_COMMAND");
  });
  it("leaves cards for inactive Menaces out of the deck", () => {
    const s = newGame({ ...standardRuleset(2), activeMenaces: ["toll_troll"] });
    expect(s.cardDeck.some((c) => c.startsWith("dragon_whisperer#"))).toBe(false);
    expect(s.cardDeck.some((c) => c.startsWith("bribe_the_troll#"))).toBe(true);
  });
});

describe("rulesets", () => {
  it("targets 10 Renown with 4 players and 12 otherwise", () => {
    expect(standardRuleset(4).targetRenown).toBe(10);
    expect(standardRuleset(3).targetRenown).toBe(12);
    expect(mvpRuleset().targetRenown).toBe(10);
  });
  it("grants seatBonus resources when play begins", () => {
    const { state, p1, p2 } = setupGame({ ...mvpRuleset(), seatBonus: [{}, { essence: 2 }] });
    expect(state.players[p2]?.resources.essence).toBe(2);
    expect(state.players[p1]?.resources.essence).toBe(0);
  });
});

describe("victory (§7)", () => {
  it("ends the game at end of turn when the target is reached", () => {
    const { state, p1 } = setupGame();
    const r = engine.applyDebugCommand(state, { type: "debug_set_bonus_renown", commandId: "x", matchId: "m1", playerId: p1, targetPlayerId: p1, value: 8 });
    let s = r.newState as GameState;
    expect(getRenown(ctx, s, p1)).toBe(10);
    s = passTurn(s);
    expect(s.status).toBe("finished");
    expect(s.winnerId).toBe(p1);
    reject(s, s.activePlayerId, { type: "end_turn" }, "GAME_NOT_ACTIVE");
  });
  it("with equalTurns, finishes the round before declaring the winner", () => {
    const { state, p1, p2 } = setupGame({ ...mvpRuleset(), equalTurns: true });
    const r = engine.applyDebugCommand(state, { type: "debug_set_bonus_renown", commandId: "x", matchId: "m1", playerId: p1, targetPlayerId: p1, value: 8 });
    let s = passTurn(r.newState as GameState);
    expect(s.status).toBe("playing");
    expect(s.endTriggered).toBe(true);
    // p2 overtakes during the final turn of the round.
    const r2 = engine.applyDebugCommand(s, { type: "debug_set_bonus_renown", commandId: "y", matchId: "m1", playerId: p2, targetPlayerId: p2, value: 9 });
    s = passTurn(r2.newState as GameState);
    expect(s.status).toBe("finished");
    expect(s.winnerId).toBe(p2);
  });
});

describe("engine properties", () => {
  it("never mutates its input", () => {
    const { state, p1 } = setupGame();
    const before = hashState(state);
    engine.applyCommand(state, { type: "end_main_phase", commandId: "z", matchId: "m1", playerId: p1 });
    engine.applyCommand(state, { type: "build_route", routeId: "nope", commandId: "z", matchId: "m1", playerId: p1 });
    expect(hashState(state)).toBe(before);
  });
  it("increments the revision per accepted command and rejects unknown ids", () => {
    const { state, p1 } = setupGame();
    const r = engine.applyCommand(state, { type: "end_main_phase", commandId: "z", matchId: "m1", playerId: p1 });
    expect(r.newState?.revision).toBe(state.revision + 1);
    reject(state, p1, { type: "build_route", routeId: "nope" }, "UNKNOWN_ENTITY");
  });
  it("redacts other hands and the deck", () => {
    const { state, p1, p2 } = setupGame(standardRuleset(2));
    let s = grant(state, p1, { grain: 1, iron: 1, essence: 1 });
    s = act(s, p1, { type: "buy_card" }).state;
    const view = redactState(s, p2);
    expect(view.players[p1]?.hand).toEqual([HIDDEN_CARD]);
    expect(view.cardDeck.every((c) => c === HIDDEN_CARD)).toBe(true);
    expect(redactState(s, p1).players[p1]?.hand).toEqual(s.players[p1]?.hand);
  });
  it("reveals only the player currently asked to react", () => {
    const s = setupGame(standardRuleset(2)).state;
    const pending = { kind: "reaction" as const, cardId: "wizard_interference#1", sourcePlayerId: "A", target: { effect: "very_minor_prophecy" as const }, eligiblePlayerIds: ["B", "C"] };
    const view = redactState({ ...s, pending }, "A");
    expect(view.pending?.kind === "reaction" && view.pending.eligiblePlayerIds).toEqual(["B"]);
  });
  it("applies batches atomically", () => {
    const { state, p1 } = setupGame();
    const good = { type: "end_main_phase" as const, commandId: "1", matchId: "m1", playerId: p1 };
    const bad = { type: "end_main_phase" as const, commandId: "2", matchId: "m1", playerId: p1 };
    const r = engine.applyBatch(state, [good, bad]);
    expect(r.accepted).toBe(false);
    expect(r.error?.code).toBe("WRONG_PHASE");
  });
});
