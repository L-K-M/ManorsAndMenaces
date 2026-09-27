import { describe, expect, it } from "vitest";
import {
  BALANCE,
  asyncRuleset,
  clone,
  defaultTargetRenown,
  getRenown,
  targetRenownChoices,
  type GameState,
  type PlayerId,
  type RulesetConfig,
} from "../src/index.js";
import { act, engine, mvpRuleset, passTurn, setupGame, standardRuleset } from "./helpers.js";

// The Renown needed to win is picked when a game is created (spec §7). Each
// game keeps the goal it was created with in its ruleset.

const ctx = engine.ctx;

/** Sets a player's Renown by adjusting their bonus Renown. */
function withRenown(s: GameState, p: PlayerId, renown: number): GameState {
  const c = clone(s);
  const player = c.players[p] as GameState["players"][string];
  player.bonusRenown += renown - getRenown(ctx, s, p);
  return c;
}

describe("Renown goal defaults (§7)", () => {
  it.each([[2, 15], [3, 15], [4, 13]])("targets %i-player Standard and async games at their default", (players, target) => {
    expect(standardRuleset(players).targetRenown).toBe(target);
    expect(asyncRuleset(players).targetRenown).toBe(target);
    expect(defaultTargetRenown("standard", players)).toBe(target);
    expect(defaultTargetRenown("async", players)).toBe(target);
  });

  it("keeps the Core rules at 10 whatever the player count", () => {
    expect(mvpRuleset().targetRenown).toBe(10);
    for (const players of [2, 3, 4]) expect(defaultTargetRenown("mvp", players)).toBe(10);
  });

  it("offers 15, 20, 25 and 30, plus the rules' own default", () => {
    expect(targetRenownChoices("standard", 2)).toEqual([15, 20, 25, 30]);
    expect(targetRenownChoices("async", 3)).toEqual([15, 20, 25, 30]);
    expect(targetRenownChoices("standard", 4)).toEqual([13, 15, 20, 25, 30]);
    expect(targetRenownChoices("mvp", 2)).toEqual([10, 15, 20, 25, 30]);
  });
});

describe("choosing a Renown goal (§7)", () => {
  it("creates Standard, async and Core rules with each offered goal", () => {
    for (const players of [2, 3, 4]) {
      for (const targetRenown of targetRenownChoices("standard", players)) {
        expect(standardRuleset(players, { targetRenown }).targetRenown).toBe(targetRenown);
        expect(asyncRuleset(players, { targetRenown }).targetRenown).toBe(targetRenown);
      }
    }
    for (const targetRenown of targetRenownChoices("mvp", 2)) expect(mvpRuleset({ targetRenown }).targetRenown).toBe(targetRenown);
  });

  it("changes nothing else about the rules", () => {
    const chosen = standardRuleset(3, { targetRenown: 25 });
    expect({ ...chosen, targetRenown: 0 }).toEqual({ ...standardRuleset(3), targetRenown: 0 });
    expect(asyncRuleset(3, { targetRenown: 25 }).enableReactionCards).toBe(false);
  });

  it.each([10, 13, 17, 18, 35, 0, -20, 20.5, Number.NaN, Number.POSITIVE_INFINITY])("refuses a goal of %s Renown for a 2-player Standard game", (targetRenown) => {
    expect(() => standardRuleset(2, { targetRenown })).toThrow(RangeError);
    expect(() => asyncRuleset(2, { targetRenown })).toThrow(RangeError);
  });

  it("no longer offers four players 18 Renown, their default before it returned to 13", () => {
    expect(() => standardRuleset(4, { targetRenown: 18 })).toThrow(RangeError);
    expect(() => asyncRuleset(4, { targetRenown: 18 })).toThrow(RangeError);
  });

  it("refuses goals the Core rules do not offer", () => {
    for (const targetRenown of [12, 18, 40]) expect(() => mvpRuleset({ targetRenown })).toThrow(RangeError);
  });

  it.each([15, 25, 30])("ends the game when someone reaches a chosen goal of %i", (targetRenown) => {
    const { state, p1 } = setupGame(standardRuleset(2, { targetRenown }));
    const short = passTurn(withRenown(state, p1, targetRenown - 1));
    expect(short.status).toBe("playing");
    const won = passTurn(withRenown(state, p1, targetRenown));
    expect(won.status).toBe("finished");
    expect(won.winnerId).toBe(p1);
  });
});

describe("Ragnarök's omen follows the chosen goal (§19.13)", () => {
  /** Ends the active player's turn and returns its events. */
  function endTurnEvents(s: GameState): string[] {
    const p = s.activePlayerId;
    let next = act(s, p, { type: "end_main_phase" }).state;
    next = act(next, p, { type: "assign_banners", assignments: {} }).state;
    return act(next, p, { type: "end_turn" }).events.map((e) => e.type);
  }

  it.each([15, 20, 30])("is foretold %i minus omenGap Renown in", (targetRenown) => {
    const ruleset: RulesetConfig = { ...standardRuleset(2, { targetRenown }), initialCards: 0, cardDrawEveryRounds: 0 };
    const { state, p2 } = setupGame(ruleset);
    expect(state.setAsideCardIds).toEqual(["ragnarok#1"]);
    const threshold = targetRenown - BALANCE.ragnarok.omenGap;
    expect(endTurnEvents(withRenown(state, p2, threshold - 1))).not.toContain("card_foretold");
    expect(endTurnEvents(withRenown(state, p2, threshold))).toContain("card_foretold");
  });
});

describe("games created before the goal changed (§7)", () => {
  // For a while the Standard goal was 20, or 18 with 4 players. A saved game
  // or running online match stores its goal, so it keeps it.
  it.each([20, 18])("still end at their saved goal of %i", (targetRenown) => {
    const { state, p1 } = setupGame({ ...standardRuleset(2), targetRenown });
    const restored = JSON.parse(JSON.stringify(state)) as GameState;
    expect(restored.ruleset.targetRenown).toBe(targetRenown);
    const ended = passTurn(withRenown(restored, p1, targetRenown));
    expect(ended.ruleset.targetRenown).toBe(targetRenown);
    expect(ended.status).toBe("finished");
    expect(ended.winnerId).toBe(p1);
  });
});
