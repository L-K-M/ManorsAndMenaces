// Why a card can't be played, or a starting Manor or Route can't go where
// the player tapped: the reasons a UI shows instead of silently ignoring the
// tap (spec §103). Each must agree with the legality it explains.

import { describe, expect, it } from "vitest";
import {
  clone,
  getCardPlayability,
  getLegalActions,
  getLegalInitialManorSites,
  getLegalInitialRoutes,
  getRenown,
  initialManorClosedReason,
  initialRouteClosedReason,
  HIDDEN_CARD,
  type GameState,
  type PlayerId,
} from "../src/index.js";
import { act, cardTestRuleset, engine, give, newGame, passTurn, routeId, setupGame, testContent } from "./helpers.js";

const ctx = engine.ctx;
const lastCard = (s: GameState, p: PlayerId): string => s.players[p]?.hand.at(-1) as string;

/** Deals a card of definition `def` to `p`, returning the state and its card id. */
function dealt(s: GameState, p: PlayerId, def: string): { s: GameState; card: string } {
  const next = give(s, p, def);
  return { s: next, card: lastCard(next, p) };
}

describe("getCardPlayability", () => {
  it("allows a card with a target in the player's Main phase", () => {
    const { state, p1 } = setupGame(cardTestRuleset(2));
    const { s, card } = dealt(state, p1, "festival_at_the_inn");
    expect(getCardPlayability(ctx, s, p1, card)).toEqual({ ok: true });
  });

  it("says a Counterspell only answers a Spell", () => {
    const { state, p1 } = setupGame(cardTestRuleset(2));
    const { s, card } = dealt(state, p1, "counterspell");
    expect(getCardPlayability(ctx, s, p1, card)).toEqual({ ok: false, reason: "REACTION_ONLY" });
  });

  it("waits for the player's own Main phase", () => {
    const { state, p1, p2 } = setupGame(cardTestRuleset(2));
    const theirs = dealt(state, p2, "festival_at_the_inn");
    expect(getCardPlayability(ctx, theirs.s, p2, theirs.card)).toEqual({ ok: false, reason: "WRONG_PHASE" });
    const mine = dealt(state, p1, "festival_at_the_inn");
    const later = act(mine.s, p1, { type: "end_main_phase" }).state;
    expect(getCardPlayability(ctx, later, p1, mine.card)).toEqual({ ok: false, reason: "WRONG_PHASE" });
  });

  it("stops once the turn's cards are played", () => {
    const { state, p1 } = setupGame(cardTestRuleset(2));
    const first = dealt(state, p1, "festival_at_the_inn");
    const second = dealt(first.s, p1, "festival_at_the_inn");
    const s = act(second.s, p1, { type: "play_card", cardId: first.card, target: { effect: "festival_at_the_inn", choice: "grain" } }).state;
    expect(getCardPlayability(ctx, s, p1, second.card)).toEqual({ ok: false, reason: "LIMIT_REACHED" });
  });

  it("reports a card with nothing to target", () => {
    const { state, p1, p2 } = setupGame(cardTestRuleset(2));
    // Nobody is ahead at the start, so the Unreliable Bard has no one to trail.
    expect(getRenown(ctx, state, p2)).toBe(getRenown(ctx, state, p1));
    const { s, card } = dealt(state, p1, "unreliable_bard");
    expect(getCardPlayability(ctx, s, p1, card)).toEqual({ ok: false, reason: "NO_TARGET" });
  });

  it("puts cards being off before everything else", () => {
    const { state, p1, p2 } = setupGame(cardTestRuleset(2));
    const { s, card } = dealt(state, p2, "festival_at_the_inn");
    const off = { ...s, ruleset: { ...s.ruleset, enableCards: false } };
    expect(getCardPlayability(ctx, off, p1, card)).toEqual({ ok: false, reason: "FEATURE_DISABLED" });
  });

  it("refuses a card the player doesn't hold, or can't see", () => {
    const { state, p1, p2 } = setupGame(cardTestRuleset(2));
    const { s, card } = dealt(state, p2, "festival_at_the_inn");
    expect(getCardPlayability(ctx, s, p1, card)).toEqual({ ok: false, reason: "NOT_IN_HAND" });
    expect(getCardPlayability(ctx, s, p1, HIDDEN_CARD)).toEqual({ ok: false, reason: "NOT_IN_HAND" });
  });

  it("agrees with getLegalActions on every card, in and out of turn", () => {
    const { state, p1, p2 } = setupGame(cardTestRuleset(2));
    // Every card, dealt to both players by state surgery: a debug draw takes
    // from the deck, which holds too few copies of some and none of others.
    const defs = testContent().cards.map((c) => c.id);
    const outcomes = new Set<boolean>();
    for (const base of [state, passTurn(state), passTurn(passTurn(state))]) {
      const s = clone(base);
      for (const pid of [p1, p2]) (s.players[pid] as GameState["players"][string]).hand = [...defs];
      for (const pid of [p1, p2]) {
        const playable = getLegalActions(ctx, s, pid).playableCards;
        for (const card of s.players[pid]?.hand ?? []) {
          const ok = getCardPlayability(ctx, s, pid, card).ok;
          expect(ok, card).toBe(playable.includes(card));
          outcomes.add(ok);
        }
      }
    }
    expect([...outcomes].sort()).toEqual([false, true]);
  });
});

