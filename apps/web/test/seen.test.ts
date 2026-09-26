import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lastSeenRevision, markSeen } from "../src/lib/online/seen.js";

// Remembers the revision of each online match this device last showed, so a
// reopened match can mark what happened since.
describe("seen revisions", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("starts unknown and keeps the newest revision shown", () => {
    expect(lastSeenRevision("m1")).toBeNull();
    markSeen("m1", 12);
    markSeen("m1", 9); // an older update arriving late never moves it back
    expect(lastSeenRevision("m1")).toBe(12);
    expect(lastSeenRevision("m2")).toBeNull();
  });

  it("forgets the matches seen longest ago once it holds too many", () => {
    for (let i = 0; i < 60; i++) {
      vi.setSystemTime(1_000 + i);
      markSeen(`m${i}`, i);
    }
    vi.useRealTimers();
    expect(lastSeenRevision("m0")).toBeNull();
    expect(lastSeenRevision("m59")).toBe(59);
    expect(Object.keys(JSON.parse(store.get("mm.online.seen.v1") ?? "{}"))).toHaveLength(50);
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
    expect(() => markSeen("m1", 3)).not.toThrow();
    expect(lastSeenRevision("m1")).toBeNull();
  });
});
