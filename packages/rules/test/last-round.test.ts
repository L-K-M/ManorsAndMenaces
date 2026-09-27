import { describe, expect, it } from "vitest";
import {
  BALANCE,
  RULESET_VERSION,
  asyncRuleset,
  createContext,
  getRenown,
  isBoardFull,
  mvpRuleset,
  standardRuleset,
  type GameEvent,
  type GameState,
  type PlayerId,
  type RulesetConfig,
} from "../src/index.js";
import { act, engine, grant, passTurn, routeId, setupGame, testContent } from "./helpers.js";

// Every game ends after its last round at the latest (§7): the most Renown
// wins, target reached or not. A small `lastRound` keeps these games short.
// After setupGame each player has two Manors (2 Renown) of the 10 needed.

const ctx = createContext(testContent());
const PLENTY = { grain: 20, timber: 20, stone: 20, iron: 20, essence: 20 };

const withLastRound = (lastRound: number): RulesetConfig => ({ ...mvpRuleset(), lastRound });

/** passTurn, keeping the End Turn's events. */
function endTurn(state: GameState): { state: GameState; events: GameEvent[] } {
  const p = state.activePlayerId;
  let s = state;
  if (s.phase === "main") s = act(s, p, { type: "end_main_phase" }).state;
  if (s.phase === "banner_assignment") s = act(s, p, { type: "assign_banners", assignments: {} }).state;
  return act(s, p, { type: "end_turn" });
}

/** Both players pass until `round` begins. */
function passUntilRound(s: GameState, round: number): GameState {
  while (s.round < round) s = passTurn(s);
  return s;
}

const setBonus = (s: GameState, playerId: PlayerId, value: number): GameState =>
  engine.applyDebugCommand(s, { type: "debug_set_bonus_renown", commandId: "bonus", matchId: s.matchId, playerId, targetPlayerId: playerId, value }).newState as GameState;

/** The active player upgrades each of their Manors. */
function upgradeAll(s: GameState): GameState {
  const p = s.activePlayerId;
  s = grant(s, p, PLENTY);
  for (const h of Object.values(s.holdings)) if (h.ownerId === p && h.type === "manor") s = act(s, p, { type: "upgrade_holding", siteId: h.siteId }).state;
  return s;
}

describe("the last round (§7)", () => {
  it("ends the game when the round's last player ends round N, and the most Renown wins short of the target", () => {
    const { state, p1, p2 } = setupGame(withLastRound(3));
    let s = passUntilRound(state, 3);
    s = setBonus(s, p2, 1);
    // The first player's End Turn in round 3 does not end the game.
    s = passTurn(s);
    expect(s.status).toBe("playing");
    expect(s.round).toBe(3);
    expect(s.activePlayerId).toBe(p2);

    const { state: ended, events } = endTurn(s);
    expect(ended.status).toBe("finished");
    expect(ended.endCause).toBe("last_round");
    expect(ended.round).toBe(3);
    expect(ended.winnerId).toBe(p2);
    expect(getRenown(ctx, ended, p2)).toBe(3);
    expect(getRenown(ctx, ended, p1)).toBe(2);
    expect(3).toBeLessThan(ended.ruleset.targetRenown);
    expect(events).toContainEqual({ type: "game_won", playerId: p2, renown: 3, cause: "last_round" });
  });

  it("lets a player who reaches the target in round N win as usual", () => {
    const { state, p2 } = setupGame(withLastRound(3));
    let s = passTurn(passUntilRound(state, 3));
    s = passTurn(setBonus(s, p2, 8));
    expect(s.status).toBe("finished");
    expect(s.winnerId).toBe(p2);
    expect(getRenown(ctx, s, p2)).toBe(s.ruleset.targetRenown);
    expect(s.endCause).toBeUndefined();
  });

  it("records a full board as the end when both apply at the same End Turn", () => {
    const { state, p1 } = setupGame(withLastRound(2));
    let s = passUntilRound(state, 2);
    // The first player takes s5, the last open Site, and upgrades everything.
    s = grant(s, p1, PLENTY);
    s = act(s, p1, { type: "build_route", routeId: routeId(2, 5) }).state;
    s = act(s, p1, { type: "build_manor", siteId: "s5" }).state;
    s = passTurn(upgradeAll(s));
    expect(s.status).toBe("playing");
    // The second player's upgrades fill the board as round 2 ends.
    const { state: ended, events } = endTurn(upgradeAll(s));
    expect(isBoardFull(ctx, ended)).toBe(true);
    expect(ended.status).toBe("finished");
    expect(ended.endCause).toBe("full_board");
    expect(events.filter((e) => e.type === "game_won")).toEqual([{ type: "game_won", playerId: p1, renown: 6, cause: "full_board" }]);
  });

  it("breaks a tie in Renown as §7 does", () => {
    const { state, p1, p2 } = setupGame(withLastRound(2));
    let s = passUntilRound(state, 2);
    // The first player upgrades a Manor (3 Renown); the second draws level
    // with a bonus but has no Stronghold.
    s = grant(s, p1, { grain: 2, iron: 2 });
    s = passTurn(act(s, p1, { type: "upgrade_holding", siteId: "s1" }).state);
    s = passTurn(setBonus(s, p2, 1));
    expect(s.status).toBe("finished");
    expect(s.endCause).toBe("last_round");
    expect(getRenown(ctx, s, p1)).toBe(getRenown(ctx, s, p2));
    expect(s.winnerId).toBe(p1);
  });

  it("announces the end only as rounds N-1 and N begin", () => {
    const { state } = setupGame(withLastRound(4));
    let s = state;
    const told: { event: GameEvent; round: number }[] = [];
    while (s.status === "playing" && s.round <= 5) {
      const r = endTurn(s);
      for (const event of r.events) if (event.type === "reign_ending") told.push({ event, round: r.state.round });
      s = r.state;
    }
    expect(s.round).toBe(4);
    expect(told).toEqual([
      { event: { type: "reign_ending", round: 3, lastRound: 4 }, round: 3 },
      { event: { type: "reign_ending", round: 4, lastRound: 4 }, round: 4 },
    ]);
  });

  it("plays on in games created without the rule", () => {
    const legacy: RulesetConfig = { ...mvpRuleset() };
    delete legacy.lastRound;
    for (const ruleset of [legacy, withLastRound(0)]) {
      const { state } = setupGame(ruleset);
      let s = state;
      const events: GameEvent[] = [];
      while (s.round <= BALANCE.lastRound) {
        const r = endTurn(s);
        events.push(...r.events);
        s = r.state;
      }
      expect(s.status).toBe("playing");
      expect(s.round).toBe(BALANCE.lastRound + 1);
      expect(events.filter((e) => e.type === "reign_ending")).toEqual([]);
    }
  });

  it("is round 30 in every ruleset", () => {
    expect(BALANCE.lastRound).toBe(30);
    expect(RULESET_VERSION).toBe("0.8.0");
    for (const ruleset of [standardRuleset(2), standardRuleset(4, { targetRenown: 30 }), asyncRuleset(3), mvpRuleset()]) expect(ruleset.lastRound).toBe(30);
  });
});
