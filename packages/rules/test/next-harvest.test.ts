import { describe, expect, it } from "vitest";
import {
  clone,
  getBannerAdvice,
  getBannerWarning,
  getChargeProgress,
  getRenown,
  hasNextHarvest,
  isBoardFull,
  menaceOfType,
  type GameState,
  type PlayerId,
  type RulesetConfig,
} from "../src/index.js";
import { act, engine, grant, mvpRuleset, passTurn, routeId, setupGame } from "./helpers.js";

// Whether a player harvests again (§16.3): the Banner warning is only given
// when they do. Each case also plays the turns out, so the selector is
// checked against what the engine does.

const ctx = engine.ctx;
const PLENTY = { grain: 20, timber: 20, stone: 20, iron: 20, essence: 20 };

const withRules = (rules: Partial<RulesetConfig>): RulesetConfig => ({ ...mvpRuleset(), ...rules });

function passUntilRound(s: GameState, round: number): GameState {
  while (s.round < round) s = passTurn(s);
  return s;
}

const setBonus = (s: GameState, playerId: PlayerId, value: number): GameState =>
  engine.applyDebugCommand(s, { type: "debug_set_bonus_renown", commandId: "bonus", matchId: s.matchId, playerId, targetPlayerId: playerId, value }).newState as GameState;

/** The active player upgrades each of their Manors. */
function upgradeAll(s: GameState): GameState {
  const p = s.activePlayerId;
  s = grant(s, p, PLENTY);
  for (const h of Object.values(s.holdings)) if (h.ownerId === p && h.type === "manor") s = act(s, p, { type: "upgrade_holding", siteId: h.siteId }).state;
  return s;
}

/** The active player's Banner Assignment phase. */
const toBanners = (s: GameState): GameState => act(s, s.activePlayerId, { type: "end_main_phase" }).state;

/** The player keeps the Banner Charge "grain" (2 Grain Regions): on the test board, s9's Banner on R7 meets it. */
function keepGrainCharge(state: GameState, playerId: PlayerId): GameState {
  const s = clone(state);
  for (const p of Object.values(s.players)) delete p.sealedCharge;
  s.pending = { kind: "charge", playerId, chargeIds: ["grain"] };
  return act(s, playerId, { type: "choose_charge", chargeId: "grain" }).state;
}

