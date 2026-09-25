// End-of-game results (victory screen): standings with a Renown breakdown,
// per-player statistics, Renown over time, awards and a short narrated recap.
// Pure: everything is derived from the final state and, when available, a
// replay of the command history. Nothing here touches the DOM.

import {
  BALANCE,
  RESOURCE_TYPES,
  getPlayerHoldings,
  getRenown,
  type GameCommand,
  type GameEvent,
  type GameState,
  type MenaceType,
  type PlayerId,
  type ResourceType,
  type RulesEngine,
} from "@manors-menaces/rules";
import { t } from "../i18n.js";
import { nameOf } from "./log.js";
import { replayHistory } from "./replay.js";

export interface RenownBreakdown {
  total: number;
  manors: number;
  strongholds: number;
  quests: number;
  /** Anything else (bonus Renown). */
  other: number;
}

/** Statistics per player. `null` means the history needed for it is unavailable. */
export interface MatchStats {
  harvested: number;
  harvestedByType: Record<ResourceType, number> | null;
  bestHarvest: number;
  routes: number;
  /** Every Manor founded, including those later raised to Strongholds. */
  manors: number;
  strongholds: number;
  writsIssued: number;
  wardensHired: number | null;
  cardsPlayed: number;
  menacesMoved: number;
  marketTrades: number;
  lostToMenaces: number | null;
}

export interface PlayerResult {
  playerId: PlayerId;
  name: string;
  renown: RenownBreakdown;
  stats: MatchStats;
}

export type AwardId = "master_builder" | "bountiful_harvest" | "menace_wrangler" | "trolls_best_customer" | "royal_pest" | "merchant_prince" | "spellbinder";

export interface Award {
  id: AwardId;
  playerId: PlayerId;
  value: number;
}

/** Renown per player at the end of each round; index 0 is the end of setup. */
export interface RenownTimeline {
  rounds: number[];
  series: Record<PlayerId, number[]>;
}

export interface MatchReport {
  winnerId: PlayerId | null;
  round: number;
  targetRenown: number;
  /** Winner first, then by Renown, then by turn order. */
  standings: PlayerResult[];
  /** Null when the history does not replay to the final state (online, debug). */
  timeline: RenownTimeline | null;
  awards: Award[];
  /** Narrated sentences, the crowning always last. */
  recap: string[];
  historyComplete: boolean;
}

export interface MatchHistory {
  initial: GameState;
  commands: readonly GameCommand[];
}

const MAX_AWARDS = 4;
const MAX_AWARDS_PER_PLAYER = 2;
const MAX_RECAP_BEFORE_CROWNING = 5;

// ------------------------------------------------------------------ report

export function buildMatchReport(engine: RulesEngine, final: GameState, history: MatchHistory | null): MatchReport {
  const replay = history ? replayMatch(engine, final, history) : null;
  const standings = rankPlayers(final, (id) => ({
    playerId: id,
    name: nameOf(final, id),
    renown: renownBreakdown(engine, final, id),
    stats: statsFor(final, id, replay?.events ?? null),
  }));

  return {
    winnerId: final.winnerId ?? null,
    round: final.round,
    targetRenown: final.ruleset.targetRenown,
    standings,
    timeline: replay?.timeline ?? null,
    awards: pickAwards(standings, final.turnOrder),
    recap: buildRecap(final, standings, replay?.events ?? null),
    historyComplete: !!replay,
  };
}

export function renownBreakdown(engine: RulesEngine, state: GameState, playerId: PlayerId): RenownBreakdown {
  const holdings = getPlayerHoldings(state, playerId);
  const manors = holdings.filter((h) => h.type === "manor").length * BALANCE.renown.manor;
  const strongholds = holdings.filter((h) => h.type === "stronghold").length * BALANCE.renown.stronghold;
  const quests = (state.players[playerId]?.claimedQuestIds ?? []).reduce((sum, q) => sum + engine.ctx.quest(q).renown, 0);
  const total = getRenown(engine.ctx, state, playerId);
  return { total, manors, strongholds, quests, other: total - manors - strongholds - quests };
}

function rankPlayers(state: GameState, result: (id: PlayerId) => PlayerResult): PlayerResult[] {
  const results = state.turnOrder.map(result);
  const order = (id: PlayerId) => state.turnOrder.indexOf(id);
  return results.sort(
    (a, b) =>
      Number(b.playerId === state.winnerId) - Number(a.playerId === state.winnerId) || b.renown.total - a.renown.total || order(a.playerId) - order(b.playerId),
  );
}

// ------------------------------------------------------------------ replay

/** An event with the round it happened in. */
interface RoundEvent {
  event: GameEvent;
  round: number;
}

