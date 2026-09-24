// Which seat's private information (hand, quest progress, harvest preview)
// the local screen may show (spec §56.1). Online, the answer is always this
// client's seat and never changes, so only local games are modelled here.

import type { PlayerId } from "@manors-menaces/rules";

export enum PrivacyMode {
  /**
   * One human, or the curtain is switched off: the screen belongs to the
   * humans and follows whichever of them acted last, through AI turns too.
   */
  Shared = "shared",
  /**
   * Two or more humans pass one device: only the human who has taken the
   * device may be shown. AI turns and the curtain show nobody's hand.
   */
  HotSeat = "hotseat",
}

export interface PrivacyView {
  /** Seat whose private information is shown, or null for a neutral view. */
  viewerId: PlayerId | null;
  /** Hot-seat: waiting for this human to take the device. */
  curtainFor: PlayerId | null;
}

export function privacyMode(humanSeats: number, curtainEnabled: boolean): PrivacyMode {
  return curtainEnabled && humanSeats >= 2 ? PrivacyMode.HotSeat : PrivacyMode.Shared;
}

/** The view before anyone has acted, e.g. for a new or reloaded game. */
export function initialView(mode: PrivacyMode, firstHuman: PlayerId | null): PrivacyView {
  return { viewerId: mode === PrivacyMode.HotSeat ? null : firstHuman, curtainFor: null };
}

/**
 * The view once `actor` must act next (null when nobody can act, e.g. after
 * the game ends, which keeps the current view).
 */
export function nextView(mode: PrivacyMode, view: PrivacyView, actor: PlayerId | null, actorIsHuman: boolean): PrivacyView {
  if (!actor) return view;

  if (mode === PrivacyMode.Shared) {
    return actorIsHuman && actor !== view.viewerId ? { viewerId: actor, curtainFor: null } : view;
  }

  if (!actorIsHuman) return { viewerId: null, curtainFor: null };
  if (actor === view.viewerId || actor === view.curtainFor) return view;
  return { viewerId: null, curtainFor: actor };
}

/** The human waiting at the curtain has taken the device. */
export function revealView(view: PrivacyView): PrivacyView {
  return view.curtainFor ? { viewerId: view.curtainFor, curtainFor: null } : view;
}
