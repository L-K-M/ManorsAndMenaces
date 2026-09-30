import { describe, expect, it } from "vitest";
import {
  RESOURCE_TYPES,
  asyncRuleset,
  clone,
  getRenown,
  getRenownSources,
  isBoardFull,
  mvpRuleset,
  standardRuleset,
  type GameEvent,
  type GameState,
  type PlayerId,
  type ResourceType,
  type RulesetConfig,
} from "../src/index.js";
import { act, engine, grant, passTurn, reject, routeId, setupGame } from "./helpers.js";

// The Crown's Levy (§27.3). On the test board 2 of its 5 Quests wait in the
// deck, and Quest expiry keeps them cycling, so the deck runs out only when a
// test empties it.

const ctx = engine.ctx;
const PLENTY = { grain: 20, timber: 20, stone: 20, iron: 20, essence: 20 };

/** A 2-player Standard game with no free cards, at the default goal or `targetRenown`. */
function levyRules(targetRenown?: number): RulesetConfig {
  return { ...standardRuleset(2, targetRenown === undefined ? {} : { targetRenown }), initialCards: 0, cardDrawEveryRounds: 0 };
}

/** The same rules as a game created before the Levy, without its field. */
function legacyRules(): RulesetConfig {
  const rules = levyRules();
  delete rules.crownLevy;
  return rules;
}

/** Ends the active player's turn, keeping the End Turn's events. */
function endTurn(state: GameState): { state: GameState; events: GameEvent[] } {
  const p = state.activePlayerId;
  let s = state;
  if (s.phase === "main") s = act(s, p, { type: "end_main_phase" }).state;
  if (s.phase === "banner_assignment") s = act(s, p, { type: "assign_banners", assignments: {} }).state;
  return act(s, p, { type: "end_turn" });
}

