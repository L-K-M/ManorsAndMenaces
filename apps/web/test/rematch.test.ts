import { describe, expect, it } from "vitest";
import type { SeatConfig } from "@manors-menaces/protocol";
import { mvpRuleset } from "@manors-menaces/rules";
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
