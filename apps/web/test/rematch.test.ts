import { describe, expect, it } from "vitest";
import type { SeatConfig } from "@manors-menaces/protocol";
import { mvpRuleset } from "@manors-menaces/rules";
import { planRematch } from "../src/lib/game/rematch.js";
import { engine } from "./helpers.js";

const seats: SeatConfig[] = [
  { playerId: "P1", displayName: "Ysolde", kind: "human", color: 2 },
  { playerId: "P2", displayName: "Wat", kind: "ai", aiLevel: "hard", color: 0 },
];
const initialState = engine.createGame({
  matchId: "m",
  seed: "old-seed",
  rulesetVersion: "x",
  ruleset: mvpRuleset(),
  players: seats.map((s) => ({ id: s.playerId, displayName: s.displayName })),
});
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
    expect(plan.options.mapId).toBe("greenvale");
    expect(plan.options.seed).toBeUndefined();
  });

  it("returns online players to the lobby instead of starting a local game", () => {
    expect(planRematch({ ...finished, transport: "online", tutorial: false }).kind).toBe("lobby");
  });

  it("sends tutorial players to a real game setup", () => {
    expect(planRematch({ ...finished, transport: "local", tutorial: true }).kind).toBe("new_game");
  });
});
