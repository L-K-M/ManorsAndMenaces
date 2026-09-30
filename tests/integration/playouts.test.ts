import { describe, expect, it } from "vitest";
import { chooseAction, runAiUntilHuman, type AiLevel } from "@manors-menaces/ai";
import { rulesContentFor, validateMap, GREENVALE_MAP } from "@manors-menaces/content";
import {
  createRng,
  createRulesEngine,
  crownsVoiceRules,
  getLegalActions,
  getRenown,
  getRenownSources,
  hashState,
  mvpRuleset,
  rankPlayers,
  redactEvent,
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
    // Rebuilding puts the embers out, so a smouldering Route is unowned and a razed Site empty.
    if (e.kind === "smouldering") expect(s.routeOwners[e.routeId], `smouldering ${e.routeId}`).toBeUndefined();
    if (e.kind === "razed") expect(sites, `razed ${e.siteId}`).not.toContain(e.siteId);
  }
  // Nobody ever builds on a ruin, and no card takes Renown below 0.
  for (const ruin of s.ruinedSiteIds ?? []) expect(sites, `ruined ${ruin}`).not.toContain(ruin);
  // Spacing (§10.3): Holdings side by side belong to one player, and one of
  // them is The Dowager's Manor (§19.28).
  for (const h of Object.values(s.holdings)) {
    for (const n of ctx.board.neighbours(h.siteId)) {
      const next = Object.values(s.holdings).find((x) => x.siteId === n);
      if (!next) continue;
      expect(next.ownerId, `${h.siteId} beside ${n}`).toBe(h.ownerId);
      expect(!!(h.dowerHouse || next.dowerHouse), `${h.siteId} beside ${n}`).toBe(true);
    }
  }
  for (const p of Object.values(s.players)) {
    expect(getRenown(ctx, s, p.id), `${p.id}'s Renown`).toBeGreaterThanOrEqual(0);
    // The Renown dialog and the results show the sources; they add up to the Renown that wins.
    const src = getRenownSources(ctx, s, p.id);
    const quests = src.quests.reduce((n, q) => n + q.renown, 0);
    const charges = src.charges.reduce((n, c) => n + c.renown, 0);
    expect(src.manors.renown + src.strongholds.renown + quests + src.levy + charges + src.favour + src.bonus - src.lost, `${p.id}'s Renown sources`).toBe(
      getRenown(ctx, s, p.id),
    );
    expect(p.lostRenown ?? 0).toBeGreaterThanOrEqual(0);
    expect(p.favour ?? 0).toBeGreaterThanOrEqual(0);
  }
  // The Crown's Voice only moves Favour: what players hold and the purse add up to the purse it began with (§129.10).
  const voice = s.ruleset.crownsVoice;
  if (voice) {
    const held = Object.values(s.players).reduce((n, p) => n + (p.favour ?? 0), 0);
    expect(held + (s.crownsVoice?.purse ?? 0)).toBe(voice.purse);
    expect(s.crownsVoice?.purse).toBeGreaterThanOrEqual(0);
  }
  // Changeling, Charters and Ragnarök move cards around; none may appear or vanish.
  expect(cardCount(s)).toBe(cards);
  // The Crown's Levy (§27.3): each player answers once a round, and the Crown
  // calls each resource once a cycle, the next Levy last.
  const levy = s.crownLevy;
  if (levy) {
    expect(new Set(levy.answeredBy).size).toBe(levy.answeredBy.length);
    for (const id of levy.answeredBy) expect(s.turnOrder).toContain(id);
    expect(new Set(levy.called).size).toBe(levy.called.length);
    expect(levy.called.at(-1)).toBe(levy.next);
  }
  const perAnswer = s.ruleset.crownLevy?.renown ?? 1;
  for (const p of Object.values(s.players)) expect((p.levyRenown ?? 0) % perAnswer, `${p.id}'s Levy Renown`).toBe(0);
  // A Sealed Charge (§27A) is in one place at most: the deck, a draw being
  // chosen from, or one player's sealed or revealed Charges.
  const charges = [...(s.chargeDeck ?? []), ...(s.pending?.kind === "charge" ? s.pending.chargeIds : [])];
  for (const p of Object.values(s.players)) charges.push(...(p.sealedCharge ? [p.sealedCharge.id] : []), ...(p.revealedChargeIds ?? []));
  expect(new Set(charges).size, "a Charge in two places").toBe(charges.length);
}

