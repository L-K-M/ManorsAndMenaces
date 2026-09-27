import { describe, expect, it } from "vitest";
import {
  HIDDEN_CHARGE,
  canRecommission,
  chargeDeckFor,
  chargesPerGame,
  clone,
  getChargeProgress,
  getLegalActions,
  getRenown,
  getRenownSources,
  redactEvent,
  redactState,
  RULESET_VERSION,
  type ChargeId,
  type GameCommand,
  type GameEvent,
  type GameState,
  type PlayerId,
  type RulesetConfig,
} from "../src/index.js";
import { act, cardTestRuleset, engine, grant, mvpRuleset, newGame, passTurn, reject, routeId, setupGame, standardRuleset } from "./helpers.js";

// Sealed Charges (§27A), a lobby option: each player keeps a hidden goal,
// revealed and scored at their End Turn once met. The test content's
// Charges are listed in helpers.ts.

const ctx = engine.ctx;
const sealed = (ruleset: RulesetConfig = mvpRuleset()): RulesetConfig => ({ ...ruleset, sealedCharges: true });

/** The player keeps `chargeId` now, as if they had just drawn it (deeds count from here). */
function seal(state: GameState, playerId: PlayerId, chargeId: ChargeId): GameState {
  const s = clone(state);
  s.pending = { kind: "charge", playerId, chargeIds: [chargeId] };
  return act(s, playerId, { type: "choose_charge", chargeId }).state;
}

/** setupGame with Sealed Charges and nobody holding one yet, so each test deals its own. */
function sealedGame(ruleset: RulesetConfig = sealed()) {
  const game = setupGame(ruleset);
  const s = clone(game.state);
  for (const p of Object.values(s.players)) delete p.sealedCharge;
  return { ...game, state: s };
}

function progressOf(s: GameState, playerId: PlayerId) {
  const charge = s.players[playerId]?.sealedCharge;
  if (!charge) throw new Error(`${playerId} holds no Charge`);
  return getChargeProgress(ctx, s, playerId, charge);
}

/** Ends the active player's turn, keeping the End Turn's events. */
function endTurn(state: GameState): { state: GameState; events: GameEvent[] } {
  const p = state.activePlayerId;
  let s = state;
  if (s.phase === "main") s = act(s, p, { type: "end_main_phase" }).state;
  if (s.phase === "banner_assignment") s = act(s, p, { type: "assign_banners", assignments: {} }).state;
  return act(s, p, { type: "end_turn" });
}

const setBonus = (s: GameState, playerId: PlayerId, value: number): GameState =>
  engine.applyDebugCommand(s, { type: "debug_set_bonus_renown", commandId: "bonus", matchId: s.matchId, playerId, targetPlayerId: playerId, value }).newState as GameState;

describe("the Sealed Charges option", () => {
  it("is off unless chosen, and a game without it holds no Charge", () => {
    expect(RULESET_VERSION).toBe("0.8.0");
    expect(standardRuleset(3).sealedCharges).toBeUndefined();
    expect(mvpRuleset().sealedCharges).toBeUndefined();
    expect(standardRuleset(3, { sealedCharges: true }).sealedCharges).toBe(true);
    expect(mvpRuleset({ sealedCharges: false }).sealedCharges).toBeUndefined();

    const { state, p1 } = setupGame(cardTestRuleset(2));
    expect(state.chargeDeck).toBeUndefined();
    expect(state.pending).toBeUndefined();
    // A Warden's move is not counted per Menace, so older games keep their stats as they were.
    let s = grant(state, p1, { essence: 1, grain: 1 });
    s = act(s, p1, { type: "hire_warden", menaceId: "menace_toll_troll", destination: { kind: "region", regionId: "R1" } }).state;
    const after = endTurn(s);
    expect(after.state.players[p1]?.stats.menaceMoves).toBeUndefined();
    expect(Object.keys(after.state.players[p1] ?? {})).not.toContain("sealedCharge");
    expect(after.events.some((e) => e.type.startsWith("charge"))).toBe(false);
  });

  it("holds one Charge per game below goal 25, two at 25 and three at 30", () => {
    expect([10, 13, 15, 20, 24, 25, 29, 30].map(chargesPerGame)).toEqual([1, 1, 1, 1, 1, 2, 2, 3]);
  });
});

