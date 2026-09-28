// What "Play again" does at the end of a game.

import type { SeatConfig } from "@manors-menaces/protocol";
import { BALANCE, clone, crownLevyRules, type GameState, type RulesetConfig } from "@manors-menaces/rules";
import { parseMapId } from "@manors-menaces/content";
import { TUTORIAL_SEED } from "./saves.js";
import type { BoardChoice, NewGameOptions } from "./session.svelte.js";

export type RematchPlan =
  /** Start a local game with the same seats, rules and board choice and a fresh seed. */
  | { kind: "local"; options: NewGameOptions }
  /** Online: go back to the lobby rather than silently starting a local game. */
  | { kind: "lobby" }
  /** After the tutorial: set up a real game. */
  | { kind: "new_game" };

export interface FinishedGame {
  transport: "local" | "online";
  tutorial: boolean;
  seats: readonly SeatConfig[];
  mapId: string;
  /** How New Game chose the board, when this session knows. */
  board?: BoardChoice;
  initialState: GameState;
}

export function planRematch(game: FinishedGame): RematchPlan {
  if (game.transport === "online") return { kind: "lobby" };
  // A tutorial continued from a save no longer carries the flag; its seed does.
  if (game.tutorial || game.initialState.seed === TUTORIAL_SEED) return { kind: "new_game" };

  // The seed is left out so the new game gets a fresh one, and with it new
  // land. A game continued from a save no longer knows whether its island was
  // chosen, so it stays on that island.
  const drawnOn = parseMapId(game.mapId);
  const board: BoardChoice =
    game.board ?? (drawnOn?.layout != null ? { kind: "drawn", islandId: drawnOn.islandId } : { kind: "fixed", mapId: game.mapId });
  return {
    kind: "local",
    options: { seats: clone([...game.seats]), ruleset: withRulesAddedSince(game.initialState.ruleset), board: clone(board) },
  };
}

/**
 * A rematch is a new game, so it gets the rules added since an older save
 * was made, which that game played on without: the full-board end (ruleset
 * 0.7.0, on in every ruleset), the last round (0.8.0) and, in the Standard
 * and async rules, the Crown's Levy (0.9.0). The goal and the other options
 * the players chose stay as they were.
 */
function withRulesAddedSince(ruleset: RulesetConfig): RulesetConfig {
  const added = { ...clone(ruleset), endOnFullBoard: ruleset.endOnFullBoard ?? true, lastRound: ruleset.lastRound ?? BALANCE.lastRound };
  if (ruleset.name === "mvp" || ruleset.crownLevy) return added;
  return { ...added, crownLevy: crownLevyRules(ruleset.targetRenown) };
}
