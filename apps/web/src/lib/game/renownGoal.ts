// The Renown to win a new game is created with (spec §7), on New Game and in
// the online lobby: the rules' default for the player count until you pick a
// goal. Your last pick is remembered per browser, like your name.

import { defaultTargetRenown, targetRenownChoices, type RulesetName } from "@manors-menaces/rules";

const KEY = "mm.renownGoal.v1";

export interface RenownGoal {
  /** The goal the game will be created with. */
  value: number;
  /** The rules' default for this player count. */
  usual: number;
  /** The goals on offer, lowest first. */
  choices: number[];
}

/**
 * The goal on offer for these rules and players: the one you picked while
 * these rules offer it, else their default. A pick the rules do not offer
 * (Core's 10 in a Standard game) is kept for when they do again.
 */
export function renownGoal(rules: RulesetName, playerCount: number, picked: number | null): RenownGoal {
  const choices = targetRenownChoices(rules, playerCount);
  const usual = defaultTargetRenown(rules, playerCount);
  return { value: picked !== null && choices.includes(picked) ? picked : usual, usual, choices };
}

/** The goal you last picked, or null. The rules check it before it is used. */
export function rememberedRenownGoal(): number | null {
  try {
    const stored = localStorage.getItem(KEY)?.trim() ?? "";
    return /^\d+$/.test(stored) ? Number(stored) : null;
  } catch {
    // Storage may be unavailable (private mode); nothing is remembered.
    return null;
  }
}

export function rememberRenownGoal(goal: number): void {
  try {
    localStorage.setItem(KEY, String(goal));
  } catch {
    // ignore
  }
}