const sorted = (cards: readonly string[]): string[] => [...cards].sort();

/**
 * Every player's hand changed only in ways that player was told about: their
 * own plays, discards and purchases, cards dealt to them, or a Changeling
 * naming them (whose event carries the new hand's size). A player once found
 * two different cards in hand; this keeps any silent change from hiding.
 */
function checkHandsExplained(before: GameState, after: GameState, events: readonly GameEvent[]): void {
  for (const id of after.turnOrder) {
    let expected = [...(before.players[id]?.hand ?? [])];
    const hand = after.players[id]?.hand ?? [];
    for (const raw of events) {
      const e = redactEvent(raw, id);
      if (e.type === "cards_dealt" && e.playerId === id) expected.push(...(e.cardIds ?? []));
      if (e.type === "card_bought" && e.playerId === id && e.cardId) expected.push(e.cardId);
      if ((e.type === "card_played" || e.type === "card_discarded") && e.playerId === id) {
        const at = expected.indexOf(e.cardId);
        expect(at, `${id}'s ${e.type} of ${e.cardId} from their hand`).toBeGreaterThanOrEqual(0);
        expected.splice(at, 1);
      }
      if (e.type === "hands_swapped" && (e.playerId === id || e.opponentId === id)) {
        expect(hand, `${id}'s swapped hand`).toHaveLength(e.playerId === id ? e.handSize : e.opponentHandSize);
        expected = [...hand];
      }
    }
    expect(sorted(hand), `${id}'s hand after ${events.map((e) => e.type).join(", ")}`).toEqual(sorted(expected));
  }
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

/** An event's type, with the card that caused it for the Holdings several cards burn or reduce. */
type EventKind = GameEvent["type"] | `${"holding_destroyed" | "holding_reduced"}:${string}`;
const kindOf = (e: GameEvent): EventKind => (e.type === "holding_destroyed" || e.type === "holding_reduced" ? `${e.type}:${e.cause}` : e.type);

/** Replays the steps, returning the final state and the kind of every event on the way. */
function replaySteps(initial: GameState, steps: Step[]): { state: GameState; eventTypes: Set<EventKind> } {
  let s = initial;
  const eventTypes = new Set<EventKind>();
  for (const step of steps) {
    const r = "deal" in step ? engine.applyDebugCommand(s, step.deal) : engine.applyCommand(s, step.command);
    if (!r.newState) throw new Error(`replay failed: ${r.error?.code}`);
    for (const e of r.events) eventTypes.add(kindOf(e));
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
    const events: GameEvent[] = [];
    for (let t = s, i = 0; i < cs.length; i++) {
      const r = engine.applyCommand(t, cs[i]!);
      events.push(...r.events);
      t = r.newState as GameState;
    }
    checkHandsExplained(s, state, events);
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
  // These games check invariants and determinism over whole games, not their
  // length, so they keep the goals their seeds were chosen with: 15 Renown,
  // or 13 with 4 players, pinned so that a new default leaves them alone. At
  // higher goals some AI games on The Greenvale fill every Site before anyone
  // wins (spec §129.6).
  const playoutRuleset = (players: number): RulesetConfig => ({ ...standardRuleset(players), targetRenown: players >= 4 ? 13 : 15 });
  for (const [players, rs, name] of [
    [3, mvpRuleset(3), "mvp-3p"],
    [2, playoutRuleset(2), "std-2p"],
    [3, playoutRuleset(3), "std-3p"],
    [4, playoutRuleset(4), "std-4p"],
  ] as const) {
    it(`${name}: finishes with a winner and keeps invariants`, () => {
      const { initial, final, commands, won } = playGame(players, rs, name);
      expectWinner(final, won, rs.targetRenown);
      // Determinism (§66.2): same seed + commands = same state.
      expect(hashState(engine.replay(initial, commands))).toBe(hashState(final));
      console.log(name, "rounds", final.round, "commands", commands.length, describeWin(final, won));
    }, 120_000);
  }

  // The draft opens at a seat drawn with the match RNG (§129.13), but round 1
  // still opens with the first player: the draft opener's compensation is the
  // reverse Banner order, not acting first.
  it("draft-3p: round 1 opens with the first turn-order seat, not the draft opener", () => {
    const initial = engine.createGame({
      matchId: "m-draft",
      seed: "draft-0",
      rulesetVersion: RULESET_VERSION,
      ruleset: standardRuleset(3),
      players: ["A", "B", "C"].map((id) => ({ id, displayName: id })),
    });
    expect(initial.setup?.placementOrder[0]).not.toBe(initial.turnOrder[0]);
    let s = initial;
    for (let i = 0; i < 40 && s.status === "setup"; i++) {
      const legal = getLegalActions(ctx, s, s.activePlayerId);
      const r = engine.applyCommand(s, {
        ...(legal.mode === "setup_manor"
          ? { type: "place_initial_manor", siteId: legal.initialManorSites[0] }
          : legal.mode === "setup_route"
            ? { type: "place_initial_route", routeId: legal.initialRoutes[0] }
            : { type: "assign_initial_banners", assignments: {} }),
        commandId: `c${i}`,
        matchId: s.matchId,
        playerId: s.activePlayerId,
      } as GameCommand);
      if (!r.newState) throw new Error(`setup rejected: ${r.error?.code}`);
      s = r.newState;
    }
    expect(s.status).toBe("playing");
    expect(s.round).toBe(1);
    expect(s.activePlayerId).toBe(s.turnOrder[0]);
    expect(s.activePlayerId).not.toBe(initial.setup?.placementOrder[0]);
  });

  // At a goal of 25 the Quest deck runs out and the Crown's Levy (§27.3) is
  // proclaimed long before anyone wins. On this seed players answer some,
  // before the board fills.
  it("levy-3p: plays through the Crown's Levy and keeps invariants", () => {
    const rs = standardRuleset(3, { targetRenown: 25 });
    const { initial, final, commands } = playGame(3, rs, "levy-3p-e");
    expect(final.status).toBe("finished");
    expect(final.crownLevy?.called.length).toBeGreaterThan(0);
    expect(Object.values(final.players).some((p) => (p.levyRenown ?? 0) > 0)).toBe(true);
    expect(hashState(engine.replay(initial, commands))).toBe(hashState(final));
    console.log("levy-3p", "rounds", final.round, "levy", final.turnOrder.map((id) => final.players[id]?.levyRenown ?? 0).join("/"), final.endCause ?? "target");
  }, 120_000);

  // The AI ignores the virtues (§129.10) but must still play such games out.
  // The Voice speaks from round 1 here: by default it waits for the Quest
  // deck, which a game to 15 Renown seldom empties.
  it("voice-3p: games with the Crown's Voice finish, move Favour and replay the same", () => {
    const rs: RulesetConfig = { ...playoutRuleset(3), crownsVoice: { ...crownsVoiceRules(), from: "first_round" } };
    const { initial, final, steps, won } = playGame(3, rs, "voice-3p");
    expectWinner(final, won, rs.targetRenown);
    const replayed = replaySteps(initial, steps);
    expect(hashState(replayed.state)).toBe(hashState(final));
    expect(replayed.eventTypes).toContain("favour_won");
    expect(replayed.eventTypes).toContain("crowns_voice_turned");
    console.log("voice-3p", "rounds", final.round, "favour", final.turnOrder.map((id) => final.players[id]?.favour ?? 0), describeWin(final, won));
  }, 120_000);

  // Every player draws a free card each turn, so the cards (the second wave's
  // Route burning, Holding destruction, hand swaps and Charters) actually get
  // played and the invariants above see their results.
  const CARD_HEAVY_PLAYERS = [2, 3, 4] as const;
  /** Seed suffixes tried in turn; the first ones are the invariant games below. */
  const CARD_HEAVY_SUFFIXES = ["", "-b", "-c", "-d", "-e", "-f", "-g"];
  const cardGameEvents = new Map<string, Set<EventKind>>();
  /** Plays and checks one card-heavy game once per run; returns its event kinds. */
  function cardHeavyGame(players: number, suffix = ""): Set<EventKind> {
    const seed = `cards-${players}p${suffix}`;
    const played = cardGameEvents.get(seed);
    if (played) return played;
    const rs = playoutRuleset(players);
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
  // Siege Engines and Raiders are not required: they need a rival's Holding at
  // the end of one of the caster's Routes, which AI networks seldom build
  // (0.05 to 0.15 raids per game in `pnpm simulate`; whether any of the games
  // below has one shifts with every AI change). They resolve through the same
  // Stronghold reduction and Manor burning as Dragon's Landing and Siege
  // Fireball, and new-cards.test.ts covers each.
  it("card-heavy games exercise the second- and third-wave cards", () => {
    const wanted: EventKind[] = [
      "route_burned",
      "holding_destroyed:dragons_landing",
      "hands_swapped",
      "insurance_claimed",
      "renown_lost",
      "renown_stolen",
      "holding_destroyed:siege_fireball",
      "site_ruined",
      "resources_lost",
    ];
    const seen = new Set<EventKind>();
    for (const suffix of CARD_HEAVY_SUFFIXES) {
      for (const players of CARD_HEAVY_PLAYERS) for (const type of cardHeavyGame(players, suffix)) seen.add(type);
      if (wanted.every((type) => seen.has(type))) break;
    }
    for (const type of wanted) expect(seen, type).toContain(type);
  }, 600_000);
});

describe("AI playouts with Sealed Charges (§27A)", () => {
  // Goal 25 draws a second Charge after a reveal; 4 players deal from the
  // largest deck. A full board may end these games below the goal (§7).
  for (const [players, targetRenown, name] of [
    [3, 25, "charges-3p-25"],
    [4, 13, "charges-4p"],
  ] as const) {
    it(`${name}: finishes, reveals Charges, keeps invariants and replays`, () => {
      const rs: RulesetConfig = { ...standardRuleset(players, { targetRenown }), sealedCharges: true };
      const { initial, final, commands, won } = playGame(players, rs, name);
      expect(final.status).toBe("finished");
      if (won?.type === "game_won" && won.cause) expect(rankPlayers(ctx, final, final.turnOrder)[0]).toBe(final.winnerId);
      else expectWinner(final, won, targetRenown);
      const revealed = Object.values(final.players).reduce((n, p) => n + (p.revealedChargeIds?.length ?? 0), 0);
      expect(revealed, "Charges revealed").toBeGreaterThan(0);
      expect(hashState(engine.replay(initial, commands))).toBe(hashState(final));
      console.log(name, "rounds", final.round, "charges revealed", revealed, describeWin(final, won));
    }, 180_000);
  }
});

// Everything the late game adds at once: the last round (§7), the Crown's
// Levy (§27.3), The Dowager (§19.28) among the free cards, Sealed Charges
// with further draws at goals 25 and 30 (§27A) and the Crown's Voice
// (§129.10), waiting for the Quest deck or speaking from round 1.
describe("AI playouts with every late-game rule together", () => {
  for (const [players, targetRenown, from, name] of [
    [3, 25, "quest_deck_empty", "late-3p-25-s"],
    [4, 30, "first_round", "late-4p-30"],
  ] as const) {
    it(`${name}: finishes, keeps invariants and replays`, () => {
      const rs: RulesetConfig = { ...standardRuleset(players, { targetRenown, sealedCharges: true }), crownsVoice: { ...crownsVoiceRules(), from } };
      const { initial, final, steps, won } = playGame(players, rs, name, { freeCardEachTurn: true });
      expect(final.status).toBe("finished");
      if (won?.type === "game_won" && won.cause) expect(rankPlayers(ctx, final, final.turnOrder)[0]).toBe(final.winnerId);
      else expectWinner(final, won, targetRenown);
      const replayed = replaySteps(initial, steps);
      expect(hashState(replayed.state)).toBe(hashState(final));
      for (const type of ["levy_answered", "charge_revealed", "crowns_voice_turned", "favour_won"] as const) expect(replayed.eventTypes, type).toContain(type);
      const dowagers = steps.filter((step) => "command" in step && step.command.type === "play_card" && step.command.cardId.startsWith("the_dowager#")).length;
      expect(dowagers, "The Dowager played").toBeGreaterThan(0);
      console.log(name, "rounds", final.round, "steps", steps.length, "Dowagers", dowagers, describeWin(final, won));
    }, 300_000);
  }
});

describe("AI decisions", () => {
  it("returns null when it is not the player's turn", () => {
    const s = engine.createGame({ matchId: "x", seed: "x", rulesetVersion: RULESET_VERSION, ruleset: mvpRuleset(), players: [{ id: "A", displayName: "A" }, { id: "B", displayName: "B" }] });
    const other = s.turnOrder[1] as string;
    expect(chooseAction(engine, s, other, { level: "normal", rng: createRng(seedRng("z")) })).toBeNull();
  });
});
