import { describe, expect, it } from "vitest";
import { SAVE_SCHEMA_VERSION, type SaveFile } from "@manors-menaces/protocol";
import { chooseAction } from "@manors-menaces/ai";
import { RULESET_VERSION, createRng, mvpRuleset, seedRng, type GameCommand, type GameState } from "@manors-menaces/rules";
import { engineFor } from "../src/lib/game/engine.js";
import {
  LEGACY_AUTOSAVE_ID,
  MAX_AUTOSAVES,
  TUTORIAL_SEED,
  autosavesToPrune,
  describeSave,
  describeSaves,
  exportFileName,
  isAutosave,
  isTutorialSave,
  latestAutosave,
  manualSaveId,
  newAutosaveId,
  relativeTime,
  replayPending,
} from "../src/lib/game/saves.js";

const engine = engineFor("greenvale");

function newGame(seed = "s"): GameState {
  return engine.createGame({
    matchId: `local-${seed}`,
    seed,
    rulesetVersion: RULESET_VERSION,
    ruleset: mvpRuleset(),
    players: [
      { id: "P1", displayName: "Alice" },
      { id: "P2", displayName: "Bertram" },
    ],
  });
}

function saveOf(state: GameState, pendingCommands?: GameCommand[]): SaveFile {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    rulesetVersion: RULESET_VERSION,
    savedAt: "2026-01-01T00:00:00.000Z",
    mapId: "greenvale",
    seats: [
      { playerId: "P1", displayName: "Alice", kind: "human", color: 2 },
      { playerId: "P2", displayName: "Bertram", kind: "human", color: 3 },
    ],
    initialState: state,
    state,
    commandHistory: [],
    ...(pendingCommands ? { pendingCommands } : {}),
  };
}

/** The first setup action (placing a Manor): undo-safe, so it would be buffered. */
function firstPlacement(state: GameState): GameCommand {
  const playerId = state.activePlayerId;
  const intent = chooseAction(engine, state, playerId, { level: "easy", rng: createRng(seedRng("t")) });
  if (!intent) throw new Error("no legal action");
  return { ...intent, commandId: `${playerId}-1`, matchId: state.matchId, playerId } as GameCommand;
}

describe("autosave slots", () => {
  const at = (id: string, minute: number) => ({ id, savedAt: new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString() });

  const autosaveId = (m: string) => newAutosaveId(m, "n");

  it("gives every game its own autosave, even with the same seed, and recognises the legacy slot", () => {
    // Custom seeds repeat, and the local match id is derived from the seed.
    expect(newAutosaveId("local-castle")).not.toBe(newAutosaveId("local-castle"));
    expect(autosaveId("local-a")).not.toBe(autosaveId("local-b"));
    expect(isAutosave(newAutosaveId("local-a"))).toBe(true);
    expect(isAutosave(LEGACY_AUTOSAVE_ID)).toBe(true);
    expect(isAutosave("save:local-a:r4")).toBe(false);
  });

  it("continues the most recently written autosave, never a manual save", () => {
    const slots = [at(autosaveId("a"), 1), at("save:b:r3", 9), at(autosaveId("c"), 5), at(LEGACY_AUTOSAVE_ID, 0)];
    expect(latestAutosave(slots)?.id).toBe(autosaveId("c"));
    expect(latestAutosave([at("save:b:r3", 1)])).toBeUndefined();
  });

  it(`keeps the ${MAX_AUTOSAVES} newest autosaves and prunes only older autosaves`, () => {
    const autos = Array.from({ length: MAX_AUTOSAVES + 2 }, (_, i) => at(autosaveId(`m${i}`), i));
    const manual = at("save:x:r1", 0);
    const active = autosaveId(`m${MAX_AUTOSAVES + 1}`);
    expect(autosavesToPrune([...autos, manual], active).sort()).toEqual([autosaveId("m0"), autosaveId("m1")]);
    expect(autosavesToPrune(autos.slice(0, MAX_AUTOSAVES), autosaveId("m0"))).toEqual([]);
  });

  it("never prunes the slot this game is writing, even if its clock says it is the oldest", () => {
    // Clock skew, or another tab writing newer rows: timestamps alone do not
    // protect the active slot, which counts towards the kept total.
    const autos = Array.from({ length: MAX_AUTOSAVES + 1 }, (_, i) => at(autosaveId(`m${i}`), i));
    const active = autosaveId("m0");
    const pruned = autosavesToPrune(autos, active);
    expect(pruned).not.toContain(active);
    expect(pruned).toEqual([autosaveId("m1")]);
  });
});

