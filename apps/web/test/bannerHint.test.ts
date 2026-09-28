import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clone, getPlayerBanners, standardRuleset, type Banner, type GameState, type LegalActionSummary, type PlayerId } from "@manors-menaces/rules";
import { mapFor } from "../src/lib/game/engine.js";
import { t } from "../src/lib/i18n.js";
import { regionName } from "../src/lib/game/log.js";
import type { GameSession } from "../src/lib/game/session.svelte.js";
import { engine, playGame } from "./helpers.js";

// Banner Assignment: a Banner at home with nowhere to go is not selected
// silently; tapping it opens a dialog saying why, as does tapping a Region the
// selected Banner can't take. The ui store is a runes module: outside the
// Svelte compiler `$state` is an ordinary global call, so the identity stands
// in for it.

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
  store.ui.selectedBannerId = null;
  store.ui.bannerDraft = {};
  store.ui.dialog = null;
  store.ui.blocked = null;
  store.ui.inspect = null;
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

  it("keeps the plain hint for a selection that no longer exists", () => {
    store.ui.selectedBannerId = "no_such_banner";
    const h = ix.computeHighlights(session(base), ix.legalFor(session(base)));
    expect(h.regions.size).toBe(0);
    expect(h.hint).toBe("hint.banner_region");
  });
});

describe("a Banner with nowhere to go", () => {
  it("selects a Banner that has room, without a dialog", async () => {
    const bannerId = getPlayerBanners(base, actor)[0]?.id as string;
    expect(ix.whyBannerStuck(session(base), bannerId)).toBeNull();
    await ix.onPick(session(base), ix.legalFor(session(base)), { kind: "banner", id: bannerId });
    expect(store.ui.selectedBannerId).toBe(bannerId);
    expect(store.ui.dialog).toBeNull();
  });

  it("explains in a dialog that rival Banners fill every Region next to the Holding", async () => {
    const { state, bannerId } = blocked(false);
    expect(ix.whyBannerStuck(session(state), bannerId)).toBe(t("hint.banner_blocked_full"));
    await ix.onPick(session(state), ix.legalFor(session(state)), { kind: "banner", id: bannerId });
    expect(store.ui.selectedBannerId).toBeNull();
    expect(store.ui.dialog).toBe("blocked");
    expect(store.ui.blocked).toEqual({ title: t("blocked.title.banner"), text: t("hint.banner_blocked_full") });
  });

  it("names the Region the player's own Banner could vacate", async () => {
    const { state, bannerId, regions } = blocked(true);
    const text = t("hint.banner_blocked_own", { regions: regionName(map, regions[0]) });
    expect(ix.whyBannerStuck(session(state), bannerId)).toBe(text);
    await ix.onPick(session(state), ix.legalFor(session(state)), { kind: "banner", id: bannerId });
    expect(store.ui.selectedBannerId).toBeNull();
    expect(store.ui.blocked?.text).toBe(text);
  });
});

describe("a Region the selected Banner can't take", () => {
  it("says the Region is full, and whether one of the player's own Banners fills it", () => {
    const { state, bannerId, regions } = blocked(true);
    expect(regions.length).toBeGreaterThan(1);
    const [own, rivals] = regions as [string, string];
    store.ui.selectedBannerId = bannerId;
    const legal = ix.legalFor(session(state)) as LegalActionSummary;
    expect(ix.refusedPick(session(state), legal, { kind: "region", id: own })).toEqual({
      title: t("blocked.title.banner_region", { region: regionName(map, own) }),
      text: t("blocked.region_full_own"),
    });
    expect(ix.refusedPick(session(state), legal, { kind: "region", id: rivals })?.text).toBe(t("error.REGION_FULL"));
  });

  it("says a Region away from the Banner's Holding is out of reach", async () => {
    const banner = getPlayerBanners(base, actor)[0] as Banner;
    const near = new Set(ctx.board.site(base.holdings[banner.holdingId]?.siteId as string).adjacentRegionIds);
    const far = ctx.board.topology.regions.find((r) => !near.has(r.id))?.id as string;
    store.ui.selectedBannerId = banner.id;
    await ix.onPick(session(base), ix.legalFor(session(base)), { kind: "region", id: far });
    expect(store.ui.selectedBannerId).toBe(banner.id);
    expect(store.ui.blocked).toEqual({ title: t("blocked.title.banner_region", { region: regionName(map, far) }), text: t("error.BANNER_NOT_ADJACENT") });
  });

  it("inspects a Region when no Banner is selected", async () => {
    const regionId = ctx.board.topology.regions[0]?.id as string;
    await ix.onPick(session(base), ix.legalFor(session(base)), { kind: "region", id: regionId });
    expect(store.ui.dialog).toBeNull();
    expect(store.ui.inspect).toEqual({ kind: "region", id: regionId });
  });
});
