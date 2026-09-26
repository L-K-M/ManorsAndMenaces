// Card effect implementations, keyed by effectId (spec §19, §39). Content
// data never contains executable code.

import { BALANCE } from "./balance.js";
import { own } from "./clone.js";
import type { RulesContext } from "./context.js";
import { check, RuleViolation, unreachable } from "./errors.js";
import { isResourceType } from "./resources.js";
import {
  dragonsLandingTargets,
  getPlayerBanners,
  getRenown,
  insurancePolicyOf,
  isLegalMenaceDestination,
  menaceLocationKind,
  menaceOfType,
  plagueBanners,
  sameLocation,
  wizardDestinations,
} from "./selectors.js";
import type { Tx } from "./tx.js";
import {
  RESOURCE_TYPES,
  type BannerId,
  type CardEffectId,
  type CardId,
  type CardRulesDefinition,
  type CardTarget,
  type GameState,
  type Holding,
  type PlayerId,
  type ResourceCost,
  type ResourceType,
  type RulesetConfig,
} from "./types.js";

/** A pair of resources from an untrusted command (Transmutation Magic). */
function isResourcePair(x: unknown): x is [ResourceType, ResourceType] {
  return Array.isArray(x) && x.length === 2 && x.every(isResourceType);
}

/** Rivals of `playerId` with more Renown than `margin` above theirs. */
function rivalsAhead(ctx: RulesContext, state: GameState, playerId: PlayerId, margin: number): PlayerId[] {
  const mine = getRenown(ctx, state, playerId);
  return state.turnOrder.filter((id) => id !== playerId && getRenown(ctx, state, id) >= mine + margin);
}

