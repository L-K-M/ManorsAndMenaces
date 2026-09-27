import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { computeBannerHarvest, getHarvestPreview, getPlayerBanners, getRenown, standardRuleset, type Banner, type GameState } from "@manors-menaces/rules";
import { mapFor } from "../src/lib/game/engine.js";
import type { GameSession } from "../src/lib/game/session.svelte.js";
import { engine, playGame } from "./helpers.js";

// The warning before a turn ends with idle Banners (§16.3): the web helper
// reads the Banner draft and says whether another placement harvests more.
// The ui store is a runes module: outside the Svelte compiler `$state` is an
// ordinary global call, so the identity stands in for it.

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
});

const ctx = engine.ctx;
const map = mapFor();

/** A Banner Assignment phase a couple of rounds in. */
const base: GameState = (() => {
  const { initial, commands } = playGame(standardRuleset(3), "banner-warning", 3, 400);
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

function session(state: GameState): GameSession {
  return { ctx, draft: state, localActor: actor, map } as unknown as GameSession;
}

/** One of the actor's Banners that harvests where it stands. */
const producing = getPlayerBanners(base, actor).find((b) => b.regionId && computeBannerHarvest(ctx, base, b, b.regionId).amount > 0) as Banner;

describe("bannerWarningFor", () => {
  it("returns advice for a Banner sent home from a Region that harvests", () => {
    expect(producing).toBeDefined();
    store.ui.bannerDraft = { [producing.id]: null };
    const advice = ix.bannerWarningFor(session(base), ix.legalFor(session(base)));
    expect(advice).not.toBeNull();
    expect(advice?.best).toBeGreaterThan(advice?.current ?? Infinity);
    expect(advice?.moves.some((m) => m.bannerId === producing.id && m.from === null)).toBe(true);
  });

  it("returns null once the suggested placement is in the draft", () => {
    store.ui.bannerDraft = { [producing.id]: null };
    const s = session(base);
    const advice = ix.bannerWarningFor(s, ix.legalFor(s));
    if (!advice) throw new Error("expected advice");
    store.ui.selectedBannerId = producing.id;

    ix.applyBannerAdvice(advice);
    expect(store.ui.selectedBannerId).toBeNull();
    expect(getHarvestPreview(ctx, base, actor, store.ui.bannerDraft).total).toBe(advice.best);
    expect(ix.bannerWarningFor(s, ix.legalFor(s))).toBeNull();
  });

  it("returns null in the last round, when the player never harvests again", () => {
    store.ui.bannerDraft = { [producing.id]: null };
    expect(ix.bannerWarningFor(session(base), ix.legalFor(session(base)))).not.toBeNull();
    const last = { ...base, ruleset: { ...base.ruleset, lastRound: base.round } };
    expect(ix.legalFor(session(last))?.mode).toBe("banner_assignment");
    expect(ix.bannerWarningFor(session(last), ix.legalFor(session(last)))).toBeNull();
  });

  it("returns null on the winning turn, which ends the game", () => {
    store.ui.bannerDraft = { [producing.id]: null };
    const me = base.players[actor];
    if (!me) throw new Error("no actor");
    const winning = { ...base, players: { ...base.players, [actor]: { ...me, bonusRenown: me.bonusRenown + base.ruleset.targetRenown } } };
    expect(getRenown(ctx, winning, actor)).toBeGreaterThanOrEqual(base.ruleset.targetRenown);
    expect(ix.bannerWarningFor(session(winning), ix.legalFor(session(winning)))).toBeNull();
  });

  // The End Turn click and the dialog it opens both ask; the search runs once.
  it("computes the advice once until the state or the draft changes", () => {
    store.ui.bannerDraft = { [producing.id]: null };
    const s = session(base);
    const first = ix.bannerWarningFor(s, ix.legalFor(s));
    expect(first).not.toBeNull();
    expect(ix.bannerWarningFor(s, ix.legalFor(s))).toBe(first);
    // A new state (a command landed) asks again.
    const next = ix.bannerWarningFor(session({ ...base }), ix.legalFor(s));
    expect(next).not.toBe(first);
    expect(next).toEqual(first);
    // So does a new draft.
    store.ui.bannerDraft = {};
    expect(ix.bannerWarningFor(s, ix.legalFor(s))).toBeNull();
  });

  it("returns null outside the Banner Assignment phase", () => {
    store.ui.bannerDraft = { [producing.id]: null };
    const main = { ...base, phase: "main" } as GameState;
    expect(ix.legalFor(session(main))?.mode).toBe("main");
    expect(ix.bannerWarningFor(session(main), ix.legalFor(session(main)))).toBeNull();
    expect(ix.bannerWarningFor(session(base), null)).toBeNull();
  });
});
