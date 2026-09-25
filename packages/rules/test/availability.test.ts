import { describe, expect, it } from "vitest";
import {
  clone,
  getActionAvailability,
  getLegalActions,
  standardRuleset,
  type GameState,
  type PlayerAction,
  type PlayerId,
  type Resources,
} from "../src/index.js";
import { act, engine, mvpRuleset, passTurn, setupGame } from "./helpers.js";

const ctx = engine.ctx;

/** Set a player's resources exactly (test-only; state is plain JSON). */
function withResources(state: GameState, playerId: PlayerId, res: Partial<Resources>): GameState {
  const s = clone(state);
  const p = s.players[playerId];
  if (!p) throw new Error("no player");
  p.resources = { grain: 0, timber: 0, stone: 0, iron: 0, essence: 0, ...res };
  return s;
}

describe("getActionAvailability", () => {
  it("reports the shortfall when a target exists but the player is short", () => {
    const { state, p1 } = setupGame();
    const a = getActionAvailability(ctx, withResources(state, p1, { timber: 1 }), p1);
    expect(a.route).toMatchObject({ ok: false, reason: "NEED_RESOURCES", missing: { stone: 1 }, missingAny: 0 });
    expect(a.route.cost).toEqual({ timber: 1, stone: 1 });
    expect(a.route.fixByTrade).toBeUndefined();
  });

  it("reports NO_TARGET rather than resources when nowhere is legal", () => {
    const { state, p1 } = setupGame();
    // p1's Route ends (s2, s6) are both next to a Holding.
    const a = getActionAvailability(ctx, withResources(state, p1, { grain: 5, timber: 5, stone: 5 }), p1);
    expect(a.manor).toMatchObject({ ok: false, reason: "NO_TARGET" });
    expect(a.route.ok).toBe(true);
    const poor = getActionAvailability(ctx, withResources(state, p1, {}), p1);
    expect(poor.manor.reason).toBe("NO_TARGET");
  });

  it("reports LIMIT_REACHED for the Market and the Warden", () => {
    const { state, p1 } = setupGame();
    let s = withResources(state, p1, { timber: 9, essence: 2, grain: 2 });
    s = act(s, p1, { type: "trade", give: "timber", receive: "iron" }).state;
    expect(getActionAvailability(ctx, s, p1).market).toMatchObject({ ok: true, tradesLeft: 1 });
    s = act(s, p1, { type: "trade", give: "timber", receive: "iron" }).state;
    s = act(s, p1, { type: "hire_warden", menaceId: "menace_toll_troll", destination: { kind: "region", regionId: "R5" } }).state;
    const a = getActionAvailability(ctx, s, p1);
    expect(a.market).toMatchObject({ ok: false, reason: "LIMIT_REACHED", tradesLeft: 0 });
    expect(a.warden).toMatchObject({ ok: false, reason: "LIMIT_REACHED" });
  });

  it("explains an empty Market as NO_TRADE_GIVE", () => {
    const { state, p1 } = setupGame();
    const a = getActionAvailability(ctx, withResources(state, p1, { grain: 2, timber: 2 }), p1);
    expect(a.market).toMatchObject({ ok: false, reason: "NO_TRADE_GIVE", tradesLeft: 2 });
  });

  it("finds a one-trade fix at the Market", () => {
    const { state, p1 } = setupGame();
    const a = getActionAvailability(ctx, withResources(state, p1, { timber: 1, grain: 3 }), p1);
    expect(a.route.reason).toBe("NEED_RESOURCES");
    expect(a.route.fixByTrade).toEqual([{ give: "grain", receive: "stone" }]);
  });

  it("finds a two-trade fix and never trades away what the action needs", () => {
    const { state, p1 } = setupGame();
    const a = getActionAvailability(ctx, withResources(state, p1, { grain: 6 }), p1);
    expect(a.route.fixByTrade).toEqual([
      { give: "grain", receive: "timber" },
      { give: "grain", receive: "stone" },
    ]);
    // Card needs Grain + Iron + Essence; 4 Grain can only fund one trade and
    // keep a Grain, so no fix exists.
    const card = getActionAvailability(ctx, withResources(state, p1, { grain: 4 }), p1);
    expect(card.card.reason).toBe("FEATURE_DISABLED");
    const std = setupGame(standardRuleset(2));
    const b = getActionAvailability(ctx, withResources(std.state, std.p1, { grain: 4 }), std.p1);
    expect(b.card).toMatchObject({ ok: false, reason: "NEED_RESOURCES", missing: { iron: 1, essence: 1 } });
    expect(b.card.fixByTrade).toBeUndefined();
  });

  it("offers no fix once the Market trades are used up", () => {
    const { state, p1 } = setupGame();
    let s = withResources(state, p1, { timber: 6, grain: 3 });
    s = act(s, p1, { type: "trade", give: "timber", receive: "iron" }).state;
    s = act(s, p1, { type: "trade", give: "timber", receive: "iron" }).state;
    const a = getActionAvailability(ctx, s, p1);
    expect(a.route).toMatchObject({ reason: "NEED_RESOURCES", missing: { timber: 1, stone: 1 } });
    expect(a.route.fixByTrade).toBeUndefined();
  });

  it("uses a Trading Post when the Market cannot help", () => {
    const { state, p2 } = setupGame();
    const s = withResources(passTurn(state), p2, { stone: 2, essence: 1 });
    const a = getActionAvailability(ctx, s, p2);
    expect(a.warden).toMatchObject({ reason: "NEED_RESOURCES", missing: { grain: 1 } });
    expect(a.warden.fixByTrade).toEqual([{ give: "stone", receive: "grain", tradePostSiteId: "s7" }]);
  });

  it("finds the shortest fix when a ruleset allows more Market trades", () => {
    const rules = (trades: number) => {
      const r = standardRuleset(2);
      r.market.maxTradesPerTurn = trades;
      return r;
    };
    // A Stronghold needs 2 Grain + 2 Iron: four trades at p2's Stone post.
    const fixFor = (trades: number) => {
      const { state, p2 } = setupGame(rules(trades));
      const s = withResources(passTurn(state), p2, { stone: 20 });
      return { s, p2, a: getActionAvailability(ctx, s, p2) };
    };
    expect(fixFor(3).a.upgrade).toMatchObject({ reason: "NEED_RESOURCES", missing: { grain: 2, iron: 2 } });
    expect(fixFor(3).a.upgrade.fixByTrade).toBeUndefined();

    const { s, p2, a } = fixFor(6);
    const fix = a.upgrade.fixByTrade ?? [];
    expect(fix).toHaveLength(4);
    // The returned trades are a real sequence: making them affords the action.
    const after = fix.reduce((st, trade) => act(st, p2, { type: "trade", ...trade }).state, s);
    expect(getActionAvailability(ctx, after, p2).upgrade.ok).toBe(true);
  });

  it("counts the Royal Writ bribe as one resource of any kind", () => {
    const { state, p1 } = setupGame();
    const a = getActionAvailability(ctx, withResources(state, p1, { essence: 1 }), p1);
    expect(a.writ.cost).toEqual({ essence: 1 });
    expect(a.writ.extraAny).toBe(1);
    // No settled rival Banner next to p1 on turn 1.
    expect(a.writ.reason).toBe("NO_TARGET");
  });

  it("reports DECK_EMPTY when no card can be drawn", () => {
    const { state, p1 } = setupGame(standardRuleset(2));
    const s = withResources(state, p1, { grain: 1, iron: 1, essence: 1 });
    expect(getActionAvailability(ctx, s, p1).card.ok).toBe(true);
    const empty = { ...s, cardDeck: [], discardPile: [] };
    expect(getActionAvailability(ctx, empty, p1).card.reason).toBe("DECK_EMPTY");
  });

  it("reports WRONG_PHASE outside the player's Main phase", () => {
    const { state, p1, p2 } = setupGame();
    expect(getActionAvailability(ctx, state, p2).route.reason).toBe("WRONG_PHASE");
    const s = act(state, p1, { type: "end_main_phase" }).state;
    expect(getActionAvailability(ctx, s, p1).manor.reason).toBe("WRONG_PHASE");
  });

  it("agrees with getLegalActions on what is available", () => {
    const flags: Record<PlayerAction, (l: ReturnType<typeof getLegalActions>) => boolean> = {
      route: (l) => l.routes.length > 0,
      manor: (l) => l.manorSites.length > 0,
      upgrade: (l) => l.upgradeSites.length > 0,
      market: (l) => l.marketTradesLeft > 0 && l.marketGive.length + l.tradePosts.length > 0,
      writ: (l) => l.canIssueWrit,
      warden: (l) => l.canHireWarden,
      card: (l) => l.canBuyCard,
    };
    for (const rs of [mvpRuleset(), standardRuleset(2)]) {
      const { state, p1 } = setupGame(rs);
      // Turn 2 for p1, so Banners are settled and Writs may have targets.
      const later = passTurn(passTurn(state));
      for (const base of [state, later]) {
        for (let n = 0; n < 60; n++) {
          const res = { grain: n % 4, timber: (n >> 1) % 3, stone: (n >> 2) % 3, iron: (n >> 3) % 3, essence: (n * 7) % 3 };
          const s = withResources(base, p1, res);
          const legal = getLegalActions(ctx, s, p1);
          const avail = getActionAvailability(ctx, s, p1);
          for (const k of Object.keys(flags) as PlayerAction[]) expect(avail[k].ok, `${k} with ${JSON.stringify(res)}`).toBe(flags[k](legal));
        }
      }
    }
  });
});