describe("starting placements", () => {
  it("explains a taken Site, and one next to a Holding", () => {
    let s = newGame(cardTestRuleset(2));
    while (s.pending?.kind === "charge") s = act(s, s.pending.playerId, { type: "choose_charge", chargeId: s.pending.chargeIds[0] as string }).state;
    const [p1, p2] = s.turnOrder as [PlayerId, PlayerId];
    s = act(s, p1, { type: "place_initial_manor", siteId: "s1" }).state;
    s = act(s, p1, { type: "place_initial_route", routeId: routeId(1, 2) }).state;
    expect(s.setup?.placementOrder[s.setup.placementIndex]).toBe(p2);
    expect(initialManorClosedReason(ctx, s, "s1")).toBe("SITE_OCCUPIED");
    expect(initialManorClosedReason(ctx, s, "s2")).toBe("SITE_TOO_CLOSE");
    expect(initialManorClosedReason(ctx, s, "s9")).toBeNull();
    const open = ctx.board.topology.sites.map((x) => x.id).filter((id) => initialManorClosedReason(ctx, s, id) === null);
    expect(open).toEqual(getLegalInitialManorSites(ctx, s));
  });

  it("explains a taken Route, and one away from the Manor just placed", () => {
    let s = newGame(cardTestRuleset(2));
    while (s.pending?.kind === "charge") s = act(s, s.pending.playerId, { type: "choose_charge", chargeId: s.pending.chargeIds[0] as string }).state;
    const [p1, p2] = s.turnOrder as [PlayerId, PlayerId];
    s = act(s, p1, { type: "place_initial_manor", siteId: "s1" }).state;
    s = act(s, p1, { type: "place_initial_route", routeId: routeId(1, 2) }).state;
    s = act(s, p2, { type: "place_initial_manor", siteId: "s3" }).state;
    expect(initialRouteClosedReason(ctx, s, routeId(1, 2))).toBe("ROUTE_OCCUPIED");
    expect(initialRouteClosedReason(ctx, s, routeId(7, 8))).toBe("NOT_CONNECTED");
    expect(initialRouteClosedReason(ctx, s, routeId(3, 6))).toBeNull();
    const open = ctx.board.topology.routes.map((r) => r.id).filter((id) => initialRouteClosedReason(ctx, s, id) === null);
    expect(open.sort()).toEqual([...getLegalInitialRoutes(ctx, s)].sort());
  });
});
