// Royal Quest conditions (spec §27). Each condition is typed code keyed by
// conditionId; content only references ids.

import type { RulesContext } from "./context.js";
import { getPlayerBanners, getPlayerHoldings, holdingAt, isRouteUsable } from "./selectors.js";
import type { GameState, PlayerId, QuestConditionId, QuestId, SiteId } from "./types.js";

export interface QuestProgress {
  complete: boolean;
  current: number;
  target: number;
}

const progress = (current: number, target: number): QuestProgress => ({ complete: current >= target, current: Math.min(current, target), target });

/** Sites connected to `from` through the player's usable Routes (§27 "connect"). */
function connectedSites(ctx: RulesContext, state: GameState, playerId: PlayerId, from: SiteId): Set<SiteId> {
  const seen = new Set<SiteId>([from]);
  const stack = [from];
  while (stack.length) {
    const cur = stack.pop() as SiteId;
    // An opponent's Holding may end a path but not be passed through.
    const h = holdingAt(state, cur);
    if (cur !== from && h && h.ownerId !== playerId) continue;
    for (const r of ctx.board.routesAt(cur)) {
      // The Highwayman only taxes expansion (§22); Quest connectivity ignores him.
      if (state.routeOwners[r.id] !== playerId || !isRouteUsable(state, r.id, { allowHighwayman: true })) continue;
      const next = ctx.board.otherEnd(r, cur);
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return seen;
}

/** Sites the player's network reaches: their Holdings and usable Route endpoints. */
function reachedSites(ctx: RulesContext, state: GameState, playerId: PlayerId): Set<SiteId> {
  const out = new Set<SiteId>(getPlayerHoldings(state, playerId).map((h) => h.siteId));
  for (const routeId of state.players[playerId]?.routeIds ?? []) {
    if (!isRouteUsable(state, routeId, { allowHighwayman: true })) continue;
    const r = ctx.board.route(routeId);
    out.add(r.siteA);
    out.add(r.siteB);
  }
  return out;
}

export function evaluateQuestCondition(ctx: RulesContext, state: GameState, playerId: PlayerId, conditionId: QuestConditionId): QuestProgress {
  const p = state.players[playerId];
  if (!p) return progress(0, 1);
  const holdings = getPlayerHoldings(state, playerId);
  switch (conditionId) {
    case "kings_highway": {
      const [a, b] = ctx.board.topology.questParams.kingsHighway;
      return progress(connectedSites(ctx, state, playerId, a).has(b) ? 1 : 0, 1);
    }
    case "friend_of_the_forest": {
      const timber = new Set(
        getPlayerBanners(state, playerId)
          .map((b) => b.regionId)
          .filter((r): r is string => !!r && ctx.board.region(r).resource === "timber"),
      );
      return progress(timber.size, 3);
    }
    case "monster_problems":
      return progress(p.stats.menacesMoved, 3);
    case "grand_tour": {
      const reached = reachedSites(ctx, state, playerId);
      return progress(ctx.board.landmarkSiteIds.filter((s) => reached.has(s)).length, 3);
    }
    case "master_builder": {
      const strongholds = holdings.filter((h) => h.type === "stronghold").length;
      // Needs 5 Holdings of which 2 are Strongholds: report the tighter of the two.
      return { complete: holdings.length >= 5 && strongholds >= 2, current: Math.min(holdings.length, 3 + Math.min(strongholds, 2)), target: 5 };
    }
    case "diverse_realm":
      return progress(p.stats.maxHarvestTypes, 5);
    case "patron_of_heroes":
      // 2, not 3: the deck holds only 3 Hero cards in 2-player games and 5 otherwise (§27.1).
      return progress(p.stats.heroesPlayed, 2);
    case "arcane_scholar":
      return progress(p.stats.spellsPlayed, 3);
    case "stone_and_timber": {
      const strongholds = holdings.filter((h) => h.type === "stronghold").length;
      return { complete: p.routeIds.length >= 6 && strongholds >= 1, current: Math.min(p.routeIds.length, 6) + Math.min(strongholds, 1), target: 7 };
    }
    case "prosperous_estates":
      return progress(p.stats.maxSingleHarvest, 5);
    case "far_reaches": {
      let best = 0;
      for (const a of holdings)
        for (const b of holdings) {
          const d = ctx.board.distance(a.siteId, b.siteId);
          if (Number.isFinite(d)) best = Math.max(best, d);
        }
      return progress(best, 6);
    }
    case "the_safer_road":
      return progress(p.stats.menacesMovedOffOwnAssets, 2);
  }
}

/**
 * Under the opt-in expiry rule (§27.2), the rounds a revealed Quest has left
 * on offer: 1 means it leaves as the next round begins. Null when there is no
 * countdown to show: the rule is off, the Quest is not on display, or it is
 * due but the deck has no replacement for it as the coming round begins (a
 * due Quest crowded out by earlier slots can still leave a round later).
 */
export function questRoundsLeft(state: GameState, questId: QuestId): number | null {
  const rounds = state.ruleset.questExpiryRounds ?? 0;
  if (!state.ruleset.enableQuests || rounds <= 0 || !state.revealedQuestIds.includes(questId)) return null;
  // Setup runs in round 0, but the opening Quests count from round 1.
  const now = Math.max(state.round, 1);
  const left = (q: QuestId): number => Math.max(1, rounds - (now - (state.revealedQuestRounds?.[q] ?? now)));
  // Quests due next round leave in slot order while the deck has replacements.
  const due = state.revealedQuestIds.filter((q) => left(q) === 1);
  const place = due.indexOf(questId);
  if (place >= state.questDeck.length || (place < 0 && state.questDeck.length === 0)) return null;
  return left(questId);
}

export function getQuestProgress(ctx: RulesContext, state: GameState, playerId: PlayerId, questId: QuestId): QuestProgress {
  return evaluateQuestCondition(ctx, state, playerId, ctx.quest(questId).conditionId);
}
