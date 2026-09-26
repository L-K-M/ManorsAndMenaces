import { describe, expect, it } from "vitest";
import { chooseAction, runAiUntilHuman, type AiLevel } from "@manors-menaces/ai";
import { rulesContentFor, validateMap, GREENVALE_MAP } from "@manors-menaces/content";
import {
  createRng,
  createRulesEngine,
  getRenown,
  hashState,
  mvpRuleset,
  rankPlayers,
  seedRng,
  standardRuleset,
  RULESET_VERSION,
  type DebugCommand,
  type GameCommand,
  type GameEvent,
  type GameState,
  type RulesetConfig,
} from "@manors-menaces/rules";

const engine = createRulesEngine(rulesContentFor());
const ctx = engine.ctx;

/** Every card of a match, wherever it is: the piles, hands, Charters and a Spell awaiting reactions. */
function cardCount(s: GameState): number {
  const held = Object.values(s.players).reduce((n, p) => n + p.hand.length + (p.charters ?? []).length, 0);
  return s.cardDeck.length + s.discardPile.length + (s.setAsideCardIds ?? []).length + held + (s.pending?.kind === "reaction" ? 1 : 0);
}

/** Invariants from spec §66.4, plus the paired records the second-wave cards remove from. */
function checkInvariants(s: GameState, cards: number): void {
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
  // Ownership is recorded twice; Fire Bolt and Dragon's Landing must clear both.
  for (const [routeId, owner] of Object.entries(s.routeOwners)) expect(s.players[owner]?.routeIds, routeId).toContain(routeId);
  for (const p of Object.values(s.players)) {
    for (const r of p.routeIds) expect(s.routeOwners[r], r).toBe(p.id);
    for (const h of p.holdingIds) expect(s.holdings[h]?.ownerId, h).toBe(p.id);
  }
  for (const h of Object.values(s.holdings)) expect(s.players[h.ownerId]?.holdingIds, h.id).toContain(h.id);
  for (const e of s.activeEffects) {
    if ("bannerId" in e) expect(s.banners[e.bannerId], `${e.kind} on a missing Banner`).toBeDefined();
    // Rebuilding puts the embers out, so a smouldering Route is unowned.
    if (e.kind === "smouldering") expect(s.routeOwners[e.routeId], `smouldering ${e.routeId}`).toBeUndefined();
  }
  // Changeling, Charters and Ragnarök move cards around; none may appear or vanish.
  expect(cardCount(s)).toBe(cards);
}

/**
 * A free card for the player whose Main phase begins: the top of the draw
 * pile. The AI rarely buys cards, so this is how a playout gets to play them.
 */
function dealTopCard(s: GameState): DebugCommand | null {
  const top = s.cardDeck[0];
  if (!top || s.status !== "playing" || s.phase !== "main" || s.pending) return null;
  const p = s.activePlayerId;
  return { type: "debug_draw_card", commandId: `deal-${s.turnNumber}`, matchId: s.matchId, playerId: p, targetPlayerId: p, cardDefId: top.split("#")[0] as string };
}

type Step = { command: GameCommand } | { deal: DebugCommand };

/** Replays the steps, returning the final state and the type of every event on the way. */
function replaySteps(initial: GameState, steps: Step[]): { state: GameState; eventTypes: Set<GameEvent["type"]> } {
  let s = initial;
  const eventTypes = new Set<GameEvent["type"]>();
  for (const step of steps) {
    const r = "deal" in step ? engine.applyDebugCommand(s, step.deal) : engine.applyCommand(s, step.command);
    if (!r.newState) throw new Error(`replay failed: ${r.error?.code}`);
    for (const e of r.events) eventTypes.add(e.type);
    s = r.newState;
  }
  return { state: s, eventTypes };
}

function playGame(players: number, ruleset: RulesetConfig, seed: string, opts: { level?: AiLevel; freeCardEachTurn?: boolean } = {}) {
  const level = opts.level ?? "normal";
  const initial = engine.createGame({
    matchId: `m-${seed}`,
    seed,
    rulesetVersion: RULESET_VERSION,
    ruleset,
    players: Array.from({ length: players }, (_, i) => ({ id: `P${i + 1}`, displayName: `Player ${i + 1}` })),
  });
  const rng = createRng(seedRng(`ai-${seed}`));
  const cards = cardCount(initial);
  let s = initial;
  let beforeLast = initial;
  const commands: GameCommand[] = [];
  const steps: Step[] = [];
  let dealtTurn = -1;
  for (let step = 0; step < 20000 && s.status !== "finished" && s.round <= 80; step++) {
    const deal = opts.freeCardEachTurn && s.turnNumber !== dealtTurn ? dealTopCard(s) : null;
    if (deal) {
      dealtTurn = s.turnNumber;
      s = engine.applyDebugCommand(s, deal).newState as GameState;
      steps.push({ deal });
    }
    const { state, commands: cs } = runAiUntilHuman(engine, s, () => true, () => ({ level, rng }), 1);
    if (cs.length === 0) break;
    commands.push(...cs);
    steps.push(...cs.map((command) => ({ command })));
    beforeLast = s;
    s = state;
    checkInvariants(s, cards);
  }
  // The final command's events say how the game was won.
  const last = commands.at(-1);
  const won = last ? engine.applyCommand(beforeLast, last).events.find((e) => e.type === "game_won") : undefined;
  return { initial, final: s, commands, steps, won };
}

