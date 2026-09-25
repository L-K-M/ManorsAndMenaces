import { describe, expect, it } from "vitest";
import { runAiUntilHuman } from "@manors-menaces/ai";
import { rulesContentFor } from "@manors-menaces/content";
import { createRng, createRulesEngine, hashState, seedRng, standardRuleset, RULESET_VERSION, type GameCommand, type GameState } from "@manors-menaces/rules";

const engine = createRulesEngine(rulesContentFor());

/** Three Easy AIs on Greenvale, stopping at the end of `maxRounds`. */
function playEasy(seed: string, maxRounds: number): { final: GameState; commands: GameCommand[] } {
  let s = engine.createGame({
    matchId: `m-${seed}`,
    seed,
    rulesetVersion: RULESET_VERSION,
    ruleset: standardRuleset(3),
    players: [1, 2, 3].map((n) => ({ id: `P${n}`, displayName: `P${n}` })),
  });
  const rng = createRng(seedRng(`ai-${seed}`));
  const commands: GameCommand[] = [];
  for (let step = 0; step < 20000 && s.status !== "finished" && s.round <= maxRounds; step++) {
    const r = runAiUntilHuman(
      engine,
      s,
      () => true,
      () => ({ level: "easy", rng }),
      1,
    );
    if (r.commands.length === 0) break;
    commands.push(...r.commands);
    s = r.state;
  }
  return { final: s, commands };
}

describe("AI expansion in Easy games", () => {
  // Before expansion planning, these seeds stalled past round 40 with every
  // player hoarding 90 to 190 resources and no Site in reach of one Route.
  for (const seed of ["easy-2", "easy-3", "easy-4"]) {
    it(`${seed}: three Easy AIs finish within 40 rounds`, () => {
      const { final } = playEasy(seed, 40);
      expect(final.status).toBe("finished");
      expect(final.round).toBeLessThanOrEqual(40);
    }, 60_000);
  }

  it("makes the same decisions from the same seeds", () => {
    const withoutIds = (cs: GameCommand[]) => cs.map(({ commandId: _id, ...rest }) => rest);
    const a = playEasy("easy-2", 40);
    const b = playEasy("easy-2", 40);
    expect(withoutIds(b.commands)).toEqual(withoutIds(a.commands));
    expect(hashState(b.final)).toBe(hashState(a.final));
  }, 60_000);
});
