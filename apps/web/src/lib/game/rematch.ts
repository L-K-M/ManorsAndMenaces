// What "Play again" does at the end of a game.

import type { SeatConfig } from "@manors-menaces/protocol";
import { clone, type GameState } from "@manors-menaces/rules";
import type { NewGameOptions } from "./session.svelte.js";

export type RematchPlan =
  /** Start a local game with the same seats, rules and map and a fresh seed. */
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
  initialState: GameState;
}

export function planRematch(game: FinishedGame): RematchPlan {
  if (game.transport === "online") return { kind: "lobby" };
  if (game.tutorial) return { kind: "new_game" };

  // The seed is left out so the new game gets a fresh one.
  return {
    kind: "local",
    options: { seats: clone([...game.seats]), ruleset: clone(game.initialState.ruleset), mapId: game.mapId },
  };
}
