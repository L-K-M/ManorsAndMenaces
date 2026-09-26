// The second wave of cards (spec §19.12–19.21): legality, target enumeration,
// resolution, events and the edge cases the rules text calls out.

import { describe, expect, it } from "vitest";
import {
  BALANCE,
  checkBuildRoute,
  clone,
  createRng,
  dragonsLandingTargets,
  enumerateCardTargets,
  getHarvestPreview,
  getLegalActions,
  getRenown,
  hashState,
  insurancePolicyOf,
  isSmoulderingFor,
  plagueBanners,
  rankPlayers,
  redactEvent,
  redactState,
  seedRng,
  validateCardTarget,
  HIDDEN_CARD,
  RULESET_VERSION,
  RuleViolation,
  type Banner,
  type CardTarget,
  type GameCommand,
  type GameEvent,
  type GameState,
  type MenaceType,
  type PlayerId,
  type ResourceType,
} from "../src/index.js";
import { act, cmd, engine, give, grant, mvpRuleset, newGame, passTurn, reject, routeId, setupGame, standardRuleset } from "./helpers.js";

const ctx = engine.ctx;
const MENACE_RULESET = { ...standardRuleset(2), activeMenaces: ["toll_troll" as const, "young_dragon" as const, "highwayman" as const] };

type Player = GameState["players"][string];
const player = (s: GameState, p: PlayerId): Player => s.players[p] as Player;
const lastCard = (s: GameState, p: PlayerId): string => player(s, p).hand.at(-1) as string;

/** A copy of `s` changed in place by `change` (test-only state surgery). */
function edit(s: GameState, change: (c: GameState) => void): GameState {
  const c = clone(s);
  change(c);
  return c;
}

/** Sets a player's Renown by adjusting their bonus Renown. */
const withRenown = (s: GameState, p: PlayerId, renown: number): GameState =>
  edit(s, (c) => {
    player(c, p).bonusRenown += renown - getRenown(ctx, c, p);
  });

/** Replaces a player's resources. */
const withResources = (s: GameState, p: PlayerId, res: Partial<Record<ResourceType, number>>): GameState =>
  edit(s, (c) => {
    player(c, p).resources = { grain: 0, timber: 0, stone: 0, iron: 0, essence: 0, ...res };
  });

/** Deals a card of definition `def` to `p`, returning the state and its card id. */
function dealt(s: GameState, p: PlayerId, def: string): { s: GameState; card: string } {
  const next = give(s, p, def);
  return { s: next, card: lastCard(next, p) };
}

const play = (s: GameState, p: PlayerId, cardId: string, target: CardTarget) => act(s, p, { type: "play_card", cardId, target });
const refuse = (s: GameState, p: PlayerId, cardId: string, target: unknown, code: string) =>
  reject(s, p, { type: "play_card", cardId, target: target as CardTarget }, code);

/**
 * The card is offered in getLegalActions exactly when it has a target, and the
 * engine accepts every target enumerated. Returns the targets.
 */
function offered(s: GameState, p: PlayerId, card: string): CardTarget[] {
  const targets = enumerateCardTargets(ctx, s, p, card);
  expect(getLegalActions(ctx, s, p).playableCards.includes(card), `${card} offered`).toBe(targets.length > 0);
  for (const target of targets)
    expect(engine.applyCommand(s, cmd(s, p, { type: "play_card", cardId: card, target })).error, JSON.stringify(target)).toBeUndefined();
  return targets;
}

/** The code validateCardTarget throws for this target, or null if it is valid. */
function violation(s: GameState, p: PlayerId, card: string, target: CardTarget): string | null {
  try {
    validateCardTarget(ctx, s, p, card, target);
    return null;
  } catch (e) {
    if (e instanceof RuleViolation) return e.code;
    throw e;
  }
}

/** Ends the active player's turn; the events include the next player's Harvest. */
function endTurn(state: GameState): { state: GameState; events: GameEvent[] } {
  const p = state.activePlayerId;
  let s = state;
  if (s.phase === "main") s = act(s, p, { type: "end_main_phase" }).state;
  if (s.phase === "banner_assignment") s = act(s, p, { type: "assign_banners", assignments: {} }).state;
  return act(s, p, { type: "end_turn" });
}

const ofType = <T extends GameEvent["type"]>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

const bannersAt = (s: GameState, siteId: string): Banner[] => Object.values(s.banners).filter((b) => s.holdings[b.holdingId]?.siteId === siteId);

/** Every Banner an ActiveEffect points at still exists. */
function expectNoDanglingEffects(s: GameState): void {
  for (const e of s.activeEffects) if ("bannerId" in e) expect(s.banners[e.bannerId], `${e.kind} on ${e.bannerId}`).toBeDefined();
}

/** Puts a Royal Insurance Policy in front of `p` without spending their card play on it. */
function insure(s: GameState, p: PlayerId): { s: GameState; policy: string } {
  const { s: withCard, card } = dealt(s, p, "royal_insurance_policy");
  const next = edit(withCard, (c) => {
    const pl = player(c, p);
    pl.hand = pl.hand.filter((x) => x !== card);
    pl.charters = [...(pl.charters ?? []), card];
  });
  return { s: next, policy: card };
}

/** The first player builds a third Manor on s5 (through s2–s5): now a Dragon's Landing target. */
function thirdManor(s: GameState, p1: PlayerId): GameState {
  let next = grant(s, p1, { grain: 1, timber: 2, stone: 2 });
  next = act(next, p1, { type: "build_route", routeId: routeId(2, 5) }).state;
  return act(next, p1, { type: "build_manor", siteId: "s5" }).state;
}

/**
 * A game of `renown.length` players in its first Main phase, with that Renown
 * per seat. Their Manors would not fit the 3×3 test board, so setup is
 * skipped by hand and all Renown is bonus Renown.
 */
function seatedGame(renown: number[]): GameState {
  const s = engine.createGame({
    matchId: "seated",
    seed: "seated",
    rulesetVersion: RULESET_VERSION,
    ruleset: standardRuleset(renown.length),
    players: renown.map((_, i) => ({ id: `P${i + 1}`, displayName: `P${i + 1}` })),
  });
  return edit(s, (c) => {
    c.status = "playing";
    delete c.setup;
    c.round = 1;
    c.phase = "main";
    c.activePlayerId = c.turnOrder[0] as PlayerId;
    c.turnOrder.forEach((id, i) => (player(c, id).bonusRenown = renown[i] as number));
  });
}

// ---------------------------------------------------------------- Changeling

