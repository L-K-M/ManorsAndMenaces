import { describe, expect, it } from "vitest";
import {
  BALANCE,
  enumerateCardTargets,
  evaluateQuestCondition,
  questRoundsLeft,
  type CommandIntent,
  type GameCommand,
  type GameEvent,
  type GameState,
  type PlayerId,
  type RulesetConfig,
} from "../src/index.js";
import { act, cmd, engine, grant, newGame, passTurn, reject, setupGame, standardRuleset, TEST_BOARD } from "./helpers.js";

const ctx = engine.ctx;

const give = (s: GameState, p: PlayerId, card: string): GameState => {
  const r = engine.applyDebugCommand(s, { type: "debug_draw_card", commandId: "d", matchId: s.matchId, playerId: p, targetPlayerId: p, cardDefId: card });
  if (!r.newState) throw new Error(r.error?.code);
  return r.newState;
};
const lastCard = (s: GameState, p: PlayerId): string => s.players[p]?.hand.at(-1) as string;
const copiesOf = (s: GameState, card: string): number => s.cardDeck.filter((c) => c.startsWith(`${card}#`)).length;

describe("Teleportation Mishap needs two Menaces of the same kind (§19.5)", () => {
  it("is left out of the 2-player deck, where the Troll and the Highwayman never share a kind", () => {
    const s = newGame(standardRuleset(2));
    expect(copiesOf(s, "teleportation_mishap")).toBe(0);
    // 24 cards, minus Dragon Whisperer (no Dragon) and Teleportation Mishap.
    expect(s.cardDeck).toHaveLength(20);
  });
  it("stays in the deck when two active Menaces share a kind", () => {
    const s = newGame({ ...standardRuleset(2), activeMenaces: ["toll_troll", "young_dragon"] });
    expect(copiesOf(s, "teleportation_mishap")).toBe(2);
  });
  it("is left out when every active Menace stands on a different kind of place", () => {
    const s = newGame({ ...standardRuleset(2), activeMenaces: ["toll_troll", "highwayman", "goblin_tinkers"] });
    expect(copiesOf(s, "teleportation_mishap")).toBe(0);
  });
});

describe("Fog of Confusion targets (§19.10)", () => {
  function fogReady() {
    const g = setupGame(standardRuleset(2));
    const s = give(g.state, g.p1, "fog_of_confusion");
    return { ...g, s, fog: lastCard(s, g.p1) };
  }
  const fogOn = (routeId: string) => ({ effect: "fog_of_confusion" as const, routeId });

  it("accepts an unowned Route, which a rival who builds it cannot connect through", () => {
    const { s, p1, p2, fog } = fogReady();
    expect(s.routeOwners["r47"]).toBeUndefined();
    let next = act(s, p1, { type: "play_card", cardId: fog, target: fogOn("r47") }).state;
    next = grant(passTurn(next), p2, { timber: 2, stone: 2 });
    next = act(next, p2, { type: "build_route", routeId: "r47" }).state;
    reject(next, p2, { type: "build_route", routeId: "r45" }, "NOT_CONNECTED");
  });
  it("rejects the caster's own Route", () => {
    const { s, p1, fog } = fogReady();
    expect(s.routeOwners["r12"]).toBe(p1);
    reject(s, p1, { type: "play_card", cardId: fog, target: fogOn("r12") }, "INVALID_CARD_TARGET");
  });
  it("rejects fogging a Route the caster has already fogged", () => {
    const { s, p1, fog } = fogReady();
    const fogged: GameState = { ...s, activeEffects: [{ kind: "fog", routeId: "r78", sourcePlayerId: p1 }] };
    reject(fogged, p1, { type: "play_card", cardId: fog, target: fogOn("r78") }, "INVALID_CARD_TARGET");
  });
  it("accepts re-fogging a Route another player fogged, which extends the fog", () => {
    const { s, p1, p2, fog } = fogReady();
    const fogged: GameState = { ...s, activeEffects: [{ kind: "fog", routeId: "r36", sourcePlayerId: p2 }] };
    const next = act(fogged, p1, { type: "play_card", cardId: fog, target: fogOn("r36") }).state;
    expect(next.activeEffects).toContainEqual({ kind: "fog", routeId: "r36", sourcePlayerId: p1 });
  });
  it("offers every Route that is not the caster's own and not already fogged by the caster", () => {
    const { s, p1, fog } = fogReady();
    const fogged: GameState = { ...s, activeEffects: [{ kind: "fog", routeId: "r78", sourcePlayerId: p1 }] };
    const routes = enumerateCardTargets(ctx, fogged, p1, fog).map((t) => (t.effect === "fog_of_confusion" ? t.routeId : ""));
    const expected = TEST_BOARD.routes.map((r) => r.id).filter((id) => s.routeOwners[id] !== p1 && id !== "r78");
    expect(routes).toContain("r36");
    expect(routes).toContain("r45");
    expect([...routes].sort()).toEqual([...expected].sort());
  });
});

