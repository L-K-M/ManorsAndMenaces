import { describe, expect, it } from "vitest";
import { clone, createContext, getRenown, isBoardFull, mvpRuleset, type GameEvent, type GameState, type PlayerId, type RulesetConfig } from "../src/index.js";
import { act, engine, grant, passTurn, routeId, setupGame, testContent } from "./helpers.js";

// A round that ends on a full board ends the game (§7). After setupGame the
// test board's corners are built and only s5, in the middle, is open.

const ctx = createContext(testContent());
const PLENTY = { grain: 20, timber: 20, stone: 20, iron: 20, essence: 20 };

/** The active player upgrades each of their Manors. */
function upgradeAll(s: GameState): GameState {
  const p = s.activePlayerId;
  s = grant(s, p, PLENTY);
  for (const h of Object.values(s.holdings)) if (h.ownerId === p && h.type === "manor") s = act(s, p, { type: "upgrade_holding", siteId: h.siteId }).state;
  return s;
}

/** The first player builds a Stronghold on s5, the last open Site. */
function buildMiddle(s: GameState, p1: PlayerId): GameState {
  s = grant(s, p1, PLENTY);
  s = act(s, p1, { type: "build_route", routeId: routeId(2, 5) }).state;
  s = act(s, p1, { type: "build_manor", siteId: "s5" }).state;
  return act(s, p1, { type: "upgrade_holding", siteId: "s5" }).state;
}

/** passTurn, keeping the End Turn's events. */
function endTurn(state: GameState): { state: GameState; events: GameEvent[] } {
  const p = state.activePlayerId;
  let s = state;
  if (s.phase === "main") s = act(s, p, { type: "end_main_phase" }).state;
  if (s.phase === "banner_assignment") s = act(s, p, { type: "assign_banners", assignments: {} }).state;
  return act(s, p, { type: "end_turn" });
}

const setBonus = (s: GameState, playerId: PlayerId, value: number): GameState =>
  engine.applyDebugCommand(s, { type: "debug_set_bonus_renown", commandId: "bonus", matchId: s.matchId, playerId, targetPlayerId: playerId, value }).newState as GameState;

describe("a full board (§7)", () => {
  it("is full once no Site is open for a Manor and every Holding is a Stronghold", () => {
    const { state, p1 } = setupGame();
    expect(isBoardFull(ctx, state)).toBe(false);
    let s = upgradeAll(buildMiddle(state, p1));
    // The second player's corners are still Manors.
    expect(isBoardFull(ctx, s)).toBe(false);
    s = upgradeAll(passTurn(s));
    expect(isBoardFull(ctx, s)).toBe(true);
  });

  it("counts a Site in ruins as closed and a burned one as open", () => {
    const { state } = setupGame();
    const corners = clone(state);
    for (const h of Object.values(corners.holdings)) h.type = "stronghold";
    // s5 is still open.
    expect(isBoardFull(ctx, corners)).toBe(false);
    expect(isBoardFull(ctx, { ...corners, ruinedSiteIds: ["s5"] })).toBe(true);
    // A corner burned down (and razed, which its owner may rebuild) is open again.
    const burned = clone(corners);
    const corner = Object.values(burned.holdings).find((h) => h.siteId === "s1");
    delete burned.holdings[corner?.id ?? ""];
    expect(isBoardFull(ctx, { ...burned, ruinedSiteIds: ["s5"] })).toBe(false);
  });

  it("ends the game when the round ends on it, and the most Renown wins short of the target", () => {
    const { state, p1, p2 } = setupGame();
    const s = passTurn(upgradeAll(buildMiddle(state, p1)));
    expect(s.status).toBe("playing");
    const { state: ended, events } = endTurn(upgradeAll(s));
    expect(ended.status).toBe("finished");
    expect(ended.endCause).toBe("full_board");
    expect(ended.winnerId).toBe(p1);
    expect(getRenown(ctx, ended, p1)).toBe(6);
    expect(getRenown(ctx, ended, p2)).toBe(4);
    expect(6).toBeLessThan(ended.ruleset.targetRenown);
    expect(events).toContainEqual({ type: "game_won", playerId: p1, renown: 6, cause: "full_board" });
  });

  it("waits for the last player of the round, whoever fills it", () => {
    const { state, p1 } = setupGame();
    // Round 1: every corner becomes a Stronghold; s5 is still open.
    let s = passTurn(upgradeAll(passTurn(upgradeAll(state))));
    expect(s.status).toBe("playing");
    expect(s.round).toBe(2);
    // Round 2: the first player fills the board, and the second still plays,
    // told that this round is the last.
    const told = endTurn(buildMiddle(s, p1));
    s = told.state;
    expect(isBoardFull(ctx, s)).toBe(true);
    expect(s.status).toBe("playing");
    expect(told.events).toContainEqual({ type: "board_full" });
    s = passTurn(s);
    expect(s.status).toBe("finished");
    expect(s.endCause).toBe("full_board");
  });

  it("breaks a tie in Renown as §7 does", () => {
    const { state, p1, p2 } = setupGame();
    // The second player draws level at 6 Renown, with a Stronghold fewer.
    const s = passTurn(upgradeAll(setBonus(passTurn(upgradeAll(buildMiddle(state, p1))), p2, 2)));
    expect(s.status).toBe("finished");
    expect(getRenown(ctx, s, p1)).toBe(getRenown(ctx, s, p2));
    expect(s.winnerId).toBe(p1);
  });

  it("lets a player who reaches the target win as usual", () => {
    const { state, p1, p2 } = setupGame();
    const s = passTurn(upgradeAll(setBonus(passTurn(upgradeAll(buildMiddle(state, p1))), p2, 6)));
    expect(s.status).toBe("finished");
    expect(s.winnerId).toBe(p2);
    expect(s.endCause).toBeUndefined();
  });

  it("plays on in games created without the rule", () => {
    const legacy: RulesetConfig = { ...mvpRuleset() };
    delete legacy.endOnFullBoard;
    const { state, p1 } = setupGame(legacy);
    const s = passTurn(upgradeAll(passTurn(upgradeAll(buildMiddle(state, p1)))));
    expect(isBoardFull(ctx, s)).toBe(true);
    expect(s.status).toBe("playing");
  });
});
