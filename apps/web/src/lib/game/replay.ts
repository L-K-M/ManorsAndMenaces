// Replays a saved command history with the rules engine (spec §62), so the
// client can derive the Chronicle and end-of-game statistics from it.

import { hashState, type ApplyResult, type GameCommand, type GameEvent, type GameState, type RulesEngine } from "@manors-menaces/rules";
import { devlog } from "../devlog.js";

export interface ReplayStep {
  command: GameCommand;
  events: GameEvent[];
  before: GameState;
  after: GameState;
}

export interface ReplayResult {
  /** State after the last command that applied. */
  final: GameState;
  /**
   * Every command applied and, when an expected state was given, the replay
   * reached it exactly. False when the history is incomplete, for example
   * after unrecorded debug commands.
   */
  complete: boolean;
}

/**
 * Applies `commands` to `initial` in order and calls `visit` for each accepted
 * one. Stops at the first rejected command instead of throwing. A command the
 * engine throws on (a damaged or older save) also ends the replay as
 * incomplete: callers use the result only for the Chronicle and statistics,
 * which must never keep a save from loading.
 */
export function replayHistory(
  engine: RulesEngine,
  initial: GameState,
  commands: readonly GameCommand[],
  visit: (step: ReplayStep) => void,
  expected?: GameState,
): ReplayResult {
  let state = initial;
  for (const command of commands) {
    let r: ApplyResult;
    try {
      r = engine.applyCommand(state, command);
    } catch (e) {
      devlog("rules", "replay stopped: the engine threw on a saved command", e);
      return { final: state, complete: false };
    }
    if (!r.accepted || !r.newState) return { final: state, complete: false };

    visit({ command, events: r.events, before: state, after: r.newState });
    state = r.newState;
  }

  const complete = !expected || hashState(state) === hashState(expected);
  return { final: state, complete };
}
