import { runAiUntilHuman } from "@manors-menaces/ai";
import { createRng, seedRng, RULESET_VERSION, type GameCommand, type GameState, type RulesetConfig } from "@manors-menaces/rules";
import { engineFor } from "../src/lib/game/engine.js";

export const engine = engineFor("greenvale");

/** Plays an AI-only game on Greenvale, optionally stopping after `maxCommands`. */
export function playGame(
  ruleset: RulesetConfig,
  seed: string,
  players = 3,
  maxCommands = Infinity,
): { initial: GameState; final: GameState; commands: GameCommand[] } {
  const initial = engine.createGame({
    matchId: `m-${seed}`,
    seed,
    rulesetVersion: RULESET_VERSION,
    ruleset,
    players: Array.from({ length: players }, (_, i) => ({ id: `P${i + 1}`, displayName: `Player ${i + 1}` })),
  });
  const rng = createRng(seedRng(`ai-${seed}`));
  let state = initial;
  const commands: GameCommand[] = [];
  while (state.status !== "finished" && commands.length < maxCommands && state.round <= 80) {
    const r = runAiUntilHuman(
      engine,
      state,
      () => true,
      () => ({ level: "normal", rng }),
      1,
    );
    if (r.commands.length === 0) break;
    commands.push(...r.commands);
    state = r.state;
  }
  return { initial, final: state, commands };
}