/** The game ended properly: at the target Renown, or early by Ragnarök with the §7 leader winning. */
function expectWinner(final: GameState, won: GameEvent | undefined, target: number): void {
  expect(final.status).toBe("finished");
  const winner = final.winnerId as string;
  expect(won).toMatchObject({ type: "game_won", playerId: winner });
  if (won?.type === "game_won" && won.cause === "ragnarok") expect(rankPlayers(ctx, final, final.turnOrder)[0]).toBe(winner);
  else expect(getRenown(ctx, final, winner)).toBeGreaterThanOrEqual(target);
}

const describeWin = (final: GameState, won: GameEvent | undefined): string =>
  `winner ${final.winnerId} ${getRenown(ctx, final, final.winnerId as string)} by ${won?.type === "game_won" ? (won.cause ?? "target") : "?"}`;

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
      const { initial, final, commands, won } = playGame(players, rs, name);
      expectWinner(final, won, rs.targetRenown);
      // Determinism (§66.2): same seed + commands = same state.
      expect(hashState(engine.replay(initial, commands))).toBe(hashState(final));
      console.log(name, "rounds", final.round, "commands", commands.length, describeWin(final, won));
    }, 120_000);
  }

  // Every player draws a free card each turn, so the cards (the second wave's
  // Route burning, Holding destruction, hand swaps and Charters) actually get
  // played and the invariants above see their results.
  const CARD_HEAVY_PLAYERS = [2, 3, 4] as const;
  /** Seed suffixes tried in turn; the first ones are the invariant games below. */
  const CARD_HEAVY_SUFFIXES = ["", "-b", "-c", "-d", "-e", "-f", "-g"];
  const cardGameEvents = new Map<string, Set<GameEvent["type"]>>();
  /** Plays and checks one card-heavy game once per run; returns its event types. */
  function cardHeavyGame(players: number, suffix = ""): Set<GameEvent["type"]> {
    const seed = `cards-${players}p${suffix}`;
    const played = cardGameEvents.get(seed);
    if (played) return played;
    const rs = standardRuleset(players);
    const { initial, final, steps, won } = playGame(players, rs, seed, { freeCardEachTurn: true });
    expectWinner(final, won, rs.targetRenown);
    const replayed = replaySteps(initial, steps);
    expect(hashState(replayed.state)).toBe(hashState(final));
    console.log(seed, "rounds", final.round, "steps", steps.length, describeWin(final, won));
    cardGameEvents.set(seed, replayed.eventTypes);
    return replayed.eventTypes;
  }

  for (const players of CARD_HEAVY_PLAYERS) {
    it(`cards-${players}p: card-heavy games keep invariants`, () => {
      cardHeavyGame(players);
    }, 120_000);
  }

  // new-cards.test.ts covers each card on its own; this checks they also
  // resolve in whole games. Which seeds get there shifts with every AI or
  // deck change, so games are played across seeds until each event has
  // happened, within a fixed budget.
  it("card-heavy games exercise the second-wave cards", () => {
    const wanted = ["route_burned", "holding_destroyed", "hands_swapped", "insurance_claimed"] as const;
    const seen = new Set<GameEvent["type"]>();
    for (const suffix of CARD_HEAVY_SUFFIXES) {
      for (const players of CARD_HEAVY_PLAYERS) for (const type of cardHeavyGame(players, suffix)) seen.add(type);
      if (wanted.every((type) => seen.has(type))) break;
    }
    for (const type of wanted) expect(seen, type).toContain(type);
  }, 600_000);
});

describe("AI decisions", () => {
  it("returns null when it is not the player's turn", () => {
    const s = engine.createGame({ matchId: "x", seed: "x", rulesetVersion: RULESET_VERSION, ruleset: mvpRuleset(), players: [{ id: "A", displayName: "A" }, { id: "B", displayName: "B" }] });
    const other = s.turnOrder[1] as string;
    expect(chooseAction(engine, s, other, { level: "normal", rng: createRng(seedRng("z")) })).toBeNull();
  });
});