/** Throws a RuleViolation if the target is not valid for the card right now. */
export function validateCardTarget(ctx: RulesContext, state: GameState, playerId: PlayerId, cardId: CardId, target: CardTarget): void {
  const def = ctx.cardOf(cardId);
  check(target && typeof target === "object" && target.effect === def.effectId, "INVALID_CARD_TARGET", "target does not match card");
  if (def.requiresMenace) check(menaceOfType(state, def.requiresMenace), "INVALID_CARD_TARGET", `${def.requiresMenace} is not active`);
  switch (target.effect) {
    case "wizard_interference": {
      const b = own(state.banners, target.bannerId);
      check(b && b.ownerId !== playerId && b.regionId, "INVALID_CARD_TARGET", "needs an opponent's assigned Banner");
      check(wizardDestinations(ctx, state, target.bannerId).includes(target.regionId), "INVALID_CARD_TARGET", "illegal destination");
      return;
    }
    case "knight_errant":
      check(own(state.menaces, target.menaceId), "INVALID_CARD_TARGET", "unknown Menace");
      check(isLegalMenaceDestination(ctx, state, target.menaceId, target.destination), "ILLEGAL_MENACE_TARGET");
      return;
    case "druids_blessing": {
      const b = own(state.banners, target.bannerId);
      check(b && b.ownerId === playerId, "INVALID_CARD_TARGET", "needs one of your Banners");
      return;
    }
    case "teleportation_mishap": {
      const a = own(state.menaces, target.menaceIdA);
      const b = own(state.menaces, target.menaceIdB);
      check(a && b && a.id !== b.id, "INVALID_CARD_TARGET", "needs two different Menaces");
      check(a.location.kind === b.location.kind && !sameLocation(a.location, b.location), "ILLEGAL_MENACE_TARGET", "swap would be illegal");
      return;
    }
    case "bribe_the_troll": {
      const troll = menaceOfType(state, "toll_troll");
      check(troll, "INVALID_CARD_TARGET", "Toll Troll is not active");
      check(isLegalMenaceDestination(ctx, state, troll.id, target.destination), "ILLEGAL_MENACE_TARGET");
      return;
    }
    case "arcane_exchange": {
      check(isResourceType(target.give) && isResourceType(target.receive), "INVALID_CARD_TARGET");
      check(target.give !== target.receive && (target.give === "essence" || target.receive === "essence"), "INVALID_CARD_TARGET", "must involve Essence");
      check((state.players[playerId]?.resources[target.give] ?? 0) >= 1, "INSUFFICIENT_RESOURCES");
      return;
    }
    case "festival_at_the_inn":
      check(isResourceType(target.choice), "INVALID_CARD_TARGET");
      return;
    case "very_minor_prophecy":
      check(state.cardDeck.length + state.discardPile.length > 0, "DECK_EMPTY");
      return;
    case "fog_of_confusion": {
      check(ctx.board.hasRoute(target.routeId), "INVALID_CARD_TARGET", "unknown Route");
      // §19.10: any Route but your own. Fogging your own only hurts you. An
      // unowned Route is a real play: a rival who builds it before the fog
      // lifts cannot connect through it.
      check(state.routeOwners[target.routeId] !== playerId, "INVALID_CARD_TARGET", "can't fog your own Route");
      // Re-fogging another player's fog extends it; re-fogging your own changes nothing.
      const mine = state.activeEffects.some((e) => e.kind === "fog" && e.routeId === target.routeId && e.sourcePlayerId === playerId);
      check(!mine, "INVALID_CARD_TARGET", "already fogged by you");
      return;
    }
    case "dragon_whisperer": {
      const dragon = menaceOfType(state, "young_dragon");
      check(dragon, "INVALID_CARD_TARGET", "Young Dragon is not active");
      check(isLegalMenaceDestination(ctx, state, dragon.id, target.destination), "ILLEGAL_MENACE_TARGET");
      if (target.take !== undefined) {
        check(isResourceType(target.take) && (dragon.state.hoard?.[target.take] ?? 0) > 0, "INVALID_CARD_TARGET", "Hoard has none of that");
      }
      return;
    }
    case "changeling": {
      const them = own(state.players, target.opponentId);
      check(them && target.opponentId !== playerId, "INVALID_CARD_TARGET", "needs an opponent");
      // Hand sizes are public, so this also holds on a redacted view.
      check(them.hand.length > 0, "INVALID_CARD_TARGET", "their hand is empty");
      return;
    }
    case "ragnarok":
      // The world may end only in your favour: nobody may have more Renown.
      check(rivalsAhead(ctx, state, playerId, 1).length === 0, "INVALID_CARD_TARGET", "someone has more Renown");
      return;
    case "fire_bolt": {
      check(ctx.board.hasRoute(target.routeId), "INVALID_CARD_TARGET", "unknown Route");
      const owner = state.routeOwners[target.routeId];
      check(owner !== undefined && owner !== playerId, "INVALID_CARD_TARGET", "needs an opponent's Route");
      // Bridges burn first: any Route is fair game only if they own no bridge.
      const ownsBridge = (state.players[owner]?.routeIds ?? []).some((r) => ctx.board.route(r).kind === "bridge");
      check(!ownsBridge || ctx.board.route(target.routeId).kind === "bridge", "INVALID_CARD_TARGET", "they own a bridge");
      return;
    }
    case "dragons_landing":
      check(dragonsLandingTargets(state).length > 0, "INVALID_CARD_TARGET", "nobody has enough Holdings");
      return;
    case "transmutation_magic": {
      check(isResourcePair(target.give) && isResourcePair(target.receive), "INVALID_CARD_TARGET");
      check(!target.receive.some((r) => target.give.includes(r)), "INVALID_CARD_TARGET", "must receive something else");
      const have = state.players[playerId]?.resources;
      check(have && target.give.every((r) => have[r] >= target.give.filter((g) => g === r).length), "INSUFFICIENT_RESOURCES");
      return;
    }
    case "the_plague":
      check(ctx.board.hasSite(target.siteId), "INVALID_CARD_TARGET", "unknown Site");
      check(
        plagueBanners(ctx, state, target.siteId).some((b) => b.ownerId !== playerId),
        "INVALID_CARD_TARGET",
        "no opponent's Banner to sicken",
      );
      return;
    case "royal_insurance_policy":
      check(!insurancePolicyOf(ctx, state, playerId), "INVALID_CARD_TARGET", "already insured");
      return;
    case "robin_of_the_glade": {
      const resource = target.resource;
      check(isResourceType(resource), "INVALID_CARD_TARGET");
      const payers = rivalsAhead(ctx, state, playerId, 1).filter((id) => (state.players[id]?.resources[resource] ?? 0) > 0);
      check(payers.length > 0, "INVALID_CARD_TARGET", "no richer rival has that");
      return;
    }
    case "unreliable_bard":
      check(rivalsAhead(ctx, state, playerId, BALANCE.underdogGap).length > 0, "INVALID_CARD_TARGET", "you are not far enough behind");
      return;
    case "treasure_hunter": {
      const dragon = menaceOfType(state, "young_dragon");
      check(dragon, "INVALID_CARD_TARGET", "Young Dragon is not active");
      check(isResourceType(target.take) && (dragon.state.hoard?.[target.take] ?? 0) > 0, "INVALID_CARD_TARGET", "Hoard has none of that");
      check(isLegalMenaceDestination(ctx, state, dragon.id, target.destination), "ILLEGAL_MENACE_TARGET");
      const dest = target.destination;
      check(
        dest.kind === "region" && Object.values(state.banners).some((b) => b.ownerId === playerId && b.regionId === dest.regionId),
        "ILLEGAL_MENACE_TARGET",
        "the Dragon must follow you to one of your Banners",
      );
      return;
    }
    default:
      return unreachable(target);
  }
}