describe("Druid's Blessing targets (§19.4)", () => {
  it("offers a Banner at home, which can be blessed and then assigned in the same turn", () => {
    const g = setupGame(standardRuleset(2));
    const { p1, p2 } = g;
    const banner = g.bannerOf(p1, "s1"); // on R1 (Grain)
    // Turn 1: p1 sends the Banner home.
    let s = act(g.state, p1, { type: "end_main_phase" }).state;
    s = act(s, p1, { type: "assign_banners", assignments: { [banner]: null } }).state;
    s = act(s, p1, { type: "end_turn" }).state;
    s = passTurn(s);
    // Turn 2: the Banner is at home. Bless it, then plant it on R1.
    s = give(s, p1, "druids_blessing");
    const card = lastCard(s, p1);
    expect(s.banners[banner]?.regionId).toBeNull();
    expect(enumerateCardTargets(ctx, s, p1, card)).toContainEqual({ effect: "druids_blessing", bannerId: banner });
    s = act(s, p1, { type: "play_card", cardId: card, target: { effect: "druids_blessing", bannerId: banner } }).state;
    s = act(s, p1, { type: "end_main_phase" }).state;
    s = act(s, p1, { type: "assign_banners", assignments: { [banner]: "R1" } }).state;
    s = act(s, p1, { type: "end_turn" }).state;
    const grainBefore = s.players[p1]?.resources.grain ?? 0;
    expect(s.activePlayerId).toBe(p2);
    s = passTurn(s); // p1's turn 3 starts with the Harvest
    const harvested = (s.players[p1]?.resources.grain ?? 0) - grainBefore;
    expect(harvested).toBe(2);
  });
});

describe("Patron of Heroes (§27.1)", () => {
  it("is complete after 2 Hero cards", () => {
    const { state, p1 } = setupGame(standardRuleset(2));
    const withHeroes = (n: number): GameState => ({
      ...state,
      players: {
        ...state.players,
        [p1]: {
          ...(state.players[p1] as GameState["players"][string]),
          stats: { ...(state.players[p1] as GameState["players"][string]).stats, heroesPlayed: n },
        },
      },
    });
    expect(evaluateQuestCondition(ctx, withHeroes(1), p1, "patron_of_heroes")).toEqual({ complete: false, current: 1, target: 2 });
    expect(evaluateQuestCondition(ctx, withHeroes(2), p1, "patron_of_heroes").complete).toBe(true);
  });
});

