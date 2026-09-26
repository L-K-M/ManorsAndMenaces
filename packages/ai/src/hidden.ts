// Hidden information in the AI's planning (spec §105). The planner works on a
// redacted view, where rivals' cards are HIDDEN_CARD, so a Spell simulated
// there never meets a Counterspell. These helpers put the counter back as a
// chance estimated from public cards only.

import { isCardUsableInRuleset, type CardDefId, type CardId, type CommandIntent, type GameCommand, type GameState, type PlayerId, type RulesContext, type RulesEngine } from "@manors-menaces/rules";

let seq = 0;

/** Reaction cards (Counterspell) this ruleset deals, with their copies. */
function reactionDefs(ctx: RulesContext, state: GameState): { id: CardDefId; copies: number }[] {
  if (!state.ruleset.enableCards || !state.ruleset.enableReactionCards) return [];
  return ctx.content.cards.filter((def) => def.timing.includes("reaction") && isCardUsableInRuleset(def, state.ruleset)).map((def) => ({ id: def.id, copies: def.copies }));
}

/** Cards the player can see: their hand, the discard pile, Charters and set-aside cards. */
function seenCards(state: GameState, playerId: PlayerId): CardId[] {
  const charters = Object.values(state.players).flatMap((p) => p.charters ?? []);
  return [...(state.players[playerId]?.hand ?? []), ...state.discardPile, ...charters, ...(state.setAsideCardIds ?? [])];
}

/**
 * Chance that at least one rival holds a reaction card when `playerId` plays
 * `cardId`, from public information: the reaction cards not yet seen are
 * spread over the unseen cards (the draw pile and rivals' hands) at random.
 * Zero for anything that opens no reaction window (§109: Spells only).
 */
export function counterChance(ctx: RulesContext, state: GameState, playerId: PlayerId, cardId: CardId): number {
  if (ctx.cardOf(cardId).type !== "spell") return 0;
  const defs = reactionDefs(ctx, state);
  if (defs.length === 0) return 0;
  const seen = seenCards(state, playerId);
  const unseenCounters = defs.reduce((n, d) => n + Math.max(0, d.copies - seen.filter((c) => c.startsWith(`${d.id}#`)).length), 0);
  const rivalCards = state.turnOrder.filter((id) => id !== playerId).reduce((n, id) => n + (state.players[id]?.hand.length ?? 0), 0);
  const unseen = rivalCards + state.cardDeck.length;
  if (unseenCounters === 0 || rivalCards === 0 || unseen === 0) return 0;
  // Hypergeometric: none of the rivals' cards is one of the unseen counters.
  let none = 1;
  for (let k = 0; k < rivalCards; k++) none *= Math.max(0, unseen - unseenCounters - k) / (unseen - k);
  return 1 - none;
}

/**
 * The state after `intent`'s Spell is countered: the next rival holding a
 * card is given an unseen Counterspell in place of one hidden card and uses
 * it. Null if no rival holds a card or the engine refuses.
 */
export function counteredOutcome(engine: RulesEngine, state: GameState, playerId: PlayerId, intent: Extract<CommandIntent, { type: "play_card" }>): GameState | null {
  const def = reactionDefs(engine.ctx, state)[0];
  if (!def) return null;
  const start = state.turnOrder.indexOf(playerId);
  const rivals = state.turnOrder.map((_, i) => state.turnOrder[(start + 1 + i) % state.turnOrder.length] as PlayerId).filter((id) => id !== playerId);
  const holderId = rivals.find((id) => (state.players[id]?.hand.length ?? 0) > 0);
  const holder = holderId ? state.players[holderId] : undefined;
  if (!holderId || !holder) return null;
  const seen = new Set(seenCards(state, playerId));
  const counter = Array.from({ length: def.copies }, (_, i) => `${def.id}#${i + 1}`).find((c) => !seen.has(c)) ?? `${def.id}#1`;
  const armed: GameState = { ...state, players: { ...state.players, [holderId]: { ...holder, hand: [counter, ...holder.hand.slice(1)] } } };
  const command = (by: PlayerId, i: CommandIntent): GameCommand => ({ ...i, commandId: `ai-counter-${++seq}`, matchId: state.matchId, playerId: by }) as GameCommand;
  const played = engine.applyCommand(armed, command(playerId, intent));
  if (!played.accepted || played.newState?.pending?.kind !== "reaction") return null;
  const reacted = engine.applyCommand(played.newState, command(holderId, { type: "react", cardId: counter }));
  return reacted.accepted && reacted.newState ? reacted.newState : null;
}