describe("Changeling (§19.12)", () => {
  /** p1 holds Changeling and an Arcane Exchange; p2 holds `p2Cards`. */
  function ready(p2Cards = ["knight_errant", "festival_at_the_inn"]) {
    const g = setupGame(standardRuleset(2));
    let { s, card } = dealt(give(g.state, g.p1, "arcane_exchange"), g.p1, "changeling");
    for (const c of p2Cards) s = give(s, g.p2, c);
    return { ...g, s, card };
  }
  const swapWith = (opponentId: PlayerId): CardTarget => ({ effect: "changeling", opponentId });

  it("swaps whole hands with an opponent; the Changeling itself has left the caster's hand", () => {
    const { s, p1, p2, card } = ready();
    const mine = player(s, p1).hand.filter((c) => c !== card);
    const theirs = [...player(s, p2).hand];
    expect(offered(s, p1, card)).toEqual([swapWith(p2)]);

    const { state, events } = play(s, p1, card, swapWith(p2));
    expect(player(state, p1).hand).toEqual(theirs);
    expect(player(state, p2).hand).toEqual(mine);
    expect(state.discardPile).toContain(card);
    // Counts only: the event names no card, so every viewer may see it whole.
    const swapped = ofType(events, "hands_swapped");
    expect(swapped).toEqual([{ type: "hands_swapped", playerId: p1, opponentId: p2, handSize: 2, opponentHandSize: 1 }]);
    for (const viewer of [p1, p2, null]) expect(redactEvent(swapped[0] as GameEvent, viewer)).toEqual(swapped[0]);
  });

  it("leaves each viewer seeing only their own new hand", () => {
    const { s, p1, p2, card } = ready();
    const mine = player(s, p1).hand.filter((c) => c !== card);
    const theirs = [...player(s, p2).hand];
    // Hand sizes are public, so the caster's redacted view offers the swap too.
    expect(enumerateCardTargets(ctx, redactState(s, p1), p1, card)).toEqual([swapWith(p2)]);

    const { state } = play(s, p1, card, swapWith(p2));
    const asP1 = redactState(state, p1);
    const asP2 = redactState(state, p2);
    expect(player(asP1, p1).hand).toEqual(theirs);
    expect(player(asP1, p2).hand).toEqual(mine.map(() => HIDDEN_CARD));
    expect(player(asP2, p2).hand).toEqual(mine);
    expect(player(asP2, p1).hand).toEqual(theirs.map(() => HIDDEN_CARD));
    const spectator = redactState(state, null);
    for (const p of [p1, p2]) expect(player(spectator, p).hand.every((c) => c === HIDDEN_CARD)).toBe(true);
  });

  it("needs an opponent who holds at least 1 card", () => {
    const { s, p1, p2, card } = ready([]);
    expect(offered(s, p1, card)).toEqual([]);
    expect(offered(redactState(s, p1), p1, card)).toEqual([]);
    refuse(s, p1, card, swapWith(p2), "INVALID_CARD_TARGET");
    refuse(give(s, p2, "knight_errant"), p1, card, swapWith(p1), "INVALID_CARD_TARGET");
    refuse(give(s, p2, "knight_errant"), p1, card, swapWith("nobody"), "INVALID_CARD_TARGET");
  });

  it("may leave the opponent with nothing when the caster's hand is otherwise empty", () => {
    const g = setupGame(standardRuleset(2));
    const { s: withCard, card } = dealt(give(g.state, g.p2, "knight_errant"), g.p1, "changeling");
    const { state, events } = play(withCard, g.p1, card, swapWith(g.p2));
    expect(player(state, g.p2).hand).toEqual([]);
    expect(player(state, g.p1).hand).toHaveLength(1);
    expect(ofType(events, "hands_swapped")[0]).toMatchObject({ handSize: 1, opponentHandSize: 0 });
  });

  it("is a Spell: a Counterspell stops it, and an unused one changes hands", () => {
    const { s, p1, p2, card } = ready(["counterspell", "knight_errant"]);
    const pending = play(s, p1, card, swapWith(p2)).state;
    expect(pending.pending?.kind).toBe("reaction");
    const counter = player(pending, p2).hand.find((c) => c.startsWith("counterspell#")) as string;

    const countered = act(pending, p2, { type: "react", cardId: counter });
    expect(ofType(countered.events, "hands_swapped")).toEqual([]);
    expect(player(countered.state, p1).hand).toEqual(player(s, p1).hand.filter((c) => c !== card));
    expect(player(countered.state, p2).hand).toEqual(player(s, p2).hand.filter((c) => c !== counter));

    // Passing instead lets the swap resolve with the Counterspell still in hand.
    const passed = act(pending, p2, { type: "pass_reaction" }).state;
    expect(player(passed, p1).hand).toContain(counter);
  });
});

// ---------------------------------------------------------------- Ragnarök

