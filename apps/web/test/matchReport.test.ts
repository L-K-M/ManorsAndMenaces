import { describe, expect, it } from "vitest";
import { RESOURCE_TYPES, clone, getRenown, standardRuleset } from "@manors-menaces/rules";
import { buildMatchReport, pickAwards, renownChart, type MatchStats, type PlayerResult } from "../src/lib/game/matchReport.js";
import { replayHistory } from "../src/lib/game/replay.js";
import { engine, playGame } from "./helpers.js";

const game = playGame(standardRuleset(3), "victory", 3);

describe("buildMatchReport", () => {
  const report = buildMatchReport(engine, game.final, { initial: game.initial, commands: game.commands });

  it("plays a finished game", () => {
    expect(game.final.status).toBe("finished");
    expect(report.historyComplete).toBe(true);
  });

  it("ranks the winner first and splits each player's Renown", () => {
    expect(report.standings[0]?.playerId).toBe(game.final.winnerId);
    for (const r of report.standings) {
      const b = r.renown;
      expect(b.total).toBe(getRenown(engine.ctx, game.final, r.playerId));
      expect(b.manors + b.strongholds + b.quests + b.other).toBe(b.total);
      expect(b.other).toBe(0);
    }
  });

  it("samples Renown per round, ending at the final Renown", () => {
    const tl = report.timeline;
    expect(tl).not.toBeNull();
    if (!tl) return;
    expect(tl.rounds[0]).toBe(0);
    expect(tl.rounds.at(-1)).toBe(game.final.round);
    expect(tl.rounds).toEqual([...tl.rounds].sort((a, b) => a - b));
    for (const id of game.final.turnOrder) {
      expect(tl.series[id]).toHaveLength(tl.rounds.length);
      expect(tl.series[id]?.at(-1)).toBe(getRenown(engine.ctx, game.final, id));
    }
  });

  it("derives per-player statistics that agree with the engine's counters", () => {
    for (const r of report.standings) {
      const byType = r.stats.harvestedByType;
      expect(byType).not.toBeNull();
      expect(RESOURCE_TYPES.reduce((sum, res) => sum + (byType?.[res] ?? 0), 0)).toBe(r.stats.harvested);
      expect(r.stats.wardensHired).not.toBeNull();
      expect(r.stats.lostToMenaces).not.toBeNull();
      expect(r.stats.manors).toBeGreaterThanOrEqual(2);
    }
  });

  // Review claim: Strongholds counted twice. A Stronghold is a paid upgrade
  // of a founded Manor, so the builder metric counts it as a second build.
  it("counts every Route, Manor and Stronghold built exactly once", () => {
    const builds = new Map<string, number>();
    replayHistory(engine, game.initial, game.commands, ({ events }) => {
      for (const e of events) {
        if (e.type === "route_built" || e.type === "holding_built" || e.type === "holding_upgraded") builds.set(e.playerId, (builds.get(e.playerId) ?? 0) + 1);
      }
    });
    expect(report.standings.some((r) => r.stats.strongholds > 0)).toBe(true);
    for (const r of report.standings) expect(r.stats.routes + r.stats.manors + r.stats.strongholds).toBe(builds.get(r.playerId));

    const award = report.awards.find((a) => a.id === "master_builder");
    expect(award?.value).toBe(Math.max(...builds.values()));
  });

  it("hands out two to four distinct awards, at most two per player, deterministically", () => {
    expect(report.awards.length).toBeGreaterThanOrEqual(2);
    expect(report.awards.length).toBeLessThanOrEqual(4);
    expect(new Set(report.awards.map((a) => a.id)).size).toBe(report.awards.length);
    for (const id of game.final.turnOrder) expect(report.awards.filter((a) => a.playerId === id).length).toBeLessThanOrEqual(2);
    expect(buildMatchReport(engine, game.final, { initial: game.initial, commands: game.commands }).awards).toEqual(report.awards);
  });

  it("narrates three to six sentences ending with the crowning", () => {
    expect(report.recap.length).toBeGreaterThanOrEqual(3);
    expect(report.recap.length).toBeLessThanOrEqual(6);
    const winner = game.final.players[game.final.winnerId ?? ""]?.displayName ?? "?";
    expect(report.recap.at(-1)).toContain(`${winner} was crowned`);
    for (const line of report.recap) expect(line).not.toMatch(/\{\w+\}|recap\./);
  });

  it("falls back to the final state when the history does not replay", () => {
    const broken = [...game.commands.slice(0, 30), ...game.commands.slice(31)];
    // A damaged initial state makes the engine throw rather than reject.
    const damaged = clone(game.initial);
    for (const p of Object.values(damaged.players)) delete (p as Partial<typeof p>).stats;
    for (const history of [null, { initial: game.initial, commands: broken }, { initial: game.final, commands: [] }, { initial: damaged, commands: game.commands }]) {
      const r = buildMatchReport(engine, game.final, history);
      expect(r.historyComplete).toBe(false);
      expect(r.timeline).toBeNull();
      expect(r.standings[0]?.playerId).toBe(game.final.winnerId);
      expect(r.standings[0]?.stats.harvestedByType).toBeNull();
      expect(r.standings[0]?.stats.harvested).toBe(report.standings[0]?.stats.harvested);
      expect(r.awards.every((a) => a.id !== "trolls_best_customer")).toBe(true);
      expect(r.recap.at(-1)).toMatch(/was crowned/);
      // Online games take this path, so the recap must still tell a story.
      expect(r.recap.length).toBeGreaterThanOrEqual(3);
      for (const line of r.recap) expect(line).not.toMatch(/\{\w+\}|recap\./);
    }
  });
});

