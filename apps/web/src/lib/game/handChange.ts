// What another player's Changeling cost the viewer: the cards they gave up
// and the ones they got, for a notice on the hand. The hands_swapped event
// carries only hand sizes, so the cards come from the viewer's own hand
// before and after the batch. Both are the viewer's, so nothing hidden leaks.

import type { CardId, GameEvent, GameState, PlayerId } from "@manors-menaces/rules";

export interface HandSwap {
  /** The player who swapped hands with the viewer. */
  by: PlayerId;
  gave: CardId[];
  got: CardId[];
}

/** Null unless another player swapped hands with `viewerId` in `events`. */
export function handSwapFor(events: readonly GameEvent[], before: GameState, after: GameState, viewerId: PlayerId): HandSwap | null {
  let by: PlayerId | null = null;
  const dealt = new Set<CardId>();
  for (const e of events) {
    if (e.type === "hands_swapped" && e.opponentId === viewerId && e.playerId !== viewerId) by = e.playerId;
    // A round's cards can arrive in the same batch; they were not part of the swap.
    if (e.type === "cards_dealt" && e.playerId === viewerId) for (const id of e.cardIds ?? []) dealt.add(id);
  }
  if (!by) return null;
  return {
    by,
    gave: [...(before.players[viewerId]?.hand ?? [])],
    got: (after.players[viewerId]?.hand ?? []).filter((id) => !dealt.has(id)),
  };
}

/**
 * The swap notices after a batch. `endedBy` is the player whose own batch
 * this is (it ends their turn or answers a reaction), or null: they have had
 * their look, so their notice goes, unless this very batch swapped their
 * hand again. Returns `current` itself when nothing changed.
 */
export function nextHandSwaps(
  current: ReadonlyMap<PlayerId, HandSwap>,
  batch: { events: readonly GameEvent[]; state: GameState },
  before: GameState,
  endedBy: PlayerId | null,
): ReadonlyMap<PlayerId, HandSwap> {
  const swaps = batch.events.flatMap((e) => (e.type === "hands_swapped" ? [e.opponentId] : []));
  if (!swaps.length && !(endedBy && current.has(endedBy))) return current;
  const next = new Map(current);
  if (endedBy) next.delete(endedBy);
  for (const victim of swaps) {
    const swap = handSwapFor(batch.events, before, batch.state, victim);
    if (swap) next.set(victim, swap);
  }
  return next;
}