describe("hasNextHarvest", () => {
  it("is true on an ordinary turn, for every seat", () => {
    const { state, p1, p2 } = setupGame(withRules({ lastRound: 3 }));
    let s = toBanners(passUntilRound(state, 2));
    expect(s.activePlayerId).toBe(p1);
    expect(hasNextHarvest(ctx, s, p1)).toBe(true);
    s = toBanners(passTurn(s));
    expect(s.activePlayerId).toBe(p2);
    expect(hasNextHarvest(ctx, s, p2)).toBe(true);
  });

  it("is false for every seat in the last round", () => {
    const { state, p1, p2 } = setupGame(withRules({ lastRound: 3 }));
    let s = toBanners(passUntilRound(state, 3));
    expect(hasNextHarvest(ctx, s, p1)).toBe(false);
    s = toBanners(passTurn(s));
    expect(s.activePlayerId).toBe(p2);
    expect(hasNextHarvest(ctx, s, p2)).toBe(false);
    // The round's end ends the game: nobody harvests again.
    expect(passTurn(s)).toMatchObject({ status: "finished", endCause: "last_round" });
  });

  it("is false on the turn a player reaches the target", () => {
    const { state, p1, p2 } = setupGame();
    let s = toBanners(setBonus(passUntilRound(state, 2), p1, 8));
    expect(getRenown(ctx, s, p1)).toBe(s.ruleset.targetRenown);
    expect(hasNextHarvest(ctx, s, p1)).toBe(false);
    expect(hasNextHarvest(ctx, s, p2)).toBe(false);
    s = passTurn(s);
    expect(s).toMatchObject({ status: "finished", winnerId: p1 });
  });

  it("is false for the rest of the round once equal turns end the game with it", () => {
    const { state, p1, p2 } = setupGame(withRules({ equalTurns: true }));
    let s = toBanners(setBonus(passUntilRound(state, 2), p1, 8));
    expect(hasNextHarvest(ctx, s, p1)).toBe(false);
    s = passTurn(s);
    expect(s.endTriggered).toBe(true);
    // A setback below the target does not stop the round's end.
    s = toBanners(setBonus(s, p1, 0));
    expect(getRenown(ctx, s, p1)).toBeLessThan(s.ruleset.targetRenown);
    expect(s.activePlayerId).toBe(p2);
    expect(hasNextHarvest(ctx, s, p2)).toBe(false);
    expect(passTurn(s).status).toBe("finished");
  });

  /** The first player's Banner Assignment on a board they have just filled. */
  function fillTheBoard() {
    const { state, p1, p2 } = setupGame();
    // The second player upgrades both Manors; next round the first takes s5,
    // the last open Site, and upgrades everything.
    let s = passUntilRound(state, 2);
    s = passTurn(upgradeAll(passTurn(s)));
    s = grant(s, p1, PLENTY);
    s = act(s, p1, { type: "build_route", routeId: routeId(2, 5) }).state;
    s = act(s, p1, { type: "build_manor", siteId: "s5" }).state;
    return { state: toBanners(upgradeAll(s)), p1, p2 };
  }

  it("is false for the round's last seat on a full board, which ends the game", () => {
    const { state, p1, p2 } = fillTheBoard();
    let s = state;
    expect(isBoardFull(ctx, s)).toBe(true);
    // Before the round's last seat a card could still empty the board.
    expect(hasNextHarvest(ctx, s, p1)).toBe(true);
    s = toBanners(passTurn(s));
    expect(s.activePlayerId).toBe(p2);
    expect(hasNextHarvest(ctx, s, p2)).toBe(false);
    expect(passTurn(s)).toMatchObject({ status: "finished", endCause: "full_board" });

    // Without the full-board rule the game goes on.
    const on = { ...s, ruleset: { ...s.ruleset, endOnFullBoard: false } };
    expect(hasNextHarvest(ctx, on, p2)).toBe(true);
    expect(passTurn(on).status).toBe("playing");
  });

  // Regression: a razed mark keeps the board open, but the player's End
  // Turn ends their own marks before it checks the board (§19.24).
  it("is false for the round's last seat whose own razed mark alone keeps the board open", () => {
    const { state, p1, p2 } = fillTheBoard();
    let s = toBanners(passTurn(state));
    expect(s.activePlayerId).toBe(p2);
    // p2's Manor on s2, beside their s3, was burned: only p2 may rebuild there, this turn.
    s = clone(s);
    s.activeEffects.push({ kind: "razed", siteId: "s2", ownerId: p2, sourcePlayerId: p1, besideOwnHoldings: true });
    expect(isBoardFull(ctx, s)).toBe(false);
    expect(hasNextHarvest(ctx, s, p2)).toBe(false);
    expect(passTurn(s)).toMatchObject({ status: "finished", endCause: "full_board" });

    // A rival's mark lasts into the next round, and so does the game.
    const rivals = clone(s);
    for (const e of rivals.activeEffects) if (e.kind === "razed") e.ownerId = p1;
    expect(hasNextHarvest(ctx, rivals, p2)).toBe(true);
    expect(passTurn(rivals).status).toBe("playing");
  });

  // Regression: the Banner warning came up on an End Turn that reveals a
  // Sealed Charge or moves Favour into the target, which ends the game.
  it("foresees the player's own Sealed Charge, met by the Banners as drafted (§27A)", () => {
    const { state, p1, bannerOf } = setupGame(withRules({ sealedCharges: true }));
    let s = keepGrainCharge(state, p1);
    s = toBanners(setBonus(s, p1, s.ruleset.targetRenown - 2 - getRenown(ctx, s, p1)));
    expect(getRenown(ctx, s, p1)).toBe(s.ruleset.targetRenown - 2);
    const meets = { [bannerOf(p1, "s9")]: "R7" };
    expect(hasNextHarvest(ctx, s, p1)).toBe(true);
    expect(hasNextHarvest(ctx, s, p1, meets)).toBe(false);
    // The engine agrees: the reveal ends the game at this End Turn.
    const placed = act(s, p1, { type: "assign_banners", assignments: meets }).state;
    expect(act(placed, p1, { type: "end_turn" }).state).toMatchObject({ status: "finished", winnerId: p1 });
    expect(act(act(s, p1, { type: "assign_banners", assignments: {} }).state, p1, { type: "end_turn" }).state.status).toBe("playing");
  });

  it("foresees the Crown's Voice's Favour at the round's last seat, not before (§129.10)", () => {
    const { state, p1, p2 } = setupGame(withRules({ crownsVoice: { purse: 10, from: "first_round" } }));
    // p1's two Strongholds out-score p2's Manors in Might, worth 2 Favour
    // as the round ends: enough to reach the target from 2 short.
    let s = upgradeAll(passUntilRound(state, 2));
    s = clone(s);
    if (s.crownsVoice) s.crownsVoice.current = "might";
    s = toBanners(setBonus(s, p1, s.ruleset.targetRenown - 2 - (getRenown(ctx, s, p1) - (s.players[p1]?.bonusRenown ?? 0))));
    expect(getRenown(ctx, s, p1)).toBe(s.ruleset.targetRenown - 2);
    // p2 could still change the scores in their turn.
    expect(hasNextHarvest(ctx, s, p1)).toBe(true);
    s = toBanners(passTurn(s));
    expect(s.activePlayerId).toBe(p2);
    expect(hasNextHarvest(ctx, s, p2)).toBe(false);
    expect(passTurn(s)).toMatchObject({ status: "finished", winnerId: p1 });
  });

  it("is false once the game is over", () => {
    const { state, p1 } = setupGame();
    const s = passTurn(setBonus(passUntilRound(state, 2), p1, 8));
    expect(s.status).toBe("finished");
    expect(hasNextHarvest(ctx, s, p1)).toBe(false);
  });
});

