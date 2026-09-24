// Hidden-information views (spec §83, §105). The server sends each player
// the public state plus their own hand; deck order and other hands are
// replaced by counts.

import { clone } from "./clone.js";
import type { GameEvent } from "./events.js";
import type { CardId, GameState, PlayerId, PlayerState } from "./types.js";

export const HIDDEN_CARD: CardId = "hidden";

/**
 * A GameState with hidden information removed for `viewerId` (or for a
 * spectator when viewerId is null). Hidden cards become HIDDEN_CARD so array
 * lengths — which are public — are preserved. The RNG state is dropped
 * because it would let a client predict draws.
 */
export function redactState(state: GameState, viewerId: PlayerId | null): GameState {
  const players: Record<PlayerId, PlayerState> = {};
  for (const [id, p] of Object.entries(state.players)) {
    players[id] = id === viewerId ? clone(p) : { ...clone(p), hand: p.hand.map(() => HIDDEN_CARD) };
  }
  const out: GameState = {
    ...clone(state),
    players,
    cardDeck: state.cardDeck.map(() => HIDDEN_CARD),
    questDeck: state.questDeck.map(() => "hidden"),
    rngState: [0, 0, 0, 0],
    seed: "hidden",
  };
  if (state.pending?.kind === "prophecy" && state.pending.playerId !== viewerId) {
    out.pending = { ...state.pending, cardIds: state.pending.cardIds.map(() => HIDDEN_CARD) };
  }
  if (state.pending?.kind === "reaction") {
    // The played card is public once played. Only the player currently being
    // asked is revealed; the rest of the list would expose who else holds a
    // reaction card (§105).
    out.pending = { ...clone(state.pending), eligiblePlayerIds: state.pending.eligiblePlayerIds.slice(0, 1) };
  }
  return out;
}

/** Removes card identities a viewer must not see from an event. */
export function redactEvent(event: GameEvent, viewerId: PlayerId | null): GameEvent {
  switch (event.type) {
    case "card_bought":
      return event.playerId === viewerId ? event : { ...event, cardId: null };
    case "prophecy_revealed":
      return event.playerId === viewerId ? event : { ...event, cardIds: null };
    case "card_discarded":
      // Discards are public in the base game (the discard pile is face up).
      return event;
    default:
      return event;
  }
}
