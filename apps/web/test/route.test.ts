import { afterEach, describe, expect, it, vi } from "vitest";
import { matchRoute } from "../src/lib/online/route.js";

// The online match on screen lives in the address (#/match/ID); the lobby
// reads it while it starts, so a mangled link must not throw.
describe("matchRoute", () => {
  afterEach(() => vi.unstubAllGlobals());
  const at = (hash: string) => vi.stubGlobal("location", { hash });

  it("reads the match id from the address", () => {
    at("#/match/m_12%2F3");
    expect(matchRoute()).toBe("m_12/3");
    at("#/join/ABC123");
    expect(matchRoute()).toBeNull();
    at("#/match/");
    expect(matchRoute()).toBeNull();
  });

  it("treats a mangled link as no match instead of throwing", () => {
    for (const hash of ["#/match/%", "#/match/ab%zz", "#/match/%FF"]) {
      at(hash);
      expect(() => matchRoute(), hash).not.toThrow();
      expect(matchRoute()).toBeNull();
    }
  });
});
