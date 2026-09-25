// Card effect implementations, keyed by effectId (spec §19, §39). Content
// data never contains executable code.

import { BALANCE } from "./balance.js";
import { own } from "./clone.js";
import type { RulesContext } from "./context.js";
import { check, RuleViolation } from "./errors.js";
import { isResourceType } from "./resources.js";
import { isLegalMenaceDestination, menaceLocationKind, menaceOfType, sameLocation, wizardDestinations } from "./selectors.js";
import type { Tx } from "./tx.js";
import {
  RESOURCE_TYPES,
  type CardEffectId,
  type CardId,
  type CardRulesDefinition,
  type CardTarget,
  type GameState,
  type PlayerId,
  type RulesetConfig,
} from "./types.js";

/** Throws a RuleViolation if the target is not valid for the card right now. */
export function validateCardTarget(ctx: RulesContext, state: GameState, playerId: PlayerId, cardId: CardId, target: CardTarget): void {
  const def = ctx.cardOf(cardId);
  check(target && target.effect === def.effectId, "INVALID_CARD_TARGET", "target does not match card");
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
      // §19.10: the Route "remains owned", so the target is someone else's
      // Route. Fogging your own or an unowned one only wastes the card.
      const owner = state.routeOwners[target.routeId];
      check(owner !== undefined && owner !== playerId, "INVALID_CARD_TARGET", "needs an opponent's Route");
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
        tx.emit({ type: "hoard_changed", menaceId: dragon.id, resource: take, delta: -1 });
        tx.gain(playerId, take, 1, "card_effect");
      }
      return;
    }
  }
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