describe("Ragnarök (§19.13)", () => {
  /** The first turn, with Ragnarök still set aside. */
  function omen() {
    const g = setupGame(standardRuleset(2));
    return { ...g, threshold: g.state.ruleset.targetRenown - BALANCE.ragnarok.omenGap };
  }
  /** p1 holds Ragnarök (dealt from the set-aside pile). */
  function ready() {
    const g = setupGame(standardRuleset(2));
    const { s, card } = dealt(g.state, g.p1, "ragnarok");
    return { ...g, s, card };
  }
  const RAGNAROK: CardTarget = { effect: "ragnarok" };

  it("is set aside face up at setup, outside the draw pile", () => {
    const s = newGame(standardRuleset(2));
    expect(s.setAsideCardIds).toEqual(["ragnarok#1"]);
    expect(s.cardDeck.some((c) => c.startsWith("ragnarok#"))).toBe(false);
    expect(redactState(s, null).setAsideCardIds).toEqual(["ragnarok#1"]);
    // Without cards nothing is set aside.
    expect(newGame(mvpRuleset()).setAsideCardIds).toEqual([]);
  });

  it("joins the draw pile, publicly, once anyone is within omenGap Renown of the target", () => {
    const { state, p1, p2, threshold } = omen();
    // p2 is not the player ending the turn: anyone's Renown counts.
    const short = endTurn(withRenown(state, p2, threshold - 1));
    expect(ofType(short.events, "card_foretold")).toEqual([]);
    expect(short.state.setAsideCardIds).toEqual(["ragnarok#1"]);

    const before = withRenown(state, p2, threshold);
    const r = endTurn(before);
    const foretold = ofType(r.events, "card_foretold");
    expect(foretold).toEqual([{ type: "card_foretold", cardId: "ragnarok#1" }]);
    for (const viewer of [p1, p2, null]) expect(redactEvent(foretold[0] as GameEvent, viewer)).toEqual(foretold[0]);
    expect(r.state.setAsideCardIds).toEqual([]);
    expect([...r.state.cardDeck].sort()).toEqual([...before.cardDeck, "ragnarok#1"].sort());
    // Foretold once only.
    expect(ofType(endTurn(r.state).events, "card_foretold")).toEqual([]);
  });

  it("lands at a position drawn from the match RNG", () => {
    const { state, p2, threshold } = omen();
    const at = (seed: string): number => {
      const s = edit(withRenown(state, p2, threshold), (c) => (c.rngState = createRng(seedRng(seed)).state));
      const first = endTurn(s).state;
      // Same state, same position.
      expect(endTurn(s).state.cardDeck).toEqual(first.cardDeck);
      return first.cardDeck.indexOf("ragnarok#1");
    };
    const positions = new Set(Array.from({ length: 12 }, (_, i) => at(`omen-${i}`)));
    expect(positions.size).toBeGreaterThan(1);
  });

  it("is not foretold when the turn ends in a normal win", () => {
    const { state, p1 } = omen();
    const target = state.ruleset.targetRenown;
    const r = endTurn(withRenown(state, p1, target));
    expect(r.state.status).toBe("finished");
    expect(ofType(r.events, "game_won")).toEqual([{ type: "game_won", playerId: p1, renown: target }]);
    expect(ofType(r.events, "card_foretold")).toEqual([]);
  });

  it("does nothing at the omen for a state saved before cards were set aside", () => {
    const { state, p2, threshold } = omen();
    const old = edit(withRenown(state, p2, threshold), (c) => delete c.setAsideCardIds);
    expect(ofType(endTurn(old).events, "card_foretold")).toEqual([]);
  });

  it("may be played only when no rival has more Renown; ties are allowed", () => {
    const { s, p1, p2, card } = ready();
    expect(offered(s, p1, card)).toEqual([RAGNAROK]);
    expect(offered(withRenown(s, p1, 3), p1, card)).toEqual([RAGNAROK]);
    const behind = withRenown(s, p2, 3);
    expect(offered(behind, p1, card)).toEqual([]);
    refuse(behind, p1, card, RAGNAROK, "INVALID_CARD_TARGET");
  });

  it("ends the game at once, even below the target Renown", () => {
    const { s: base, p1, p2, card } = ready();
    const s = withRenown(withRenown(base, p1, 5), p2, 3);
    const { state, events } = play(s, p1, card, RAGNAROK);
    expect(state.status).toBe("finished");
    expect(state.winnerId).toBe(p1);
    expect(state.endCause).toBe("ragnarok");
    expect(state.pending).toBeUndefined();
    expect(state.discardPile).toContain(card);
    expect(ofType(events, "game_won")).toEqual([{ type: "game_won", playerId: p1, renown: 5, cause: "ragnarok" }]);
    expect(getRenown(ctx, state, p1)).toBeLessThan(state.ruleset.targetRenown);
    expect(events.map((e) => e.type).slice(-2)).toEqual(["card_resolved", "game_won"]);
    reject(state, p1, { type: "end_main_phase" }, "GAME_NOT_ACTIVE");
  });

  it("crowns the §7 leader, who need not be the caster", () => {
    const { s: base, p1, p2, card } = ready();
    // Tied on Renown, Quests and Strongholds: the most resources wins.
    const s = withResources(withResources(base, p1, { grain: 1 }), p2, { iron: 3 });
    expect(rankPlayers(ctx, s, s.turnOrder)).toEqual([p2, p1]);
    const r = play(s, p1, card, RAGNAROK);
    expect(r.state.winnerId).toBe(p2);
    expect(ofType(r.events, "game_won")).toEqual([{ type: "game_won", playerId: p2, renown: 2, cause: "ragnarok" }]);
    // Tied on everything: the earlier seat wins.
    const even = withResources(s, p2, { grain: 1 });
    expect(play(even, p1, card, RAGNAROK).state.winnerId).toBe(even.turnOrder[0]);
    // Claimed Quests come before resources.
    const quester = edit(withRenown(s, p1, 3), (c) => player(c, p2).claimedQuestIds.push("monster_problems"));
    expect(getRenown(ctx, quester, p2)).toBe(3);
    expect(rankPlayers(ctx, withResources(quester, p1, { grain: 9 }), quester.turnOrder)).toEqual([p2, p1]);
  });

  it("can be Counterspelled, and the game goes on", () => {
    const { s: base, p1, p2, card } = ready();
    const s = give(base, p2, "counterspell");
    const pending = play(s, p1, card, RAGNAROK).state;
    expect(pending.pending?.kind).toBe("reaction");
    const r = act(pending, p2, { type: "react", cardId: lastCard(pending, p2) });
    expect(r.state.status).toBe("playing");
    expect(ofType(r.events, "card_cancelled")).toHaveLength(1);
    expect(ofType(r.events, "game_won")).toEqual([]);
    // Unanswered, it ends the game when the window closes.
    const passed = act(pending, p2, { type: "pass_reaction" });
    expect(passed.state.status).toBe("finished");
    expect(ofType(passed.events, "game_won")[0]?.cause).toBe("ragnarok");
  });
});

// ---------------------------------------------------------------- Fire Bolt

describe("Fire Bolt (§19.14)", () => {
  function ready() {
    const g = setupGame(standardRuleset(2));
    const { s, card } = dealt(g.state, g.p1, "fire_bolt");
    return { ...g, s, card };
  }
  const bolt = (r: string): CardTarget => ({ effect: "fire_bolt", routeId: r });
  const routesOf = (targets: CardTarget[]) => targets.map((t) => (t.effect === "fire_bolt" ? t.routeId : "")).sort();
  /** Gives `p` the bridge s8–s9 (both ownership records). */
  const withBridge = (s: GameState, p: PlayerId): GameState =>
    edit(s, (c) => {
      c.routeOwners["r89"] = p;
      player(c, p).routeIds.push("r89");
    });

  it("targets any opponent's Route while they own no bridge", () => {
    const { s, p1, card } = ready();
    expect(ctx.board.route("r89").kind).toBe("bridge");
    expect(routesOf(offered(s, p1, card))).toEqual(["r36", "r78"]);
    refuse(s, p1, card, bolt("r12"), "INVALID_CARD_TARGET"); // own
    refuse(s, p1, card, bolt("r25"), "INVALID_CARD_TARGET"); // unowned
    refuse(s, p1, card, bolt("r99"), "INVALID_CARD_TARGET"); // unknown
  });

  it("must burn a bridge while the opponent owns one", () => {
    const { s: base, p1, p2, card } = ready();
    const s = withBridge(base, p2);
    expect(routesOf(offered(s, p1, card))).toEqual(["r89"]);
    refuse(s, p1, card, bolt("r36"), "INVALID_CARD_TARGET");
    // A bridge of the caster's own does not count.
    expect(routesOf(offered(withBridge(base, p1), p1, card))).toEqual(["r36", "r78"]);
  });

  it("leaves the Route unowned and smouldering", () => {
    const { s, p1, p2, card } = ready();
    const { state, events } = play(s, p1, card, bolt("r36"));
    expect(ofType(events, "route_burned")).toEqual([{ type: "route_burned", byPlayerId: p1, ownerId: p2, routeId: "r36" }]);
    expect(state.routeOwners["r36"]).toBeUndefined();
    expect(player(state, p2).routeIds).toEqual(["r78"]);
    expect(state.activeEffects).toEqual([{ kind: "smouldering", routeId: "r36", ownerId: p2, sourcePlayerId: p1 }]);
    expect(state.discardPile).toContain(card);
    expect(isSmoulderingFor(state, "r36", p1)).toBe(true);
    expect(isSmoulderingFor(state, "r36", p2)).toBe(false);
  });

  it("lets only its former owner rebuild it, which puts it out", () => {
    const { s, p1, p2, card } = ready();
    // r36 touches s6, which p1 reaches through s6–s9: only the embers stop them.
    const burned = grant(play(s, p1, card, bolt("r36")).state, p1, { timber: 1, stone: 1 });
    expect(checkBuildRoute(ctx, burned, p1, "r36")).toEqual({ legal: false, reason: "ROUTE_SMOULDERING" });
    expect(getLegalActions(ctx, burned, p1).routes).not.toContain("r36");
    reject(burned, p1, { type: "build_route", routeId: "r36" }, "ROUTE_SMOULDERING");

    const theirTurn = grant(passTurn(burned), p2, { timber: 1, stone: 1 });
    expect(getLegalActions(ctx, theirTurn, p2).routes).toContain("r36");
    const rebuilt = act(theirTurn, p2, { type: "build_route", routeId: "r36" }).state;
    expect(rebuilt.routeOwners["r36"]).toBe(p2);
    expect(rebuilt.activeEffects).toEqual([]);
  });

  it("cools at the end of the owner's next turn", () => {
    const { s, p1, p2, card } = ready();
    const burned = play(s, p1, card, bolt("r36")).state;
    // The caster's turn ending does not count.
    const theirTurn = passTurn(burned);
    expect(theirTurn.activeEffects).toHaveLength(1);
    const r = endTurn(theirTurn);
    expect(ofType(r.events, "effect_expired")).toEqual([{ type: "effect_expired", effect: "smouldering", playerId: p2 }]);
    expect(r.state.activeEffects).toEqual([]);
    const rebuilt = act(grant(r.state, p1, { timber: 1, stone: 1 }), p1, { type: "build_route", routeId: "r36" }).state;
    expect(rebuilt.routeOwners["r36"]).toBe(p1);
  });
});