interface MatchReplay {
  events: RoundEvent[];
  timeline: RenownTimeline;
}

/** Replays the history; null unless it reproduces the final state exactly. */
function replayMatch(engine: RulesEngine, final: GameState, history: MatchHistory): MatchReplay | null {
  // A history must start at game creation to explain the whole game.
  if (history.initial.revision !== 0) return null;

  const events: RoundEvent[] = [];
  const rounds: number[] = [];
  const series: Record<PlayerId, number[]> = Object.fromEntries(final.turnOrder.map((id) => [id, []]));
  const sample = (state: GameState, round: number) => {
    rounds.push(round);
    for (const id of final.turnOrder) series[id]?.push(getRenown(engine.ctx, state, id));
  };

  let round = 0;
  const { complete } = replayHistory(
    engine,
    history.initial,
    history.commands,
    ({ events: stepEvents, before }) => {
      for (const event of stepEvents) {
        // The state before a new round's first turn is the end of the last one.
        if (event.type === "turn_started" && event.round > round) {
          sample(before, event.round - 1);
          round = event.round;
        }
        events.push({ event, round });
      }
    },
    final,
  );
  if (!complete) return null;

  if (rounds.at(-1) !== final.round) sample(final, final.round);
  return { events, timeline: { rounds, series } };
}

// ------------------------------------------------------------------ stats

function statsFor(state: GameState, playerId: PlayerId, events: RoundEvent[] | null): MatchStats {
  const p = state.players[playerId];
  const holdings = getPlayerHoldings(state, playerId);
  const base = {
    harvested: p?.stats.resourcesHarvestedTotal ?? 0,
    bestHarvest: p?.stats.maxSingleHarvest ?? 0,
    routes: p?.routeIds.length ?? 0,
    manors: holdings.length,
    strongholds: holdings.filter((h) => h.type === "stronghold").length,
    writsIssued: p?.stats.writsIssued ?? 0,
    cardsPlayed: (p?.stats.heroesPlayed ?? 0) + (p?.stats.spellsPlayed ?? 0),
    menacesMoved: p?.stats.menacesMoved ?? 0,
    marketTrades: p?.stats.marketTrades ?? 0,
  };
  if (!events) return { ...base, harvestedByType: null, wardensHired: null, lostToMenaces: null };

  const harvestedByType = Object.fromEntries(RESOURCE_TYPES.map((r) => [r, 0])) as Record<ResourceType, number>;
  let wardensHired = 0;
  let lostToMenaces = 0;
  for (const { event: e } of events) {
    if (!("playerId" in e) || e.playerId !== playerId) continue;

    if (e.type === "harvest_completed") {
      for (const r of RESOURCE_TYPES) harvestedByType[r] += e.byType[r] ?? 0;
    } else if (e.type === "warden_hired") {
      wardensHired += 1;
    } else if (e.type === "banner_harvested") {
      // A blocked or stolen Banner harvest loses what it would have produced.
      if (e.notes.includes("blocked_by_troll") || e.notes.includes("taken_by_dragon")) lostToMenaces += 1;
    } else if (e.type === "resource_spent" && (e.reason === "toll" || e.reason === "goblin_tinkers")) {
      lostToMenaces += e.amount;
    }
  }
  return { ...base, harvestedByType, wardensHired, lostToMenaces };
}

// ------------------------------------------------------------------ awards

/**
 * Awards in priority order: the statistic each rewards and the least the
 * leader needs (a single Writ or Warden is not worth a trophy).
 */
const AWARD_METRICS: [AwardId, (s: MatchStats) => number | null, number][] = [
  ["master_builder", (s) => s.routes + s.manors + s.strongholds, 1],
  ["bountiful_harvest", (s) => s.harvested, 1],
  ["menace_wrangler", (s) => s.menacesMoved, 2],
  ["trolls_best_customer", (s) => s.lostToMenaces, 2],
  ["royal_pest", (s) => s.writsIssued, 2],
  ["merchant_prince", (s) => s.marketTrades, 2],
  ["spellbinder", (s) => s.cardsPlayed, 2],
];

/**
 * Up to four awards, in priority order. An award needs a leader with at least
 * its minimum and is skipped when every player ties. Ties go to the player with less Renown
 * (a consolation), then to the earlier player in turn order. A player gets at
 * most two awards, so the glory is shared.
 */