describe("the deal at setup", () => {
  it("has each seat in turn order keep one of two Charges before the first placement", () => {
    const s = newGame(sealed());
    const [first, second] = s.turnOrder as [PlayerId, PlayerId];
    const deckSize = chargeDeckFor(ctx, s.ruleset).length;
    const offer = s.pending?.kind === "charge" ? s.pending.chargeIds : [];
    expect(s.pending).toEqual({ kind: "charge", playerId: first, chargeIds: offer });
    expect(offer).toHaveLength(2);
    expect(s.chargeDeck).toHaveLength(deckSize - 2);

    reject(s, first, { type: "place_initial_manor", siteId: "s1" }, "PENDING_DECISION");
    reject(s, second, { type: "choose_charge", chargeId: offer[0] as string }, "NOT_ACTIVE_PLAYER");
    reject(s, first, { type: "choose_charge", chargeId: "nonsense" }, "CHARGE_NOT_OFFERED");
    expect(getLegalActions(ctx, s, first).mode).toBe("charge");
    expect(getLegalActions(ctx, s, second).mode).toBe("none");

    const kept = act(s, first, { type: "choose_charge", chargeId: offer[1] as string });
    expect(kept.state.players[first]?.sealedCharge?.id).toBe(offer[1]);
    // The Charge not kept goes to the bottom of the deck.
    expect(kept.state.chargeDeck?.at(-1)).toBe(offer[0]);
    const next = kept.state.pending?.kind === "charge" ? kept.state.pending.chargeIds : [];
    expect(kept.state.pending).toEqual({ kind: "charge", playerId: second, chargeIds: next });
    expect(kept.events).toEqual([
      { type: "charge_kept", playerId: first, chargeId: offer[1] },
      { type: "charges_drawn", playerId: second, chargeIds: next, count: 2 },
    ]);
    expect(next).not.toContain(offer[0]);
    expect(next).not.toContain(offer[1]);

    const done = act(kept.state, second, { type: "choose_charge", chargeId: next[0] as string }).state;
    expect(done.pending).toBeUndefined();
    expect(done.status).toBe("setup");
    expect(done.activePlayerId).toBe(first);
    act(done, first, { type: "place_initial_manor", siteId: "s1" });
  });

  it("refuses a choice when no Charge is being chosen, such as the same choice sent twice", () => {
    const { state, p1 } = sealedGame();
    const drawn = act(grant(seal(state, p1, "inn"), p1, { essence: 1 }), p1, { type: "recommission_charge" }).state;
    const offer = drawn.pending?.kind === "charge" ? drawn.pending.chargeIds : [];
    const kept = act(drawn, p1, { type: "choose_charge", chargeId: offer[0] as string }).state;
    reject(kept, p1, { type: "choose_charge", chargeId: offer[0] as string }, "NO_CHARGE_CHOICE");
    // Another decision waiting is not a Charge to choose either.
    const prophecy: GameState = { ...clone(kept), pending: { kind: "prophecy", playerId: p1, cardIds: [] } };
    reject(prophecy, p1, { type: "choose_charge", chargeId: offer[1] as string }, "NO_CHARGE_CHOICE");
  });

  it("gives every player a Charge of their own, and never one naming a Menace not in play", () => {
    for (let game = 0; game < 30; game++) {
      const ruleset = sealed(cardTestRuleset(4));
      let s = engine.createGame({
        matchId: "m4",
        seed: `charges-${game}`,
        rulesetVersion: RULESET_VERSION,
        ruleset,
        players: ["A", "B", "C", "D"].map((id) => ({ id, displayName: id })),
      });
      const seen: ChargeId[] = [];
      while (s.pending?.kind === "charge") {
        const { playerId, chargeIds } = s.pending;
        seen.push(...chargeIds);
        s = act(s, playerId, { type: "choose_charge", chargeId: chargeIds[game % chargeIds.length] as string }).state;
      }
      const kept = s.turnOrder.map((id) => s.players[id]?.sealedCharge?.id);
      expect(new Set(kept).size).toBe(4);
      // Four seats drew two each, all different: nothing kept was offered twice.
      expect(new Set(seen).size).toBe(8);
      // Toll Troll, Young Dragon and Bog Witch play with 4; the Highwayman and the Goblins do not.
      for (const id of [...seen, ...(s.chargeDeck ?? [])]) expect(["highwayman", "goblins", "hall", "iron"]).not.toContain(id);
      expect([...(s.chargeDeck ?? []), ...kept].sort()).toEqual(chargeDeckFor(ctx, ruleset).sort());
    }
  });

  it("leaves out Charges the game cannot meet: other Menaces, missing landmarks and Regions, rules left out", () => {
    // Core: no cards, and the Toll Troll alone. The test board has no Dwarven Hall and one Iron Region.
    expect(chargeDeckFor(ctx, sealed()).sort()).toEqual(["castle", "grain", "inn", "stone", "tower", "trades", "troll", "writs"]);
    expect(chargeDeckFor(ctx, sealed(cardTestRuleset(2))).sort()).toEqual(["cards", "castle", "grain", "highwayman", "inn", "stone", "tower", "trades", "troll", "writs"]);
    const noWrits = sealed({ ...mvpRuleset(), writ: { ...mvpRuleset().writ, enabled: false } });
    expect(chargeDeckFor(ctx, noWrits)).not.toContain("writs");
    // A Menace Charge needs a way to move the Menace: a Warden, or a card such as Knight Errant.
    const noWardens = (ruleset: RulesetConfig) => sealed({ ...ruleset, warden: { ...ruleset.warden, enabled: false } });
    expect(chargeDeckFor(ctx, noWardens(mvpRuleset()))).not.toContain("troll");
    expect(chargeDeckFor(ctx, noWardens(cardTestRuleset(2)))).toContain("troll");
  });
});