// ---------------------------------------------------------------- Dragon's Landing

describe("Dragon's Landing (§19.15)", () => {
  const LANDING: CardTarget = { effect: "dragons_landing" };

  it(`strikes only players with at least ${BALANCE.dragonsLanding.minHoldings} Holdings, the caster included`, () => {
    const g = setupGame(standardRuleset(2));
    const { s: two, card } = dealt(g.state, g.p1, "dragons_landing");
    expect(dragonsLandingTargets(two)).toEqual([]);
    expect(offered(two, g.p1, card)).toEqual([]);
    refuse(two, g.p1, card, LANDING, "INVALID_CARD_TARGET");

    const three = thirdManor(two, g.p1);
    const pool = dragonsLandingTargets(three);
    expect(pool.map((h) => h.ownerId)).toEqual([g.p1, g.p1, g.p1]);
    expect(new Set(pool.map((h) => h.id))).toEqual(new Set(player(three, g.p1).holdingIds));
    expect(offered(three, g.p1, card)).toEqual([LANDING]);
  });

  it("burns down a Manor with its Banner and every effect on it", () => {
    const g = setupGame(standardRuleset(2));
    let s = thirdManor(g.state, g.p1);
    // p2's turn: they cast it, and only p1's Holdings are in the pool.
    s = passTurn(s);
    const { s: withCard, card } = dealt(give(s, g.p1, "counterspell"), g.p2, "dragons_landing");
    s = edit(withCard, (c) => {
      for (const b of Object.values(c.banners)) if (b.ownerId === g.p1) c.activeEffects.push({ kind: "sick", bannerId: b.id, sourcePlayerId: g.p2 });
    });
    const renown = getRenown(ctx, s, g.p1);

    const { state, events } = play(s, g.p2, card, LANDING);
    // A Story: the Counterspell in p1's hand opens no reaction window.
    expect(state.pending).toBeUndefined();
    const [landed] = ofType(events, "dragon_landed");
    expect(landed).toMatchObject({ byPlayerId: g.p2, ownerId: g.p1 });
    const h = s.holdings[landed?.holdingId as string];
    expect(h?.siteId).toBe(landed?.siteId);
    const lost = bannersAt(s, h?.siteId as string).map((b) => b.id);
    expect(ofType(events, "holding_destroyed")).toEqual([
      { type: "holding_destroyed", byPlayerId: g.p2, ownerId: g.p1, holdingId: h?.id, siteId: h?.siteId, bannerIds: lost },
    ]);
    expect(state.holdings[h?.id as string]).toBeUndefined();
    expect(player(state, g.p1).holdingIds).not.toContain(h?.id);
    for (const b of lost) expect(state.banners[b]).toBeUndefined();
    expectNoDanglingEffects(state);
    expect(state.activeEffects).toHaveLength(2);
    expect(getRenown(ctx, state, g.p1)).toBe(renown - 1);
    expect(state.discardPile).toContain(card);
  });

  // Which Banners stand in a Region (true) or at home, and which one the reduced Stronghold loses.
  it.each([
    { older: true, newer: false, lost: "newer" },
    { older: false, newer: true, lost: "older" },
    { older: true, newer: true, lost: "newer" },
    { older: false, newer: false, lost: "newer" },
  ] as const)("knocks a Stronghold back to a Manor, keeping an assigned Banner first (%o)", (where) => {
    const g = setupGame(standardRuleset(2));
    let s = grant(thirdManor(g.state, g.p1), g.p1, { grain: 6, iron: 6 });
    const older: Record<string, string> = {};
    for (const site of ["s1", "s5", "s9"]) older[site] = (bannersAt(s, site)[0] as Banner).id;
    const newer: Record<string, string> = {};
    for (const site of ["s1", "s5", "s9"]) {
      const r = act(s, g.p1, { type: "upgrade_holding", siteId: site });
      s = r.state;
      newer[site] = ofType(r.events, "holding_upgraded")[0]?.newBannerId as string;
    }
    // Regions next to each Site that no other Banner uses.
    const olderRegion: Record<string, string> = { s1: "R1", s5: "R2", s9: "R8" };
    const newerRegion: Record<string, string> = { s1: "R6", s5: "R4", s9: "R7" };
    s = edit(s, (c) => {
      for (const site of ["s1", "s5", "s9"]) {
        (c.banners[older[site] as string] as Banner).regionId = where.older ? (olderRegion[site] as string) : null;
        (c.banners[newer[site] as string] as Banner).regionId = where.newer ? (newerRegion[site] as string) : null;
      }
    });
    const { s: withCard, card } = dealt(s, g.p1, "dragons_landing");
    const renown = getRenown(ctx, withCard, g.p1);

    const { state, events } = play(withCard, g.p1, card, LANDING);
    const [landed] = ofType(events, "dragon_landed");
    const site = landed?.siteId as string;
    const [lost, kept] = where.lost === "newer" ? [newer[site], older[site]] : [older[site], newer[site]];
    expect(ofType(events, "holding_reduced")).toEqual([
      { type: "holding_reduced", byPlayerId: g.p1, ownerId: g.p1, holdingId: landed?.holdingId, siteId: site, bannerId: lost },
    ]);
    expect(state.holdings[landed?.holdingId as string]?.type).toBe("manor");
    expect(bannersAt(state, site).map((b) => b.id)).toEqual([kept]);
    expect(getRenown(ctx, state, g.p1)).toBe(renown - 1);
  });

  it("draws its victim with the match RNG: replays give the same result", () => {
    const g = setupGame(standardRuleset(2));
    const { s: initial, card } = dealt(thirdManor(g.state, g.p1), g.p1, "dragons_landing");
    const command: GameCommand = cmd(initial, g.p1, { type: "play_card", cardId: card, target: LANDING });
    const first = engine.applyCommand(initial, command);
    const second = engine.applyCommand(initial, command);
    expect(hashState(second.newState as GameState)).toBe(hashState(first.newState as GameState));
    expect(second.events).toEqual(first.events);
    expect(hashState(engine.replay(initial, [command]))).toBe(hashState(first.newState as GameState));
    // Different RNG states spread the strikes over the pool.
    const struck = new Set(
      Array.from({ length: 12 }, (_, i) => {
        const s = edit(initial, (c) => (c.rngState = createRng(seedRng(`landing-${i}`)).state));
        return ofType(play(s, g.p1, card, LANDING).events, "dragon_landed")[0]?.holdingId;
      }),
    );
    expect(struck.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------- Transmutation Magic

describe("Transmutation Magic (§19.16)", () => {
  function ready(res: Partial<Record<ResourceType, number>>) {
    const g = setupGame(standardRuleset(2));
    const { s, card } = dealt(g.state, g.p1, "transmutation_magic");
    return { ...g, s: withResources(s, g.p1, res), card };
  }
  const transmute = (give: [ResourceType, ResourceType], receive: [ResourceType, ResourceType]): CardTarget => ({
    effect: "transmutation_magic",
    give,
    receive,
  });

  it("turns two resources into two of types not given", () => {
    const { s, p1, card } = ready({ grain: 2, timber: 1 });
    const { state } = play(s, p1, card, transmute(["grain", "grain"], ["iron", "essence"]));
    expect(player(state, p1).resources).toEqual({ grain: 0, timber: 1, stone: 0, iron: 1, essence: 1 });
    const mixed = ready({ grain: 1, timber: 1 });
    const r = play(mixed.s, mixed.p1, mixed.card, transmute(["grain", "timber"], ["iron", "iron"]));
    expect(player(r.state, mixed.p1).resources).toEqual({ grain: 0, timber: 0, stone: 0, iron: 2, essence: 0 });
    expect(ofType(r.events, "resource_spent").map((e) => [e.resource, e.amount])).toEqual([
      ["grain", 1],
      ["timber", 1],
    ]);
    expect(ofType(r.events, "resource_gained").reduce((n, e) => n + e.amount, 0)).toBe(2);
  });

  it("needs both resources given, doubles counted twice", () => {
    const { s, p1, card } = ready({ grain: 1, timber: 1 });
    refuse(s, p1, card, transmute(["grain", "grain"], ["iron", "stone"]), "INSUFFICIENT_RESOURCES");
    refuse(s, p1, card, transmute(["grain", "stone"], ["iron", "essence"]), "INSUFFICIENT_RESOURCES");
  });

  it("never gives back a type given", () => {
    const { s, p1, card } = ready({ grain: 2, timber: 2 });
    refuse(s, p1, card, transmute(["grain", "timber"], ["timber", "iron"]), "INVALID_CARD_TARGET");
    refuse(s, p1, card, transmute(["grain", "grain"], ["grain", "iron"]), "INVALID_CARD_TARGET");
  });

  it("rejects anything but two resource types on each side", () => {
    const { s, p1, card } = ready({ grain: 3 });
    const malformed: [unknown, unknown][] = [
      ["grain", ["iron", "iron"]],
      [["grain"], ["iron", "iron"]],
      [
        ["grain", "grain", "grain"],
        ["iron", "iron"],
      ],
      [
        ["grain", "grain"],
        ["iron", "gold"],
      ],
      [["grain", "grain"], null],
      [{ 0: "grain", 1: "grain", length: 2 }, ["iron", "iron"]],
    ];
    for (const [give, receive] of malformed) refuse(s, p1, card, { effect: "transmutation_magic", give, receive }, "INVALID_CARD_TARGET");
  });

  it("offers each unordered pair once: 110 plays at most", () => {
    const rich = ready({ grain: 2, timber: 2, stone: 2, iron: 2, essence: 2 });
    const all = offered(rich.s, rich.p1, rich.card);
    expect(all).toHaveLength(110);
    const key = (t: CardTarget) => (t.effect === "transmutation_magic" ? `${[...t.give].sort()}>${[...t.receive].sort()}` : "");
    expect(new Set(all.map(key)).size).toBe(110);

    const pair = ready({ grain: 1, timber: 1 });
    const gives = offered(pair.s, pair.p1, pair.card).map((t) => (t.effect === "transmutation_magic" ? t.give : []));
    expect(gives).toHaveLength(6);
    for (const give of gives) expect(give).toEqual(["grain", "timber"]);

    const poor = ready({ grain: 1 });
    expect(offered(poor.s, poor.p1, poor.card)).toEqual([]);
  });
});

// ---------------------------------------------------------------- The Plague

describe("The Plague (§19.17)", () => {
  /** p1 in their second turn (both first Harvests are behind them), holding the Plague. */
  function ready(ruleset = standardRuleset(2)) {
    const g = setupGame(ruleset);
    const { s, card } = dealt(passTurn(passTurn(g.state)), g.p1, "the_plague");
    const banner = {
      p1R1: g.bannerOf(g.p1, "s1"),
      p1R8: g.bannerOf(g.p1, "s9"),
      p2R5: g.bannerOf(g.p2, "s3"),
      p2R3: g.bannerOf(g.p2, "s7"),
    };
    return { ...g, s, card, banner };
  }
  const plague = (siteId: string): CardTarget => ({ effect: "the_plague", siteId });
  const sick = (s: GameState): string[] => s.activeEffects.flatMap((e) => (e.kind === "sick" ? [e.bannerId] : [])).sort();

  it("sickens every Banner in the Regions around the Site, the caster's too", () => {
    const { s, p1, card, banner } = ready();
    // s5 touches R1–R4: p1's Grain Banner and p2's Stone Banner.
    const { state, events } = play(s, p1, card, plague("s5"));
    const expected = [banner.p1R1, banner.p2R3].sort();
    expect(sick(state)).toEqual(expected);
    for (const e of state.activeEffects) expect(e).toMatchObject({ kind: "sick", sourcePlayerId: p1 });
    const [started] = ofType(events, "effect_started");
    expect(started).toMatchObject({ effect: "plague", siteId: "s5", playerId: p1 });
    expect(started?.effect === "plague" ? [...started.bannerIds].sort() : []).toEqual(expected);
  });

  it("spares Banners at home", () => {
    const { s, p1, card, banner } = ready();
    const home = edit(s, (c) => ((c.banners[banner.p1R1] as Banner).regionId = null));
    expect(sick(play(home, p1, card, plague("s5")).state)).toEqual([banner.p2R3]);
  });

  it("needs at least one opponent's Banner that is not already sick", () => {
    const { s, p1, p2, card, banner } = ready();
    // p2's Banners stand on R5 (s1–s3) and R3 (s4, s5, s7, s8).
    const sites = offered(s, p1, card).map((t) => (t.effect === "the_plague" ? t.siteId : ""));
    expect(sites).toEqual(["s1", "s2", "s3", "s4", "s5", "s7", "s8"]);
    refuse(s, p1, card, plague("s9"), "INVALID_CARD_TARGET"); // only p1's own Banner
    refuse(s, p1, card, plague("s6"), "INVALID_CARD_TARGET"); // no Banner at all
    refuse(s, p1, card, plague("nowhere"), "INVALID_CARD_TARGET");

    const after = play(s, p1, card, plague("s5")).state;
    // Around s4 every Banner is sick already; around s1 only p2's Essence Banner is new.
    expect(violation(after, p1, card, plague("s4"))).toBe("INVALID_CARD_TARGET");
    expect(violation(after, p1, card, plague("s1"))).toBeNull();
    expect(plagueBanners(ctx, after, "s1").map((b) => b.id)).toEqual([banner.p2R5]);
    // p2 may sicken p1's remaining Banner.
    expect(violation(after, p2, card, plague("s9"))).toBeNull();
    expect(plagueBanners(ctx, after, "s9").map((b) => b.id)).toEqual([banner.p1R8]);
  });

  it("blocks each sick Banner's next Harvest, then its owner is cured", () => {
    const { s, p1, p2, card, banner } = ready();
    const cast = play(s, p1, card, plague("s5")).state;
    const preview = getHarvestPreview(ctx, cast, p2).banners.find((b) => b.bannerId === banner.p2R3);
    expect(preview).toMatchObject({ produced: null, amount: 0, notes: ["sick"] });

    // p2's Harvest: the Stone Banner yields nothing, the Essence Banner is well.
    const theirs = endTurn(cast);
    const harvested = ofType(theirs.events, "banner_harvested");
    expect(harvested.find((e) => e.bannerId === banner.p2R3)).toMatchObject({ produced: null, amount: 0, notes: ["sick"] });
    expect(harvested.find((e) => e.bannerId === banner.p2R5)).toMatchObject({ produced: "essence", amount: 1, notes: [] });
    expect(player(theirs.state, p2).resources.stone).toBe(player(cast, p2).resources.stone);
    expect(ofType(theirs.events, "effect_expired")).toEqual([{ type: "effect_expired", effect: "plague", playerId: p2 }]);
    expect(sick(theirs.state)).toEqual([banner.p1R1]);

    // p1's Harvest cures the caster's own Banner the same way.
    const mine = endTurn(theirs.state);
    expect(ofType(mine.events, "banner_harvested").find((e) => e.bannerId === banner.p1R1)?.notes).toEqual(["sick"]);
    expect(ofType(mine.events, "effect_expired")).toEqual([{ type: "effect_expired", effect: "plague", playerId: p1 }]);
    expect(sick(mine.state)).toEqual([]);
    expect(getHarvestPreview(ctx, mine.state, p1).banners.every((b) => !b.notes.includes("sick"))).toBe(true);
  });

  // Harvest layers (§31): the Toll Troll blocks before sickness, and sickness before bonuses and the Dragon.
  const moveMenace = (s: GameState, type: MenaceType, regionId: string): GameState =>
    edit(s, (c) => {
      const menace = Object.values(c.menaces).find((m) => m.type === type);
      if (menace) menace.location = { kind: "region", regionId };
    });

  it("under the Toll Troll the Banner is blocked, yet its owner's Harvest still cures and settles it", () => {
    const { s, p1, p2, card, banner } = ready();
    let cast = play(s, p1, card, plague("s5")).state;
    cast = edit(moveMenace(cast, "toll_troll", "R3"), (c) => ((c.banners[banner.p2R3] as Banner).settled = false));
    const blocked = { produced: null, amount: 0, notes: ["blocked_by_troll"] };
    expect(getHarvestPreview(ctx, cast, p2).banners.find((b) => b.bannerId === banner.p2R3)).toMatchObject(blocked);

    const theirs = endTurn(cast);
    expect(ofType(theirs.events, "banner_harvested").find((e) => e.bannerId === banner.p2R3)).toMatchObject(blocked);
    expect(ofType(theirs.events, "effect_expired")).toEqual([{ type: "effect_expired", effect: "plague", playerId: p2 }]);
    expect(sick(theirs.state)).toEqual([banner.p1R1]);
    expect(theirs.state.banners[banner.p2R3]?.settled).toBe(true);
  });

  it("under the Young Dragon the Banner is sick, and nothing goes into the Hoard", () => {
    const { s, p1, p2, card, banner } = ready(MENACE_RULESET);
    const cast = moveMenace(play(s, p1, card, plague("s5")).state, "young_dragon", "R3");
    const dragon = Object.values(cast.menaces).find((m) => m.type === "young_dragon");
    expect(dragon?.location).toEqual({ kind: "region", regionId: "R3" });
    const hoard = { ...dragon?.state.hoard };
    const sickNote = { produced: null, amount: 0, notes: ["sick"] };
    const preview = getHarvestPreview(ctx, cast, p2).banners.find((b) => b.bannerId === banner.p2R3);
    expect(preview).toMatchObject(sickNote);
    expect(preview?.hoard).toBeUndefined();

    const theirs = endTurn(cast);
    expect(ofType(theirs.events, "banner_harvested").find((e) => e.bannerId === banner.p2R3)).toMatchObject(sickNote);
    expect(ofType(theirs.events, "hoard_changed")).toEqual([]);
    expect(theirs.state.menaces[dragon?.id as string]?.state.hoard ?? {}).toEqual(hoard);
    expect(ofType(theirs.events, "effect_expired")).toEqual([{ type: "effect_expired", effect: "plague", playerId: p2 }]);
  });

  it("with Druid's Blessing the Banner still produces nothing: sickness blocks before bonuses", () => {
    const { s, p1, card, banner } = ready();
    const bless = (x: GameState) => edit(x, (c) => c.activeEffects.push({ kind: "druids_blessing", bannerId: banner.p1R1, sourcePlayerId: p1 }));
    const grainBanner = (x: GameState) => getHarvestPreview(ctx, x, p1).banners.find((b) => b.bannerId === banner.p1R1);
    // Well, p1's Grain Banner on R1 would yield 2.
    expect(grainBanner(bless(s))).toMatchObject({ produced: "grain", amount: 2, notes: ["druids_blessing"] });

    const cast = bless(play(s, p1, card, plague("s5")).state);
    expect(grainBanner(cast)).toMatchObject({ produced: null, amount: 0, notes: ["sick"] });
    const theirs = endTurn(cast);
    const mine = endTurn(theirs.state);
    expect(ofType(mine.events, "banner_harvested").find((e) => e.bannerId === banner.p1R1)).toMatchObject({ produced: null, amount: 0, notes: ["sick"] });
    expect(player(mine.state, p1).resources.grain).toBe(player(theirs.state, p1).resources.grain);
    expect(ofType(mine.events, "effect_expired")).toEqual([
      { type: "effect_expired", effect: "plague", playerId: p1 },
      { type: "effect_expired", effect: "druids_blessing", playerId: p1 },
    ]);
  });
});

// ---------------------------------------------------------------- Royal Insurance Policy

describe("Royal Insurance Policy (§19.19)", () => {
  const POLICY: CardTarget = { effect: "royal_insurance_policy" };
  const claims = (events: GameEvent[]) => ofType(events, "insurance_claimed");

  it("stays in front of its player, one at most, and cannot be countered", () => {
    const g = setupGame(standardRuleset(2));
    const { s, card } = dealt(give(g.state, g.p2, "counterspell"), g.p1, "royal_insurance_policy");
    expect(offered(s, g.p1, card)).toEqual([POLICY]);
    const { state, events } = play(s, g.p1, card, POLICY);
    expect(state.pending).toBeUndefined();
    expect(player(state, g.p1).charters).toEqual([card]);
    expect(state.discardPile).not.toContain(card);
    expect(ofType(events, "card_resolved")).toEqual([{ type: "card_resolved", playerId: g.p1, cardId: card }]);
    expect(insurancePolicyOf(ctx, state, g.p1)).toBe(card);
    expect(insurancePolicyOf(ctx, state, g.p2)).toBeUndefined();
    // Public: opponents see it.
    expect(player(redactState(state, g.p2), g.p1).charters).toEqual([card]);

    const second = give(passTurn(passTurn(state)), g.p1, "royal_insurance_policy");
    expect(offered(second, g.p1, lastCard(second, g.p1))).toEqual([]);
    refuse(second, g.p1, lastCard(second, g.p1), POLICY, "INVALID_CARD_TARGET");
  });

  it("works on a state saved before Charters existed", () => {
    const g = setupGame(standardRuleset(2));
    const { s, card } = dealt(g.state, g.p1, "royal_insurance_policy");
    const old = edit(s, (c) => delete player(c, g.p1).charters);
    expect(insurancePolicyOf(ctx, old, g.p1)).toBeUndefined();
    expect(player(play(old, g.p1, card, POLICY).state, g.p1).charters).toEqual([card]);
  });

  it("is claimed instead of a Fire Bolt burning a Route", () => {
    const g = setupGame(standardRuleset(2));
    const { s: insured, policy } = insure(g.state, g.p2);
    const { s, card } = dealt(insured, g.p1, "fire_bolt");
    const { state, events } = play(s, g.p1, card, { effect: "fire_bolt", routeId: "r36" });
    expect(claims(events)).toEqual([{ type: "insurance_claimed", playerId: g.p2, cardId: policy, against: "fire_bolt" }]);
    expect(ofType(events, "route_burned")).toEqual([]);
    expect(state.routeOwners["r36"]).toBe(g.p2);
    expect(state.activeEffects).toEqual([]);
    expect(player(state, g.p2).charters).toEqual([]);
    expect(state.discardPile).toEqual(expect.arrayContaining([policy, card]));
  });

  it("is claimed instead of Dragon's Landing, even the owner's own", () => {
    const g = setupGame(standardRuleset(2));
    const { s: insured, policy } = insure(thirdManor(g.state, g.p1), g.p1);
    const { s, card } = dealt(insured, g.p1, "dragons_landing");
    const { state, events } = play(s, g.p1, card, { effect: "dragons_landing" });
    expect(events.map((e) => e.type)).toContain("dragon_landed");
    expect(claims(events)).toEqual([{ type: "insurance_claimed", playerId: g.p1, cardId: policy, against: "dragons_landing" }]);
    expect(ofType(events, "holding_destroyed")).toEqual([]);
    expect(ofType(events, "holding_reduced")).toEqual([]);
    expect(state.holdings).toEqual(s.holdings);
    expect(state.banners).toEqual(s.banners);
  });

  it("spares all of its owner's Banners from one Plague, then it is gone", () => {
    const g = setupGame(standardRuleset(2));
    // Move p1's Stone Banner from R8 to R4, so two of p1's Banners stand around s5.
    const base = edit(g.state, (c) => ((c.banners[g.bannerOf(g.p1, "s9")] as Banner).regionId = "R4"));
    const { s: insured, policy } = insure(base, g.p1);
    const { s, card } = dealt(insured, g.p1, "the_plague");
    expect(plagueBanners(ctx, s, "s5").filter((b) => b.ownerId === g.p1)).toHaveLength(2);

    const { state, events } = play(s, g.p1, card, { effect: "the_plague", siteId: "s5" });
    expect(claims(events)).toEqual([{ type: "insurance_claimed", playerId: g.p1, cardId: policy, against: "the_plague" }]);
    const started = ofType(events, "effect_started")[0];
    expect(started?.effect === "plague" ? started.bannerIds : []).toEqual([g.bannerOf(g.p2, "s7")]);
    expect(state.activeEffects).toEqual([{ kind: "sick", bannerId: g.bannerOf(g.p2, "s7"), sourcePlayerId: g.p1 }]);
    expect(insurancePolicyOf(ctx, state, g.p1)).toBeUndefined();
  });

  it("can leave a Plague with no one to sicken", () => {
    const g = setupGame(standardRuleset(2));
    const { s: insured, policy } = insure(g.state, g.p2);
    const { s, card } = dealt(insured, g.p1, "the_plague");
    // Around s3 only p2's Essence Banner stands.
    const { state, events } = play(s, g.p1, card, { effect: "the_plague", siteId: "s3" });
    expect(claims(events)).toEqual([{ type: "insurance_claimed", playerId: g.p2, cardId: policy, against: "the_plague" }]);
    expect(ofType(events, "effect_started")).toEqual([]);
    expect(state.activeEffects).toEqual([]);
  });

  it("is claimed instead of a Changeling swap", () => {
    const g = setupGame(standardRuleset(2));
    const { s: insured, policy } = insure(give(g.state, g.p2, "knight_errant"), g.p2);
    const { s, card } = dealt(give(insured, g.p1, "arcane_exchange"), g.p1, "changeling");
    const { state, events } = play(s, g.p1, card, { effect: "changeling", opponentId: g.p2 });
    expect(claims(events)).toEqual([{ type: "insurance_claimed", playerId: g.p2, cardId: policy, against: "changeling" }]);
    expect(ofType(events, "hands_swapped")).toEqual([]);
    expect(player(state, g.p2).hand).toEqual(player(s, g.p2).hand);
    expect(player(state, g.p1).hand).toEqual(player(s, g.p1).hand.filter((c) => c !== card));
  });

  it("is not used up by cards it does not cover", () => {
    const g = setupGame(standardRuleset(2));
    const { s: insured, policy } = insure(g.state, g.p2);
    const { s, card } = dealt(insured, g.p1, "wizard_interference");
    const { state, events } = play(s, g.p1, card, { effect: "wizard_interference", bannerId: g.bannerOf(g.p2, "s3"), regionId: "R2" });
    expect(claims(events)).toEqual([]);
    expect(player(state, g.p2).charters).toEqual([policy]);
  });
});

// ---------------------------------------------------------------- Robin of the Glade

describe("Robin of the Glade (§19.18)", () => {
  const rob = (resource: ResourceType): CardTarget => ({ effect: "robin_of_the_glade", resource });

  it("takes 1 of the named resource from a rival with more Renown", () => {
    const g = setupGame(standardRuleset(2));
    const { s: dealtState, card } = dealt(g.state, g.p1, "robin_of_the_glade");
    const s = withResources(withResources(withRenown(dealtState, g.p2, 3), g.p2, { grain: 2 }), g.p1, {});
    // Only what the payer holds is offered.
    expect(offered(s, g.p1, card)).toEqual([rob("grain")]);
    refuse(s, g.p1, card, rob("iron"), "INVALID_CARD_TARGET");
    const { state, events } = play(s, g.p1, card, rob("grain"));
    expect(player(state, g.p1).resources.grain).toBe(1);
    expect(player(state, g.p2).resources.grain).toBe(1);
    expect(ofType(events, "resource_transferred")).toEqual([
      { type: "resource_transferred", fromPlayerId: g.p2, toPlayerId: g.p1, resource: "grain", amount: 1, reason: "card_effect" },
    ]);
    expect(player(state, g.p1).stats.heroesPlayed).toBe(1);
  });

  it("does not rob a rival tied on Renown", () => {
    const g = setupGame(standardRuleset(2));
    const { s: dealtState, card } = dealt(g.state, g.p1, "robin_of_the_glade");
    const s = withResources(dealtState, g.p2, { grain: 5 });
    expect(offered(s, g.p1, card)).toEqual([]);
    refuse(s, g.p1, card, rob("grain"), "INVALID_CARD_TARGET");
    refuse(s, g.p1, card, { effect: "robin_of_the_glade", resource: "gold" }, "INVALID_CARD_TARGET");
  });

  it("collects from every richer rival who has it, and only from them", () => {
    // P1 casts at 1 Renown. P2 (3) and P3 (2) are ahead; P4 (1) is tied.
    let s = seatedGame([1, 3, 2, 1]);
    const [p1, p2, p3, p4] = s.turnOrder as [PlayerId, PlayerId, PlayerId, PlayerId];
    s = withResources(withResources(withResources(s, p2, { grain: 1 }), p3, { grain: 4, iron: 1 }), p4, { grain: 5, iron: 5 });
    const { s: withCard, card } = dealt(s, p1, "robin_of_the_glade");
    expect(offered(withCard, p1, card)).toEqual([rob("grain"), rob("iron")]);

    const grain = play(withCard, p1, card, rob("grain"));
    expect(ofType(grain.events, "resource_transferred").map((e) => e.fromPlayerId)).toEqual([p2, p3]);
    expect([p1, p2, p3, p4].map((p) => player(grain.state, p).resources.grain)).toEqual([2, 0, 3, 5]);
    const iron = play(withCard, p1, card, rob("iron"));
    expect(ofType(iron.events, "resource_transferred").map((e) => e.fromPlayerId)).toEqual([p3]);
  });
});

// ---------------------------------------------------------------- The Unreliable Bard

describe("The Unreliable Bard (§19.20)", () => {
  const BARD: CardTarget = { effect: "unreliable_bard" };

  it(`needs a rival at least ${BALANCE.underdogGap} Renown ahead, then gains 1 Renown`, () => {
    const g = setupGame(standardRuleset(2));
    const { s, card } = dealt(g.state, g.p1, "unreliable_bard");
    const close = withRenown(s, g.p2, 2 + BALANCE.underdogGap - 1);
    expect(offered(close, g.p1, card)).toEqual([]);
    refuse(close, g.p1, card, BARD, "INVALID_CARD_TARGET");

    const far = withRenown(s, g.p2, 2 + BALANCE.underdogGap);
    expect(offered(far, g.p1, card)).toEqual([BARD]);
    const { state, events } = play(far, g.p1, card, BARD);
    expect(getRenown(ctx, state, g.p1)).toBe(3);
    expect(player(state, g.p1).bonusRenown).toBe(player(far, g.p1).bonusRenown + 1);
    expect(ofType(events, "renown_gained")).toEqual([{ type: "renown_gained", playerId: g.p1, amount: 1, cause: "unreliable_bard" }]);
    expect(player(state, g.p1).stats.heroesPlayed).toBe(1);
  });
});

// ---------------------------------------------------------------- Treasure Hunter

describe("Treasure Hunter (§19.21)", () => {
  const DRAGON = "menace_young_dragon";
  /** Young Dragon on R8 (under p1's Stone Banner) with `hoard`; p1 holds the card. */
  function ready(hoard: Partial<Record<ResourceType, number>>) {
    const g = setupGame(MENACE_RULESET);
    const withHoard = edit(g.state, (c) => {
      const dragon = c.menaces[DRAGON];
      if (dragon) dragon.state.hoard = { ...hoard };
    });
    const { s, card } = dealt(withResources(withHoard, g.p1, {}), g.p1, "treasure_hunter");
    return { ...g, s, card };
  }
  const hunt = (take: ResourceType, regionId: string): CardTarget => ({ effect: "treasure_hunter", take, destination: { kind: "region", regionId } });

  it("needs the Young Dragon", () => {
    const g = setupGame(standardRuleset(2));
    expect(violation(g.state, g.p1, "treasure_hunter#1", hunt("grain", "R1"))).toBe("INVALID_CARD_TARGET");
  });

  it(`takes up to ${BALANCE.treasureHunter.take} of one resource from the Hoard, then moves the Dragon`, () => {
    const { s, p1, card } = ready({ grain: 5, iron: 1 });
    const { state, events } = play(s, p1, card, hunt("grain", "R1"));
    expect(player(state, p1).resources.grain).toBe(3);
    expect(state.menaces[DRAGON]?.state.hoard).toEqual({ grain: 2, iron: 1 });
    expect(ofType(events, "hoard_changed")).toEqual([{ type: "hoard_changed", menaceId: DRAGON, resource: "grain", delta: -3 }]);
    expect(ofType(events, "menace_moved")).toEqual([
      { type: "menace_moved", byPlayerId: p1, menaceId: DRAGON, from: { kind: "region", regionId: "R8" }, to: { kind: "region", regionId: "R1" } },
    ]);
    expect(state.menaces[DRAGON]?.location).toEqual({ kind: "region", regionId: "R1" });

    const few = play(s, p1, card, hunt("iron", "R1")).state;
    expect(player(few, p1).resources.iron).toBe(1);
    expect(few.menaces[DRAGON]?.state.hoard).toEqual({ grain: 5 });
  });

  it("must lead the Dragon to a Region holding one of your Banners", () => {
    const { s, p1, card } = ready({ grain: 5, iron: 1 });
    // p1's Banners stand on R1 and R8, where the Dragon already is.
    expect(offered(s, p1, card)).toEqual([hunt("grain", "R1"), hunt("iron", "R1")]);
    refuse(s, p1, card, hunt("grain", "R3"), "ILLEGAL_MENACE_TARGET"); // p2's Banner
    refuse(s, p1, card, hunt("grain", "R2"), "ILLEGAL_MENACE_TARGET"); // nobody's
    refuse(s, p1, card, hunt("grain", "R8"), "ILLEGAL_MENACE_TARGET"); // no move
    refuse(s, p1, card, { effect: "treasure_hunter", take: "grain", destination: { kind: "site", siteId: "s1" } }, "ILLEGAL_MENACE_TARGET");
  });

  it("has nothing to take from an empty Hoard", () => {
    const { s, p1, card } = ready({});
    expect(offered(s, p1, card)).toEqual([]);
    refuse(s, p1, card, hunt("grain", "R1"), "INVALID_CARD_TARGET");
    const some = ready({ stone: 1 });
    refuse(some.s, some.p1, some.card, hunt("grain", "R1"), "INVALID_CARD_TARGET");
  });
});
