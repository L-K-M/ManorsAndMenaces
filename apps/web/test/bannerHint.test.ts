import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clone, getPlayerBanners, standardRuleset, type Banner, type GameState, type PlayerId } from "@manors-menaces/rules";
import { mapFor } from "../src/lib/game/engine.js";
import { regionName } from "../src/lib/game/log.js";
import type { GameSession } from "../src/lib/game/session.svelte.js";
import { engine, playGame } from "./helpers.js";

// The Banner Assignment hint explains why a Banner at home has nowhere to go
// instead of silently highlighting nothing. The ui store is a runes module:
// outside the Svelte compiler `$state` is an ordinary global call, so the
// identity stands in for it.

type Interaction = typeof import("../src/lib/game/interaction.js");
type UiStore = typeof import("../src/lib/stores/ui.svelte.js");
let ix: Interaction;
let store: UiStore;

beforeAll(async () => {
  vi.stubGlobal("$state", <T>(value: T) => value);
  store = await import("../src/lib/stores/ui.svelte.js");
  ix = await import("../src/lib/game/interaction.js");
});

beforeEach(() => {
  store.resetTool();
  store.ui.bannerDraft = {};
});

const ctx = engine.ctx;
const map = mapFor();

/** A Banner Assignment phase a couple of rounds in. */
const base: GameState = (() => {
  const { initial, commands } = playGame(standardRuleset(3), "banner-hint", 3, 400);
  let s = initial;
  for (const c of commands) {
    const next = engine.applyCommand(s, c).newState;
    if (!next) break;
    s = next;
    if (s.round >= 2 && s.phase === "banner_assignment" && !s.pending) return s;
  }
  throw new Error("the AI game never reached a Banner Assignment phase in round 2");
})();
const actor = base.activePlayerId;
const rival = base.turnOrder.find((id) => id !== actor) as PlayerId;

function session(state: GameState): GameSession {
  return { ctx, draft: state, localActor: actor, map } as unknown as GameSession;
}

/**
 * Sends the actor's first Banner home and fills every Region next to its
 * Holding, the first one with the actor's own Banners when `ownFirst`.
 */
function blocked(ownFirst: boolean): { state: GameState; bannerId: string; regions: string[] } {
  const s = clone(base);
  const banner = getPlayerBanners(s, actor)[0] as Banner;
  s.banners[banner.id] = { ...banner, regionId: null };
  const siteId = s.holdings[banner.holdingId]?.siteId as string;
  const regions = ctx.board.site(siteId).adjacentRegionIds;
  let n = 0;
  regions.forEach((regionId, i) => {
    for (const b of Object.values(s.banners)) if (b.regionId === regionId) b.regionId = null;
    const ownerId = ownFirst && i === 0 ? actor : rival;
    for (let k = 0; k < ctx.board.region(regionId).capacity; k++) {
      const id = `filler_${++n}`;
      s.banners[id] = { id, ownerId, holdingId: "filler", regionId, settled: true };
    }
  });
  return { state: s, bannerId: banner.id, regions };
}

describe("Banner Assignment hint", () => {
  it("asks for a highlighted Region while one has room", () => {
    store.ui.selectedBannerId = getPlayerBanners(base, actor)[0]?.id ?? null;
    const h = ix.computeHighlights(session(base), ix.legalFor(session(base)));
    expect(h.regions.size).toBeGreaterThan(0);
    expect(h.hint).toBe("hint.banner_region");
  });

  it("explains that rival Banners fill every Region next to the Holding", () => {
    const { state, bannerId } = blocked(false);
    store.ui.selectedBannerId = bannerId;
    const h = ix.computeHighlights(session(state), ix.legalFor(session(state)));
    expect(h.regions.size).toBe(0);
    expect(h.hint).toBe("hint.banner_blocked_full");
  });

  it("names the Region the player's own Banner could vacate", () => {
    const { state, bannerId, regions } = blocked(true);
    store.ui.selectedBannerId = bannerId;
    const h = ix.computeHighlights(session(state), ix.legalFor(session(state)));
    expect(h.regions.size).toBe(0);
    expect(h.hint).toBe("hint.banner_blocked_own");
    expect(h.hintParams).toEqual({ regions: regionName(map, regions[0]) });
  });
});