describe("the goals", () => {
  it("landmark: the network reaches it and a Banner stands in a Region touching it", () => {
    const { state, p2 } = sealedGame();
    // p2's Banner in R5 touches the Royal Castle on s1, but their network does not reach it.
    let s = seal(passTurn(state), p2, "castle");
    expect(progressOf(s, p2)).toEqual({ complete: false, current: 1, target: 2 });
    s = grant(s, p2, { timber: 2, stone: 2 });
    s = act(s, p2, { type: "build_route", routeId: routeId(4, 7) }).state;
    s = act(s, p2, { type: "build_route", routeId: routeId(1, 4) }).state;
    expect(progressOf(s, p2)).toEqual({ complete: true, current: 2, target: 2 });
  });

  it("Banners: Regions of the resource held at the same time, and a revealed Charge stays scored", () => {
    const { state, p1, bannerOf } = sealedGame();
    let s = seal(state, p1, "grain");
    expect(progressOf(s, p1)).toEqual({ complete: false, current: 1, target: 2 });
    const renown = getRenown(ctx, s, p1);
    s = act(s, p1, { type: "end_main_phase" }).state;
    s = act(s, p1, { type: "assign_banners", assignments: { [bannerOf(p1, "s9")]: "R7" } }).state;
    expect(progressOf(s, p1).complete).toBe(true);
    const { state: after, events } = act(s, p1, { type: "end_turn" });
    expect(events).toContainEqual({ type: "charge_revealed", playerId: p1, chargeId: "grain", renown: 2 });
    expect(after.players[p1]?.sealedCharge).toBeUndefined();
    expect(after.players[p1]?.revealedChargeIds).toEqual(["grain"]);
    expect(getRenown(ctx, after, p1)).toBe(renown + 2);

    // Moving the Banner away later takes nothing back.
    let later = passTurn(after);
    later = act(later, p1, { type: "end_main_phase" }).state;
    later = act(later, p1, { type: "assign_banners", assignments: { [bannerOf(p1, "s9")]: "R8" } }).state;
    expect(getRenown(ctx, act(later, p1, { type: "end_turn" }).state, p1)).toBe(renown + 2);
  });

  it("deeds count only from when the Charge was drawn", () => {
    const { state, p1 } = sealedGame();
    const before = clone(state);
    (before.players[p1] as GameState["players"][string]).stats.marketTrades = 7;
    let s = seal(before, p1, "trades");
    expect(s.players[p1]?.sealedCharge).toEqual({ id: "trades", since: 7 });
    expect(progressOf(s, p1)).toEqual({ complete: false, current: 0, target: 5 });
    s = grant(s, p1, { grain: 6 });
    s = act(s, p1, { type: "trade", give: "grain", receive: "iron" }).state;
    s = act(s, p1, { type: "trade", give: "grain", receive: "stone" }).state;
    expect(progressOf(s, p1)).toEqual({ complete: false, current: 2, target: 5 });
    const more = clone(s);
    (more.players[p1] as GameState["players"][string]).stats.marketTrades = 12;
    expect(progressOf(more, p1).complete).toBe(true);
  });

  it("cards bought and Writs issued count as deeds", () => {
    const { state, p1, p2, bannerOf } = sealedGame(sealed(cardTestRuleset(2)));
    let s = seal(state, p1, "cards");
    s = grant(s, p1, { grain: 1, iron: 1, essence: 1 });
    s = act(s, p1, { type: "buy_card" }).state;
    expect(progressOf(s, p1).current).toBe(1);

    // p2's Banner in R5, next to p1's Manor on s1, has harvested by p1's third turn, so a Writ may send it home.
    s = seal(passTurn(passTurn(passTurn(passTurn(s)))), p1, "writs");
    s = grant(s, p1, { essence: 1, grain: 1 });
    s = act(s, p1, { type: "issue_royal_writ", targetBannerId: bannerOf(p2, "s3"), bribe: "grain" }).state;
    expect(progressOf(s, p1)).toEqual({ complete: false, current: 1, target: 3 });
  });

  it("Menace: moves of the named Menace by the player, from the draw", () => {
    const { state, p1 } = sealedGame(sealed(cardTestRuleset(2)));
    let s = seal(state, p1, "troll");
    s = grant(s, p1, { essence: 3, grain: 3 });
    // The Highwayman is another Menace: his move does not count.
    s = act(s, p1, { type: "hire_warden", menaceId: "menace_highwayman", destination: { kind: "route", routeId: routeId(4, 5) } }).state;
    expect(progressOf(s, p1).current).toBe(0);
    expect(s.players[p1]?.stats.menaceMoves).toEqual({ highwayman: 1 });
    s = passTurn(passTurn(s));
    s = act(s, p1, { type: "hire_warden", menaceId: "menace_toll_troll", destination: { kind: "region", regionId: "R2" } }).state;
    expect(progressOf(s, p1)).toEqual({ complete: false, current: 1, target: 2 });
    s = passTurn(passTurn(s));
    s = act(s, p1, { type: "hire_warden", menaceId: "menace_toll_troll", destination: { kind: "region", regionId: "R6" } }).state;
    expect(progressOf(s, p1).complete).toBe(true);
    expect(endTurn(s).events).toContainEqual({ type: "charge_revealed", playerId: p1, chargeId: "troll", renown: 2 });
  });
});

