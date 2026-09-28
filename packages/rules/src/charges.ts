// Sealed Charges (spec §27A), a lobby option: each player keeps a personal
// goal face down, and it is revealed and scored at their End Turn once met.
// The goal is secret; the Renown it scores is public, like all Renown (§83).
// Goals are typed code keyed by kind; the deck and its numbers are content.

import { BALANCE } from "./balance.js";
import type { RulesContext } from "./context.js";
import { check } from "./errors.js";
import { reachedSites, type QuestProgress } from "./quests.js";
import { getPlayerBanners } from "./selectors.js";
import type { Tx } from "./tx.js";
import type { ChargeGoal, ChargeId, ChargeRulesDefinition, GameState, PlayerId, PlayerState, RulesetConfig, SealedCharge } from "./types.js";
import { HIDDEN_CHARGE } from "./views.js";

/**
 * Which Charges a draw may take. The deal at setup takes any; every later
 * draw (after a reveal, or a Recommission) skips landmark Charges, which a
 * full board can put out of reach, and takes Banner, deed and Menace ones.
 */
export type ChargeDraw = "setup" | "later";

const progress = (current: number, target: number): QuestProgress => ({ complete: current >= target, current: Math.max(0, Math.min(current, target)), target });

/** Charges a player may reveal over a game with this Renown goal, one after another (§27A). */
export function chargesPerGame(targetRenown: number): number {
  let charges = 1;
  for (const step of BALANCE.sealedCharges.perGame) if (targetRenown >= step.fromGoal) charges = step.charges;
  return charges;
}

/**
 * Whether a Charge can be met in a game with these rules on this board: its
 * Menace is in play (Charges naming another are removed first) and a Warden
 * or a card can move it, its landmark is on the board, its deed is part of
 * the rules and the board has enough Regions for its Banners.
 */
function isChargeInPlay(ctx: RulesContext, ruleset: RulesetConfig, def: ChargeRulesDefinition): boolean {
  const goal = def.goal;
  switch (goal.kind) {
    case "landmark":
      return ctx.board.topology.landmarks.some((l) => l.id === goal.landmarkId);
    case "banners":
      return ctx.board.topology.regions.filter((r) => r.resource === goal.resource).length >= goal.count;
    case "deed":
      if (goal.deed === "writs") return ruleset.writ.enabled;
      if (goal.deed === "cards_bought") return ruleset.enableCards;
      return true;
    case "menace":
      return ruleset.activeMenaces.includes(goal.menaceType) && (ruleset.warden.enabled || ruleset.enableCards);
  }
}

/** The Charge deck of a new game, unshuffled: every Charge that can be met in it. */
export function chargeDeckFor(ctx: RulesContext, ruleset: RulesetConfig): ChargeId[] {
  return (ctx.content.charges ?? []).filter((c) => isChargeInPlay(ctx, ruleset, c)).map((c) => c.id);
}

/**
 * Whether a draw may take this Charge. A hidden one (the deck on a redacted
 * view) may be anything, so it counts as drawable; the server, which sees
 * the deck, decides.
 */
function drawable(ctx: RulesContext, chargeId: ChargeId, draw: ChargeDraw): boolean {
  if (draw === "setup" || chargeId === HIDDEN_CHARGE) return true;
  return ctx.charge(chargeId).goal.kind !== "landmark";
}

/**
 * Removes and returns the first Charges from the top of `deck` that this
 * draw may take, `BALANCE.sealedCharges.drawn` at most. The others keep
 * their places. Mutates `deck`: the engine's draft or a new game's deck.
 */
export function takeCharges(ctx: RulesContext, deck: ChargeId[], draw: ChargeDraw): ChargeId[] {
  const taken: ChargeId[] = [];
  for (let i = 0; i < deck.length && taken.length < BALANCE.sealedCharges.drawn; ) {
    if (drawable(ctx, deck[i] as ChargeId, draw)) taken.push(...deck.splice(i, 1));
    else i++;
  }
  return taken;
}

/** What a deed or Menace Charge counts, now. */
function deedCount(p: PlayerState, goal: Extract<ChargeGoal, { kind: "deed" | "menace" }>): number {
  if (goal.kind === "menace") return p.stats.menaceMoves?.[goal.menaceType] ?? 0;
  switch (goal.deed) {
    case "writs":
      return p.stats.writsIssued;
    case "trades":
      return p.stats.marketTrades;
    case "cards_bought":
      return p.stats.cardsBought;
  }
}

/**
 * Progress toward a Charge the player holds. A landmark Charge has two
 * steps: the network reaches the landmark, and a Banner stands in a Region
 * touching its Site. A hidden Charge (a rival's, on a redacted view) shows
 * no progress.
 */
