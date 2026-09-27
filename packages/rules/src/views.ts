// Hidden-information views (spec §83, §105). The server sends each player
// the public state plus their own hand; deck order and other hands are
// replaced by counts.

import { clone } from "./clone.js";
import type { GameEvent } from "./events.js";
import type { CardId, ChargeId, GameState, PlayerId, PlayerState } from "./types.js";

export const HIDDEN_CARD: CardId = "hidden";
/** A Sealed Charge the viewer may not see (§27A): a rival's, or one in the deck. */
export const HIDDEN_CHARGE: ChargeId = "hidden";

/** A player as `viewerId` may see them: a rival's hand and sealed Charge are hidden, their counts are not. */
function playerView(p: PlayerState, viewerId: PlayerId | null): PlayerState {
  if (p.id === viewerId) return clone(p);
  const out: PlayerState = { ...clone(p), hand: p.hand.map(() => HIDDEN_CARD) };
  if (p.sealedCharge) out.sealedCharge = { id: HIDDEN_CHARGE };
  return out;
}

/**
 * A GameState with hidden information removed for `viewerId` (or for a
 * spectator when viewerId is null). Hidden cards become HIDDEN_CARD so array
 * lengths — which are public — are preserved. The RNG state is dropped
 * because it would let a client predict draws.
 */
export function redactState(state: GameState, viewerId: PlayerId | null): GameState {
  const players: Record<PlayerId, PlayerState> = {};
  for (const [id, p] of Object.entries(state.players)) players[id] = playerView(p, viewerId);
  const out: GameState = {
    ...clone(state),
    players,
    cardDeck: state.cardDeck.map(() => HIDDEN_CARD),
    questDeck: state.questDeck.map(() => "hidden"),
    rngState: [0, 0, 0, 0],
    seed: "hidden",
  };
  if (state.chargeDeck) out.chargeDeck = state.chargeDeck.map(() => HIDDEN_CHARGE);
  if (state.pending?.kind === "prophecy" && state.pending.playerId !== viewerId) {
    out.pending = { ...state.pending, cardIds: state.pending.cardIds.map(() => HIDDEN_CARD) };
  }
  if (state.pending?.kind === "charge" && state.pending.playerId !== viewerId) {
    out.pending = { ...state.pending, chargeIds: state.pending.chargeIds.map(() => HIDDEN_CHARGE) };
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
    case "cards_dealt":
    case "prophecy_revealed":
      return event.playerId === viewerId ? event : { ...event, cardIds: null };
    case "charges_drawn":
      return event.playerId === viewerId ? event : { ...event, chargeIds: null };
    case "charge_kept":
      return event.playerId === viewerId ? event : { ...event, chargeId: null };
    case "card_discarded":
      // Discards are public in the base game (the discard pile is face up).
      return event;
    default:
      return event;
  }
}
