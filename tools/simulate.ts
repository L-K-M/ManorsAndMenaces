// Balance simulator (spec §67–68): plays AI-vs-AI games and reports the
// telemetry the spec asks for, checked against the §68 targets.
//
// Usage: pnpm simulate [--games N] [--players 2|3|4] [--rules mvp|standard] [--level easy|normal|hard] [--max-rounds N]

import { runAiUntilHuman, type AiLevel } from "@manors-menaces/ai";
import { rulesContentFor } from "@manors-menaces/content";
import {
  RESOURCE_TYPES,
  RULESET_VERSION,
  createRng,
  createRulesEngine,
  getPlayerHoldings,
  getRenown,
  mvpRuleset,
  seedRng,
  standardRuleset,
  type GameEvent,
  type GameState,
} from "@manors-menaces/rules";

const args = process.argv.slice(2);
const arg = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback;
};
const GAMES = Number(arg("games", "40"));
const PLAYERS = Number(arg("players", "3"));
const RULES = arg("rules", "standard");
const LEVEL = arg("level", "normal") as AiLevel;
const MAX_ROUNDS = Number(arg("max-rounds", "60"));

const engine = createRulesEngine(rulesContentFor());
const ctx = engine.ctx;

interface GameStats {
  finished: boolean;
  rounds: number;
  winnerSeat: number | null;
  winnerRenown: number;
  renownSources: { holdings: number; quests: number };
  writs: number;
  wardens: number;
  trades: number;
  cards: number;
  quests: number;
  produced: Record<string, number>;
  /** Longest run of consecutive rounds a Region was held by the same player, as a share of the game. */
  maxHoldShare: number;
  harvestMid: number[];
  harvestLate: number[];
}

function playOne(i: number): GameStats {
  const ruleset = RULES === "mvp" ? mvpRuleset() : standardRuleset(PLAYERS);
  let s: GameState = engine.createGame({
    matchId: `sim-${i}`,
    seed: `sim-${RULES}-${PLAYERS}-${i}`,
    rulesetVersion: RULESET_VERSION,
    ruleset,
    players: Array.from({ length: PLAYERS }, (_, k) => ({ id: `P${k + 1}`, displayName: `P${k + 1}` })),
  });
  const rng = createRng(seedRng(`sim-ai-${i}`));
  const stats: GameStats = {
    finished: false,
    rounds: 0,
    winnerSeat: null,
    winnerRenown: 0,
    renownSources: { holdings: 0, quests: 0 },
    writs: 0,
    wardens: 0,
    trades: 0,
    cards: 0,
    quests: 0,
    produced: Object.fromEntries(RESOURCE_TYPES.map((r) => [r, 0])),
    maxHoldShare: 0,
    harvestMid: [],
    harvestLate: [],
  };
  const holder = new Map<string, { owner: string; since: number }>();
  const longest = new Map<string, number>();
  let lastRound = -1;
  for (let step = 0; step < 20000 && s.status !== "finished" && s.round <= MAX_ROUNDS; step++) {
    const r = runAiUntilHuman(engine, s, () => true, () => ({ level: LEVEL, rng }), 1);
    if (r.commands.length === 0) break;
    const before = s;
    s = r.state;
    const events: GameEvent[] = engine.applyCommand(before, r.commands[0]!).events;
    for (const e of events) {
      if (e.type === "royal_writ_issued") stats.writs++;
      if (e.type === "warden_hired") stats.wardens++;
      if (e.type === "market_traded") stats.trades++;
      if (e.type === "card_played") stats.cards++;
      if (e.type === "quest_claimed") stats.quests++;
      if (e.type === "resource_gained" && e.reason === "harvest") stats.produced[e.resource] = (stats.produced[e.resource] ?? 0) + e.amount;
      if (e.type === "harvest_completed") (s.round <= 6 ? stats.harvestMid : stats.harvestLate).push(e.total);
    }
    if (s.round !== lastRound && s.status === "playing") {
      lastRound = s.round;
      for (const region of ctx.board.topology.regions) {
        const owner = Object.values(s.banners).find((b) => b.regionId === region.id)?.ownerId ?? "";
        // Only contestable Regions count: another player has a Holding next to it.
        const contestable = Object.values(s.holdings).some((h) => h.ownerId !== owner && region.adjacentSiteIds.includes(h.siteId));
        if (!contestable) {
          holder.delete(region.id);
          continue;
        }
        const cur = holder.get(region.id);
        if (!cur || cur.owner !== owner) holder.set(region.id, { owner, since: s.round });
        else if (owner) longest.set(region.id, Math.max(longest.get(region.id) ?? 0, s.round - cur.since + 1));
      }
    }
  }
  stats.rounds = s.round;
  stats.finished = s.status === "finished";
  if (s.winnerId) {
    stats.winnerSeat = s.turnOrder.indexOf(s.winnerId);
    stats.winnerRenown = getRenown(ctx, s, s.winnerId);
    stats.renownSources.holdings = getPlayerHoldings(s, s.winnerId).reduce((n, h) => n + (h.type === "manor" ? 1 : 2), 0);
    stats.renownSources.quests = (s.players[s.winnerId]?.claimedQuestIds ?? []).reduce((n, q) => n + ctx.quest(q).renown, 0);
  }
  stats.maxHoldShare = Math.max(0, ...[...longest.values()]) / Math.max(1, s.round);
  return stats;
}

