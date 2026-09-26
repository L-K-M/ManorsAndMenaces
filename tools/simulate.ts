// Balance simulator (spec §67–68): plays AI-vs-AI games and reports the
// telemetry the spec asks for, checked against the §68 targets.
//
// Usage: pnpm simulate [--games N] [--players 2|3|4] [--rules mvp|standard] [--level easy|normal|hard] [--max-rounds N] [--equal-turns]
//                       [--exclude-cards a,b] [--override JSON] [--map ID|drawn|drawn:ISLAND]
//
// --map picks the board: a map id plays every game on that map (default: The
// Greenvale as published); "drawn" draws an island and a layout for each game
// as new games do; "drawn:ISLAND" draws a layout of that island for each game.

import { runAiUntilHuman, type AiLevel } from "@manors-menaces/ai";
import { GREENVALE_MAP, mapIdForNewGame, rulesContentFor } from "@manors-menaces/content";
import {
  RESOURCE_TYPES,
  RULESET_VERSION,
  cardDefIdOf,
  createRng,
  createRulesEngine,
  getPlayerHoldings,
  getRenown,
  isCardUsableInRuleset,
  mvpRuleset,
  seedRng,
  standardRuleset,
  type GameEvent,
  type GameState,
  type RulesEngine,
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
const EQUAL_TURNS = args.includes("--equal-turns");
// Extra ruleset overrides as JSON, e.g. --override '{"enableQuests":false}'.
const OVERRIDE = JSON.parse(arg("override", "{}")) as Record<string, unknown>;

// --exclude-cards a,b removes card definitions from the deck (balance experiments).
const EXCLUDE = new Set(arg("exclude-cards", "").split(",").filter(Boolean));
const MAP = arg("map", GREENVALE_MAP.id);
const engines = new Map<string, RulesEngine>();
function engineFor(mapId: string): RulesEngine {
  const known = engines.get(mapId);
  if (known) return known;
  const content = rulesContentFor(mapId);
  const engine = createRulesEngine({ ...content, cards: content.cards.filter((c) => !EXCLUDE.has(c.id)) });
  engines.set(mapId, engine);
  return engine;
}
function mapIdFor(seed: string): string {
  if (MAP === "drawn") return mapIdForNewGame(seed);
  if (MAP.startsWith("drawn:")) return mapIdForNewGame(seed, MAP.slice("drawn:".length));
  return MAP;
}
// Every map deals the same cards.
const ctx = engineFor(GREENVALE_MAP.id).ctx;
const RULESET = { ...(RULES === "mvp" ? mvpRuleset() : standardRuleset(PLAYERS)), equalTurns: EQUAL_TURNS, ...OVERRIDE };
// The card definitions this ruleset deals (Treasure Hunter and others need their Menace).
const DECK = RULESET.enableCards ? ctx.content.cards.filter((c) => isCardUsableInRuleset(c, RULESET)) : [];

interface GameStats {
  finished: boolean;
  /** Seed and map, to replay a game that stalled. */
  seed: string;
  mapId: string;
  rounds: number;
  winnerSeat: number | null;
  winnerRenown: number;
  renownSources: { holdings: number; quests: number; bonus: number };
  writs: number;
  wardens: number;
  trades: number;
  cards: number;
  bought: number;
  quests: number;
  produced: Record<string, number>;
  /** Cards played (countered ones included) and cards countered, by card definition id. */
  plays: Record<string, number>;
  countered: Record<string, number>;
  /** Round Ragnarök was foretold (shuffled into the draw pile), if it was (§19.13). */
  omenRound: number | null;
  /** Round the game ended by Ragnarök, if it did. */
  ragnarokRound: number | null;
  targetRenown: number;
  // Second-wave card outcomes (§19.12–19.21).
  holdingsDestroyed: number;
  holdingsReduced: number;
  routesBurned: number;
  handSwaps: number;
  insuranceClaims: number;
  bannersSickened: number;
  sickHarvests: number;
  /** Longest run of consecutive rounds a Region was held by the same player, as a share of the game. */
  maxHoldShare: number;
  harvestMid: number[];
  harvestLate: number[];
}

function playOne(i: number): GameStats {
  const seed = `sim-${RULES}-${PLAYERS}-${i}`;
  const mapId = mapIdFor(seed);
  const engine = engineFor(mapId);
  const ctx = engine.ctx;
  let s: GameState = engine.createGame({
    matchId: `sim-${i}`,
    seed,
    rulesetVersion: RULESET_VERSION,
    ruleset: RULESET,
    players: Array.from({ length: PLAYERS }, (_, k) => ({ id: `P${k + 1}`, displayName: `P${k + 1}` })),
  });
  const rng = createRng(seedRng(`sim-ai-${i}`));
  const stats: GameStats = {
    finished: false,
    seed,
    mapId,
    rounds: 0,
    winnerSeat: null,
    winnerRenown: 0,
    renownSources: { holdings: 0, quests: 0, bonus: 0 },
    writs: 0,
    wardens: 0,
    trades: 0,
    cards: 0,
    bought: 0,
    quests: 0,
    produced: Object.fromEntries(RESOURCE_TYPES.map((r) => [r, 0])),
    plays: {},
    countered: {},
    omenRound: null,
    ragnarokRound: null,
    targetRenown: s.ruleset.targetRenown,
    holdingsDestroyed: 0,
    holdingsReduced: 0,
    routesBurned: 0,
    handSwaps: 0,
    insuranceClaims: 0,
    bannersSickened: 0,
    sickHarvests: 0,
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
      if (e.type === "card_played") {
        stats.cards++;
        bump(stats.plays, cardDefIdOf(e.cardId));
      }
      if (e.type === "card_cancelled") bump(stats.countered, cardDefIdOf(e.cardId));
      if (e.type === "card_bought") stats.bought++;
      if (e.type === "quest_claimed") stats.quests++;
      if (e.type === "resource_gained" && e.reason === "harvest") stats.produced[e.resource] = (stats.produced[e.resource] ?? 0) + e.amount;
      if (e.type === "harvest_completed") (s.round <= 6 ? stats.harvestMid : stats.harvestLate).push(e.total);
      // `before.round`: the omen at the last seat's End Turn belongs to the round that ended.
      if (e.type === "card_foretold") stats.omenRound ??= before.round;
      if (e.type === "game_won" && e.cause === "ragnarok") stats.ragnarokRound = before.round;
      if (e.type === "holding_destroyed") stats.holdingsDestroyed++;
      if (e.type === "holding_reduced") stats.holdingsReduced++;
      if (e.type === "route_burned") stats.routesBurned++;
      if (e.type === "hands_swapped") stats.handSwaps++;
      if (e.type === "insurance_claimed") stats.insuranceClaims++;
      if (e.type === "effect_started" && e.effect === "plague") stats.bannersSickened += e.bannerIds.length;
      if (e.type === "banner_harvested" && e.notes.includes("sick")) stats.sickHarvests++;
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
    stats.renownSources.bonus = s.players[s.winnerId]?.bonusRenown ?? 0;
  }
  stats.maxHoldShare = Math.max(0, ...[...longest.values()]) / Math.max(1, s.round);
  return stats;
}

function bump(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

const results: GameStats[] = [];
const t0 = Date.now();
for (let i = 0; i < GAMES; i++) results.push(playOne(i));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (n: number) => `${Math.round((100 * n) / Math.max(1, results.length))}%`;
const finished = results.filter((r) => r.finished);
const seatWins = Array.from({ length: PLAYERS }, (_, k) => finished.filter((r) => r.winnerSeat === k).length);
const produced = Object.fromEntries(RESOURCE_TYPES.map((r) => [r, Math.round(avg(results.map((x) => x.produced[r] ?? 0)))]));

console.log(`\n${GAMES} games · ${PLAYERS} players · ${RULES} · AI ${LEVEL} · map ${MAP} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`finished:            ${finished.length}/${GAMES} (stalled at round ${MAX_ROUNDS}: ${GAMES - finished.length})`);
for (const r of results.filter((x) => !x.finished)) console.log(`  stalled:           seed ${r.seed} on ${r.mapId}`);
console.log(`rounds (turns/player): avg ${avg(finished.map((r) => r.rounds)).toFixed(1)}  min ${Math.min(...finished.map((r) => r.rounds))}  max ${Math.max(...finished.map((r) => r.rounds))}   target 12–16`);
console.log(`winner renown:       avg ${avg(finished.map((r) => r.winnerRenown)).toFixed(1)} (holdings ${avg(finished.map((r) => r.renownSources.holdings)).toFixed(1)}, quests ${avg(finished.map((r) => r.renownSources.quests)).toFixed(1)}, bonus ${avg(finished.map((r) => r.renownSources.bonus)).toFixed(1)})`);
console.log(`seat win rates:      ${seatWins.map((w, k) => `seat${k + 1} ${pct(w)}`).join("  ")}   target: none > ${PLAYERS === 4 ? "30" : "45"}%`);
console.log(`harvest per turn:    early ${avg(results.flatMap((r) => r.harvestMid)).toFixed(2)}  later ${avg(results.flatMap((r) => r.harvestLate)).toFixed(2)}   target mid 3–5, late 4–7`);
console.log(`per game:            writs ${avg(results.map((r) => r.writs)).toFixed(1)}  wardens ${avg(results.map((r) => r.wardens)).toFixed(1)}  trades ${avg(results.map((r) => r.trades)).toFixed(1)}  cards bought ${avg(results.map((r) => r.bought)).toFixed(1)} played ${avg(results.map((r) => r.cards)).toFixed(1)}  quests ${avg(results.map((r) => r.quests)).toFixed(1)}`);
console.log(`produced per game:   ${JSON.stringify(produced)}`);
console.log(`hereditary regions:  games where a contestable Region was held by one player > 60% of the match: ${pct(results.filter((r) => r.maxHoldShare > 0.6).length)}   target ≤ 25%`);
if (DECK.length > 0) printCardTelemetry();

/** Per-card plays and the second-wave outcomes; printed only when the ruleset deals cards. */
function printCardTelemetry(): void {
  const total = (pick: (r: GameStats) => Record<string, number>, id: string) => results.reduce((n, r) => n + (pick(r)[id] ?? 0), 0);
  const entries = DECK.map((c) => {
    const countered = total((r) => r.countered, c.id);
    return `${c.id} ${total((r) => r.plays, c.id)}${countered ? ` (${countered} countered)` : ""}`;
  });
  // Wrapped to keep the table readable in a terminal.
  const lines: string[] = [];
  for (const entry of entries) {
    const last = lines.length - 1;
    if (last >= 0 && (lines[last] as string).length + entry.length < 100) lines[last] += `  ${entry}`;
    else lines.push(entry);
  }
  lines.forEach((line, k) => console.log((k === 0 ? "card plays, total:" : "").padEnd(21) + line));
  const per = (pick: (r: GameStats) => number) => avg(results.map(pick)).toFixed(2);
  console.log(
    `new cards per game:  holdings destroyed ${per((r) => r.holdingsDestroyed)} reduced ${per((r) => r.holdingsReduced)}  routes burned ${per((r) => r.routesBurned)}  hand swaps ${per((r) => r.handSwaps)}  insurance claims ${per((r) => r.insuranceClaims)}  banners sickened ${per((r) => r.bannersSickened)} (harvests lost ${per((r) => r.sickHarvests)})`,
  );
  if (!DECK.some((c) => c.setAside)) return;
  const omens = results.filter((r) => r.omenRound !== null);
  const endings = results.filter((r) => r.ragnarokRound !== null);
  const short = endings.filter((r) => r.winnerRenown < r.targetRenown).length;
  const avgRound = (rounds: (number | null)[]) => `avg round ${avg(rounds.map(Number)).toFixed(1)}`;
  console.log(
    `ragnarok:            foretold in ${omens.length}/${GAMES} games${omens.length ? ` (${avgRound(omens.map((r) => r.omenRound))})` : ""}` +
      `  ended ${endings.length}${endings.length ? ` (${avgRound(endings.map((r) => r.ragnarokRound))}, winner below target in ${short})` : ""}`,
  );
}
