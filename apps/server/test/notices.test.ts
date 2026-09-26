import { describe, expect, it } from "vitest";
import { rulesContentFor } from "@manors-menaces/content";
import { RULESET_VERSION, createRulesEngine, standardRuleset, type GameState } from "@manors-menaces/rules";
import { noticeFor, noticesAfter } from "../src/notices.js";

// Spec §85: tell a player when it becomes their turn and when the match ends;
// not for every opponent action.
const engine = createRulesEngine(rulesContentFor());
const game = engine.createGame({
  matchId: "m1",
  seed: "notices",
  rulesetVersion: RULESET_VERSION,
  ruleset: standardRuleset(3),
  players: [
    { id: "P1", displayName: "Alice" },
    { id: "P2", displayName: "Bob" },
    { id: "P3", displayName: "Cara" },
  ],
});
const turnOf = (playerId: string): GameState => ({ ...game, activePlayerId: playerId });

describe("noticesAfter", () => {
  it("tells the player whose turn it became, and only them", () => {
    expect(noticesAfter(turnOf("P1"), turnOf("P2"))).toEqual([{ playerId: "P2", kind: "your_turn" }]);
  });

  it("tells the first player when the match starts", () => {
    expect(noticesAfter(null, turnOf("P2"))).toEqual([{ playerId: "P2", kind: "your_turn" }]);
  });

  it("says nothing while the same player keeps acting", () => {
    expect(noticesAfter(turnOf("P1"), { ...turnOf("P1"), revision: game.revision + 3 })).toEqual([]);
  });

  it("tells a player who must answer a reaction window, before the active player", () => {
    const reaction = { ...turnOf("P1"), pending: { kind: "reaction", eligiblePlayerIds: ["P3"] } } as unknown as GameState;
    expect(noticesAfter(turnOf("P1"), reaction)).toEqual([{ playerId: "P3", kind: "your_turn" }]);
  });

  it("tells everyone once when the match ends", () => {
    const finished: GameState = { ...turnOf("P1"), status: "finished", winnerId: "P1" };
    expect(noticesAfter(turnOf("P1"), finished).map((n) => [n.playerId, n.kind])).toEqual([
      ["P1", "match_over"],
      ["P2", "match_over"],
      ["P3", "match_over"],
    ]);
    expect(noticesAfter(finished, finished)).toEqual([]);
  });
});

describe("noticeFor", () => {
  it("names the other players and the match", () => {
    const n = noticeFor("m1", "your_turn", "P2", turnOf("P2"));
    expect(n).toMatchObject({ matchId: "m1", kind: "your_turn" });
    expect(n.body).toContain("Alice, Cara");
    expect(n.body).not.toContain("Bob");
  });

  it("tells the winner they won and the others who did", () => {
    const finished: GameState = { ...turnOf("P1"), status: "finished", winnerId: "P1" };
    expect(noticeFor("m1", "match_over", "P1", finished).body).toMatch(/You won/);
    expect(noticeFor("m1", "match_over", "P2", finished).body).toMatch(/Alice won/);
  });
});
