import { describe, expect, it } from "vitest";
import { chooseAction, runAiUntilHuman, type AiLevel } from "@manors-menaces/ai";
import { rulesContentFor, validateMap, GREENVALE_MAP } from "@manors-menaces/content";
import {
  createRng,
  createRulesEngine,
  getRenown,
  hashState,
  mvpRuleset,
  seedRng,
  standardRuleset,
  RULESET_VERSION,
  type GameState,
  type RulesetConfig,
} from "@manors-menaces/rules";

const engine = createRulesEngine(rulesContentFor());
const ctx = engine.ctx;

/** Invariants from spec §66.4. */
function checkInvariants(s: GameState): void {
  for (const p of Object.values(s.players)) for (const v of Object.values(p.resources)) expect(v).toBeGreaterThanOrEqual(0);
  const perRegion = new Map<string, number>();
  const perHolding = new Map<string, Set<string>>();
  for (const b of Object.values(s.banners)) {
    const h = s.holdings[b.holdingId];
    expect(h, "banner has a holding").toBeTruthy();
    if (!b.regionId || !h) continue;
    perRegion.set(b.regionId, (perRegion.get(b.regionId) ?? 0) + 1);
    expect(ctx.board.site(h.siteId).adjacentRegionIds).toContain(b.regionId);
    const set = perHolding.get(h.id) ?? new Set();
    expect(set.has(b.regionId), "stronghold banners share a region").toBe(false);
    set.add(b.regionId);
    perHolding.set(h.id, set);
  }
  for (const [r, n] of perRegion) expect(n).toBeLessThanOrEqual(ctx.board.region(r).capacity);
  const sites = Object.values(s.holdings).map((h) => h.siteId);
  expect(new Set(sites).size).toBe(sites.length);
  for (const h of Object.values(s.holdings)) {
    const expected = h.type === "manor" ? 1 : 2;
    expect(Object.values(s.banners).filter((b) => b.holdingId === h.id)).toHaveLength(expected);
  }
  if (s.status !== "finished") expect(s.turnOrder).toContain(s.activePlayerId);
}

function playGame(players: number, ruleset: RulesetConfig, seed: string, level: AiLevel = "normal") {
  const initial = engine.createGame({
    matchId: `m-${seed}`,
    seed,
    rulesetVersion: RULESET_VERSION,
    ruleset,
    players: Array.from({ length: players }, (_, i) => ({ id: `P${i + 1}`, displayName: `Player ${i + 1}` })),
  });
  const rng = createRng(seedRng(`ai-${seed}`));
  let s = initial;
  const commands = [];
  for (let step = 0; step < 20000 && s.status !== "finished" && s.round <= 80; step++) {
    const { state, commands: cs } = runAiUntilHuman(engine, s, () => true, () => ({ level, rng }), 1);
    if (cs.length === 0) break;
    commands.push(...cs);
    s = state;
    checkInvariants(s);
  }
  return { initial, final: s, commands };
}

describe("Greenvale map", () => {
  it("passes validation", () => {
    const v = validateMap(GREENVALE_MAP);
    expect(v.errors).toEqual([]);
    expect(v.stats.maxIndependentSites).toBeGreaterThanOrEqual(16);
  });
});

describe("AI playouts", () => {
  for (const [players, rs, name] of [
    [3, mvpRuleset(), "mvp-3p"],
    [2, standardRuleset(2), "std-2p"],
    [3, standardRuleset(3), "std-3p"],
    [4, standardRuleset(4), "std-4p"],
  ] as const) {
    it(`${name}: finishes with a winner and keeps invariants`, () => {
      const { initial, final, commands } = playGame(players, rs, name);
      expect(final.status).toBe("finished");
      const winner = final.winnerId as string;
      expect(getRenown(ctx, final, winner)).toBeGreaterThanOrEqual(rs.targetRenown);
      // Determinism (§66.2): same seed + commands = same state.
      expect(hashState(engine.replay(initial, commands))).toBe(hashState(final));
      // eslint-disable-next-line no-console
      console.log(name, "rounds", final.round, "commands", commands.length, "winner", winner, getRenown(ctx, final, winner));
    }, 120_000);
  }
});

describe("AI decisions", () => {
  it("returns null when it is not the player's turn", () => {
    const s = engine.createGame({ matchId: "x", seed: "x", rulesetVersion: RULESET_VERSION, ruleset: mvpRuleset(), players: [{ id: "A", displayName: "A" }, { id: "B", displayName: "B" }] });
    const other = s.turnOrder[1] as string;
    expect(chooseAction(engine, s, other, { level: "normal", rng: createRng(seedRng("z")) })).toBeNull();
  });
});
