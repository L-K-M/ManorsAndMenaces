// Sealed Charges (spec §27A) as the screen shows them: the viewer's own
// Charge and its progress, the Charges drawn for them to keep one of, and
// the Charges revealed so far. A rival's Charge is never named, not even in
// a local game where the state holds it: only that one is held (§83).

import { HIDDEN_CHARGE, getChargeProgress, type ChargeId, type GameState, type PlayerId, type QuestProgress, type RulesContext } from "@manors-menaces/rules";
import { t } from "../i18n.js";

export const chargeName = (id: ChargeId): string => t(`charge.${id}.name`);
export const chargeDescription = (id: ChargeId): string => t(`charge.${id}.description`);

export interface HeldCharge {
  id: ChargeId;
  progress: QuestProgress;
}

/** The viewer's own sealed Charge, or null: none held, or no viewer (a hot-seat curtain, a spectator). */
export function heldCharge(ctx: RulesContext, state: GameState, viewerId: PlayerId | null): HeldCharge | null {
  const charge = viewerId ? state.players[viewerId]?.sealedCharge : undefined;
  if (!viewerId || !charge || charge.id === HIDDEN_CHARGE) return null;
  return { id: charge.id, progress: getChargeProgress(ctx, state, viewerId, charge) };
}

/** The Charges drawn for the viewer to keep one of; empty unless that choice is theirs now. */
export function chargeChoices(state: GameState, viewerId: PlayerId | null): ChargeId[] {
  const pending = state.pending;
  if (pending?.kind !== "charge" || pending.playerId !== viewerId) return [];
  return pending.chargeIds.filter((id) => id !== HIDDEN_CHARGE);
}

/** Every Charge revealed so far, with who revealed it, in turn order. */
export function revealedCharges(state: GameState): { playerId: PlayerId; chargeId: ChargeId }[] {
  return state.turnOrder.flatMap((playerId) => (state.players[playerId]?.revealedChargeIds ?? []).map((chargeId) => ({ playerId, chargeId })));
}
