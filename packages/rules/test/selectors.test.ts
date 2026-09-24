import { afterEach, describe, expect, it, vi } from "vitest";
import { createRng, getPlayerBanners, seedRng, type Banner, type GameState } from "../src/index.js";

/** A state holding only Banners, inserted in a shuffled order. */
function bannerState(ids: string[]): GameState {
  const banners: Record<string, Banner> = {};
  for (const id of createRng(seedRng("banner-order")).shuffle(ids)) banners[id] = { id, ownerId: "P1", holdingId: "h", regionId: null, settled: false };
  return { banners } as unknown as GameState;
}

describe("getPlayerBanners", () => {
  afterEach(() => vi.restoreAllMocks());

  it("orders Banner ids exactly as the numeric English collation did", () => {
    const ids = Array.from({ length: 120 }, (_, i) => `banner_${i + 1}`);
    const got = getPlayerBanners(bannerState(ids), "P1").map((b) => b.id);
    expect(got).toEqual([...ids].sort((a, b) => a.localeCompare(b, "en", { numeric: true })));
    expect(got.indexOf("banner_2")).toBeLessThan(got.indexOf("banner_10"));
  });

  it("only returns the player's own Banners", () => {
    const state = bannerState(["banner_1", "banner_2"]);
    (state.banners["banner_2"] as Banner).ownerId = "P2";
    expect(getPlayerBanners(state, "P1").map((b) => b.id)).toEqual(["banner_1"]);
  });

  // The AI calls this in its innermost loops; a locale-aware comparison
  // built an ICU collator per call and doubled the cost of a decision.
  it("sorts without locale-aware string comparison", () => {
    const spy = vi.spyOn(String.prototype, "localeCompare");
    getPlayerBanners(bannerState(["banner_3", "banner_1", "banner_12"]), "P1");
    expect(spy).not.toHaveBeenCalled();
  });
});
