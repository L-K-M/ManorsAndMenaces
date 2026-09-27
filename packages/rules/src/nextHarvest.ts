// The Banner warning (§16.3), and whether a player harvests again before the
// game ends. Apart from the selectors because both look at the End Turn's
// own scoring, which Sealed Charges and the Crown's Voice add.

import { BALANCE } from "./balance.js";
import { meetsChargeWith } from "./charges.js";
import type { RulesContext } from "./context.js";
import { endsOnFullBoard, getBannerAdvice, getRenown, isLastRound, isLastSeat, type BannerAdvice } from "./selectors.js";
import type { BannerId, GameState, PlayerId, RegionId } from "./types.js";
import { getFavourAwards } from "./voice.js";

/**
 * Whether the player harvests again, at the start of their next turn:
 * false when the game is sure to end first. That is when someone has the
 * target Renown once this End Turn has scored (the game ends at this End
 * Turn, or with the round under equal turns), when equal turns already end
 * the game with this round, in the last round, and when the player ends the
 * round on a full board.
 *
 * This End Turn scores the player's own Sealed Charge if the Banners, as
 * `draft` places them, meet it (§27A), and at the round's last seat the
 * Crown's Voice's Favour (§129.10), both before the victory check. The
 * player knows both: their own Charge is on their view, and Favour is
 * public and fixed by then.
 *
 * Endings still open are not foreseen: Ragnarök, a rival reaching the
 * target later in the round, Favour at a later seat's End Turn, and a board
 * that fills before the round's last seat, which a card could empty again.
 */
export function hasNextHarvest(ctx: RulesContext, state: GameState, playerId: PlayerId, draft: Readonly<Record<BannerId, RegionId | null>> = {}): boolean {
  if (state.status === "finished" || state.endTriggered || isLastRound(state)) return false;
  const renown = renownAfterEndTurn(ctx, state, playerId, draft);
  if (state.turnOrder.some((id) => (renown.get(id) ?? 0) >= state.ruleset.targetRenown)) return false;
  return !(isLastSeat(state, playerId) && endsOnFullBoard(ctx, state));
}

/**
 * §16.3: the Banner warning before the player ends their turn: how their
 * Banners could harvest more next turn than `draft` places them, or null
 * when they cannot, or when the game ends before that Harvest.
 *
 * When the draft meets the player's Sealed Charge, only placements that
 * still meet it are advised: the Charge's Renown, scored at this End Turn,
 * outweighs a Harvest (§27A), as it does for the AI.
 */
export function getBannerWarning(ctx: RulesContext, state: GameState, playerId: PlayerId, draft: Readonly<Record<BannerId, RegionId | null>> = {}): BannerAdvice | null {
  if (!hasNextHarvest(ctx, state, playerId, draft)) return null;
  const keepsCharge = meetsChargeWith(ctx, state, playerId, draft);
  const advice = getBannerAdvice(ctx, state, playerId, draft, keepsCharge ? { keep: (placement) => meetsChargeWith(ctx, state, playerId, placement) } : {});
  return advice.best > advice.current ? advice : null;
}

/** Each player's Renown at the victory check of the player's End Turn (engine.ts endTurn). */
function renownAfterEndTurn(ctx: RulesContext, state: GameState, playerId: PlayerId, draft: Readonly<Record<BannerId, RegionId | null>>): Map<PlayerId, number> {
  const renown = new Map(state.turnOrder.map((id) => [id, getRenown(ctx, state, id)]));
  const add = (id: PlayerId, n: number) => renown.set(id, Math.max(0, (renown.get(id) ?? 0) + n));

  if (meetsChargeWith(ctx, state, playerId, draft)) add(playerId, BALANCE.sealedCharges.renown);
  if (isLastSeat(state, playerId)) {
    for (const award of getFavourAwards(ctx, state)) {
      add(award.playerId, 1);
      if (award.source === "rival") add(award.rivalId, -1);
    }
  }
  return renown;
}