describe("pickAwards", () => {
  const stats = (s: Partial<MatchStats>): MatchStats => ({
    harvested: 0,
    harvestedByType: null,
    bestHarvest: 0,
    routes: 0,
    manors: 0,
    strongholds: 0,
    writsIssued: 0,
    wardensHired: null,
    cardsPlayed: 0,
    menacesMoved: 0,
    marketTrades: 0,
    lostToMenaces: null,
    ...s,
  });
  const player = (playerId: string, renown: number, s: Partial<MatchStats>): PlayerResult => ({
    playerId,
    name: playerId,
    renown: { total: renown, manors: renown, strongholds: 0, quests: 0, other: 0 },
    stats: stats(s),
  });

  it("breaks ties towards less Renown, then earlier turn order", () => {
    const standings = [
      player("A", 10, { routes: 5 }),
      player("B", 6, { routes: 5 }),
      player("C", 6, { routes: 5, harvested: 1 }),
      player("D", 3, { routes: 1 }),
    ];
    const awards = pickAwards(standings, ["C", "B", "A", "D"]);
    expect(awards[0]).toEqual({ id: "master_builder", playerId: "C", value: 5 });
  });

  it("skips zero values, unknown values and awards everyone ties for", () => {
    const standings = [player("A", 10, { routes: 3, harvested: 4 }), player("B", 6, { routes: 3, harvested: 2 })];
    expect(pickAwards(standings, ["A", "B"]).map((a) => a.id)).toEqual(["bountiful_harvest"]);
  });

  it("gives a player at most two awards", () => {
    const standings = [
      player("A", 10, { routes: 9, harvested: 9, menacesMoved: 9, writsIssued: 9 }),
      player("B", 6, { routes: 1, harvested: 1, menacesMoved: 1, writsIssued: 1 }),
    ];
    const awards = pickAwards(standings, ["A", "B"]);
    expect(awards.filter((a) => a.playerId === "A")).toHaveLength(2);
    expect(awards.every((a) => a.playerId === "A")).toBe(true);
  });
});

describe("renownChart", () => {
  it("draws one line per player across the plot, with the target inside it", () => {
    const timeline = { rounds: [0, 1, 2, 3], series: { P1: [2, 3, 5, 10], P2: [2, 2, 4, 7] } };
    const g = renownChart(timeline, 10, ["P1", "P2"], 500, 200);

    expect(g.lines.map((l) => l.playerId)).toEqual(["P1", "P2"]);
    for (const l of g.lines) {
      expect(l.points).toHaveLength(4);
      expect(l.points[0]?.[0]).toBe(g.plot.left);
      expect(l.points.at(-1)?.[0]).toBe(g.plot.right);
    }
    expect(g.targetY).toBeGreaterThanOrEqual(g.plot.top);
    expect(g.targetY).toBeLessThan(g.plot.bottom);
    expect(g.yTicks[0]).toEqual({ y: g.plot.bottom, value: 0 });
    expect(g.xTicks.map((x) => x.label)).toEqual([0, 1, 2, 3]);
  });

  it("keeps the end-of-line labels of tied players apart", () => {
    const timeline = { rounds: [0, 1], series: { P1: [2, 4], P2: [2, 4], P3: [2, 4] } };
    const ys = renownChart(timeline, 10, ["P1", "P2", "P3"])
      .lines.map((l) => l.labelY)
      .sort((a, b) => a - b);
    expect(ys[1]! - ys[0]!).toBeGreaterThanOrEqual(15);
    expect(ys[2]! - ys[1]!).toBeGreaterThanOrEqual(15);
  });
});
