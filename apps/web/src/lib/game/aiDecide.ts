// One AI decision as a pure function of plain data, so the Web Worker and the
// in-thread fallback run exactly the same code and produce the same result.

import { chooseAction, type AiLevel } from "@manors-menaces/ai";
import { createRng, type CommandIntent, type GameState, type PlayerId, type RngState } from "@manors-menaces/rules";
import { engineFor } from "./engine.js";

/** Everything a decision depends on; all of it survives structured cloning. */
export interface AiRequest {
  mapId: string;
  state: GameState;
  playerId: PlayerId;
  level: AiLevel;
  /** The session's AI RNG before this decision (§30). */
  rngState: RngState;
}

export interface AiDecision {
  intent: CommandIntent | null;
  /** The AI RNG after this decision; the session carries it to the next one. */
  rngState: RngState;
}

export function decideAi(req: AiRequest): AiDecision {
  const rng = createRng(req.rngState);
  const intent = chooseAction(engineFor(req.mapId), req.state, req.playerId, { level: req.level, rng });
  return { intent, rngState: rng.state };
}
