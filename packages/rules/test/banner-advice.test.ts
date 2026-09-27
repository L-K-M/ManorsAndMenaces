import { describe, expect, it } from "vitest";
import {
  clone,
  getBannerAdvice,
  getHarvestPreview,
  menaceOfType,
  validateBannerAssignment,
  type BannerAdvice,
  type BannerId,
  type GameState,
  type MenaceType,
  type PlayerId,
  type RegionId,
  type RulesetConfig,
} from "../src/index.js";
import { act, engine, mvpRuleset, setupGame } from "./helpers.js";

// The warning before a turn ends with idle Banners (§16.3): the best legal
// placement of the player's own Banners for the next Harvest.
//
// Test board (helpers.ts): p1 has Manors on s1 (Banner on R1 grain; also
// next to R5 essence and R6 timber) and s9 (Banner on R8 stone; also next
// to R4 iron and R7 grain). p2's Banners hold R5 and R3. Every Region takes
// one Banner except R2 (timber, capacity 2).

const ctx = engine.ctx;

function game(menaces: MenaceType[] = ["toll_troll"]) {
  const ruleset: RulesetConfig = { ...mvpRuleset(), activeMenaces: menaces };
  const g = setupGame(ruleset);
  const state = act(g.state, g.p1, { type: "end_main_phase" }).state;
  return { ...g, state, s1: g.bannerOf(g.p1, "s1"), s9: g.bannerOf(g.p1, "s9") };
}

/** Moves the Menace of `type` into `regionId`. */
function menaceTo(state: GameState, type: MenaceType, regionId: RegionId): GameState {
  const s = clone(state);
  const m = menaceOfType(s, type);
  if (!m) throw new Error(`${type} is not in play`);
  m.location = { kind: "region", regionId };
  return s;
}

/** Puts a Banner at `regionId` (or home) in the state itself, not in a draft. */
function place(state: GameState, bannerId: BannerId, regionId: RegionId | null): GameState {
  const s = clone(state);
  const banner = s.banners[bannerId];
  if (!banner) throw new Error(`no Banner ${bannerId}`);
  banner.regionId = regionId;
  return s;
}

let fillers = 0;
/** Fills `regionId` to capacity with Banners of `ownerId` that belong to no Holding. */
function fill(state: GameState, regionId: RegionId, ownerId: PlayerId): GameState {
  const s = clone(state);
  const room = ctx.board.region(regionId).capacity - Object.values(s.banners).filter((b) => b.regionId === regionId).length;
  for (let k = 0; k < room; k++) {
    const id = `filler_${++fillers}`;
    s.banners[id] = { id, ownerId, holdingId: "filler", regionId, settled: true };
  }
  return s;
}

/** Gives `ownerId` a Holding on `siteId` whose Banners stand at `regions`. */
function holding(state: GameState, ownerId: PlayerId, siteId: string, regions: (RegionId | null)[]): { state: GameState; banners: BannerId[] } {
  const s = clone(state);
  const holdingId = `holding_${siteId}`;
  s.holdings[holdingId] = { id: holdingId, siteId, ownerId, type: regions.length > 1 ? "stronghold" : "manor" };
  s.players[ownerId]?.holdingIds.push(holdingId);
  const banners = regions.map((regionId, i) => {
    const id = `banner_${siteId}_${i}`;
    s.banners[id] = { id, ownerId, holdingId, regionId, settled: false };
    return id;
  });
  return { state: s, banners };
}

const warns = (a: BannerAdvice) => a.best > a.current;

/** The advice is legal and yields exactly what it claims. */
function expectSound(state: GameState, playerId: PlayerId, advice: BannerAdvice) {
  expect(validateBannerAssignment(ctx, state, playerId, advice.assignment)).toEqual({ ok: true });
  expect(getHarvestPreview(ctx, state, playerId, advice.assignment).total).toBe(advice.best);
}

