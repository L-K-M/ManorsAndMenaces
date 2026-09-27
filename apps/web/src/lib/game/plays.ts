// Cards other players played, as notices the viewer reads whole and
// acknowledges (PlayedCardDialog). Pure; plays.svelte.ts queues them.

import type { HistoryEntry } from "@manors-menaces/protocol";
import type { CardId, GameEvent, GameState, PlayerId } from "@manors-menaces/rules";

export interface PlayNotice {
  /** Who played the card. */
  playerId: PlayerId;
  /** The card they played; for a counter, their Counterspell. */
  cardId: CardId;
  /** The Spell a Counterspell cancelled, and who had cast it. */
  countered: { playerId: PlayerId; cardId: CardId } | null;
}

/**
 * The Spell `viewerId` is being asked to answer right now, if any. The
 * Counterspell dialog shows that card, which counts as reading it.
 */
export function reactionAskedOf(state: GameState, viewerId: PlayerId): CardId | null {
  const pending = state.pending;
  return pending?.kind === "reaction" && pending.eligiblePlayerIds[0] === viewerId ? pending.cardId : null;
}

/**
 * The cards other players played in one batch of events, in order, as
 * `viewerId` should read them (`state` is the state after the batch). The
 * viewer's own plays are left out, and a Counterspell and the Spell it
 * cancelled make one notice. Without a viewer (a neutral screen, a game of
 * computers only) nobody reads anything.
 */
export function playNoticesFor(events: readonly GameEvent[], state: GameState, viewerId: PlayerId | null): PlayNotice[] {
  if (!viewerId) return [];
  // The engine reports a Counterspell as played, then the Spell as cancelled.
  const counters = new Set(events.flatMap((e) => (e.type === "card_cancelled" ? [e.counterCardId] : [])));
  const asked = reactionAskedOf(state, viewerId);
  const out: PlayNotice[] = [];
  for (const e of events) {
    if (e.type === "card_played") {
      if (e.playerId === viewerId || counters.has(e.cardId) || e.cardId === asked) continue;
      out.push({ playerId: e.playerId, cardId: e.cardId, countered: null });
    } else if (e.type === "card_cancelled" && e.byPlayerId !== viewerId) {
      out.push({ playerId: e.byPlayerId, cardId: e.counterCardId, countered: { playerId: e.playerId, cardId: e.cardId } });
    }
  }
  return out;
}

/**
 * Online: the cards other players played since this device last showed the
 * match (`lastSeen`, a revision), oldest first, from the match history. On a
 * first visit there is nothing to catch up on, as the Chronicle marks no
 * moves as new either. History entries carry no state of their own; the
 * current `state` only tells which Spell the viewer must answer now.
 */
export function missedPlays(entries: readonly HistoryEntry[], lastSeen: number | null, state: GameState, viewerId: PlayerId): PlayNotice[] {
  if (lastSeen === null) return [];
  return entries.filter((entry) => entry.revision > lastSeen).flatMap((entry) => playNoticesFor(entry.events, state, viewerId));
}