export function pickAwards(standings: readonly PlayerResult[], turnOrder: readonly PlayerId[]): Award[] {
  const awards: Award[] = [];
  const count = new Map<PlayerId, number>();
  for (const [id, metric, minimum] of AWARD_METRICS) {
    if (awards.length >= MAX_AWARDS) break;

    const values = standings.map((r) => ({ r, value: metric(r.stats) }));
    if (values.some((v) => v.value === null)) continue;

    const best = Math.max(...values.map((v) => v.value ?? 0));
    const leaders = values.filter((v) => v.value === best).map((v) => v.r);
    if (best < minimum || leaders.length === standings.length) continue;

    const eligible = leaders.filter((r) => (count.get(r.playerId) ?? 0) < MAX_AWARDS_PER_PLAYER);
    const winner = eligible.sort((a, b) => a.renown.total - b.renown.total || turnOrder.indexOf(a.playerId) - turnOrder.indexOf(b.playerId))[0];
    if (!winner) continue;

    awards.push({ id, playerId: winner.playerId, value: best });
    count.set(winner.playerId, (count.get(winner.playerId) ?? 0) + 1);
  }
  return awards;
}

// ------------------------------------------------------------------ recap

/** "Chronicle of the Realm": a few sentences from the key events, crowning last. */
function buildRecap(state: GameState, standings: readonly PlayerResult[], events: RoundEvent[] | null): string[] {
  const name = (id: PlayerId | null | undefined) => nameOf(state, id);
  const lines: string[] = [];

  if (events) {
    const firstStronghold = events.find((x) => x.event.type === "holding_upgraded");
    if (firstStronghold?.event.type === "holding_upgraded") {
      lines.push(t("recap.first_stronghold", { name: name(firstStronghold.event.playerId), round: firstStronghold.round }));
    }

    const firstQuest = events.find((x) => x.event.type === "quest_claimed");
    if (firstQuest?.event.type === "quest_claimed") {
      const e = firstQuest.event;
      lines.push(t("recap.first_quest", { name: name(e.playerId), quest: t(`quest.${e.questId}.name`), round: firstQuest.round }));
    }

    let bestHarvest: { playerId: PlayerId; total: number; round: number } | null = null;
    for (const { event: e, round } of events) {
      if (e.type === "harvest_completed" && e.total > (bestHarvest?.total ?? 0)) bestHarvest = { playerId: e.playerId, total: e.total, round };
    }
    if (bestHarvest && bestHarvest.total > 1) {
      lines.push(t("recap.best_harvest", { name: name(bestHarvest.playerId), amount: bestHarvest.total, round: bestHarvest.round }));
    }

    const moves = new Map<MenaceType, number>();
    for (const { event: e } of events) {
      const type = e.type === "menace_moved" ? state.menaces[e.menaceId]?.type : undefined;
      if (type) moves.set(type, (moves.get(type) ?? 0) + 1);
    }
    const [restless, moved] = [...moves].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? [null, 0];
    if (restless && moved >= 2) lines.push(t("recap.restless_menace", { menace: t(`menace.${restless}.name`), count: moved }));
  } else {
    // Without the history (online games), narrate from the final counters.
    const harvester = maxBy(standings, (r) => r.stats.bestHarvest);
    if (harvester && harvester.stats.bestHarvest > 1) {
      lines.push(t("recap.best_harvest_any", { name: harvester.name, amount: harvester.stats.bestHarvest }));
    }

    const builder = soleLeader(standings, (r) => r.stats.routes + r.stats.manors + r.stats.strongholds);
    if (builder) lines.push(t("recap.builder", { name: builder.name, count: builder.stats.routes + builder.stats.manors + builder.stats.strongholds }));

    const herder = soleLeader(standings, (r) => r.stats.menacesMoved);
    if (herder && herder.stats.menacesMoved >= 2) lines.push(t("recap.menace_herder", { name: herder.name, count: herder.stats.menacesMoved }));

    const quester = soleLeader(standings, (r) => state.players[r.playerId]?.claimedQuestIds.length ?? 0);
    const quests = quester ? (state.players[quester.playerId]?.claimedQuestIds.length ?? 0) : 0;
    if (quester && quests > 0) lines.push(t(quests === 1 ? "recap.quest_leader_one" : "recap.quest_leader", { name: quester.name, count: quests }));
  }

  const worstLoss = maxBy(standings, (r) => r.stats.lostToMenaces ?? 0);
  if (worstLoss && (worstLoss.stats.lostToMenaces ?? 0) >= 2) {
    lines.push(t("recap.losses", { name: worstLoss.name, count: worstLoss.stats.lostToMenaces ?? 0 }));
  }

  const writs = standings.reduce((sum, r) => sum + r.stats.writsIssued, 0);
  const writer = maxBy(standings, (r) => r.stats.writsIssued);
  const soleWriter = writer && standings.filter((r) => r.stats.writsIssued === writer.stats.writsIssued).length === 1;
  if (writer && writs === 1) lines.push(t("recap.writ_one", { name: writer.name }));
  else if (writer && soleWriter) lines.push(t("recap.writs", { name: writer.name, count: writs }));
  else if (writs > 1) lines.push(t("recap.writs_shared", { count: writs }));

  const recap = lines.slice(0, MAX_RECAP_BEFORE_CROWNING);
  const [winner, runnerUp] = standings;
  if (winner && state.winnerId) {
    const margin = winner.renown.total - (runnerUp?.renown.total ?? 0);
    const params = { name: winner.name, renown: winner.renown.total, round: state.round, runner: runnerUp?.name ?? "", margin };
    recap.push(t(margin > 0 ? "recap.crowned" : "recap.crowned_tie", params));
  }
  return recap;
}

