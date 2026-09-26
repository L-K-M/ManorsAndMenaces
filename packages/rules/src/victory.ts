// Victory ranking and game end (spec §7). Shared by the End Turn check and
// Ragnarök (§19.13), which ends the game in the middle of a turn.

import type { RulesContext } from "./context.js";
import { totalResources } from "./resources.js";
import { getPlayerHoldings, getRenown } from "./selectors.js";
import type { Tx } from "./tx.js";
import type { GameState, PlayerId, PlayerState } from "./types.js";

/** Players ordered by the §7 tie-break chain, best first. */
export function rankPlayers(ctx: RulesContext, state: GameState, playerIds: readonly PlayerId[]): PlayerId[] {
  const strongholds = (id: PlayerId): number => getPlayerHoldings(state, id).filter((h) => h.type === "stronghold").length;
  const key = (id: PlayerId): number[] => {
    const p = state.players[id] as PlayerState;
    return [getRenown(ctx, state, id), p.claimedQuestIds.length, strongholds(id), totalResources(p.resources), -state.turnOrder.indexOf(id)];
  };
  const keys = new Map(playerIds.map((id) => [id, key(id)]));
  return [...playerIds].sort((a, b) => {
    const ka = keys.get(a) as number[];
    const kb = keys.get(b) as number[];
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return (kb[i] as number) - (ka[i] as number);
    return 0;
  });
}

export function finishGame(tx: Tx, winnerId: PlayerId, cause?: "ragnarok"): void {
  const s = tx.s;
  s.status = "finished";
  s.winnerId = winnerId;
  if (cause) s.endCause = cause;
  delete s.pending;
  const renown = getRenown(tx.ctx, s, winnerId);
  tx.emit(cause ? { type: "game_won", playerId: winnerId, renown, cause } : { type: "game_won", playerId: winnerId, renown });
}