describe("revealing a Charge", () => {
  it("happens at its holder's End Turn, before the victory check", () => {
    const { state, p1 } = sealedGame();
    // p1's Manor on s1 and Banner in R1 already meet the Royal Castle Charge.
    const s = setBonus(seal(state, p1, "castle"), p1, state.ruleset.targetRenown - 4);
    expect(getRenown(ctx, s, p1)).toBe(state.ruleset.targetRenown - 2);
    const { state: after, events } = endTurn(s);
    const types = events.map((e) => e.type);
    expect(types.indexOf("charge_revealed")).toBeGreaterThanOrEqual(0);
    expect(types.indexOf("charge_revealed")).toBeLessThan(types.indexOf("game_won"));
    expect(after.status).toBe("finished");
    expect(after.winnerId).toBe(p1);
  });

  it("waits for the holder's own End Turn", () => {
    const { state, p1, p2 } = sealedGame();
    const s = seal(passTurn(state), p1, "castle");
    expect(s.activePlayerId).toBe(p2);
    const theirs = endTurn(s);
    expect(theirs.events.some((e) => e.type === "charge_revealed")).toBe(false);
    expect(theirs.state.players[p1]?.sealedCharge?.id).toBe("castle");
    expect(endTurn(theirs.state).events).toContainEqual({ type: "charge_revealed", playerId: p1, chargeId: "castle", renown: 2 });
  });
});