/** The first item with the highest positive score, in the given order. */
function maxBy<T>(items: readonly T[], score: (item: T) => number): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const item of items) {
    const s = score(item);
    if (s > bestScore) {
      best = item;
      bestScore = s;
    }
  }
  return best;
}

/** Like maxBy, but null unless exactly one item has the highest score. */
function soleLeader<T>(items: readonly T[], score: (item: T) => number): T | null {
  const best = maxBy(items, score);
  if (!best) return null;
  const top = score(best);
  return items.filter((item) => score(item) === top).length === 1 ? best : null;
}

// ------------------------------------------------------------------ chart

export interface ChartLine {
  playerId: PlayerId;
  points: [number, number][];
  /** Where the direct label at the end of the line goes, clear of the others. */
  labelY: number;
}

export interface ChartGeometry {
  width: number;
  height: number;
  plot: { left: number; right: number; top: number; bottom: number };
  lines: ChartLine[];
  xTicks: { x: number; label: number }[];
  yTicks: { y: number; value: number }[];
  targetY: number;
}

const CHART_PAD = { left: 30, right: 104, top: 12, bottom: 30 };
const MAX_X_TICKS = 8;
/** Vertical nudge between series so equal Renown lines stay visible. */
const SERIES_OFFSET = 2.5;
/** Minimum vertical distance between end-of-line labels. */
const LABEL_GAP = 15;

/** Lays out the Renown-over-time chart in SVG user units. */
export function renownChart(timeline: RenownTimeline, targetRenown: number, playerOrder: readonly PlayerId[], width = 460, height = 250): ChartGeometry {
  const plot = { left: CHART_PAD.left, right: width - CHART_PAD.right, top: CHART_PAD.top, bottom: height - CHART_PAD.bottom };
  const lastRound = Math.max(1, timeline.rounds.at(-1) ?? 1);
  const values = Object.values(timeline.series).flat();
  // Headroom above the target line and the top score for their labels.
  const yMax = Math.ceil((Math.max(targetRenown, ...values) + 1) / 2) * 2;
  const x = (round: number) => plot.left + (round / lastRound) * (plot.right - plot.left);
  const y = (value: number) => plot.bottom - (value / yMax) * (plot.bottom - plot.top);

  const n = playerOrder.length;
  const lines = playerOrder.map((playerId, i) => {
    const offset = (i - (n - 1) / 2) * SERIES_OFFSET;
    const series = timeline.series[playerId] ?? [];
    const points = series.map((v, k): [number, number] => [x(timeline.rounds[k] ?? 0), y(v) + offset]);
    return { playerId, points, labelY: points.at(-1)?.[1] ?? plot.bottom };
  });
  spreadLabels(lines, plot.top, height - 4);

  const xStep = Math.max(1, Math.ceil(lastRound / MAX_X_TICKS));
  const xTicks = [];
  for (let r = 0; r <= lastRound; r += xStep) xTicks.push({ x: x(r), label: r });

  const yStep = yMax <= 12 ? 2 : yMax <= 24 ? 4 : 5;
  const yTicks = [];
  for (let v = 0; v <= yMax; v += yStep) yTicks.push({ y: y(v), value: v });

  return { width, height, plot, lines, xTicks, yTicks, targetY: y(targetRenown) };
}

/** Pushes end labels apart (top to bottom) so no two overlap, within bounds. */
function spreadLabels(lines: ChartLine[], top: number, bottom: number): void {
  const sorted = [...lines].sort((a, b) => a.labelY - b.labelY);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1] as ChartLine;
    const cur = sorted[i] as ChartLine;
    cur.labelY = Math.max(cur.labelY, prev.labelY + LABEL_GAP);
  }
  // If the stack ran past the bottom, shift it back up.
  const overflow = (sorted.at(-1)?.labelY ?? 0) - bottom;
  if (overflow > 0) for (const l of sorted) l.labelY = Math.max(top, l.labelY - overflow);
}