describe("manual save ids", () => {
  it("reuses one row for the same position and separates different ones", () => {
    const state = newGame();
    const cmd = firstPlacement(state);
    expect(manualSaveId(saveOf(state))).toBe(manualSaveId(saveOf(state)));
    expect(manualSaveId(saveOf(state, [cmd]))).not.toBe(manualSaveId(saveOf(state)));
    expect(manualSaveId(saveOf(state, [cmd]))).not.toBe(manualSaveId(saveOf(state, [{ ...cmd, commandId: "other" }])));
  });

  it("separates different positions at the same revision", () => {
    // Loading an earlier save and playing another line reaches the same revision.
    const state = newGame();
    const a = engine.applyCommand(state, firstPlacement(state)).newState!;
    const b = { ...a, holdings: {} } as GameState;
    expect(b.revision).toBe(a.revision);
    expect(manualSaveId(saveOf(a))).not.toBe(manualSaveId(saveOf(b)));
  });
});

describe("save descriptions", () => {
  it("names the players with their colours in turn order and never says round 0", () => {
    const state = newGame();
    const meta = describeSave(saveOf(state));
    expect(state.round).toBe(0);
    expect(meta.round).toBe(1);
    expect(meta.players.map((p) => p.name)).toEqual(state.turnOrder.map((id) => state.players[id]?.displayName));
    const alice = meta.players.find((p) => p.name === "Alice");
    expect(alice?.color).toBe(2);
    expect(meta.rulesetName).toBe("mvp");
    expect(meta.winner).toBeNull();
  });

  it("marks unreadable stored saves instead of failing the whole list", () => {
    const good = saveOf(newGame());
    const rows = [
      { id: "a", savedAt: good.savedAt, label: "A", data: good },
      { id: "b", savedAt: good.savedAt, label: "B", data: { nonsense: true } },
      { id: "c", savedAt: good.savedAt, label: "C", data: { ...good, state: { ...good.state, turnOrder: null } } },
    ];
    const entries = describeSaves(rows);
    expect(entries.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(entries[0]?.meta?.players).toHaveLength(2);
    expect(entries[1]?.meta).toBeNull();
    expect(entries[2]?.meta).toBeNull();
  });

  it("recognises tutorial saves and builds a safe export file name", () => {
    expect(isTutorialSave(saveOf(newGame(TUTORIAL_SEED)))).toBe(true);
    expect(isTutorialSave(saveOf(newGame()))).toBe(false);
    expect(exportFileName(saveOf(newGame("a b/c")))).toBe("manors-local-a-b-c-r1.json");
  });

  it("formats save times relative to now", () => {
    const now = Date.UTC(2026, 5, 10, 12);
    const ago = (ms: number) => new Date(now - ms).toISOString();
    expect(relativeTime(ago(10_000), now)).toBe("just now");
    expect(relativeTime(ago(5 * 60_000), now)).toBe("5 min ago");
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe("3 h ago");
    expect(relativeTime(ago(2 * 86_400_000), now)).toBe("2 days ago");
    expect(relativeTime(ago(1 * 86_400_000), now)).toBe("1 day ago");
  });
});

describe("replaying a turn in progress", () => {
  it("re-applies pending commands so a save shows exactly what was on screen", () => {
    const state = newGame();
    const cmd = firstPlacement(state);
    const expected = engine.applyCommand(state, cmd).newState;
    const steps = replayPending(engine, state, [cmd]);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.before).toBe(state);
    expect(steps[0]?.after).toEqual(expected);
  });

  it("stops at the first command that is rejected or not undo-safe", () => {
    const state = newGame();
    const cmd = firstPlacement(state);
    expect(replayPending(engine, state, [{ ...cmd, playerId: "nobody" }])).toHaveLength(0);
    const locking = { type: "end_turn", commandId: "x", matchId: state.matchId, playerId: state.activePlayerId } as GameCommand;
    expect(replayPending(engine, state, [locking, cmd])).toHaveLength(0);
  });
});
