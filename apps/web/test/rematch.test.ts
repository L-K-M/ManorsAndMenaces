import { describe, expect, it } from "vitest";
import type { SeatConfig } from "@manors-menaces/protocol";
import { BALANCE, mvpRuleset, standardRuleset, type RulesetConfig } from "@manors-menaces/rules";
import { planRematch } from "../src/lib/game/rematch.js";
import { TUTORIAL_SEED } from "../src/lib/game/saves.js";
import { engine } from "./helpers.js";

const seats: SeatConfig[] = [
  { playerId: "P1", displayName: "Ysolde", kind: "human", color: 2 },
  { playerId: "P2", displayName: "Wat", kind: "ai", aiLevel: "hard", color: 0 },
];
const initialStateOptions = {
  matchId: "m",
  seed: "old-seed",
  rulesetVersion: "x",
  ruleset: mvpRuleset(),
  players: seats.map((s) => ({ id: s.playerId, displayName: s.displayName })),
};
const initialState = engine.createGame(initialStateOptions);
const finished = { seats, mapId: "greenvale", initialState };

// Regression: "Play again" reused whatever local game the tab last started,
// and turned online matches into local ones.
describe("planRematch", () => {
  it("reuses the finished game's seats, rules and map with a fresh seed", () => {
    const plan = planRematch({ ...finished, transport: "local", tutorial: false });

    expect(plan.kind).toBe("local");
    if (plan.kind !== "local") return;
    expect(plan.options.seats).toEqual(seats);
    expect(plan.options.ruleset).toEqual(mvpRuleset());
    expect(plan.options.board).toEqual({ kind: "fixed", mapId: "greenvale" });
    expect(plan.options.seed).toBeUndefined();
  });

  // Regression: a rematch of a game saved before ruleset 0.7.0 or 0.8.0 was
  // a new game without the full-board end or the last round.
  it("adds the full-board end and the last round to rules saved without them, and keeps the players' choices", () => {
    // New Game's goal and advanced options.
    const old: RulesetConfig = { ...standardRuleset(2, { targetRenown: 25 }), questExpiryRounds: 0, initialCards: 0, cardDrawEveryRounds: 0 };
    delete old.endOnFullBoard;
    delete old.lastRound;
    const initialState = engine.createGame({ ...initialStateOptions, ruleset: old });
    const plan = planRematch({ ...finished, initialState, transport: "local", tutorial: false });

    expect(plan.kind).toBe("local");
    if (plan.kind !== "local") return;
    expect(plan.options.ruleset).toEqual({ ...old, endOnFullBoard: true, lastRound: BALANCE.lastRound });
    expect(plan.options.ruleset?.targetRenown).toBe(25);
    // The finished game's own rules are left alone.
    expect(initialState.ruleset.lastRound).toBeUndefined();
  });

  it("repeats the New Game island choice, so each game deals new land", () => {
    const drawn = { ...finished, mapId: "greenvale-coastal-v2@123", transport: "local" as const, tutorial: false };
    const boardAfter = (board?: { kind: "drawn"; islandId?: string }) => {
      const plan = planRematch({ ...drawn, ...(board ? { board } : {}) });
      return plan.kind === "local" ? plan.options.board : plan.kind;
    };
    expect(boardAfter({ kind: "drawn" })).toEqual({ kind: "drawn" });
    expect(boardAfter({ kind: "drawn", islandId: "greenvale-coastal-v2" })).toEqual({ kind: "drawn", islandId: "greenvale-coastal-v2" });
    // A game continued from a save forgot the choice: stay on its island.
    expect(boardAfter()).toEqual({ kind: "drawn", islandId: "greenvale-coastal-v2" });
  });

  it("returns online players to the lobby instead of starting a local game", () => {
    expect(planRematch({ ...finished, transport: "online", tutorial: false }).kind).toBe("lobby");
  });

  it("sends tutorial players to a real game setup", () => {
    expect(planRematch({ ...finished, transport: "local", tutorial: true }).kind).toBe("new_game");
  });

  it("recognises a tutorial resumed from a save", () => {
    const tutorialStart = engine.createGame({ ...initialStateOptions, seed: TUTORIAL_SEED });
    expect(planRematch({ ...finished, initialState: tutorialStart, transport: "local", tutorial: false }).kind).toBe("new_game");
  });
});