/** Plays empty turns until `round` begins, with every event on the way. */
function playTo(state: GameState, round: number): { state: GameState; events: GameEvent[] } {
  let s = state;
  const events: GameEvent[] = [];
  while (s.round < round) {
    const r = endTurn(s);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

/** Sets a player's resources exactly. */
function withResources(state: GameState, playerId: PlayerId, res: Partial<Record<ResourceType, number>>): GameState {
  const s = clone(state);
  const p = s.players[playerId];
  if (!p) throw new Error("no player");
  p.resources = { grain: 0, timber: 0, stone: 0, iron: 0, essence: 0, ...res };
  return s;
}

/** The Quest deck runs out during round 1. */
function withEmptyDeck(state: GameState): GameState {
  const s = clone(state);
  s.questDeck = [];
  return s;
}

/** Round 3 of a game whose Quest deck ran out in round 1: the first Levy is in force. */
function firstLevy(rules = levyRules()): { state: GameState; p1: PlayerId; p2: PlayerId; levy: ResourceType } {
  const g = setupGame(rules);
  const state = playTo(withEmptyDeck(g.state), 3).state;
  const levy = state.crownLevy?.current;
  if (!levy) throw new Error("no Levy in force");
  return { state, p1: g.p1, p2: g.p2, levy };
}

const levyEvents = (events: GameEvent[]) => events.filter((e) => e.type === "levy_proclaimed" || e.type === "levy_answered");

const setBonus = (s: GameState, playerId: PlayerId, value: number): GameState =>
  engine.applyDebugCommand(s, { type: "debug_set_bonus_renown", commandId: "bonus", matchId: s.matchId, playerId, targetPlayerId: playerId, value }).newState as GameState;

describe("the Crown's Levy rules (§27.3)", () => {
  it("run in every Standard and async game, and never in Core", () => {
    for (const players of [2, 3, 4]) {
      expect(standardRuleset(players).crownLevy).toEqual({ price: 5, renown: 1, proclaimByRound: 15 });
      expect(asyncRuleset(players).crownLevy).toEqual(standardRuleset(players).crownLevy);
    }
    expect(mvpRuleset().crownLevy).toBeUndefined();
  });

  it.each([
    [15, 1],
    [20, 1],
    [25, 2],
    [30, 2],
  ])("pay %i-Renown games %i Renown an answer", (targetRenown, renown) => {
    expect(standardRuleset(3, { targetRenown }).crownLevy?.renown).toBe(renown);
    expect(asyncRuleset(2, { targetRenown }).crownLevy?.renown).toBe(renown);
  });
});

describe("proclaiming the Levy (§27.3)", () => {
  it("proclaims the first Levy as the round after the Quest deck runs out begins, in force a round later", () => {
    const { state, p1 } = setupGame(levyRules());
    const round2 = playTo(withEmptyDeck(state), 2);
    const levy = round2.state.crownLevy;
    expect(levy).toMatchObject({ current: null, answeredBy: [] });
    const first = levy?.next as ResourceType;
    expect(RESOURCE_TYPES).toContain(first);
    expect(levy?.called).toEqual([first]);
    expect(levyEvents(round2.events)).toEqual([{ type: "levy_proclaimed", resource: first, round: 3, current: null }]);
    // Proclaimed, not yet in force.
    reject(grant(round2.state, p1, PLENTY), p1, { type: "answer_levy", resource: first }, "LEVY_NOT_ACTIVE");

    const round3 = playTo(round2.state, 3);
    const second = round3.state.crownLevy?.next as ResourceType;
    expect(round3.state.crownLevy).toEqual({ current: first, next: second, called: [first, second], answeredBy: [] });
    expect(second).not.toBe(first);
    expect(levyEvents(round3.events)).toEqual([{ type: "levy_proclaimed", resource: second, round: 4, current: first }]);
  });

  it("proclaims it as round 15 begins when the Quest deck lasts", () => {
    const { state } = setupGame(levyRules());
    const round14 = playTo(state, 14);
    expect(round14.state.questDeck.length).toBeGreaterThan(0);
    expect(round14.state.crownLevy).toBeUndefined();
    expect(levyEvents(round14.events)).toEqual([]);

    const round15 = playTo(round14.state, 15).state;
    expect(round15.questDeck.length).toBeGreaterThan(0);
    expect(round15.crownLevy).toMatchObject({ current: null });
    const round16 = playTo(round15, 16).state;
    expect(round16.crownLevy?.current).toBe(round15.crownLevy?.next);
  });

  it("calls each resource once, in an order drawn from the match RNG, before any repeats", () => {
    const called = (): ResourceType[] => {
      let s = playTo(withEmptyDeck(setupGame(levyRules()).state), 2).state;
      const out: ResourceType[] = [];
      for (let round = 3; out.length < 10; round++) {
        out.push(s.crownLevy?.next as ResourceType);
        // The cycle so far, the newest last; a new cycle starts after five.
        expect(s.crownLevy?.called).toEqual(out.slice(out.length > 5 ? 5 : 0));
        s = playTo(s, round).state;
      }
      return out;
    };
    const order = called();
    expect([...order.slice(0, 5)].sort()).toEqual([...RESOURCE_TYPES].sort());
    expect([...order.slice(5)].sort()).toEqual([...RESOURCE_TYPES].sort());
    // The same seed calls the same Levies.
    expect(called()).toEqual(order);
  });

  it("never calls one resource two rounds running, even as a new cycle begins", () => {
    const s = playTo(withEmptyDeck(setupGame(levyRules()).state), 2).state;
    // The same RNG state ends a cycle with each resource in turn.
    for (const last of RESOURCE_TYPES) {
      const endOfCycle = clone(s);
      endOfCycle.crownLevy = { current: null, next: last, called: [...RESOURCE_TYPES.filter((r) => r !== last), last], answeredBy: [] };
      const levy = playTo(endOfCycle, s.round + 1).state.crownLevy;
      expect(levy?.current).toBe(last);
      expect(levy?.next).not.toBe(last);
      expect(levy?.called).toEqual([levy?.next]);
    }
  });
});

describe("answering the Levy (§27.3)", () => {
  it("pays 5 of this round's resource to the supply for 1 Renown, its own source", () => {
    const { state, p1, levy } = firstLevy();
    expect(state.activePlayerId).toBe(p1);
    const s = withResources(state, p1, { [levy]: 5 });
    const before = getRenown(ctx, s, p1);
    const { state: after, events } = act(s, p1, { type: "answer_levy", resource: levy });

    expect(after.players[p1]?.resources[levy]).toBe(0);
    expect(events).toContainEqual({ type: "resource_spent", playerId: p1, resource: levy, amount: 5, reason: "crown_levy" });
    expect(events).toContainEqual({ type: "levy_answered", playerId: p1, resource: levy, amount: 5, renown: 1 });
    expect(after.crownLevy?.answeredBy).toEqual([p1]);
    expect(after.players[p1]?.levyRenown).toBe(1);
    expect(getRenown(ctx, after, p1)).toBe(before + 1);

    const sources = getRenownSources(ctx, after, p1);
    expect(sources.levy).toBe(1);
    expect(sources.quests).toEqual([]);
    expect(sources.bonus).toBe(0);
    expect(sources.manors.renown + sources.strongholds.renown + sources.levy).toBe(sources.total);
  });

  it("pays 2 Renown at a goal of 25", () => {
    const { state, p1, levy } = firstLevy(levyRules(25));
    const s = grant(state, p1, { [levy]: 5 });
    const after = act(s, p1, { type: "answer_levy", resource: levy }).state;
    expect(getRenown(ctx, after, p1)).toBe(getRenown(ctx, s, p1) + 2);
    expect(getRenownSources(ctx, after, p1).levy).toBe(2);
  });

  it("takes the resources wherever they came from, the Market included", () => {
    const { state, p1, levy } = firstLevy();
    const other = RESOURCE_TYPES.find((r) => r !== levy) as ResourceType;
    let s = withResources(state, p1, { [levy]: 4, [other]: 3 });
    reject(s, p1, { type: "answer_levy", resource: levy }, "INSUFFICIENT_RESOURCES");
    s = act(s, p1, { type: "trade", give: other, receive: levy }).state;
    expect(act(s, p1, { type: "answer_levy", resource: levy }).state.players[p1]?.levyRenown).toBe(1);
  });

  it("refuses the wrong resource, a second answer, the wrong phase and the wrong player", () => {
    const { state, p1, p2, levy } = firstLevy();
    const other = RESOURCE_TYPES.find((r) => r !== levy) as ResourceType;
    const rich = grant(grant(state, p1, PLENTY), p2, PLENTY);
    reject(rich, p1, { type: "answer_levy", resource: other }, "INVALID_PAYMENT");
    reject(rich, p2, { type: "answer_levy", resource: levy }, "NOT_ACTIVE_PLAYER");
    const answered = act(rich, p1, { type: "answer_levy", resource: levy }).state;
    reject(answered, p1, { type: "answer_levy", resource: levy }, "LEVY_LIMIT_REACHED");
    const banners = act(rich, p1, { type: "end_main_phase" }).state;
    reject(banners, p1, { type: "answer_levy", resource: levy }, "WRONG_PHASE");
  });

  it("lets each player answer once a round, and again the next", () => {
    const { state, p1, p2, levy } = firstLevy();
    let s = act(grant(state, p1, { [levy]: 5 }), p1, { type: "answer_levy", resource: levy }).state;
    s = passTurn(s);
    expect(s.crownLevy?.answeredBy).toEqual([p1]);
    s = act(grant(s, p2, { [levy]: 5 }), p2, { type: "answer_levy", resource: levy }).state;
    expect(s.crownLevy?.answeredBy).toEqual([p1, p2]);
    s = passTurn(s);
    expect(s.round).toBe(4);
    expect(s.crownLevy?.answeredBy).toEqual([]);
    const next = s.crownLevy?.current as ResourceType;
    s = act(grant(s, p1, { [next]: 5 }), p1, { type: "answer_levy", resource: next }).state;
    expect(s.players[p1]?.levyRenown).toBe(2);
  });

  it("is refused before it is proclaimed and in games without it", () => {
    const { state, p1 } = setupGame(levyRules());
    reject(grant(state, p1, PLENTY), p1, { type: "answer_levy", resource: "grain" }, "LEVY_NOT_ACTIVE");
    const core = setupGame(mvpRuleset());
    reject(grant(core.state, core.p1, PLENTY), core.p1, { type: "answer_levy", resource: "grain" }, "FEATURE_DISABLED");
  });
});

describe("the Levy and the end of the game (§7, §27.3)", () => {
  it("wins the game for a player whose answer reaches the goal", () => {
    const { state, p1, levy } = firstLevy();
    const s = grant(setBonus(state, p1, 0), p1, { [levy]: 5 });
    const short = setBonus(s, p1, s.ruleset.targetRenown - getRenown(ctx, s, p1) - 1);
    expect(passTurn(short).status).toBe("playing");
    // equalTurns: reaching the goal marks the game but the round plays out.
    const marked = passTurn(act(short, p1, { type: "answer_levy", resource: levy }).state);
    expect(marked.endTriggered).toBe(true);
    const ended = passTurn(marked);
    expect(ended.status).toBe("finished");
    expect(ended.winnerId).toBe(p1);
    expect(ended.endCause).toBeUndefined();
  });

  it("does not keep a full board from ending the game", () => {
    const { state, p1 } = firstLevy();
    /** The active player upgrades each of their Manors. */
    const upgradeAll = (s: GameState): GameState => {
      const p = s.activePlayerId;
      s = grant(s, p, PLENTY);
      for (const h of Object.values(s.holdings)) if (h.ownerId === p && h.type === "manor") s = act(s, p, { type: "upgrade_holding", siteId: h.siteId }).state;
      return s;
    };
    let s = grant(state, p1, PLENTY);
    s = act(s, p1, { type: "build_route", routeId: routeId(2, 5) }).state;
    s = act(s, p1, { type: "build_manor", siteId: "s5" }).state;
    s = passTurn(upgradeAll(s));
    const { state: ended } = endTurn(upgradeAll(s));
    expect(isBoardFull(ctx, ended)).toBe(true);
    expect(ended.status).toBe("finished");
    expect(ended.endCause).toBe("full_board");
  });
});

describe("games created before the Levy (ruleset 0.7.0)", () => {
  it("play on unchanged: no Levy, no events and no draw from the match RNG", () => {
    const { state, p1 } = setupGame(legacyRules());
    const start = withEmptyDeck(state);
    const { state: late, events } = playTo(start, 17);
    expect(late.crownLevy).toBeUndefined();
    expect(levyEvents(events)).toEqual([]);
    expect(late.rngState).toEqual(start.rngState);
    reject(grant(late, p1, PLENTY), p1, { type: "answer_levy", resource: "grain" }, "FEATURE_DISABLED");
    // The same game under the new rules draws its Levies from the match RNG.
    const current = playTo(withEmptyDeck(setupGame(levyRules()).state), 17).state;
    expect(current.rngState).not.toEqual(start.rngState);
  });
});
