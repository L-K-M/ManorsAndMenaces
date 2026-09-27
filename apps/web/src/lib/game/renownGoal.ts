// The Renown to win a new game is created with (spec §7), on New Game and in
// the online lobby: the rules' default for the player count until you pick a
// goal. Your last pick is remembered per browser, like your name.

import { BALANCE, defaultTargetRenown, targetRenownChoices, type RulesetName } from "@manors-menaces/rules";
import { t } from "../i18n.js";

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

/**
 * By player count, the lowest goal the board usually fills up before, after
 * which the most Renown wins (§7): from simulations of the Standard rules
 * (§129.7). The Core rules were not simulated, so they get no such hint.
 */
const BOARD_FILLS_FIRST_FROM: Readonly<Partial<Record<number, number>>> = { 2: 30, 3: 25, 4: 20 };

/** What a goal means, shown under the choice: whether the board usually fills first, and the last round. */
export function renownGoalHint(rules: RulesetName, playerCount: number, goal: number): string {
  const lastRound = t("ui.renown_goal_last_round", { last: BALANCE.lastRound });
  if (rules === "mvp") return lastRound;
  const fillsFrom = BOARD_FILLS_FIRST_FROM[playerCount];
  return fillsFrom !== undefined && goal >= fillsFrom ? `${t("ui.renown_goal_board_fills")} ${lastRound}` : lastRound;
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
