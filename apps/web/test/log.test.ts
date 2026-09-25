import { describe, expect, it } from "vitest";
import { mvpRuleset } from "@manors-menaces/rules";
import { mapFor } from "../src/lib/game/engine.js";
import { rebuildLog } from "../src/lib/game/log.js";
import { engine, playGame } from "./helpers.js";

// Regression: after Continue or Load the Chronicle was empty, although the
// save holds the full command history.
describe("rebuildLog", () => {
  const map = mapFor("greenvale");
  const game = playGame(mvpRuleset(), "chronicle", 2, 120);

  it("rebuilds the Chronicle of a saved game from its history", () => {
    const r = rebuildLog(engine, map, game.initial, game.commands, game.final);

    expect(r.complete).toBe(true);
    expect(r.entries.some((e) => e.kind === "turn")).toBe(true);
    expect(r.entries.some((e) => /harvested/.test(e.text))).toBe(true);
    expect(r.entries.every((e) => !e.provisional)).toBe(true);
  });

  it("keeps what it could replay and says the rest is unavailable when the history diverges", () => {
    // Dropping a command (as unrecorded debug commands do) breaks the replay.
    const broken = [...game.commands.slice(0, 40), ...game.commands.slice(41)];
    const r = rebuildLog(engine, map, game.initial, broken, game.final);

    expect(r.complete).toBe(false);
    expect(r.entries.length).toBeGreaterThan(1);
    expect(r.entries.at(-1)?.text).toMatch(/could not be restored/);
  });

  it("detects a saved state the history does not reach", () => {
    const r = rebuildLog(engine, map, game.initial, game.commands.slice(0, 60), game.final);
    expect(r.complete).toBe(false);
  });
});