export function getChargeProgress(ctx: RulesContext, state: GameState, playerId: PlayerId, charge: SealedCharge): QuestProgress {
  const p = state.players[playerId];
  if (!p || charge.id === HIDDEN_CHARGE) return progress(0, 1);
  const goal = ctx.charge(charge.id).goal;
  switch (goal.kind) {
    case "landmark": {
      const siteId = ctx.board.topology.landmarks.find((l) => l.id === goal.landmarkId)?.siteId;
      if (!siteId) return progress(0, 2);
      const touching = new Set(ctx.board.site(siteId).adjacentRegionIds);
      const reached = reachedSites(ctx, state, playerId).has(siteId) ? 1 : 0;
      const bannered = getPlayerBanners(state, playerId).some((b) => b.regionId !== null && touching.has(b.regionId)) ? 1 : 0;
      return progress(reached + bannered, 2);
    }
    case "banners": {
      const regions = new Set(
        getPlayerBanners(state, playerId)
          .map((b) => b.regionId)
          .filter((r): r is string => r !== null && ctx.board.region(r).resource === goal.resource),
      );
      return progress(regions.size, goal.count);
    }
    case "deed":
    case "menace":
      return progress(deedCount(p, goal) - (charge.since ?? 0), goal.count);
  }
}

/** Whether the deck still holds a Charge a later draw may take. */
function laterChargeLeft(ctx: RulesContext, state: GameState): boolean {
  return (state.chargeDeck ?? []).some((c) => drawable(ctx, c, "later"));
}

/** Whether the player may Recommission now, in their Main phase: once per game, for `BALANCE.sealedCharges.recommission`. */
export function canRecommission(ctx: RulesContext, state: GameState, playerId: PlayerId): boolean {
  const p = state.players[playerId];
  if (!state.ruleset.sealedCharges || !p?.sealedCharge || p.recommissioned) return false;
  const cost = BALANCE.sealedCharges.recommission;
  return p.resources.essence >= cost.essence && laterChargeLeft(ctx, state);
}

// ------------------------------------------------------------------ engine steps

/**
 * Draws Charges for the player to keep one of, as a pending decision.
 * Returns false, and changes nothing, when the deck holds none this draw may take.
 */
export function drawCharges(tx: Tx, playerId: PlayerId, draw: ChargeDraw): boolean {
  const chargeIds = takeCharges(tx.ctx, (tx.s.chargeDeck ??= []), draw);
  if (chargeIds.length === 0) return false;
  tx.s.pending = { kind: "charge", playerId, chargeIds };
  tx.emit({ type: "charges_drawn", playerId, chargeIds: [...chargeIds], count: chargeIds.length });
  return true;
}

/** The player keeps one of the Charges drawn; the others go to the bottom of the deck. */
export function keepCharge(tx: Tx, playerId: PlayerId, chargeId: unknown): void {
  const s = tx.s;
  const pending = s.pending;
  check(pending && pending.kind === "charge", "NO_CHARGE_CHOICE");
  check(pending.playerId === playerId, "NOT_ACTIVE_PLAYER");
  check(typeof chargeId === "string" && pending.chargeIds.includes(chargeId), "CHARGE_NOT_OFFERED");
  const p = tx.player(playerId);
  const goal = tx.ctx.charge(chargeId).goal;
  // Deeds count from now: the counters as they stand are the baseline.
  p.sealedCharge = goal.kind === "deed" || goal.kind === "menace" ? { id: chargeId, since: deedCount(p, goal) } : { id: chargeId };
  (s.chargeDeck ??= []).push(...pending.chargeIds.filter((c) => c !== chargeId));
  delete s.pending;
  tx.emit({ type: "charge_kept", playerId, chargeId });
}

/** At the player's End Turn, before the victory check: reveals and scores their Charge if it is met. */
export function revealMetCharge(tx: Tx, playerId: PlayerId): boolean {
  const p = tx.player(playerId);
  const charge = p.sealedCharge;
  if (!charge || !getChargeProgress(tx.ctx, tx.s, playerId, charge).complete) return false;
  delete p.sealedCharge;
  p.revealedChargeIds = [...(p.revealedChargeIds ?? []), charge.id];
  tx.emit({ type: "charge_revealed", playerId, chargeId: charge.id, renown: BALANCE.sealedCharges.renown });
  return true;
}

/** After a reveal: whether the player has revealed fewer Charges than the goal allows, and so draws again. */
export function drawsAnotherCharge(state: GameState, playerId: PlayerId): boolean {
  const p = state.players[playerId];
  return !!p && !p.sealedCharge && (p.revealedChargeIds?.length ?? 0) < chargesPerGame(state.ruleset.targetRenown);
}

/** Recommission, a Main phase action once per game: pay, discard the Charge face down, and draw again. */
export function recommissionCharge(tx: Tx, playerId: PlayerId): void {
  const s = tx.s;
  check(s.ruleset.sealedCharges, "FEATURE_DISABLED", "sealed charges");
  const p = tx.player(playerId);
  check(p.sealedCharge, "NO_SEALED_CHARGE");
  check(!p.recommissioned, "RECOMMISSION_USED");
  check(laterChargeLeft(tx.ctx, s), "CHARGE_DECK_EMPTY");
  tx.spend(playerId, BALANCE.sealedCharges.recommission, "recommission");
  // Discarded unrevealed: it leaves the game, and nobody learns what it was.
  delete p.sealedCharge;
  p.recommissioned = true;
  tx.emit({ type: "charge_recommissioned", playerId });
  drawCharges(tx, playerId, "later");
}
