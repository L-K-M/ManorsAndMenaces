import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rememberName, rememberedName } from "../src/lib/game/playerName.js";

// The name you last played under, so the next New Game (or the online lobby)
// starts with it instead of a stranger's.
describe("remembered player name", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("starts empty and returns the last name played under, trimmed", () => {
    expect(rememberedName()).toBe("");
    rememberName("  Lukas ");
    expect(rememberedName()).toBe("Lukas");
    rememberName("Ysolde");
    expect(rememberedName()).toBe("Ysolde");
  });

  it("does not forget a name for a blank one", () => {
    rememberName("Lukas");
    rememberName("   ");
    expect(rememberedName()).toBe("Lukas");
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
    expect(() => rememberName("Lukas")).not.toThrow();
    expect(rememberedName()).toBe("");
  });
});