describe("getBannerWarning", () => {
  /** p1 holds the "grain" Charge, with the Toll Troll on R7: a Banner there harvests nothing, yet counts for it. */
  function trollOnTheCharge() {
    const g = setupGame(withRules({ sealedCharges: true }));
    const s = clone(keepGrainCharge(g.state, g.p1));
    const troll = menaceOfType(s, "toll_troll");
    if (!troll) throw new Error("the Toll Troll is not in play");
    troll.location = { kind: "region", regionId: "R7" };
    return { ...g, state: toBanners(s), s9: g.bannerOf(g.p1, "s9") };
  }

  // Regression: the warning offered to move a Banner off a Region that met
  // the player's Sealed Charge, for one more resource, at the price of the
  // 2 Renown this End Turn would have scored.
  it("keeps a Sealed Charge the draft meets (§27A)", () => {
    const { state: s, p1, s9 } = trollOnTheCharge();
    const meets = { [s9]: "R7" };
    const charge = s.players[p1]?.sealedCharge;
    if (!charge) throw new Error("p1 holds no Charge");
    // For the Harvest alone, s9's Banner would leave the Troll.
    expect(getBannerAdvice(ctx, s, p1, meets).moves).toContainEqual(expect.objectContaining({ bannerId: s9, from: "R7" }));
    expect(hasNextHarvest(ctx, s, p1, meets)).toBe(true);
    // Only R7 gives p1 a second Grain Region, so no placement that keeps the Charge harvests more.
    expect(getBannerWarning(ctx, s, p1, meets)).toBeNull();
    const placed = act(s, p1, { type: "assign_banners", assignments: meets }).state;
    expect(getChargeProgress(ctx, placed, p1, charge).complete).toBe(true);
  });

  it("still warns when the draft does not meet the Charge", () => {
    const { state: s, p1, s9 } = trollOnTheCharge();
    const warning = getBannerWarning(ctx, s, p1, { [s9]: null });
    expect(warning).toMatchObject({ current: 1, best: 2 });
    expect(warning?.moves).toEqual([expect.objectContaining({ bannerId: s9, from: null })]);
  });

  it("gives no warning when the game ends before the next Harvest", () => {
    const { state: s, p1, s9 } = trollOnTheCharge();
    const last = { ...s, ruleset: { ...s.ruleset, lastRound: s.round } };
    expect(getBannerWarning(ctx, s, p1, { [s9]: null })).not.toBeNull();
    expect(getBannerWarning(ctx, last, p1, { [s9]: null })).toBeNull();
  });
});