describe("getBannerAdvice", () => {
  it("reports the draft's total as current", () => {
    const { state, p1, s1 } = game();
    expect(getBannerAdvice(ctx, state, p1).current).toBe(2);
    expect(getBannerAdvice(ctx, state, p1, { [s1]: null }).current).toBe(1);
  });

  it("gives no advice when every Banner is already at its best", () => {
    const { state, p1 } = game();
    const advice = getBannerAdvice(ctx, state, p1);
    expect(advice).toMatchObject({ current: 2, best: 2, moves: [] });
    expectSound(state, p1, advice);
  });

  it("warns about a Banner at home while a Region next to it has room", () => {
    const { state, p1, s1 } = game();
    const advice = getBannerAdvice(ctx, state, p1, { [s1]: null });
    expect(advice).toMatchObject({ current: 1, best: 2 });
    expect(advice.moves).toHaveLength(1);
    expect(advice.moves[0]).toMatchObject({ bannerId: s1, from: null, reason: "unplaced" });
    expect(["R1", "R6"]).toContain(advice.moves[0]?.to);
    expectSound(state, p1, advice);
  });

  it("does not warn about a Banner at home when every Region next to it is full", () => {
    const g = game();
    const s = fill(fill(place(g.state, g.s1, null), "R1", g.p2), "R6", g.p2);
    const advice = getBannerAdvice(ctx, s, g.p1);
    expect(warns(advice)).toBe(false);
    expect(advice.moves).toEqual([]);
  });

  it("moves a Banner away from the Toll Troll when another Region produces", () => {
    const g = game();
    const s = menaceTo(g.state, "toll_troll", "R1");
    const advice = getBannerAdvice(ctx, s, g.p1);
    expect(advice).toMatchObject({ current: 1, best: 2 });
    expect(advice.moves).toEqual([{ bannerId: g.s1, from: "R1", to: "R6", reason: "blocked_by_troll" }]);
    expectSound(s, g.p1, advice);
  });

  it("leaves a Banner under the Toll Troll when it has nowhere better", () => {
    const g = game();
    const s = fill(menaceTo(g.state, "toll_troll", "R1"), "R6", g.p2);
    expect(warns(getBannerAdvice(ctx, s, g.p1))).toBe(false);
  });

  it("moves a Banner away from the Young Dragon when another Region produces", () => {
    const g = game(["toll_troll", "young_dragon"]);
    // The Dragon starts on R8, under p1's s9 Banner; R4 has the Troll.
    const advice = getBannerAdvice(ctx, g.state, g.p1);
    expect(advice).toMatchObject({ current: 1, best: 2 });
    expect(advice.moves).toEqual([{ bannerId: g.s9, from: "R8", to: "R7", reason: "taken_by_dragon" }]);
    expectSound(g.state, g.p1, advice);
  });

  it("leaves a Banner under the Young Dragon when it has nowhere better", () => {
    const g = game(["toll_troll", "young_dragon"]);
    const s = fill(g.state, "R7", g.p2);
    expect(warns(getBannerAdvice(ctx, s, g.p1))).toBe(false);
  });

  it("does not warn about the Bog Witch, which only converts", () => {
    const g = game(["toll_troll", "bog_witch"]);
    // The Witch starts on R7 (grain): Essence there is worth as much as Stone on R8.
    const advice = getBannerAdvice(ctx, g.state, g.p1, { [g.s9]: "R7" });
    expect(advice).toMatchObject({ current: 2, best: 2, moves: [] });
  });

  it("does not warn about a sick Banner, which harvests nothing anywhere", () => {
    const g = game();
    const s = clone(g.state);
    s.activeEffects.push({ kind: "sick", bannerId: g.s1, sourcePlayerId: g.p2 });
    expect(getBannerAdvice(ctx, s, g.p1)).toMatchObject({ current: 1, best: 1, moves: [] });
    expect(getBannerAdvice(ctx, s, g.p1, { [g.s1]: null })).toMatchObject({ current: 1, best: 1, moves: [] });
  });

  it("warns when a blessed Banner leaves Grain and Timber", () => {
    const g = game();
    const s = place(g.state, g.s9, "R7");
    s.activeEffects.push({ kind: "druids_blessing", bannerId: g.s9, sourcePlayerId: g.p1 });
    expect(getBannerAdvice(ctx, s, g.p1).moves).toEqual([]);
    const advice = getBannerAdvice(ctx, s, g.p1, { [g.s9]: "R8" });
    expect(advice).toMatchObject({ current: 2, best: 3 });
    expect(advice.moves).toEqual([{ bannerId: g.s9, from: "R8", to: "R7", reason: "blessing_lost" }]);
  });

  it("finds a move that only makes room for another Banner", () => {
    // p1's new Manor on s2 has its Banner on R2 under the Troll. Its only
    // other Region with room is R1, which p1's s1 Banner could leave for R6.
    const g = game();
    const { state: s, banners } = holding(menaceTo(g.state, "toll_troll", "R2"), g.p1, "s2", ["R2"]);
    const a = banners[0] as BannerId;
    const advice = getBannerAdvice(ctx, s, g.p1);
    expect(advice).toMatchObject({ current: 2, best: 3 });
    // The Banner that makes room comes first, so the moves can be made in order.
    expect(advice.moves).toEqual([
      { bannerId: g.s1, from: "R1", to: "R6", reason: "make_room" },
      { bannerId: a, from: "R2", to: "R1", reason: "blocked_by_troll" },
    ]);
    expectSound(s, g.p1, advice);
  });

  it("keeps the two Banners of a Stronghold apart", () => {
    // Only R2 (capacity 2) has room next to s2, and it takes one of them:
    // R1 holds p1's s1 Banner, which has nowhere else to go.
    const g = game();
    const { state: s0 } = holding(g.state, g.p1, "s2", [null, null]);
    const s = fill(s0, "R6", g.p2);
    const advice = getBannerAdvice(ctx, s, g.p1);
    expect(advice.best).toBe(advice.current + 1);
    expect(advice.moves).toHaveLength(1);
    expect(advice.moves[0]).toMatchObject({ to: "R2", reason: "unplaced" });
    expectSound(s, g.p1, advice);
  });

  it("respects Region capacity across Banners", () => {
    // Two Banners at home whose only Region with room is R6 (p2 holds R3
    // and R5).
    const g = game();
    const { state: s0, banners } = holding(place(g.state, g.s1, null), g.p1, "s4", [null]);
    const s = fill(s0, "R1", g.p2);
    const advice = getBannerAdvice(ctx, s, g.p1);
    expect(advice).toMatchObject({ current: 1, best: 2 });
    expect(advice.moves).toHaveLength(1);
    expect([g.s1, banners[0]]).toContain(advice.moves[0]?.bannerId);
    expect(advice.moves[0]?.to).toBe("R6");
    expectSound(s, g.p1, advice);
  });

  it("prefers the placement with the fewest moves", () => {
    // s2's Banner at home can take R2 alone, or R1 once s1's Banner moves to
    // R6: the same total, so only the single move is suggested.
    const g = game();
    const { state: s, banners } = holding(g.state, g.p1, "s2", [null]);
    const advice = getBannerAdvice(ctx, s, g.p1);
    expect(advice.best).toBe(advice.current + 1);
    expect(advice.moves).toEqual([{ bannerId: banners[0], from: null, to: "R2", reason: "unplaced" }]);
  });

  it("suggests a placement the engine accepts and that harvests the best total", () => {
    const g = game(["toll_troll", "young_dragon"]);
    const s = menaceTo(g.state, "toll_troll", "R1");
    const advice = getBannerAdvice(ctx, s, g.p1);
    expect(advice).toMatchObject({ current: 0, best: 2 });
    const changes = Object.fromEntries(advice.moves.map((m) => [m.bannerId, m.to]));
    const next = act(s, g.p1, { type: "assign_banners", assignments: changes }).state;
    expect(getHarvestPreview(ctx, next, g.p1).total).toBe(2);
    expect(getBannerAdvice(ctx, next, g.p1).moves).toEqual([]);
  });

  it("never warns wrongly when it runs out of budget", () => {
    const g = game(["toll_troll", "young_dragon"]);
    const { state: s0 } = holding(menaceTo(g.state, "toll_troll", "R2"), g.p1, "s2", ["R2"]);
    const cases: [GameState, Record<BannerId, RegionId | null>][] = [
      [s0, {}],
      [s0, { [g.s1]: null }],
      [g.state, {}],
      [fill(g.state, "R7", g.p2), {}],
    ];
    for (const [s, draft] of cases) {
      const full = getBannerAdvice(ctx, s, g.p1, draft);
      for (const budget of [0, 1, 2, 5, 20]) {
        const advice = getBannerAdvice(ctx, s, g.p1, draft, budget);
        expect(advice.current).toBe(full.current);
        expect(advice.best).toBeGreaterThanOrEqual(advice.current);
        expect(advice.best).toBeLessThanOrEqual(full.best);
        expectSound(s, g.p1, advice);
        if (!warns(advice)) expect(advice.moves).toEqual([]);
      }
    }
  });

  it("does not move rival Banners", () => {
    const g = game();
    const s = menaceTo(g.state, "toll_troll", "R1");
    const advice = getBannerAdvice(ctx, s, g.p1);
    expect(Object.keys(advice.assignment).sort()).toEqual([g.s1, g.s9].sort());
    expect(getBannerAdvice(ctx, s, g.p2).moves).toEqual([]);
  });
});