/** Applies a card's effect. The target must already be validated. */
export function resolveCardEffect(tx: Tx, playerId: PlayerId, target: CardTarget): void {
  const s = tx.s;
  switch (target.effect) {
    case "wizard_interference": {
      const b = s.banners[target.bannerId];
      check(b && b.regionId, "INVALID_CARD_TARGET");
      const from = b.regionId;
      b.regionId = target.regionId;
      b.settled = false;
      tx.emit({ type: "banner_displaced", byPlayerId: playerId, ownerId: b.ownerId, bannerId: b.id, fromRegionId: from, toRegionId: target.regionId, cause: "wizard_interference" });
      return;
    }
    case "knight_errant": {
      const m = s.menaces[target.menaceId];
      check(m, "INVALID_CARD_TARGET");
      tx.moveMenace(playerId, m, target.destination);
      return;
    }
    case "druids_blessing":
      s.activeEffects.push({ kind: "druids_blessing", bannerId: target.bannerId, sourcePlayerId: playerId });
      tx.emit({ type: "effect_started", effect: "druids_blessing", bannerId: target.bannerId, playerId });
      return;
    case "teleportation_mishap": {
      const a = s.menaces[target.menaceIdA];
      const b = s.menaces[target.menaceIdB];
      check(a && b, "INVALID_CARD_TARGET");
      const la = a.location;
      const lb = b.location;
      tx.moveMenace(playerId, a, lb);
      tx.moveMenace(playerId, b, la);
      return;
    }
    case "bribe_the_troll": {
      const troll = menaceOfType(s, "toll_troll");
      check(troll, "INVALID_CARD_TARGET");
      const from = troll.location;
      const hadOwnBanner =
        from.kind === "region" && Object.values(s.banners).some((b) => b.ownerId === playerId && b.regionId === from.regionId);
      tx.moveMenace(playerId, troll, target.destination);
      if (hadOwnBanner) tx.gain(playerId, "grain", 1, "card_effect");
      return;
    }
    case "arcane_exchange":
      tx.spend(playerId, { [target.give]: 1 }, "card_effect");
      tx.gain(playerId, target.receive, 1, "card_effect");
      return;
    case "festival_at_the_inn":
      for (const id of s.turnOrder) tx.gain(id, "grain", 1, "card_effect");
      tx.gain(playerId, target.choice, 1, "card_effect");
      return;
    case "very_minor_prophecy": {
      const cards: CardId[] = [];
      for (let i = 0; i < BALANCE.prophecyCards; i++) {
        const c = tx.drawCard();
        if (c) cards.push(c);
      }
      if (cards.length === 0) return;
      // Put them back on top; the player now chooses their order.
      s.cardDeck.unshift(...cards);
      s.pending = { kind: "prophecy", playerId, cardIds: cards };
      tx.emit({ type: "prophecy_revealed", playerId, cardIds: cards });
      return;
    }
    case "fog_of_confusion":
      s.activeEffects.push({ kind: "fog", routeId: target.routeId, sourcePlayerId: playerId });
      tx.emit({ type: "effect_started", effect: "fog", routeId: target.routeId, playerId });
      return;
    case "dragon_whisperer": {
      const dragon = menaceOfType(s, "young_dragon");
      check(dragon, "INVALID_CARD_TARGET");
      tx.moveMenace(playerId, dragon, target.destination);
      const hoard = (dragon.state.hoard ??= {});
      const take = target.take ?? RESOURCE_TYPES.find((r) => (hoard[r] ?? 0) > 0);
      if (take && (hoard[take] ?? 0) > 0) {
        hoard[take] = (hoard[take] ?? 0) - 1;
        if ((hoard[take] ?? 0) === 0) delete hoard[take];
        tx.emit({ type: "hoard_changed", menaceId: dragon.id, resource: take, delta: -1 });
        tx.gain(playerId, take, 1, "card_effect");
      }
      return;
    }
    case "changeling": {
      if (claimInsurance(tx, target.opponentId, "changeling")) return;
      const me = tx.player(playerId);
      const them = tx.player(target.opponentId);
      [me.hand, them.hand] = [them.hand, me.hand];
      // Counts only: the cards themselves stay hidden from everyone else.
      tx.emit({ type: "hands_swapped", playerId, opponentId: them.id, handSize: me.hand.length, opponentHandSize: them.hand.length });
      return;
    }
    case "ragnarok":
      // The game ends in engine.resolveCard, once the card itself has resolved.
      return;
    case "fire_bolt": {
      const ownerId = s.routeOwners[target.routeId];
      check(ownerId !== undefined, "INVALID_CARD_TARGET");
      if (claimInsurance(tx, ownerId, "fire_bolt")) return;
      tx.removeRoute(target.routeId);
      s.activeEffects.push({ kind: "smouldering", routeId: target.routeId, ownerId, sourcePlayerId: playerId });
      tx.emit({ type: "route_burned", byPlayerId: playerId, ownerId, routeId: target.routeId });
      return;
    }
    case "dragons_landing": {
      // Drawn at resolution, after any reaction window, from a sorted pool (§30).
      const h = tx.rng.pick(dragonsLandingTargets(s));
      tx.emit({ type: "dragon_landed", byPlayerId: playerId, ownerId: h.ownerId, holdingId: h.id, siteId: h.siteId });
      if (claimInsurance(tx, h.ownerId, "dragons_landing")) return;
      if (h.type === "manor") {
        const bannerIds = tx.removeHolding(h.id);
        tx.emit({ type: "holding_destroyed", byPlayerId: playerId, ownerId: h.ownerId, holdingId: h.id, siteId: h.siteId, bannerIds });
      } else {
        reduceStronghold(tx, playerId, h);
      }
      return;
    }
    case "transmutation_magic": {
      const cost: ResourceCost = {};
      for (const r of target.give) cost[r] = (cost[r] ?? 0) + 1;
      tx.spend(playerId, cost, "card_effect");
      for (const r of target.receive) tx.gain(playerId, r, 1, "card_effect");
      return;
    }
    case "the_plague": {
      const victims = plagueBanners(tx.ctx, s, target.siteId);
      // Each insured owner's policy spares all of their Banners here, once.
      const insured = new Set<PlayerId>();
      for (const ownerId of new Set(victims.map((b) => b.ownerId))) if (claimInsurance(tx, ownerId, "the_plague")) insured.add(ownerId);
      const bannerIds: BannerId[] = victims.filter((b) => !insured.has(b.ownerId)).map((b) => b.id);
      for (const bannerId of bannerIds) s.activeEffects.push({ kind: "sick", bannerId, sourcePlayerId: playerId });
      if (bannerIds.length > 0) tx.emit({ type: "effect_started", effect: "plague", siteId: target.siteId, bannerIds, playerId });
      return;
    }
    case "royal_insurance_policy":
      // Kept in front of the player by engine.resolveCard, like every Charter.
      return;
    case "robin_of_the_glade": {
      const mine = getRenown(tx.ctx, s, playerId);
      const payers = s.turnOrder.filter((id) => id !== playerId && getRenown(tx.ctx, s, id) > mine);
      for (const id of payers) if (tx.player(id).resources[target.resource] > 0) tx.transfer(id, playerId, target.resource, 1, "card_effect");
      return;
    }
    case "unreliable_bard":
      tx.player(playerId).bonusRenown += 1;
      tx.emit({ type: "renown_gained", playerId, amount: 1, cause: "unreliable_bard" });
      return;
    case "treasure_hunter": {
      const dragon = menaceOfType(s, "young_dragon");
      check(dragon, "INVALID_CARD_TARGET");
      const hoard = (dragon.state.hoard ??= {});
      const n = Math.min(BALANCE.treasureHunter.take, hoard[target.take] ?? 0);
      hoard[target.take] = (hoard[target.take] ?? 0) - n;
      if ((hoard[target.take] ?? 0) === 0) delete hoard[target.take];
      tx.emit({ type: "hoard_changed", menaceId: dragon.id, resource: target.take, delta: -n });
      tx.gain(playerId, target.take, n, "card_effect");
      tx.moveMenace(playerId, dragon, target.destination);
      return;
    }
    default:
      return unreachable(target);
  }
}