const results: GameStats[] = [];
const t0 = Date.now();
for (let i = 0; i < GAMES; i++) results.push(playOne(i));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (n: number) => `${Math.round((100 * n) / Math.max(1, results.length))}%`;
const finished = results.filter((r) => r.finished);
const seatWins = Array.from({ length: PLAYERS }, (_, k) => finished.filter((r) => r.winnerSeat === k).length);
const produced = Object.fromEntries(RESOURCE_TYPES.map((r) => [r, Math.round(avg(results.map((x) => x.produced[r] ?? 0)))]));

console.log(`\n${GAMES} games · ${PLAYERS} players · ${RULES} · AI ${LEVEL} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`finished:            ${finished.length}/${GAMES} (stalled at round ${MAX_ROUNDS}: ${GAMES - finished.length})`);
console.log(`rounds (turns/player): avg ${avg(finished.map((r) => r.rounds)).toFixed(1)}  min ${Math.min(...finished.map((r) => r.rounds))}  max ${Math.max(...finished.map((r) => r.rounds))}   target 12–16`);
console.log(`winner renown:       avg ${avg(finished.map((r) => r.winnerRenown)).toFixed(1)} (holdings ${avg(finished.map((r) => r.renownSources.holdings)).toFixed(1)}, quests ${avg(finished.map((r) => r.renownSources.quests)).toFixed(1)})`);
console.log(`seat win rates:      ${seatWins.map((w, k) => `seat${k + 1} ${pct(w)}`).join("  ")}   target: none > ${PLAYERS === 4 ? "30" : "45"}%`);
console.log(`harvest per turn:    early ${avg(results.flatMap((r) => r.harvestMid)).toFixed(2)}  later ${avg(results.flatMap((r) => r.harvestLate)).toFixed(2)}   target mid 3–5, late 4–7`);
console.log(`per game:            writs ${avg(results.map((r) => r.writs)).toFixed(1)}  wardens ${avg(results.map((r) => r.wardens)).toFixed(1)}  trades ${avg(results.map((r) => r.trades)).toFixed(1)}  cards ${avg(results.map((r) => r.cards)).toFixed(1)}  quests ${avg(results.map((r) => r.quests)).toFixed(1)}`);
console.log(`produced per game:   ${JSON.stringify(produced)}`);
console.log(`hereditary regions:  games where a contestable Region was held by one player > 60% of the match: ${pct(results.filter((r) => r.maxHoldShare > 0.6).length)}   target ≤ 25%`);
