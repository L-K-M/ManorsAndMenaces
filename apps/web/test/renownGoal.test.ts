import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rememberRenownGoal, rememberedRenownGoal, renownGoal, renownGoalHint } from "../src/lib/game/renownGoal.js";

// The "Renown to win" choice on New Game and the online lobby: the rules'
// default for the player count until you pick a goal, which is remembered.
describe("renownGoal", () => {
  it("follows the rules and player count until you pick a goal", () => {
    expect(renownGoal("standard", 2, null)).toEqual({ value: 15, usual: 15, choices: [15, 20, 25, 30] });
    expect(renownGoal("standard", 3, null).value).toBe(15);
    expect(renownGoal("standard", 4, null)).toEqual({ value: 13, usual: 13, choices: [13, 15, 20, 25, 30] });
    expect(renownGoal("async", 4, null).value).toBe(13);
    expect(renownGoal("mvp", 3, null)).toEqual({ value: 10, usual: 10, choices: [10, 15, 20, 25, 30] });
  });

  it("keeps a picked goal when the player count or rules change", () => {
    for (const [rules, players] of [["standard", 2], ["standard", 4], ["async", 3], ["mvp", 4]] as const) {
      expect(renownGoal(rules, players, 25).value).toBe(25);
      expect(renownGoal(rules, players, 15).value).toBe(15);
    }
    // Picking the usual goal still pins it: four players keep 15, not 13.
    expect(renownGoal("standard", 4, 15).value).toBe(15);
  });

  it("falls back to the default when these rules do not offer the picked goal", () => {
    // 10 is a Core goal and 13 the four-player one.
    expect(renownGoal("standard", 3, 10).value).toBe(15);
    expect(renownGoal("mvp", 3, 10).value).toBe(10);
    expect(renownGoal("standard", 2, 13).value).toBe(15);
    expect(renownGoal("standard", 4, 13).value).toBe(13);
    expect(renownGoal("standard", 3, 17).value).toBe(15);
  });
});

// What a goal means, under the choice: when the board usually fills first,
// and that every game ends after round 30 at the latest (§7, §129.7).
describe("renownGoalHint", () => {
  const LAST = "Every game ends after round 30 at the latest.";
  const FILLS = "The board usually fills first, and then the most Renown wins.";

  it("gives the default goals only the last round", () => {
    expect(renownGoalHint("standard", 2, 15)).toBe(LAST);
    expect(renownGoalHint("standard", 3, 15)).toBe(LAST);
    expect(renownGoalHint("async", 4, 13)).toBe(LAST);
    expect(renownGoalHint("standard", 4, 15)).toBe(LAST);
    expect(renownGoalHint("standard", 3, 20)).toBe(LAST);
  });

  it("says the board usually fills first at 25 and 30, and at 20 with four players", () => {
    for (const players of [2, 3, 4]) {
      expect(renownGoalHint("standard", players, 25)).toBe(`${FILLS} ${LAST}`);
      expect(renownGoalHint("async", players, 30)).toBe(`${FILLS} ${LAST}`);
    }
    expect(renownGoalHint("standard", 4, 20)).toBe(`${FILLS} ${LAST}`);
  });

  it("gives the Core rules only the last round", () => {
    for (const goal of [10, 15, 20, 25, 30]) expect(renownGoalHint("mvp", 4, goal)).toBe(LAST);
  });
});

describe("remembered Renown goal", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("starts with none and returns the last goal picked", () => {
    expect(rememberedRenownGoal()).toBeNull();
    rememberRenownGoal(25);
    expect(rememberedRenownGoal()).toBe(25);
    rememberRenownGoal(10);
    expect(rememberedRenownGoal()).toBe(10);
  });

  it("ignores stored values that are not whole numbers", () => {
    // The key the goal is stored under, so a renamed key cannot pass unread.
    rememberRenownGoal(25);
    const [key] = [...store.keys()];
    if (!key) throw new Error("nothing was stored");
    for (const junk of ["", "abc", "25.5", "1e3x", "-"]) {
      store.set(key, junk);
      expect(rememberedRenownGoal()).toBeNull();
    }
  });

  it("keeps working when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => rememberRenownGoal(25)).not.toThrow();
    expect(rememberedRenownGoal()).toBeNull();
  });
});
