import { describe, expect, it } from "vitest";
import { runAiUntilHuman } from "@manors-menaces/ai";
import {
  RESOURCE_TYPES,
  RULESET_VERSION,
  clone,
  createRng,
  getLegalActions,
  getRenown,
  seedRng,
  standardRuleset,
  type GameCommand,
  type GameState,
} from "@manors-menaces/rules";
import { buildMatchReport, legendParts, pickAwards, renownBar, renownBreakdown, renownChart, type MatchStats, type PlayerResult } from "../src/lib/game/matchReport.js";
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
      expect(b.manors + b.strongholds + b.quests + b.levy + b.other - b.lost).toBe(b.total);
      const p = game.final.players[r.playerId];
      expect(b.levy).toBe(p?.levyRenown ?? 0);
      expect(b.other).toBe(p?.bonusRenown ?? 0);
      expect(b.lost).toBe(p?.lostRenown ?? 0);
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

/**
 * A game that Ragnarök ends. The card is dealt to P1 from the start (an edit
 * of the initial state, so the history still replays from revision 0) and
 * played the first time the rules allow it. Without reaction cards no
 * Counterspell can stop it, whatever the deck deals.
 */
function ragnarokGame(): { initial: GameState; final: GameState; commands: GameCommand[] } {
  const initial = clone(
    engine.createGame({
      matchId: "m-ragnarok",
      seed: "ragnarok",
      rulesetVersion: RULESET_VERSION,
      ruleset: { ...standardRuleset(3), enableReactionCards: false },
      players: ["P1", "P2", "P3"].map((id, i) => ({ id, displayName: `Player ${i + 1}` })),
    }),
  );
  const card = initial.setAsideCardIds?.[0] as string;
  initial.setAsideCardIds = [];
  initial.players.P1?.hand.push(card);

  const rng = createRng(seedRng("ai-ragnarok"));
  let state = initial;
  const commands: GameCommand[] = [];
  while (state.status !== "finished" && commands.length < 2000) {
    if (state.activePlayerId === "P1" && !state.pending && getLegalActions(engine.ctx, state, "P1").playableCards.includes(card)) {
      const command = {
        type: "play_card",
        cardId: card,
        target: { effect: "ragnarok" },
        commandId: "ragnarok",
        matchId: state.matchId,
        playerId: "P1",
      } as const;
      state = engine.applyCommand(state, command).newState ?? state;
      commands.push(command);
      continue;
    }
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
  if (state.status !== "finished") throw new Error(`ragnarokGame() stalled: unfinished after ${commands.length} commands`);
  return { initial, final: state, commands };
}

/**
 * Three normal AIs to 30 Renown on a seed whose board fills up first: the
 * round that ends on the full board ends the game (§7). The goal is pinned
 * because the default of 15 is reached before the board fills, and with the
 * Crown's Levy (§27.3) so is 20.
 */
function fullBoardGame(): { initial: GameState; final: GameState; commands: GameCommand[] } {
  const initial = engine.createGame({
    matchId: "m-full",
    seed: "e2e-finished",
    rulesetVersion: RULESET_VERSION,
    ruleset: standardRuleset(3, { targetRenown: 30 }),
    players: ["P1", "P2", "P3"].map((id, i) => ({ id, displayName: `Player ${i + 1}` })),
  });
  const rng = createRng(seedRng("e2e-finished-ai"));
  const { state, commands } = runAiUntilHuman(engine, initial, () => true, () => ({ level: "normal", rng }), 20_000);
  if (state.status !== "finished") throw new Error(`fullBoardGame() stalled: unfinished after ${commands.length} commands`);
  return { initial, final: state, commands };
}

describe("buildMatchReport after a full board", () => {
  const game = fullBoardGame();

  it("crowns the most renowned player, short of the target", () => {
    const report = buildMatchReport(engine, game.final, { initial: game.initial, commands: game.commands });
    const winner = game.final.players[game.final.winnerId ?? ""]?.displayName ?? "?";

    expect(report.endCause).toBe("full_board");
    expect(getRenown(engine.ctx, game.final, game.final.winnerId ?? "")).toBeLessThan(game.final.ruleset.targetRenown);
    expect(report.recap.at(-1)).toMatch(new RegExp(`^In round \\d+, with the board full, ${winner} was crowned`));
  });
});

describe("buildMatchReport after Ragnarök", () => {
  const game = ragnarokGame();

  it("tells who ended the world and crowns the winner among the ashes", () => {
    const report = buildMatchReport(engine, game.final, { initial: game.initial, commands: game.commands });
    const winner = game.final.players[game.final.winnerId ?? ""]?.displayName ?? "?";

    expect(report.historyComplete).toBe(true);
    expect(report.endCause).toBe("ragnarok");
    expect(report.recap.length).toBeLessThanOrEqual(6);
    expect(report.recap.at(-2)).toBe("Player 1 played Ragnarök, and the world ended.");
    expect(report.recap.at(-1)).toContain(`${winner} was crowned among the ashes`);
  });

  it("reads the ending from the final state, so a late joiner sees it too", () => {
    const late = buildMatchReport(engine, game.final, null);
    expect(late.endCause).toBe("ragnarok");
    expect(late.recap.at(-1)).toMatch(/was crowned among the ashes/);
  });

  it("takes the ending from the session for a state that does not record it", () => {
    const older = { ...game.final };
    delete older.endCause;
    const known = buildMatchReport(engine, older, null, "ragnarok");
    expect(known.endCause).toBe("ragnarok");
    expect(known.recap.at(-1)).toMatch(/was crowned among the ashes/);
    expect(known.recap.join(" ")).not.toMatch(/played Ragnarök/);

    const unknown = buildMatchReport(engine, older, null);
    expect(unknown.endCause).toBeNull();
    expect(unknown.recap.at(-1)).not.toMatch(/ashes/);
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
    renown: { total: renown, manors: renown, strongholds: 0, quests: 0, levy: 0, other: 0, lost: 0 },
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

describe("renownBar", () => {
  it("takes Renown lost for good off the last sources, so the bar ends at the total", () => {
    expect(renownBar({ total: 7, manors: 2, strongholds: 4, quests: 3, levy: 0, other: 1, lost: 3 })).toEqual({ manors: 2, strongholds: 4, quests: 1, levy: 0, other: 0 });
    expect(renownBar({ total: 0, manors: 1, strongholds: 0, quests: 0, levy: 0, other: 0, lost: 1 })).toEqual({ manors: 0, strongholds: 0, quests: 0, levy: 0, other: 0 });
  });

  it("shows the Crown's Levy as its own part, after the Quests (§27.3)", () => {
    expect(renownBar({ total: 9, manors: 2, strongholds: 4, quests: 1, levy: 3, other: 0, lost: 1 })).toEqual({ manors: 2, strongholds: 4, quests: 1, levy: 2, other: 0 });
    const s = clone(game.final);
    const id = s.turnOrder.find((p) => p !== s.winnerId) ?? "";
    s.players[id]!.levyRenown = 2;
    const b = renownBreakdown(engine, s, id);
    expect(b.levy).toBe(2);
    expect(b.total).toBe(getRenown(engine.ctx, s, id));
  });

  it("keys the Crown's Levy in the legend once a bar shows it", () => {
    const result = (levy: number, lost = 0): PlayerResult => ({
      playerId: "A",
      name: "A",
      renown: { total: 3 + levy - lost, manors: 3, strongholds: 0, quests: 0, levy, other: 0, lost },
      stats: { harvested: 0, harvestedByType: null, bestHarvest: 0, routes: 0, manors: 3, strongholds: 0, writsIssued: 0, wardensHired: null, cardsPlayed: 0, menacesMoved: 0, marketTrades: 0, lostToMenaces: null },
    });
    expect(legendParts([result(0)])).toEqual(["manors", "strongholds", "quests"]);
    expect(legendParts([result(0), result(2)])).toEqual(["manors", "strongholds", "quests", "levy"]);
    // Renown lost for good took it off the bar.
    expect(legendParts([result(1, 1)])).toEqual(["manors", "strongholds", "quests"]);
  });

  it("stops at a disgraced player's total, short of the goal", () => {
    const s = clone(game.final);
    const id = s.turnOrder.find((p) => p !== s.winnerId) ?? "";
    s.players[id]!.lostRenown = 2;
    const b = renownBreakdown(engine, s, id);
    expect(b.lost).toBe(2);
    const bar = renownBar(b);
    expect(bar.manors + bar.strongholds + bar.quests + bar.levy + bar.other).toBe(b.total);
    expect(b.total).toBeLessThan(s.ruleset.targetRenown);
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