describe("Royal Quest expiry (ruleset option questExpiryRounds, §27.2)", () => {
  const withExpiry = (rounds: number) => ({ ...standardRuleset(2), questExpiryRounds: rounds });
  const passRound = (s: GameState): { state: GameState; events: GameEvent[] } => {
    const events: GameEvent[] = [];
    let cur = s;
    for (let i = 0; i < cur.turnOrder.length; i++) {
      const p = cur.activePlayerId;
      cur = act(cur, p, { type: "end_main_phase" }).state;
      cur = act(cur, p, { type: "assign_banners", assignments: {} }).state;
      const r = act(cur, p, { type: "end_turn" });
      cur = r.state;
      events.push(...r.events);
    }
    return { state: cur, events };
  };

  it("is on in the Standard rules: an unclaimed Quest leaves after BALANCE.questExpiryRounds rounds", () => {
    let s = setupGame(standardRuleset(2)).state;
    const [first] = s.revealedQuestIds as [string];
    for (let i = 1; i < BALANCE.questExpiryRounds; i++) s = passRound(s).state;
    expect(s.revealedQuestIds).toContain(first);
    const r = passRound(s);
    expect(r.events).toContainEqual({ type: "quest_expired", questId: first });
    expect(r.state.revealedQuestIds).not.toContain(first);
  });

  it("can be turned off: with 0, unclaimed Quests stay and no extra state is kept", () => {
    let s = setupGame(withExpiry(0)).state;
    const revealed = [...s.revealedQuestIds];
    for (let i = 0; i < 6; i++) s = passRound(s).state;
    expect(s.revealedQuestIds).toEqual(revealed);
    expect(s.revealedQuestRounds).toBeUndefined();
  });

  it("stays off for a ruleset without the setting, like one saved before 0.4.0", () => {
    const before: RulesetConfig = { ...standardRuleset(2) };
    delete before.questExpiryRounds;
    let s = setupGame(before).state;
    const revealed = [...s.revealedQuestIds];
    for (let i = 0; i < 6; i++) s = passRound(s).state;
    expect(s.revealedQuestIds).toEqual(revealed);
    expect(s.revealedQuestRounds).toBeUndefined();
  });

  it("swaps each Quest unclaimed for that many rounds with the top of the Quest deck", () => {
    let s = setupGame(withExpiry(2)).state;
    expect(s.round).toBe(1);
    const [q1, q2, q3] = s.revealedQuestIds as [string, string, string];
    const [d1, d2] = s.questDeck as [string, string];
    expect(s.revealedQuestRounds).toEqual({ [q1]: 1, [q2]: 1, [q3]: 1 });

    s = passRound(s).state; // round 2: shown for 1 round
    expect(s.revealedQuestIds).toEqual([q1, q2, q3]);

    const r = passRound(s); // round 3: shown for 2 rounds
    s = r.state;
    expect(s.round).toBe(3);
    // Only two replacements exist, so the third Quest waits for the next swap.
    expect(s.revealedQuestIds).toEqual([d1, d2, q3]);
    expect(s.questDeck).toEqual([q1, q2]);
    expect(s.revealedQuestRounds).toEqual({ [d1]: 3, [d2]: 3, [q3]: 1 });
    const types = r.events.filter((e) => e.type === "quest_expired" || e.type === "quest_revealed");
    expect(types).toEqual([
      { type: "quest_expired", questId: q1 },
      { type: "quest_revealed", questId: d1 },
      { type: "quest_expired", questId: q2 },
      { type: "quest_revealed", questId: d2 },
    ]);
  });

  it("reports how many rounds each Quest has left", () => {
    let s = setupGame(withExpiry(2)).state;
    const [q1, q2, q3] = s.revealedQuestIds as [string, string, string];
    expect(questRoundsLeft(s, q1)).toBe(2);
    s = passRound(s).state;
    // All three are due, but the deck holds only two replacements.
    expect([q1, q2, q3].map((q) => questRoundsLeft(s, q))).toEqual([1, 1, null]);
    // With the rule off there is no countdown.
    const off = setupGame(withExpiry(0)).state;
    expect(questRoundsLeft(off, off.revealedQuestIds[0] as string)).toBeNull();
    // During setup (round 0) the opening Quests still show the full count.
    const inSetup = newGame(withExpiry(2));
    expect(inSetup.round).toBe(0);
    expect(questRoundsLeft(inSetup, inSetup.revealedQuestIds[0] as string)).toBe(2);
    expect(questRoundsLeft({ ...s, questDeck: [] }, q1)).toBeNull();
    // A Quest that is not on display has no countdown.
    expect(questRoundsLeft(s, s.questDeck[0] as string)).toBeNull();
  });

  it("keeps Quests when the Quest deck is empty", () => {
    let s = setupGame(withExpiry(1)).state;
    s = { ...s, questDeck: [] };
    const revealed = [...s.revealedQuestIds];
    s = passRound(s).state;
    expect(s.revealedQuestIds).toEqual(revealed);
  });

  it("starts a refilled Quest's clock when it is revealed", () => {
    const g = setupGame(withExpiry(3));
    let s: GameState = {
      ...g.state,
      revealedQuestIds: ["monster_problems", "kings_highway", "stone_and_timber"],
      questDeck: ["prosperous_estates", "the_safer_road"],
    };
    s = { ...s, revealedQuestRounds: { monster_problems: 1, kings_highway: 1, stone_and_timber: 1 } };
    s = passRound(s).state;
    const p = s.activePlayerId;
    s = {
      ...s,
      players: {
        ...s.players,
        [p]: { ...(s.players[p] as GameState["players"][string]), stats: { ...(s.players[p] as GameState["players"][string]).stats, menacesMoved: 3 } },
      },
    };
    s = act(s, p, { type: "claim_quest", questId: "monster_problems" }).state;
    expect(s.revealedQuestRounds?.["monster_problems"]).toBeUndefined();
    s = passTurn(s);
    expect(s.revealedQuestIds).toContain("prosperous_estates");
    expect(s.revealedQuestRounds?.["prosperous_estates"]).toBe(2);
  });

  it("starts the clock of a Quest refilled by the last seat with the next round", () => {
    const g = setupGame(withExpiry(1));
    let s: GameState = {
      ...g.state,
      revealedQuestIds: ["monster_problems", "kings_highway", "stone_and_timber"],
      revealedQuestRounds: { monster_problems: 1, kings_highway: 1, stone_and_timber: 1 },
      // Enough replacements that every Quest due as round 2 begins can leave.
      questDeck: ["prosperous_estates", "the_safer_road", "grand_tour", "far_reaches", "diverse_realm"],
    };
    s = passTurn(s);
    const p = s.activePlayerId;
    expect(s.turnOrder.indexOf(p)).toBe(s.turnOrder.length - 1);
    const player = s.players[p] as GameState["players"][string];
    s = { ...s, players: { ...s.players, [p]: { ...player, stats: { ...player.stats, menacesMoved: 3 } } } };
    s = act(s, p, { type: "claim_quest", questId: "monster_problems" }).state;
    s = act(s, p, { type: "end_main_phase" }).state;
    s = act(s, p, { type: "assign_banners", assignments: {} }).state;
    const r = act(s, p, { type: "end_turn" });
    expect(r.state.round).toBe(2);
    // Claimable from round 2 on, so it is not expired as round 2 begins.
    expect(r.events).not.toContainEqual({ type: "quest_expired", questId: "prosperous_estates" });
    expect(r.state.revealedQuestIds).toContain("prosperous_estates");
    expect(r.state.revealedQuestRounds?.["prosperous_estates"]).toBe(2);
    expect(questRoundsLeft(r.state, "prosperous_estates")).toBe(1);
  });

  it("replays deterministically", () => {
    const g = setupGame(withExpiry(1));
    const initial = g.state;
    let s = initial;
    const commands: GameCommand[] = [];
    for (let i = 0; i < 6; i++) {
      const p = s.activePlayerId;
      for (const intent of [{ type: "end_main_phase" }, { type: "assign_banners", assignments: {} }, { type: "end_turn" }] as CommandIntent[]) {
        const c = cmd(s, p, intent);
        commands.push(c);
        const r = engine.applyCommand(s, c);
        if (!r.newState) throw new Error(r.error?.code);
        s = r.newState;
      }
    }
    expect(s.revealedQuestIds).not.toEqual(initial.revealedQuestIds);
    expect(engine.replay(initial, commands)).toEqual(s);
  });
});