describe("further Charges at the higher goals", () => {
  const atGoal = (targetRenown: number) => sealed(standardRuleset(2, { targetRenown }));

  it("has the player keep another before the turn passes, from Banner, deed and Menace Charges only", () => {
    const { state, p1, p2 } = sealedGame(atGoal(25));
    const { state: s, events } = endTurn(seal(state, p1, "castle"));
    expect(events.map((e) => e.type)).toContain("charge_revealed");
    expect(s.pending?.kind).toBe("charge");
    const offer = s.pending?.kind === "charge" ? s.pending.chargeIds : [];
    expect(offer).toHaveLength(2);
    for (const id of offer) expect(["castle", "tower", "inn"]).not.toContain(id);
    expect(s.activePlayerId).toBe(p1);
    reject(s, p2, { type: "end_main_phase" }, "PENDING_DECISION");

    const { state: next, events: handover } = act(s, p1, { type: "choose_charge", chargeId: offer[0] as string });
    expect(next.players[p1]?.sealedCharge?.id).toBe(offer[0]);
    expect(next.activePlayerId).toBe(p2);
    expect(handover).toContainEqual(expect.objectContaining({ type: "turn_started", playerId: p2 }));
  });

  it("stops at two Charges with goal 25 and three with goal 30", () => {
    for (const [goal, charges] of [
      [15, 1],
      [25, 2],
      [30, 3],
    ] as const) {
      let { state: s, p1 } = sealedGame(atGoal(goal));
      for (let reveal = 1; reveal <= 3; reveal++) {
        // A Charge p1 already meets: the Wizard Tower (their Manor on s9, Banner in R8).
        s = endTurn(seal(s, p1, "tower")).state;
        expect(s.players[p1]?.revealedChargeIds).toHaveLength(reveal);
        const drawsAgain = s.pending?.kind === "charge";
        expect(drawsAgain, `goal ${goal}, reveal ${reveal}`).toBe(reveal < charges);
        if (drawsAgain) s = act(s, p1, { type: "choose_charge", chargeId: (s.pending?.kind === "charge" && s.pending.chargeIds[0]) as string }).state;
        s = passTurn(s);
      }
    }
  });
});

describe("Recommission", () => {
  it("pays 1 Essence to discard the Charge unrevealed and keep one of two new ones, once per game", () => {
    const { state, p1 } = sealedGame();
    let s = seal(state, p1, "inn");
    expect(canRecommission(ctx, s, p1)).toBe(false);
    reject(s, p1, { type: "recommission_charge" }, "INSUFFICIENT_RESOURCES");
    s = grant(s, p1, { essence: 2 });
    expect(getLegalActions(ctx, s, p1).canRecommission).toBe(true);
    const deckBefore = s.chargeDeck?.length ?? 0;

    const { state: drawn, events } = act(s, p1, { type: "recommission_charge" });
    expect(events).toContainEqual({ type: "resource_spent", playerId: p1, resource: "essence", amount: 1, reason: "recommission" });
    expect(events).toContainEqual({ type: "charge_recommissioned", playerId: p1 });
    expect(drawn.players[p1]?.sealedCharge).toBeUndefined();
    expect(drawn.players[p1]?.recommissioned).toBe(true);
    const offer = drawn.pending?.kind === "charge" ? drawn.pending.chargeIds : [];
    expect(offer).toHaveLength(2);
    for (const id of offer) expect(["castle", "tower", "inn"]).not.toContain(id);

    const kept = act(drawn, p1, { type: "choose_charge", chargeId: offer[1] as string }).state;
    // Play goes on in the Main phase; the old Charge left the game.
    expect(kept.phase).toBe("main");
    expect(kept.activePlayerId).toBe(p1);
    expect(kept.chargeDeck).toHaveLength(deckBefore - 1);
    expect(kept.chargeDeck).not.toContain("inn");
    reject(kept, p1, { type: "recommission_charge" }, "RECOMMISSION_USED");
    expect(canRecommission(ctx, kept, p1)).toBe(false);
  });

  it("needs a Charge, the Main phase, the option and a Charge a later draw may take", () => {
    const { state, p1, p2 } = sealedGame();
    const s = grant(seal(state, p1, "inn"), p1, { essence: 2 });
    reject(grant(state, p1, { essence: 1 }), p1, { type: "recommission_charge" }, "NO_SEALED_CHARGE");
    reject(act(s, p1, { type: "end_main_phase" }).state, p1, { type: "recommission_charge" }, "WRONG_PHASE");
    reject(s, p2, { type: "recommission_charge" }, "NOT_ACTIVE_PLAYER");
    const landmarksOnly = { ...clone(s), chargeDeck: ["castle", "tower"] };
    reject(landmarksOnly, p1, { type: "recommission_charge" }, "CHARGE_DECK_EMPTY");
    expect(canRecommission(ctx, landmarksOnly, p1)).toBe(false);
    const { state: off } = setupGame();
    reject(grant(off, p1, { essence: 1 }), p1, { type: "recommission_charge" }, "FEATURE_DISABLED");
  });
});