/**
 * Royal Insurance Policy (§19.19): if the player has one in front of them, it
 * is discarded instead of `against` affecting them. Returns whether it was.
 */
function claimInsurance(tx: Tx, playerId: PlayerId, against: CardEffectId): boolean {
  const policy = insurancePolicyOf(tx.ctx, tx.s, playerId);
  if (!policy) return false;
  const p = tx.player(playerId);
  p.charters = (p.charters ?? []).filter((c) => c !== policy);
  tx.discard(policy);
  tx.emit({ type: "insurance_claimed", playerId, cardId: policy, against });
  return true;
}

/**
 * Dragon's Landing on a Stronghold knocks it back to a Manor, which supports
 * one Banner (§114). It loses a Banner at home over an assigned one, and the
 * newer (the one the upgrade created) when both are at home or both assigned.
 */
function reduceStronghold(tx: Tx, byPlayerId: PlayerId, h: Holding): void {
  const holding = tx.s.holdings[h.id];
  check(holding, "INVALID_CARD_TARGET");
  holding.type = "manor";
  // Sorted by id, which is creation order, so the last is the newer.
  const banners = getPlayerBanners(tx.s, h.ownerId).filter((b) => b.holdingId === h.id);
  const home = banners.filter((b) => b.regionId === null);
  const lost = home.at(-1) ?? banners.at(-1);
  if (!lost) return;
  tx.removeBanner(lost.id);
  tx.emit({ type: "holding_reduced", byPlayerId, ownerId: h.ownerId, holdingId: h.id, siteId: h.siteId, bannerId: lost.id });
}

export function isReactionOnly(effectId: CardEffectId): boolean {
  return effectId === "counterspell";
}

/**
 * Whether a card could ever be played under this ruleset. Setup leaves the
 * others out of the deck (§19), so nobody pays for a card that can't be used.
 */
export function isCardUsableInRuleset(def: CardRulesDefinition, ruleset: RulesetConfig): boolean {
  if (!ruleset.enableReactionCards && isReactionOnly(def.effectId)) return false;
  if (def.requiresMenace && !ruleset.activeMenaces.includes(def.requiresMenace)) return false;
  if (def.requiresMenacePair) {
    // A swap needs two Menaces on the same kind of place (§19.5). The 2-player
    // set (Troll on a Region, Highwayman on a Route) never has such a pair.
    const kinds = ruleset.activeMenaces.map(menaceLocationKind);
    if (new Set(kinds).size === kinds.length) return false;
  }
  return true;
}

export { RuleViolation };
