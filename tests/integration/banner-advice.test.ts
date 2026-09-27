import { describe, expect, it } from "vitest";
import { runAiUntilHuman } from "@manors-menaces/ai";
import { mapIdForNewGame, rulesContentFor } from "@manors-menaces/content";
import {
  createRng,
  createRulesEngine,
  getBannerAdvice,
  getHarvestPreview,
  hasNextHarvest,
  mvpRuleset,
  seedRng,
  standardRuleset,
  validateBannerAssignment,
  RULESET_VERSION,
  type GameState,
  type PlayerId,
  type RulesetConfig,
} from "@manors-menaces/rules";

// The Banner warning (§16.3) against the AI's own Banner search
// (optimizeBanners): after a Normal AI places its Banners, a better
// placement never exists, so a human who placed them the same way is never
// warned. Left as they were, the Banners often could do better.

interface Tally {
  phases: number;
  aiWarnings: number;
  keptWarnings: number;
}

function play(seed: string, players: number, tally: Tally): void {
  const engine = createRulesEngine(rulesContentFor(mapIdForNewGame(seed)));
  const ctx = engine.ctx;
  let s: GameState = engine.createGame({
    matchId: `m-${seed}`,
    seed,
    rulesetVersion: RULESET_VERSION,
    ruleset: standardRuleset(players),
    players: Array.from({ length: players }, (_, i) => ({ id: `P${i + 1}`, displayName: `P${i + 1}` })),
  });
  const rng = createRng(seedRng(`ai-${seed}`));
  for (let step = 0; step < 20000 && s.status !== "finished" && s.round <= 40; step++) {
    const r = runAiUntilHuman(
      engine,
      s,
      () => true,
      () => ({ level: "normal", rng }),
      1,
    );
    const command = r.commands[0];
    if (!command) break;
    if (s.status === "playing" && command.type === "assign_banners") {
      const p = command.playerId;
      tally.phases++;
      const kept = getBannerAdvice(ctx, s, p);
      expect(validateBannerAssignment(ctx, s, p, kept.assignment)).toEqual({ ok: true });
      expect(getHarvestPreview(ctx, s, p, kept.assignment).total).toBe(kept.best);
      if (kept.best > kept.current) tally.keptWarnings++;
      const placed = getBannerAdvice(ctx, s, p, command.assignments);
      expect(placed.current).toBe(kept.best);
      if (placed.best > placed.current) tally.aiWarnings++;
    }
    s = r.state;
  }
}

describe("Banner advice against the AI", () => {
  it("never finds a better placement than the Normal AI's", () => {
    const tally: Tally = { phases: 0, aiWarnings: 0, keptWarnings: 0 };
    for (const seed of ["banner-advice-1", "banner-advice-2"]) play(seed, 3, tally);
    play("banner-advice-3", 4, tally);
    expect(tally.phases).toBeGreaterThan(100);
    expect(tally.aiWarnings).toBe(0);
    // Not vacuous: Banners left where they were often could do better.
    expect(tally.keptWarnings).toBeGreaterThan(tally.phases / 5);
  }, 120_000);
});

// The warning is only given when the player harvests again (hasNextHarvest):
// whenever it says they will not, the game ends before their next turn.
function playOut(seed: string, ruleset: RulesetConfig, players: number): number {
  const engine = createRulesEngine(rulesContentFor(mapIdForNewGame(seed)));
  let s: GameState = engine.createGame({
    matchId: `m-${seed}`,
    seed,
    rulesetVersion: RULESET_VERSION,
    ruleset,
    players: Array.from({ length: players }, (_, i) => ({ id: `P${i + 1}`, displayName: `P${i + 1}` })),
  });
  const rng = createRng(seedRng(`ai-${seed}`));
  // Players told they will not harvest again, with the turn they were told in.
  const told = new Map<PlayerId, number>();
  for (let step = 0; step < 20000 && s.status !== "finished"; step++) {
    const r = runAiUntilHuman(engine, s, () => true, () => ({ level: "normal", rng }), 1);
    const command = r.commands[0];
    if (!command) break;
    if (s.status === "playing" && command.type === "end_turn" && !hasNextHarvest(engine.ctx, s, command.playerId)) told.set(command.playerId, s.turnNumber);
    s = r.state;
    const since = told.get(s.activePlayerId);
    if (s.status === "playing" && since !== undefined) expect(s.turnNumber, `${seed}: ${s.activePlayerId} began another turn`).toBe(since);
  }
  expect(s.status).toBe("finished");
  return told.size;
}

describe("hasNextHarvest against played games", () => {
  it("never says a player will not harvest again when they do", () => {
    // Games that end with the last round, with equal turns after the target,
    // and on a full board; the seeds avoid Ragnarök, which nothing foretells.
    const told = [
      playOut("next-harvest-1", { ...standardRuleset(3), lastRound: 6 }, 3),
      playOut("next-harvest-eq-6", { ...standardRuleset(3), equalTurns: true }, 3),
      playOut("next-harvest-full-6", mvpRuleset({ targetRenown: 25 }), 3),
    ];
    for (const players of told) expect(players).toBeGreaterThan(0);
  }, 120_000);
});
