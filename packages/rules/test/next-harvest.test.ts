import { describe, expect, it } from "vitest";
import { getRenown, hasNextHarvest, isBoardFull, type GameState, type PlayerId, type RulesetConfig } from "../src/index.js";
import { act, engine, grant, mvpRuleset, passTurn, routeId, setupGame } from "./helpers.js";

// Whether a player harvests again (§16.3): the Banner warning is only given
// when they do. Each case also plays the turns out, so the selector is
// checked against what the engine does.

const ctx = engine.ctx;
const PLENTY = { grain: 20, timber: 20, stone: 20, iron: 20, essence: 20 };

const withRules = (rules: Partial<RulesetConfig>): RulesetConfig => ({ ...mvpRuleset(), ...rules });

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

/** The active player's Banner Assignment phase. */
const toBanners = (s: GameState): GameState => act(s, s.activePlayerId, { type: "end_main_phase" }).state;

describe("hasNextHarvest", () => {
  it("is true on an ordinary turn, for every seat", () => {
    const { state, p1, p2 } = setupGame(withRules({ lastRound: 3 }));
    let s = toBanners(passUntilRound(state, 2));
    expect(s.activePlayerId).toBe(p1);
    expect(hasNextHarvest(ctx, s, p1)).toBe(true);
    s = toBanners(passTurn(s));
    expect(s.activePlayerId).toBe(p2);
    expect(hasNextHarvest(ctx, s, p2)).toBe(true);
  });

  it("is false for every seat in the last round", () => {
    const { state, p1, p2 } = setupGame(withRules({ lastRound: 3 }));
    let s = toBanners(passUntilRound(state, 3));
    expect(hasNextHarvest(ctx, s, p1)).toBe(false);
    s = toBanners(passTurn(s));
    expect(s.activePlayerId).toBe(p2);
    expect(hasNextHarvest(ctx, s, p2)).toBe(false);
    // The round's end ends the game: nobody harvests again.
    expect(passTurn(s)).toMatchObject({ status: "finished", endCause: "last_round" });
  });

  it("is false on the turn a player reaches the target", () => {
    const { state, p1, p2 } = setupGame();
    let s = toBanners(setBonus(passUntilRound(state, 2), p1, 8));
    expect(getRenown(ctx, s, p1)).toBe(s.ruleset.targetRenown);
    expect(hasNextHarvest(ctx, s, p1)).toBe(false);
    expect(hasNextHarvest(ctx, s, p2)).toBe(false);
    s = passTurn(s);
    expect(s).toMatchObject({ status: "finished", winnerId: p1 });
  });

  it("is false for the rest of the round once equal turns end the game with it", () => {
    const { state, p1, p2 } = setupGame(withRules({ equalTurns: true }));
    let s = toBanners(setBonus(passUntilRound(state, 2), p1, 8));
    expect(hasNextHarvest(ctx, s, p1)).toBe(false);
    s = passTurn(s);
    expect(s.endTriggered).toBe(true);
    // A setback below the target does not stop the round's end.
    s = toBanners(setBonus(s, p1, 0));
    expect(getRenown(ctx, s, p1)).toBeLessThan(s.ruleset.targetRenown);
    expect(s.activePlayerId).toBe(p2);
    expect(hasNextHarvest(ctx, s, p2)).toBe(false);
    expect(passTurn(s).status).toBe("finished");
  });

  it("is false for the round's last seat on a full board, which ends the game", () => {
    const { state, p1, p2 } = setupGame();
    // The second player upgrades both Manors; next round the first takes s5,
    // the last open Site, and upgrades everything.
    let s = passUntilRound(state, 2);
    s = passTurn(upgradeAll(passTurn(s)));
    s = grant(s, p1, PLENTY);
    s = act(s, p1, { type: "build_route", routeId: routeId(2, 5) }).state;
    s = act(s, p1, { type: "build_manor", siteId: "s5" }).state;
    s = toBanners(upgradeAll(s));
    expect(isBoardFull(ctx, s)).toBe(true);
    // Before the round's last seat a card could still empty the board.
    expect(hasNextHarvest(ctx, s, p1)).toBe(true);
    s = toBanners(passTurn(s));
    expect(s.activePlayerId).toBe(p2);
    expect(hasNextHarvest(ctx, s, p2)).toBe(false);
    expect(passTurn(s)).toMatchObject({ status: "finished", endCause: "full_board" });

    // Without the full-board rule the game goes on.
    const on = { ...s, ruleset: { ...s.ruleset, endOnFullBoard: false } };
    expect(hasNextHarvest(ctx, on, p2)).toBe(true);
    expect(passTurn(on).status).toBe("playing");
  });

  it("is false once the game is over", () => {
    const { state, p1 } = setupGame();
    const s = passTurn(setBonus(passUntilRound(state, 2), p1, 8));
    expect(s.status).toBe("finished");
    expect(hasNextHarvest(ctx, s, p1)).toBe(false);
  });
});