describe("hidden information", () => {
  it("hides the Charges drawn from everyone but the player choosing", () => {
    const s = newGame(sealed());
    const [first, second] = s.turnOrder as [PlayerId, PlayerId];
    const offer = s.pending?.kind === "charge" ? s.pending.chargeIds : [];
    expect(redactState(s, first).pending).toEqual({ kind: "charge", playerId: first, chargeIds: offer });
    for (const viewer of [second, null]) {
      const view = redactState(s, viewer);
      expect(view.pending).toEqual({ kind: "charge", playerId: first, chargeIds: [HIDDEN_CHARGE, HIDDEN_CHARGE] });
      expect(view.chargeDeck).toEqual(s.chargeDeck?.map(() => HIDDEN_CHARGE));
    }
    const { events } = act(s, first, { type: "choose_charge", chargeId: offer[0] as string });
    const drawn = events.find((e) => e.type === "charges_drawn") as GameEvent;
    const kept = events.find((e) => e.type === "charge_kept") as GameEvent;
    expect(redactEvent(kept, first)).toEqual(kept);
    expect(redactEvent(kept, second)).toEqual({ type: "charge_kept", playerId: first, chargeId: null });
    expect(redactEvent(drawn, second)).toEqual(drawn);
    expect(redactEvent(drawn, first)).toEqual({ type: "charges_drawn", playerId: second, chargeIds: null, count: 2 });
  });

  it("shows a rival only that a Charge is held, and every revealed Charge to all", () => {
    const { state, p1, p2 } = sealedGame();
    const s = seal(seal(state, p1, "trades"), p2, "castle");
    const view = redactState(s, p2);
    expect(view.players[p1]?.sealedCharge).toEqual({ id: HIDDEN_CHARGE });
    expect(view.players[p2]?.sealedCharge).toEqual({ id: "castle" });
    expect(redactState(s, null).players[p2]?.sealedCharge).toEqual({ id: HIDDEN_CHARGE });
    // A hidden Charge shows no progress, and the redacted view still plays.
    expect(getChargeProgress(ctx, view, p1, { id: HIDDEN_CHARGE })).toEqual({ complete: false, current: 0, target: 1 });
    expect(getLegalActions(ctx, redactState(grant(s, p1, { essence: 1 }), p1), p1).canRecommission).toBe(true);

    const { state: after, events } = endTurn(seal(s, p1, "castle"));
    const revealed = events.find((e) => e.type === "charge_revealed") as GameEvent;
    expect(redactEvent(revealed, p2)).toEqual(revealed);
    expect(redactState(after, p2).players[p1]?.revealedChargeIds).toEqual(["castle"]);
    expect(getRenown(ctx, redactState(after, p2), p1)).toBe(getRenown(ctx, after, p1));
  });
});

describe("Renown from Charges", () => {
  it("is its own source, and the sources still add up", () => {
    const { state, p1 } = sealedGame();
    const after = endTurn(seal(state, p1, "castle")).state;
    const sources = getRenownSources(ctx, after, p1);
    expect(sources.charges).toEqual([{ chargeId: "castle", renown: 2 }]);
    const parts = sources.manors.renown + sources.strongholds.renown + sources.quests.reduce((n, q) => n + q.renown, 0) + sources.charges.reduce((n, c) => n + c.renown, 0) + sources.bonus - sources.lost;
    expect(parts).toBe(sources.total);
    expect(getRenownSources(ctx, state, p1).charges).toEqual([]);
  });

  it("replays to the same state", () => {
    let s = newGame(sealed(cardTestRuleset(2)), "replay-seed");
    const initial = s;
    const commands: GameCommand[] = [];
    while (s.pending?.kind === "charge") {
      const c: GameCommand = { type: "choose_charge", chargeId: s.pending.chargeIds[1] as string, commandId: `k${commands.length}`, matchId: s.matchId, playerId: s.pending.playerId };
      commands.push(c);
      s = engine.applyCommand(s, c).newState as GameState;
    }
    expect(engine.replay(initial, commands)).toEqual(s);
  });
});
