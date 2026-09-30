// The second and third waves of cards (spec §19.12–19.27): legality, target
// enumeration, resolution, events and the edge cases the rules text calls out.

import { describe, expect, it } from "vitest";
import {
  BALANCE,
  checkBuildManor,
  checkBuildRoute,
  clone,
  createRng,
  dragonsLandingTargets,
  enumerateCardTargets,
  getHarvestPreview,
  getLegalActions,
  getLegalInitialManorSites,
  getRenown,
  getRenownSources,
  hashState,
  holdingAt,
  insurancePolicyOf,
  isBoardFull,
  isSiteOpenFor,
  isSmoulderingFor,
  manorSiteClosedReason,
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
import { act, cmd, engine, give, grant, mvpRuleset, newGame, passTurn, reject, routeId, setupGame, cardTestRuleset as standardRuleset } from "./helpers.js";

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
    // equalTurns off so a normal win still ends the game at once; Ragnarök
    // ends mid-turn either way (§19.13).
    const g = setupGame({ ...standardRuleset(2), equalTurns: false });
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
      { type: "holding_destroyed", byPlayerId: g.p2, ownerId: g.p1, holdingId: h?.id, siteId: h?.siteId, bannerIds: lost, cause: "dragons_landing" },
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
      { type: "holding_reduced", byPlayerId: g.p1, ownerId: g.p1, holdingId: landed?.holdingId, siteId: site, bannerId: lost, cause: "dragons_landing" },
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

// ---------------------------------------------------------------- The third wave (§19.22–19.27)

const MANOR_COST = { grain: 1, timber: 1, stone: 1 };

/**
 * p2's first turn against p1, who leads with 4 Renown: Manors on s1 and s5,
 * a Stronghold on s9 and 5 Grain. p2 (2 Renown) has built Routes to s5 (s5–s8)
 * and s9 (the s8–s9 bridge).
 */
function siegeFixture() {
  const g = setupGame(standardRuleset(2));
  let s = grant(thirdManor(g.state, g.p1), g.p1, { grain: 2, iron: 2 });
  s = act(s, g.p1, { type: "upgrade_holding", siteId: "s9" }).state;
  s = passTurn(s);
  s = grant(s, g.p2, { timber: 2, stone: 2 });
  s = act(s, g.p2, { type: "build_route", routeId: routeId(5, 8) }).state;
  s = act(s, g.p2, { type: "build_route", routeId: routeId(8, 9) }).state;
  s = withResources(s, g.p1, { grain: 5 });
  expect(s.activePlayerId).toBe(g.p2);
  expect([getRenown(ctx, s, g.p1), getRenown(ctx, s, g.p2)]).toEqual([4, 2]);
  return { ...g, s };
}

/** Removes the Holding on `siteId` with its Banners (test-only state surgery). */
const withoutHolding = (s: GameState, siteId: string): GameState =>
  edit(s, (c) => {
    const h = Object.values(c.holdings).find((x) => x.siteId === siteId);
    if (!h) return;
    for (const b of Object.values(c.banners)) if (b.holdingId === h.id) delete c.banners[b.id];
    delete c.holdings[h.id];
    player(c, h.ownerId).holdingIds = player(c, h.ownerId).holdingIds.filter((id) => id !== h.id);
  });

const razedEffects = (s: GameState) => s.activeEffects.filter((e) => e.kind === "razed");

describe("Disgrace (§19.22)", () => {
  const shame = (opponentId: PlayerId): CardTarget => ({ effect: "disgrace", opponentId });

  it("costs the Renown leader 1 Renown for the rest of the game", () => {
    const { s: base, p1, p2 } = siegeFixture();
    const { s, card } = dealt(base, p2, "disgrace");
    expect(player(s, p1).lostRenown).toBeUndefined();
    expect(offered(s, p2, card)).toEqual([shame(p1)]);

    const { state, events } = play(s, p2, card, shame(p1));
    expect(getRenown(ctx, state, p1)).toBe(3);
    expect(player(state, p1).lostRenown).toBe(1);
    expect(getRenownSources(ctx, state, p1)).toMatchObject({ total: 3, bonus: 0, lost: 1 });
    expect(ofType(events, "renown_lost")).toEqual([{ type: "renown_lost", byPlayerId: p2, playerId: p1, amount: 1, cause: "disgrace" }]);
    expect(state.discardPile).toContain(card);
    // For good: a new Stronghold adds to the lower total.
    const raised = act(grant(passTurn(state), p1, { grain: 2, iron: 2 }), p1, { type: "upgrade_holding", siteId: "s5" }).state;
    expect(getRenown(ctx, raised, p1)).toBe(4);
  });

  it("cannot be played by a leader or co-leader", () => {
    const g = setupGame(standardRuleset(2));
    const { s: tied, card } = dealt(g.state, g.p1, "disgrace");
    expect(offered(tied, g.p1, card)).toEqual([]);
    refuse(tied, g.p1, card, shame(g.p2), "INVALID_CARD_TARGET");
    const ahead = withRenown(tied, g.p1, 5);
    expect(offered(ahead, g.p1, card)).toEqual([]);
    refuse(ahead, g.p1, card, shame(g.p2), "INVALID_CARD_TARGET");
    refuse(ahead, g.p1, card, shame(g.p1), "INVALID_CARD_TARGET");
    // Sharing the lead with a third player is no better.
    const shared = seatedGame([3, 3, 1]);
    const [q1] = shared.turnOrder as [PlayerId];
    const { s: withCard, card: third } = dealt(shared, q1, "disgrace");
    expect(offered(withCard, q1, third)).toEqual([]);
  });

  it("strikes only a rival with the most Renown; the caster picks among tied leaders", () => {
    const s = seatedGame([1, 3, 3, 2]);
    const [p1, p2, p3, p4] = s.turnOrder as [PlayerId, PlayerId, PlayerId, PlayerId];
    const { s: withCard, card } = dealt(s, p1, "disgrace");
    expect(offered(withCard, p1, card)).toEqual([shame(p2), shame(p3)]);
    refuse(withCard, p1, card, shame(p4), "INVALID_CARD_TARGET");
    refuse(withCard, p1, card, shame("nobody"), "INVALID_CARD_TARGET");
    const { state } = play(withCard, p1, card, shame(p3));
    expect(state.turnOrder.map((id) => getRenown(ctx, state, id))).toEqual([1, 3, 2, 2]);
  });
});

describe("Siege Engines (§19.23)", () => {
  const siege = (siteId: string): CardTarget => ({ effect: "siege_engines", siteId });

  it("targets an opponent's Stronghold at an end of one of your Routes", () => {
    const { s: base, p2 } = siegeFixture();
    const { s, card } = dealt(base, p2, "siege_engines");
    expect(offered(s, p2, card)).toEqual([siege("s9")]);
    refuse(s, p2, card, siege("s5"), "INVALID_CARD_TARGET"); // a Manor
    refuse(s, p2, card, siege("s2"), "INVALID_CARD_TARGET"); // empty
    refuse(s, p2, card, siege("s99"), "INVALID_CARD_TARGET"); // unknown
    // A Stronghold that no Route of yours reaches is safe.
    const far = edit(s, (c) => {
      delete c.routeOwners["r89"];
      player(c, p2).routeIds = player(c, p2).routeIds.filter((r) => r !== "r89");
    });
    expect(offered(far, p2, card)).toEqual([]);
    refuse(far, p2, card, siege("s9"), "INVALID_CARD_TARGET");
    // Nor may you besiege your own.
    const own = edit(s, (c) => ((c.holdings[holdingAt(c, "s7")?.id as string] as GameState["holdings"][string]).type = "stronghold"));
    refuse(own, p2, card, siege("s7"), "INVALID_CARD_TARGET");
  });

  it("knocks it back to a Manor that loses a Banner, 1 Renown, and may be raised again", () => {
    const { s: base, p1, p2 } = siegeFixture();
    const { s, card } = dealt(base, p2, "siege_engines");
    const holding = holdingAt(s, "s9");
    // Both of the Stronghold's Banners: the newer one, at home, goes (§114).
    const [older, newer] = bannersAt(s, "s9").map((b) => b.id);
    const { state, events } = play(s, p2, card, siege("s9"));
    expect(ofType(events, "holding_reduced")).toEqual([
      { type: "holding_reduced", byPlayerId: p2, ownerId: p1, holdingId: holding?.id, siteId: "s9", bannerId: newer, cause: "siege_engines" },
    ]);
    expect(holdingAt(state, "s9")?.type).toBe("manor");
    expect(bannersAt(state, "s9").map((b) => b.id)).toEqual([older]);
    expect(getRenown(ctx, state, p1)).toBe(3);
    expectNoDanglingEffects(state);
    const theirTurn = grant(passTurn(state), p1, { grain: 2, iron: 2 });
    expect(getLegalActions(ctx, theirTurn, p1).upgradeSites).toContain("s9");
  });
});

describe("Raiders (§19.24)", () => {
  const raid = (siteId: string): CardTarget => ({ effect: "raiders", siteId });

  it("targets an opponent's Manor at an end of one of your Routes", () => {
    const { s: base, p2 } = siegeFixture();
    const { s, card } = dealt(base, p2, "raiders");
    expect(offered(s, p2, card)).toEqual([raid("s5")]);
    refuse(s, p2, card, raid("s9"), "INVALID_CARD_TARGET"); // a Stronghold
    refuse(s, p2, card, raid("s1"), "INVALID_CARD_TARGET"); // no Route of p2's reaches it
    refuse(s, p2, card, raid("s7"), "INVALID_CARD_TARGET"); // p2's own
    refuse(s, p2, card, raid("s2"), "INVALID_CARD_TARGET"); // empty
  });

  it(`strikes only players with at least ${BALANCE.raid.minHoldings} Holdings`, () => {
    // p1 has only the two starting Manors; s9 is at the end of p2's bridge.
    const g = setupGame(standardRuleset(2));
    let s = grant(passTurn(g.state), g.p2, { timber: 1, stone: 1 });
    s = act(s, g.p2, { type: "build_route", routeId: routeId(8, 9) }).state;
    const { s: withCard, card } = dealt(s, g.p2, "raiders");
    expect(offered(withCard, g.p2, card)).toEqual([]);
    refuse(withCard, g.p2, card, raid("s9"), "INVALID_CARD_TARGET");
  });

  it("burns the Manor down with its Banner and every effect on it", () => {
    const { s: base, p1, p2 } = siegeFixture();
    const { s: withCard, card } = dealt(base, p2, "raiders");
    const holding = holdingAt(withCard, "s5");
    const lost = bannersAt(withCard, "s5").map((b) => b.id);
    const s = edit(withCard, (c) => {
      for (const b of lost) c.activeEffects.push({ kind: "sick", bannerId: b, sourcePlayerId: p2 });
    });
    const { state, events } = play(s, p2, card, raid("s5"));
    expect(ofType(events, "holding_destroyed")).toEqual([
      { type: "holding_destroyed", byPlayerId: p2, ownerId: p1, holdingId: holding?.id, siteId: "s5", bannerIds: lost, cause: "raiders" },
    ]);
    expect(holdingAt(state, "s5")).toBeUndefined();
    expect(player(state, p1).holdingIds).not.toContain(holding?.id);
    for (const b of lost) expect(state.banners[b]).toBeUndefined();
    expectNoDanglingEffects(state);
    expect(getRenown(ctx, state, p1)).toBe(3);
    expect(razedEffects(state)).toEqual([{ kind: "razed", siteId: "s5", ownerId: p1, sourcePlayerId: p2 }]);
  });

  it("lets only the owner rebuild there, which puts the embers out", () => {
    const { s: base, p1, p2 } = siegeFixture();
    const { s, card } = dealt(base, p2, "raiders");
    // p2's s5–s8 Route reaches the empty Site: only the embers stop them.
    const burned = grant(play(s, p2, card, raid("s5")).state, p2, MANOR_COST);
    expect(checkBuildManor(ctx, burned, p2, "s5")).toEqual({ legal: false, reason: "SITE_RAZED" });
    expect(getLegalActions(ctx, burned, p2).manorSites).not.toContain("s5");
    reject(burned, p2, { type: "build_manor", siteId: "s5" }, "SITE_RAZED");

    const theirTurn = grant(passTurn(burned), p1, MANOR_COST);
    expect(getLegalActions(ctx, theirTurn, p1).manorSites).toContain("s5");
    const rebuilt = act(theirTurn, p1, { type: "build_manor", siteId: "s5" }).state;
    expect(holdingAt(rebuilt, "s5")?.ownerId).toBe(p1);
    expect(razedEffects(rebuilt)).toEqual([]);
    expect(getRenown(ctx, rebuilt, p1)).toBe(4);
  });

  it("cools at the end of the owner's next turn, and then anyone may build there", () => {
    const { s: base, p1, p2 } = siegeFixture();
    const { s, card } = dealt(base, p2, "raiders");
    const burned = play(s, p2, card, raid("s5")).state;
    // The caster's turn ending does not count.
    const theirTurn = passTurn(burned);
    expect(razedEffects(theirTurn)).toHaveLength(1);
    const r = endTurn(theirTurn);
    expect(ofType(r.events, "effect_expired")).toEqual([{ type: "effect_expired", effect: "razed", playerId: p1 }]);
    expect(razedEffects(r.state)).toEqual([]);
    expect(checkBuildManor(ctx, grant(r.state, p2, MANOR_COST), p2, "s5")).toMatchObject({ legal: true });
  });

  it("keeps rivals from building next to the razed Site while it smoulders", () => {
    const g = setupGame(standardRuleset(2));
    // Clear s7 and s9, so p2's s7–s8 Route leaves s8 free to build on.
    const open = grant(passTurn(withoutHolding(withoutHolding(g.state, "s7"), "s9")), g.p2, MANOR_COST);
    expect(checkBuildManor(ctx, open, g.p2, "s8")).toMatchObject({ legal: true });
    const razed = edit(open, (c) => c.activeEffects.push({ kind: "razed", siteId: "s9", ownerId: g.p1, sourcePlayerId: g.p2 }));
    expect(checkBuildManor(ctx, razed, g.p2, "s8")).toEqual({ legal: false, reason: "SITE_RAZED" });
    reject(razed, g.p2, { type: "build_manor", siteId: "s8" }, "SITE_RAZED");
  });
});

describe("Stolen Glory (§19.25)", () => {
  const steal = (opponentId: PlayerId): CardTarget => ({ effect: "stolen_glory", opponentId });

  it("moves 1 Renown for good from a rival with more to the caster", () => {
    const s = seatedGame([1, 3, 2, 1]);
    const [p1, p2, p3, p4] = s.turnOrder as [PlayerId, PlayerId, PlayerId, PlayerId];
    const { s: withCard, card } = dealt(s, p1, "stolen_glory");
    expect(offered(withCard, p1, card)).toEqual([steal(p2), steal(p3)]);
    refuse(withCard, p1, card, steal(p4), "INVALID_CARD_TARGET"); // tied
    refuse(withCard, p1, card, steal(p1), "INVALID_CARD_TARGET");

    const { state, events } = play(withCard, p1, card, steal(p3));
    expect(state.turnOrder.map((id) => getRenown(ctx, state, id))).toEqual([2, 3, 1, 1]);
    expect(player(state, p1).bonusRenown).toBe(2);
    expect(player(state, p3).lostRenown).toBe(1);
    expect(ofType(events, "renown_stolen")).toEqual([{ type: "renown_stolen", byPlayerId: p1, fromPlayerId: p3, amount: 1 }]);
    expect(state.discardPile).toContain(card);
  });

  it("cannot be played by a leader or co-leader", () => {
    const g = setupGame(standardRuleset(2));
    const { s, card } = dealt(g.state, g.p1, "stolen_glory");
    expect(offered(s, g.p1, card)).toEqual([]);
    refuse(s, g.p1, card, steal(g.p2), "INVALID_CARD_TARGET");
    expect(offered(withRenown(s, g.p2, 3), g.p1, card)).toEqual([steal(g.p2)]);
  });
});

describe("Siege Fireball (§19.26)", () => {
  const fireball = (siteId: string): CardTarget => ({ effect: "siege_fireball", siteId });

  it("burns any Manor of a rival with more Renown, and leaves a ruin nobody may ever build on", () => {
    const { s: base, p1, p2 } = siegeFixture();
    const { s, card } = dealt(base, p2, "siege_fireball");
    // Anywhere on the board, but only Manors: s9 is a Stronghold.
    expect(offered(s, p2, card)).toEqual([fireball("s1"), fireball("s5")]);
    refuse(s, p2, card, fireball("s9"), "INVALID_CARD_TARGET");
    refuse(s, p2, card, fireball("s3"), "INVALID_CARD_TARGET"); // p2's own

    const holding = holdingAt(s, "s5");
    const lost = bannersAt(s, "s5").map((b) => b.id);
    const { state, events } = play(s, p2, card, fireball("s5"));
    expect(ofType(events, "holding_destroyed")).toEqual([
      { type: "holding_destroyed", byPlayerId: p2, ownerId: p1, holdingId: holding?.id, siteId: "s5", bannerIds: lost, cause: "siege_fireball" },
    ]);
    expect(ofType(events, "site_ruined")).toEqual([{ type: "site_ruined", byPlayerId: p2, siteId: "s5" }]);
    expect(state.ruinedSiteIds).toEqual(["s5"]);
    expect(getRenown(ctx, state, p1)).toBe(3);
    expect(razedEffects(state)).toEqual([]);

    // Not the caster, whose Route reaches it…
    const caster = grant(state, p2, MANOR_COST);
    expect(checkBuildManor(ctx, caster, p2, "s5")).toEqual({ legal: false, reason: "SITE_RUINED" });
    reject(caster, p2, { type: "build_manor", siteId: "s5" }, "SITE_RUINED");
    // …nor its owner, now or ever.
    let later = passTurn(state);
    for (let i = 0; i < 4; i++) {
      const owner = grant(later, p1, MANOR_COST);
      expect(owner.activePlayerId).toBe(p1);
      expect(checkBuildManor(ctx, owner, p1, "s5")).toEqual({ legal: false, reason: "SITE_RUINED" });
      expect(getLegalActions(ctx, owner, p1).manorSites).not.toContain("s5");
      reject(owner, p1, { type: "build_manor", siteId: "s5" }, "SITE_RUINED");
      later = passTurn(passTurn(owner));
    }
  });

  it(`needs a rival with more Renown and at least ${BALANCE.raid.minHoldings} Holdings`, () => {
    const g = setupGame(standardRuleset(2));
    const { s: tied, card } = dealt(g.state, g.p1, "siege_fireball");
    expect(offered(tied, g.p1, card)).toEqual([]);
    refuse(tied, g.p1, card, fireball("s3"), "INVALID_CARD_TARGET");
    // Ahead on Renown, but with only the two starting Manors.
    const ahead = withRenown(tied, g.p2, 5);
    expect(offered(ahead, g.p1, card)).toEqual([]);
    refuse(ahead, g.p1, card, fireball("s3"), "INVALID_CARD_TARGET");
  });

  it("needs the rival strictly ahead on Renown even when they have enough Holdings", () => {
    const { s: base, p1, p2 } = siegeFixture();
    const { s: withCard, card } = dealt(base, p2, "siege_fireball");
    // p1 keeps 3 Holdings and 4 Renown; p2 draws level, then passes them.
    for (const renown of [4, 5]) {
      const s = withRenown(withCard, p2, renown);
      expect(player(s, p1).holdingIds.length).toBeGreaterThanOrEqual(BALANCE.raid.minHoldings);
      expect(getRenown(ctx, s, p1)).toBe(4);
      expect(offered(s, p2, card)).toEqual([]);
      refuse(s, p2, card, fireball("s5"), "INVALID_CARD_TARGET");
    }
  });

  it("keeps initial placement off a ruin too", () => {
    const s = edit(newGame(standardRuleset(2)), (c) => (c.ruinedSiteIds = ["s5"]));
    expect(getLegalInitialManorSites(ctx, s)).not.toContain("s5");
    reject(s, s.activePlayerId, { type: "place_initial_manor", siteId: "s5" }, "SITE_RUINED");
  });
});

describe("Sabotage (§19.27)", () => {
  const sabotage = (opponentId: PlayerId): CardTarget => ({ effect: "sabotage", opponentId });

  it(`burns ${BALANCE.sabotage.grain} of an opponent's Grain, or all they have`, () => {
    const g = setupGame(standardRuleset(2));
    const { s: base, card } = dealt(g.state, g.p1, "sabotage");
    const s = withResources(base, g.p2, { grain: 3, iron: 1 });
    expect(offered(s, g.p1, card)).toEqual([sabotage(g.p2)]);
    const { state, events } = play(s, g.p1, card, sabotage(g.p2));
    expect(player(state, g.p2).resources).toMatchObject({ grain: 1, iron: 1 });
    expect(ofType(events, "resources_lost")).toEqual([
      { type: "resources_lost", byPlayerId: g.p1, playerId: g.p2, resource: "grain", amount: 2, cause: "sabotage" },
    ]);
    const poor = play(withResources(base, g.p2, { grain: 1 }), g.p1, card, sabotage(g.p2));
    expect(player(poor.state, g.p2).resources.grain).toBe(0);
    expect(ofType(poor.events, "resources_lost")[0]?.amount).toBe(1);
  });

  it("needs an opponent who has Grain", () => {
    const g = setupGame(standardRuleset(2));
    const { s: base, card } = dealt(withResources(g.state, g.p1, { grain: 4 }), g.p1, "sabotage");
    const s = withResources(base, g.p2, { iron: 3 });
    expect(offered(s, g.p1, card)).toEqual([]);
    refuse(s, g.p1, card, sabotage(g.p2), "INVALID_CARD_TARGET");
    refuse(s, g.p1, card, sabotage(g.p1), "INVALID_CARD_TARGET");
  });
});

describe("the third wave: Counterspell, insurance and the Renown floor", () => {
  const THIRD_WAVE: { card: string; target: (p1: PlayerId) => CardTarget; insured: boolean }[] = [
    { card: "disgrace", target: (p1) => ({ effect: "disgrace", opponentId: p1 }), insured: true },
    { card: "siege_engines", target: () => ({ effect: "siege_engines", siteId: "s9" }), insured: true },
    { card: "raiders", target: () => ({ effect: "raiders", siteId: "s5" }), insured: true },
    { card: "stolen_glory", target: (p1) => ({ effect: "stolen_glory", opponentId: p1 }), insured: true },
    { card: "siege_fireball", target: () => ({ effect: "siege_fireball", siteId: "s5" }), insured: true },
    { card: "sabotage", target: (p1) => ({ effect: "sabotage", opponentId: p1 }), insured: false },
  ];
  /** What any of these cards could change. */
  const outcome = (s: GameState, p1: PlayerId, p2: PlayerId) => ({
    renown: [getRenown(ctx, s, p1), getRenown(ctx, s, p2)],
    holdings: s.holdings,
    banners: s.banners,
    grain: player(s, p1).resources.grain,
    ruins: s.ruinedSiteIds ?? [],
    effects: s.activeEffects,
  });

  it.each(THIRD_WAVE)("$card is a Spell: a Counterspell cancels it", ({ card: def, target }) => {
    const { s: base, p1, p2 } = siegeFixture();
    const { s, card } = dealt(give(base, p1, "counterspell"), p2, def);
    const pending = play(s, p2, card, target(p1)).state;
    expect(pending.pending?.kind).toBe("reaction");
    const r = act(pending, p1, { type: "react", cardId: lastCard(pending, p1) });
    expect(ofType(r.events, "card_cancelled")).toHaveLength(1);
    expect(outcome(r.state, p1, p2)).toEqual(outcome(s, p1, p2));
    expect(r.state.discardPile).toContain(card);
  });

  it.each(THIRD_WAVE)("$card and the Royal Insurance Policy", ({ card: def, target, insured }) => {
    const { s: base, p1, p2 } = siegeFixture();
    const { s: covered, policy } = insure(base, p1);
    const { s, card } = dealt(covered, p2, def);
    const { state, events } = play(s, p2, card, target(p1));
    const claims = ofType(events, "insurance_claimed");
    if (insured) {
      expect(claims).toEqual([{ type: "insurance_claimed", playerId: p1, cardId: policy, against: def }]);
      expect(outcome(state, p1, p2)).toEqual(outcome(s, p1, p2));
      expect(insurancePolicyOf(ctx, state, p1)).toBeUndefined();
    } else {
      expect(claims).toEqual([]);
      expect(outcome(state, p1, p2)).not.toEqual(outcome(s, p1, p2));
      expect(insurancePolicyOf(ctx, state, p1)).toBe(policy);
    }
  });

  it.each(THIRD_WAVE)("$card's events are public", ({ card: def, target }) => {
    const { s: base, p1, p2 } = siegeFixture();
    const { s, card } = dealt(base, p2, def);
    const { events } = play(s, p2, card, target(p1));
    for (const viewer of [p1, p2, null]) for (const e of events) expect(redactEvent(e, viewer)).toEqual(e);
  });

  it("never takes Renown below 0: a later loss forgives Renown lost for good", () => {
    const { s: base, p1, p2 } = siegeFixture();
    // p1 has lost all 4 of their Renown for good, to Disgraces and Stolen Glory.
    const s = edit(base, (c) => (player(c, p1).lostRenown = 4));
    expect(getRenown(ctx, s, p1)).toBe(0);
    const { s: withCard, card } = dealt(s, p2, "raiders");
    const burned = play(withCard, p2, card, { effect: "raiders", siteId: "s5" }).state;
    expect(getRenown(ctx, burned, p1)).toBe(0);
    expect(player(burned, p1).lostRenown).toBe(3);
    // Rebuilding then counts in full: no debt is left over.
    const rebuilt = act(grant(passTurn(burned), p1, MANOR_COST), p1, { type: "build_manor", siteId: "s5" }).state;
    expect(getRenown(ctx, rebuilt, p1)).toBe(1);
  });

  it("forgives Renown lost for good when a Stronghold is reduced too", () => {
    const { s: base, p1, p2 } = siegeFixture();
    const s = edit(base, (c) => (player(c, p1).lostRenown = 4));
    const { s: withCard, card } = dealt(s, p2, "siege_engines");
    const reduced = play(withCard, p2, card, { effect: "siege_engines", siteId: "s9" }).state;
    expect(getRenown(ctx, reduced, p1)).toBe(0);
    expect(player(reduced, p1).lostRenown).toBe(3);
  });
});

// ---------------------------------------------------------------- The Dowager (§19.28)

describe("The Dowager (§19.28)", () => {
  const at = (siteId: string, pay: { tollPayment?: ResourceType; extraPayment?: ResourceType } = {}): CardTarget => ({ effect: "the_dowager", siteId, ...pay });
  const PLENTY = { grain: 20, timber: 20, stone: 20, iron: 20, essence: 20 };

  /**
   * p1's turn 1 with a Stronghold on s1, The Dowager in hand and exactly the
   * price of a Manor. p2's Manor on s3 is off the board, so s2, at the far
   * end of p1's s1–s2 Route, has no rival next to it.
   */
  function dowager(ruleset = standardRuleset(2)) {
    const g = setupGame(ruleset);
    let s = withoutHolding(g.state, "s3");
    s = act(grant(s, g.p1, { grain: 2, iron: 2 }), g.p1, { type: "upgrade_holding", siteId: "s1" }).state;
    s = withResources(s, g.p1, MANOR_COST);
    const { s: withCard, card } = dealt(s, g.p1, "the_dowager");
    return { s: withCard, card, p1: g.p1, p2: g.p2 };
  }

  it("builds a Manor, her Dower House, next to your Stronghold at full cost", () => {
    const { s, card, p1 } = dowager();
    // An ordinary Manor there would break the spacing rule (§10.3).
    expect(checkBuildManor(ctx, s, p1, "s2")).toMatchObject({ legal: false, reason: "SITE_TOO_CLOSE" });
    expect(offered(s, p1, card)).toEqual([at("s2")]);
    const before = getRenown(ctx, s, p1);
    const { state, events } = play(s, p1, card, at("s2"));

    const house = holdingAt(state, "s2");
    expect(house).toMatchObject({ ownerId: p1, type: "manor", dowerHouse: true });
    expect(player(state, p1).resources).toEqual({ grain: 0, timber: 0, stone: 0, iron: 0, essence: 0 });
    expect(ofType(events, "resource_spent").map((e) => [e.resource, e.amount, e.reason])).toEqual([
      ["grain", 1, "build_manor"],
      ["timber", 1, "build_manor"],
      ["stone", 1, "build_manor"],
    ]);
    expect(ofType(events, "holding_built")).toEqual([{ type: "holding_built", playerId: p1, holdingId: house?.id, siteId: "s2", free: false }]);
    expect(bannersAt(state, "s2")).toHaveLength(1);
    expect(getRenown(ctx, state, p1)).toBe(before + 1);
    expect(state.discardPile).toContain(card);
    // Afterwards it is an ordinary Manor: it can be raised to a Stronghold.
    const raised = act(grant(state, p1, { grain: 2, iron: 2 }), p1, { type: "upgrade_holding", siteId: "s2" }).state;
    expect(holdingAt(raised, "s2")).toMatchObject({ type: "stronghold", dowerHouse: true });
  });

  it("needs one of your Routes from one of your Strongholds to an empty Site with no rival next to it", () => {
    const { s, card, p1, p2 } = dowager();
    refuse(s, p1, card, at("s1"), "SITE_OCCUPIED");
    // s6 is at the end of p1's Route from s9, a Manor.
    refuse(s, p1, card, at("s6"), "NOT_CONNECTED");
    // No Route of p1's joins s1 to s4.
    refuse(s, p1, card, at("s4"), "NOT_CONNECTED");
    // A rival's Route, or a fogged one, does not count.
    const theirs = edit(s, (c) => {
      c.routeOwners[routeId(1, 2)] = p2;
      player(c, p1).routeIds = player(c, p1).routeIds.filter((r) => r !== routeId(1, 2));
      player(c, p2).routeIds.push(routeId(1, 2));
    });
    refuse(theirs, p1, card, at("s2"), "NOT_CONNECTED");
    const fogged = edit(s, (c) => c.activeEffects.push({ kind: "fog", routeId: routeId(1, 2), sourcePlayerId: p2 }));
    refuse(fogged, p1, card, at("s2"), "NOT_CONNECTED");
    // With p2's Manor on s3 in place, s2 is next to a rival.
    const g = setupGame(standardRuleset(2));
    const upgraded = act(grant(g.state, g.p1, { grain: 3, iron: 2, timber: 1, stone: 1 }), g.p1, { type: "upgrade_holding", siteId: "s1" }).state;
    const crowded = dealt(upgraded, g.p1, "the_dowager");
    refuse(crowded.s, g.p1, crowded.card, at("s2"), "SITE_TOO_CLOSE");
    expect(offered(crowded.s, g.p1, crowded.card)).toEqual([]);
  });

  it("is refused on a ruin and on or next to a Site razed for someone else, but not next to a ruin", () => {
    const { s, card, p1, p2 } = dowager();
    refuse(edit(s, (c) => (c.ruinedSiteIds = ["s2"])), p1, card, at("s2"), "SITE_RUINED");
    const razed = (siteId: string) => edit(s, (c) => c.activeEffects.push({ kind: "razed", siteId, ownerId: p2, sourcePlayerId: p1 }));
    refuse(razed("s2"), p1, card, at("s2"), "SITE_RAZED");
    refuse(razed("s3"), p1, card, at("s2"), "SITE_RAZED");
    // A ruin is not a Holding (§19.26).
    expect(offered(edit(s, (c) => (c.ruinedSiteIds = ["s3"])), p1, card)).toEqual([at("s2")]);
  });

  it("needs the full price, with a toll or surcharge only when one is due", () => {
    const { s, card, p1 } = dowager();
    refuse(withResources(s, p1, { grain: 1, timber: 1 }), p1, card, at("s2"), "INSUFFICIENT_RESOURCES");
    refuse(s, p1, card, at("s2", { tollPayment: "grain" }), "INVALID_PAYMENT");
    refuse(s, p1, card, at("s2", { extraPayment: "grain" }), "INVALID_PAYMENT");

    // The Highwayman on p1's s1–s2 Route: a toll of 1, as for any Manor there.
    const toll = edit(s, (c) => {
      const m = c.menaces.menace_highwayman;
      if (m) m.location = { kind: "route", routeId: routeId(1, 2) };
    });
    refuse(toll, p1, card, at("s2"), "INVALID_PAYMENT");
    refuse(toll, p1, card, at("s2", { tollPayment: "grain" }), "INSUFFICIENT_RESOURCES");
    const paying = withResources(toll, p1, { ...MANOR_COST, iron: 1 });
    expect(offered(paying, p1, card)).toEqual([at("s2", { tollPayment: "iron" })]);
    expect(player(play(paying, p1, card, at("s2", { tollPayment: "iron" })).state, p1).resources.iron).toBe(0);

    // Goblin Tinkers on s2: their surcharge of 1.
    const goblins = edit(withResources(s, p1, { ...MANOR_COST, stone: 2 }), (c) => {
      c.menaces.menace_goblin_tinkers = { id: "menace_goblin_tinkers", type: "goblin_tinkers", location: { kind: "site", siteId: "s2" }, state: {} };
    });
    refuse(goblins, p1, card, at("s2"), "INVALID_PAYMENT");
    expect(offered(goblins, p1, card)).toEqual([at("s2", { extraPayment: "stone" })]);
    expect(player(play(goblins, p1, card, at("s2", { extraPayment: "stone" })).state, p1).resources.stone).toBe(0);
  });

  it("is a Hero: no reaction window opens, so nobody can counter it", () => {
    const { s: base, card, p1, p2 } = dowager();
    const s = give(base, p2, "counterspell");
    const { state, events } = play(s, p1, card, at("s2"));
    expect(state.pending).toBeUndefined();
    expect(ofType(events, "reaction_requested")).toEqual([]);
    expect(holdingAt(state, "s2")?.ownerId).toBe(p1);
    expect(player(state, p1).stats.heroesPlayed).toBe(1);
  });

  it("behaves the same on a redacted view", () => {
    const { s, card, p1 } = dowager();
    const view = redactState(s, p1);
    expect(enumerateCardTargets(ctx, view, p1, card)).toEqual(enumerateCardTargets(ctx, s, p1, card));
    const r = engine.applyCommand(view, cmd(view, p1, { type: "play_card", cardId: card, target: at("s2") }));
    expect(r.error).toBeUndefined();
    expect(holdingAt(r.newState as GameState, "s2")?.dowerHouse).toBe(true);
  });

  describe("and a full board (§7)", () => {
    /**
     * Round 1, p1's turn: p2's Manor on s3 lies in ruins, p1 has built a
     * Stronghold on s5 and raised s1 and s9, and holds The Dowager. Once p2
     * raises s7 no Site is open, yet s2 and s6 are Dower House Sites for p1.
     */
    function filling() {
      const g = setupGame(standardRuleset(2));
      let s = edit(withoutHolding(g.state, "s3"), (c) => (c.ruinedSiteIds = ["s3"]));
      s = grant(s, g.p1, PLENTY);
      s = act(s, g.p1, { type: "build_route", routeId: routeId(2, 5) }).state;
      s = act(s, g.p1, { type: "build_manor", siteId: "s5" }).state;
      for (const site of ["s5", "s1", "s9"]) s = act(s, g.p1, { type: "upgrade_holding", siteId: site }).state;
      const { s: withCard, card } = dealt(s, g.p1, "the_dowager");
      return { s: withCard, card, p1: g.p1, p2: g.p2 };
    }
    const p2Fills = (s: GameState, p2: PlayerId): GameState => act(grant(s, p2, PLENTY), p2, { type: "upgrade_holding", siteId: "s7" }).state;

    it("still ends the game when a player holds the card", () => {
      const { s, card, p1, p2 } = filling();
      const full = p2Fills(passTurn(s), p2);
      expect(isBoardFull(ctx, full)).toBe(true);
      // Hands are hidden, so a card in one cannot keep the board open.
      expect(enumerateCardTargets(ctx, full, p1, card).map((t) => (t as { siteId: string }).siteId).sort()).toEqual(["s2", "s6"]);
      const ended = passTurn(full);
      expect(ended.status).toBe("finished");
      expect(ended.endCause).toBe("full_board");
    });

    it("plays on once the card is played, until the Dower House is raised", () => {
      const { s, card, p1, p2 } = filling();
      const played = play(s, p1, card, at("s2")).state;
      let next = p2Fills(passTurn(played), p2);
      expect(isBoardFull(ctx, next)).toBe(false);
      next = passTurn(next);
      expect(next.status).toBe("playing");
      expect(next.round).toBe(2);
      next = act(grant(next, p1, PLENTY), p1, { type: "upgrade_holding", siteId: "s2" }).state;
      expect(isBoardFull(ctx, next)).toBe(true);
      const ended = passTurn(passTurn(next));
      expect(ended.status).toBe("finished");
      expect(ended.endCause).toBe("full_board");
    });

    it("counts a razed Dower House as open while its owner may rebuild it", () => {
      const { s, card, p1, p2 } = filling();
      let next = p2Fills(passTurn(play(s, p1, card, at("s2")).state), p2);
      next = act(next, p2, { type: "build_route", routeId: routeId(2, 3) }).state;
      const raid = dealt(next, p2, "raiders");
      next = play(raid.s, p2, raid.card, { effect: "raiders", siteId: "s2" }).state;
      // Its owner may rebuild it beside their Strongholds on s1 and s5 (§19.24).
      expect(isBoardFull(ctx, next)).toBe(false);
      next = passTurn(next);
      expect(next.status).toBe("playing");
      expect(checkBuildManor(ctx, grant(next, p1, MANOR_COST), p1, "s2")).toMatchObject({ legal: true });
      // Once the window closes unused, the board is full again.
      const ended = passTurn(passTurn(next));
      expect(ended.status).toBe("finished");
      expect(ended.endCause).toBe("full_board");
    });
  });

  describe("and Raiders (§19.24)", () => {
    /** p2's turn 1: p1's Dower House stands on s2, and p2's s2–s3 Route reaches it. */
    function raided() {
      const { s: base, card, p1, p2 } = dowager();
      let s = passTurn(play(base, p1, card, at("s2")).state);
      s = act(grant(s, p2, { timber: 1, stone: 1 }), p2, { type: "build_route", routeId: routeId(2, 3) }).state;
      const raid = dealt(s, p2, "raiders");
      s = play(raid.s, p2, raid.card, { effect: "raiders", siteId: "s2" }).state;
      return { s, p1, p2 };
    }

    it("marks the razed Site as a Dower House's", () => {
      const { s, p1, p2 } = raided();
      expect(holdingAt(s, "s2")).toBeUndefined();
      expect(razedEffects(s)).toEqual([{ kind: "razed", siteId: "s2", ownerId: p1, sourcePlayerId: p2, dowerHouse: true, besideOwnHoldings: true }]);
    });

    it("counts the razed Site as open to its owner alone while the ashes are warm", () => {
      const { s, p1, p2 } = raided();
      expect(isSiteOpenFor(ctx, s, p1, "s2")).toBe(true);
      expect(manorSiteClosedReason(ctx, s, p2, "s2")).toBe("SITE_RAZED");
      // Open to someone, so open on a board seen by no player in particular.
      expect(manorSiteClosedReason(ctx, s, null, "s2")).toBeNull();
    });

    it("lets its owner rebuild it with an ordinary build while the ashes are warm, and not after", () => {
      const { s, p1 } = raided();
      const theirTurn = grant(passTurn(s), p1, MANOR_COST);
      expect(checkBuildManor(ctx, theirTurn, p1, "s2")).toMatchObject({ legal: true });
      expect(getLegalActions(ctx, theirTurn, p1).manorSites).toContain("s2");
      const rebuilt = act(theirTurn, p1, { type: "build_manor", siteId: "s2" }).state;
      expect(holdingAt(rebuilt, "s2")).toMatchObject({ ownerId: p1, dowerHouse: true });
      expect(razedEffects(rebuilt)).toEqual([]);

      // Once the owner's next turn is over, s2 is too close to s1 again.
      const cooled = grant(passTurn(passTurn(theirTurn)), p1, MANOR_COST);
      expect(razedEffects(cooled)).toEqual([]);
      expect(checkBuildManor(ctx, cooled, p1, "s2")).toEqual({ legal: false, reason: "SITE_TOO_CLOSE" });
    });

    it("puts out the embers when she builds on a razed Dower House of yours", () => {
      const { s, p1 } = raided();
      const again = dealt(grant(passTurn(s), p1, MANOR_COST), p1, "the_dowager");
      const rebuilt = play(again.s, p1, again.card, at("s2")).state;
      expect(holdingAt(rebuilt, "s2")).toMatchObject({ ownerId: p1, dowerHouse: true });
      expect(razedEffects(rebuilt)).toEqual([]);
    });

    it("lets the owner rebuild a burned Manor beside their Dower House", () => {
      // p2 reduces p1's Stronghold on s1, beside the Dower House on s2, then burns it.
      const { s: base, card, p1, p2 } = dowager();
      let s = grant(passTurn(play(base, p1, card, at("s2")).state), p2, PLENTY);
      s = act(s, p2, { type: "build_route", routeId: routeId(4, 7) }).state;
      s = act(s, p2, { type: "build_route", routeId: routeId(1, 4) }).state;
      const siege = dealt(s, p2, "siege_engines");
      s = play(siege.s, p2, siege.card, { effect: "siege_engines", siteId: "s1" }).state;
      expect(holdingAt(s, "s1")?.type).toBe("manor");
      const raid = dealt(passTurn(passTurn(s)), p2, "raiders");
      s = play(raid.s, p2, raid.card, { effect: "raiders", siteId: "s1" }).state;
      expect(razedEffects(s)).toEqual([{ kind: "razed", siteId: "s1", ownerId: p1, sourcePlayerId: p2, besideOwnHoldings: true }]);

      const theirTurn = grant(passTurn(s), p1, MANOR_COST);
      expect(checkBuildManor(ctx, theirTurn, p1, "s1")).toMatchObject({ legal: true });
      const rebuilt = act(theirTurn, p1, { type: "build_manor", siteId: "s1" }).state;
      expect(holdingAt(rebuilt, "s1")).toEqual({ id: expect.any(String), siteId: "s1", ownerId: p1, type: "manor" });
      expect(razedEffects(rebuilt)).toEqual([]);
    });
  });
});
