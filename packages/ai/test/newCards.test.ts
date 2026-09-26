import { describe, expect, it } from "vitest";
import {
  createRng,
  createRulesEngine,
  enumerateCardTargets,
  getRenown,
  plagueBanners,
  seedRng,
  type CardRulesDefinition,
  type CommandIntent,
  type GameCommand,
  type GameState,
  type PlayerId,
  type PlayerState,
  type RngState,
  type SiteId,
} from "@manors-menaces/rules";
import { chooseAction, evaluate, mainPhaseCandidates, type AiLevel } from "../src/index.js";
import { MAX_CARD_TARGETS } from "../src/candidates.js";
import { routeId, setupGame, standardRuleset, testContent } from "../../rules/test/helpers.js";

// The second wave of cards (§19.12–19.21) on the rules test board. Setup
// (from the rules helpers): the first player (p1) has Manors on s1 and s9
// with Banners on R1 (grain) and R8 (stone); p2 has Manors on s3 and s7 with
// Banners on R5 (essence) and R3 (stone). Positions below are edited straight
// into the state, as the AI only ever reads it.
const NEW_CARDS: CardRulesDefinition[] = [
  { id: "changeling", type: "spell", timing: ["main"], effectId: "changeling", copies: 1 },
  { id: "ragnarok", type: "spell", timing: ["main"], effectId: "ragnarok", copies: 1, setAside: true },
  { id: "fire_bolt", type: "spell", timing: ["main"], effectId: "fire_bolt", copies: 2 },
  { id: "dragons_landing", type: "story", timing: ["main"], effectId: "dragons_landing", copies: 1 },
  { id: "transmutation_magic", type: "spell", timing: ["main"], effectId: "transmutation_magic", copies: 2 },
  { id: "the_plague", type: "spell", timing: ["main"], effectId: "the_plague", copies: 2 },
  { id: "royal_insurance_policy", type: "charter", timing: ["main"], effectId: "royal_insurance_policy", copies: 2 },
  { id: "robin_of_the_glade", type: "hero", timing: ["main"], effectId: "robin_of_the_glade", copies: 2 },
  { id: "unreliable_bard", type: "hero", timing: ["main"], effectId: "unreliable_bard", copies: 1 },
  { id: "treasure_hunter", type: "hero", timing: ["main"], effectId: "treasure_hunter", copies: 1, requiresMenace: "young_dragon" },
];
const base = testContent();
const engine = createRulesEngine({ ...base, cards: [...base.cards.filter((c) => !NEW_CARDS.some((n) => n.id === c.id)), ...NEW_CARDS] });
const NONE = { grain: 0, timber: 0, stone: 0, iron: 0, essence: 0 };

let seq = 0;
function act(state: GameState, playerId: PlayerId, intent: CommandIntent): GameState {
  const r = engine.applyCommand(state, { ...intent, commandId: `n${++seq}`, matchId: state.matchId, playerId } as GameCommand);
  if (!r.accepted || !r.newState) throw new Error(`rejected ${intent.type}: ${r.error?.code} ${r.error?.detail ?? ""}`);
  return r.newState;
}

function withPlayer(state: GameState, playerId: PlayerId, patch: Partial<PlayerState>): GameState {
  const p = state.players[playerId] as PlayerState;
  return { ...state, players: { ...state.players, [playerId]: { ...p, ...patch } } };
}

/** Adds a Manor without a Banner; spacing is not checked. */
function withManor(state: GameState, ownerId: PlayerId, siteId: SiteId): GameState {
  const id = `holding_extra_${siteId}`;
  const p = state.players[ownerId] as PlayerState;
  return withPlayer({ ...state, holdings: { ...state.holdings, [id]: { id, siteId, ownerId, type: "manor" } } }, ownerId, {
    holdingIds: [...p.holdingIds, id],
  });
}

function decide(state: GameState, playerId: PlayerId, level: AiLevel = "normal"): CommandIntent | null {
  return chooseAction(engine, state, playerId, { level, rng: createRng(seedRng("new-cards")) });
}

/** Turn 1 of p1 with empty hands and purses, so only the cards given matter. */
function position(ruleset = standardRuleset(2)): { state: GameState; p1: PlayerId; p2: PlayerId } {
  const g = setupGame(ruleset);
  let state = g.state;
  for (const id of [g.p1, g.p2]) state = withPlayer(state, id, { hand: [], resources: { ...NONE } });
  expect(state.activePlayerId).toBe(g.p1);
  expect(state.phase).toBe("main");
  return { state, p1: g.p1, p2: g.p2 };
}

const play = (cardId: string, target: Extract<CommandIntent, { type: "play_card" }>["target"]): CommandIntent => ({ type: "play_card", cardId, target });

describe("Dragon's Landing: no peeking at the match RNG", () => {
  /** The first substitute RNG state under which the Dragon lands on `victim`'s Holding. */
  function rngStriking(state: GameState, caster: PlayerId, victim: PlayerId): RngState {
    for (let i = 0; i < 200; i++) {
      const rngState = seedRng(`strike-${i}`);
      const trial = { ...state, rngState };
      const r = engine.applyCommand(trial, {
        ...play("dragons_landing#1", { effect: "dragons_landing" }),
        commandId: "probe",
        matchId: state.matchId,
        playerId: caster,
      } as GameCommand);
      const landed = r.events.find((e) => e.type === "dragon_landed");
      if (landed?.type === "dragon_landed" && landed.ownerId === victim) return rngState;
    }
    throw new Error("no seed strikes that player");
  }

  it("declines a pool that is half its own, even when the real pick would spare it", () => {
    let { state, p1, p2 } = position();
    state = withManor(withManor(state, p1, "s4"), p2, "s5");
    state = withPlayer(state, p1, { hand: ["dragons_landing#1"] });
    const lucky = rngStriking(state, p1, p2);
    const unlucky = rngStriking(state, p1, p1);

    // Knowing the pick in advance, playing it under `lucky` would pay.
    const after = act({ ...state, rngState: lucky }, p1, play("dragons_landing#1", { effect: "dragons_landing" }));
    expect(evaluate(engine.ctx, after, p1)).toBeGreaterThan(evaluate(engine.ctx, state, p1) + 0.05);

    for (const level of ["normal", "hard"] as const) {
      expect(decide({ ...state, rngState: lucky }, p1, level)).toEqual({ type: "end_main_phase" });
      expect(decide({ ...state, rngState: unlucky }, p1, level)).toEqual({ type: "end_main_phase" });
    }
  });

  it("plays it when every Holding in the pool is a rival's, whatever the RNG holds", () => {
    let { state, p1, p2 } = position();
    state = withPlayer(withManor(state, p2, "s5"), p1, { hand: ["dragons_landing#1"] });
    const intent = play("dragons_landing#1", { effect: "dragons_landing" });
    for (let i = 0; i < 4; i++) expect(decide({ ...state, rngState: seedRng(`any-${i}`) }, p1)).toEqual(intent);
    // The decision is a pure function of the state.
    expect(decide(JSON.parse(JSON.stringify(state)) as GameState, p1)).toEqual(decide(state, p1));
  });
});

describe("Ragnarök", () => {
  const ragnarok = play("ragnarok#1", { effect: "ragnarok" });

  it("ends the game when the AI would win", () => {
    let { state, p1 } = position();
    state = withPlayer(state, p1, { hand: ["ragnarok#1"], bonusRenown: 3 });
    expect(decide(state, p1)).toEqual(ragnarok);
    const after = act(state, p1, ragnarok);
    expect(after.status).toBe("finished");
    expect(after.winnerId).toBe(p1);
  });

  it("keeps it when a tie would be broken against the AI", () => {
    let { state, p1, p2 } = position();
    // Equal Renown, so it is legal; the richer rival wins the tie-break (§7).
    state = withPlayer(withPlayer(state, p1, { hand: ["ragnarok#1"] }), p2, { resources: { ...NONE, grain: 3 } });
    expect(decide(state, p1)).toEqual({ type: "end_main_phase" });
  });

  it("counters it when the game would end with a rival ahead, and lets it through otherwise", () => {
    const { state: start, p1, p2 } = position();
    const cast = (s: GameState): GameState => act(withPlayer(s, p1, { hand: ["ragnarok#1"] }), p1, ragnarok);
    const withCounter = withPlayer(start, p2, { hand: ["counterspell#1"] });

    const losing = cast(withPlayer(withCounter, p1, { bonusRenown: 1 }));
    expect(losing.pending?.kind).toBe("reaction");
    expect(decide(losing, p2)).toEqual({ type: "react", cardId: "counterspell#1" });

    // A tie that p2 wins on resources: let the world end.
    const winning = cast(withPlayer(withCounter, p2, { resources: { ...NONE, grain: 3 } }));
    expect(decide(winning, p2)).toEqual({ type: "pass_reaction" });
  });
});

describe("Counterspell against the second wave", () => {
  /** p1 casts `cardId` at `target` while p2 holds a Counterspell (and `p2Hand`). */
  function cast(
    cardId: string,
    target: Extract<CommandIntent, { type: "play_card" }>["target"],
    patch: { p1Hand?: string[]; p2Hand?: string[]; insured?: boolean } = {},
  ): { state: GameState; p2: PlayerId } {
    const { state: start, p1, p2 } = position();
    let s = withPlayer(start, p1, { hand: [cardId, ...(patch.p1Hand ?? [])] });
    s = withPlayer(s, p2, { hand: ["counterspell#1", ...(patch.p2Hand ?? [])], ...(patch.insured ? { charters: ["royal_insurance_policy#1"] } : {}) });
    s = act(s, p1, play(cardId, target));
    expect(s.pending?.kind).toBe("reaction");
    return { state: s, p2 };
  }
  const counter = { type: "react", cardId: "counterspell#1" };
  const pass = { type: "pass_reaction" };

  it("counters Fire Bolt on its Route unless insured", () => {
    const bolt = { effect: "fire_bolt", routeId: routeId(3, 6) } as const;
    const plain = cast("fire_bolt#1", bolt);
    expect(decide(plain.state, plain.p2)).toEqual(counter);
    const insured = cast("fire_bolt#1", bolt, { insured: true });
    expect(decide(insured.state, insured.p2)).toEqual(pass);
  });

  it("counters The Plague only when it sickens more of its Banners than the caster's", () => {
    // s3 touches R5 (p2's essence) only; s2 touches R1 (p1's grain) and R5.
    const onlyMine = cast("the_plague#1", { effect: "the_plague", siteId: "s3" });
    expect(decide(onlyMine.state, onlyMine.p2)).toEqual(counter);
    const even = cast("the_plague#1", { effect: "the_plague", siteId: "s2" });
    expect(decide(even.state, even.p2)).toEqual(pass);
    const insured = cast("the_plague#1", { effect: "the_plague", siteId: "s3" }, { insured: true });
    expect(decide(insured.state, insured.p2)).toEqual(pass);
  });

  it("counters Changeling unless the caster's hand is at least as big", () => {
    const { p2 } = position();
    const target = { effect: "changeling", opponentId: p2 } as const;
    // p2 holds 3 cards, the caster 1 after casting: keep the hand.
    const small = cast("changeling#1", target, { p1Hand: ["knight_errant#1"], p2Hand: ["knight_errant#2", "knight_errant#3"] });
    expect(decide(small.state, small.p2)).toEqual(counter);
    // The caster keeps 3: the swap is worth as much as countering it.
    const big = cast("changeling#1", target, {
      p1Hand: ["knight_errant#1", "druids_blessing#1", "druids_blessing#2"],
      p2Hand: ["knight_errant#2", "knight_errant#3"],
    });
    expect(decide(big.state, big.p2)).toEqual(pass);
  });
});

describe("helpful cards", () => {
  it("puts a Royal Insurance Policy in front of it when nothing better is on", () => {
    let { state, p1 } = position();
    state = withPlayer(state, p1, { hand: ["royal_insurance_policy#1"] });
    expect(decide(state, p1)).toEqual(play("royal_insurance_policy#1", { effect: "royal_insurance_policy" }));
  });

  it("plays The Unreliable Bard when far enough behind", () => {
    let { state, p1, p2 } = position();
    state = withPlayer(withPlayer(state, p1, { hand: ["unreliable_bard#1"] }), p2, { bonusRenown: 2 });
    expect(decide(state, p1)).toEqual(play("unreliable_bard#1", { effect: "unreliable_bard" }));
  });

  it("sends Robin of the Glade for the Iron that completes a Stronghold", () => {
    let { state, p1, p2 } = position();
    state = withPlayer(state, p1, { hand: ["robin_of_the_glade#1"], resources: { ...NONE, grain: 2, iron: 1 } });
    state = withPlayer(state, p2, { bonusRenown: 1, resources: { ...NONE, iron: 2, essence: 2 } });
    expect(decide(state, p1)).toEqual(play("robin_of_the_glade#1", { effect: "robin_of_the_glade", resource: "iron" }));
  });

  it("burns a Route of a rival close to winning", () => {
    let { state, p1, p2 } = position();
    state = withPlayer(withPlayer(state, p1, { hand: ["fire_bolt#1"] }), p2, { bonusRenown: state.ruleset.targetRenown - 4 - getRenown(engine.ctx, state, p2) });
    const intent = decide(state, p1);
    expect(intent).toMatchObject({ type: "play_card", cardId: "fire_bolt#1", target: { effect: "fire_bolt" } });
    if (intent?.type !== "play_card" || intent.target.effect !== "fire_bolt") return;
    expect(state.routeOwners[intent.target.routeId]).toBe(p2);
  });
});

describe("candidate pruning", () => {
  const cardCandidates = (state: GameState, playerId: PlayerId, cardId: string): Extract<CommandIntent, { type: "play_card" }>[] =>
    mainPhaseCandidates(engine.ctx, state, playerId, { menaces: true, cards: true }).filter(
      (c): c is Extract<CommandIntent, { type: "play_card" }> => c.type === "play_card" && c.cardId === cardId,
    );

  it("keeps the best few of Transmutation Magic's 110 exchanges", () => {
    let { state, p1 } = position();
    state = withPlayer(state, p1, { hand: ["transmutation_magic#1"], resources: { grain: 0, timber: 0, stone: 0, iron: 4, essence: 4 } });
    // Every give pair is affordable with 2 of each.
    const rich = withPlayer(state, p1, { resources: { grain: 2, timber: 2, stone: 2, iron: 2, essence: 2 } });
    expect(enumerateCardTargets(engine.ctx, rich, p1, "transmutation_magic#1")).toHaveLength(110);
    expect(cardCandidates(rich, p1, "transmutation_magic#1")).toHaveLength(MAX_CARD_TARGETS);

    // With only Iron and Essence to give, the best estimates receive what the next builds need.
    const kept = cardCandidates(state, p1, "transmutation_magic#1");
    expect(kept.length).toBeLessThanOrEqual(MAX_CARD_TARGETS);
    const first = kept[0]?.target;
    expect(first?.effect === "transmutation_magic" && first.receive.every((r) => r !== "essence")).toBe(true);
  });

  it("simulates one Plague per distinct set of sickened Banners", () => {
    let { state, p1 } = position();
    state = withPlayer(state, p1, { hand: ["the_plague#1"] });
    const kept = cardCandidates(state, p1, "the_plague#1");
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThanOrEqual(MAX_CARD_TARGETS);
    const sickened = kept.map((c) => (c.target.effect === "the_plague" ? plagueBanners(engine.ctx, state, c.target.siteId) : []));
    expect(new Set(sickened.map((banners) => banners.map((b) => b.id).join())).size).toBe(kept.length);
  });

  it("bounds Treasure Hunter's Hoard and Region choices", () => {
    let { state, p1 } = position({ ...standardRuleset(2), activeMenaces: ["toll_troll", "young_dragon"] });
    const dragon = Object.values(state.menaces).find((m) => m.type === "young_dragon");
    if (!dragon) throw new Error("no dragon");
    state = {
      ...state,
      menaces: {
        ...state.menaces,
        [dragon.id]: { ...dragon, location: { kind: "region", regionId: "R2" }, state: { hoard: { grain: 2, timber: 3, stone: 1, iron: 2, essence: 1 } } },
      },
    };
    state = withPlayer(state, p1, { hand: ["treasure_hunter#1"] });
    expect(enumerateCardTargets(engine.ctx, state, p1, "treasure_hunter#1").length).toBeGreaterThan(MAX_CARD_TARGETS);
    expect(cardCandidates(state, p1, "treasure_hunter#1")).toHaveLength(MAX_CARD_TARGETS);
  });

  it("keeps Fire Bolt's Routes on an uninsured rival when the insured leader has more", () => {
    let { state, p1, p2 } = position();
    const withRoutes = (s: GameState, ownerId: PlayerId, ids: string[]): GameState =>
      withPlayer({ ...s, routeOwners: { ...s.routeOwners, ...Object.fromEntries(ids.map((id) => [id, ownerId])) } }, ownerId, {
        routeIds: [...(s.players[ownerId] as PlayerState).routeIds, ...ids],
      });
    // A third player with Manors on s5 and s8 joined by r58, so its loss cuts nothing.
    const p3 = "C";
    const blank = { hand: [], holdingIds: [], routeIds: [], claimedQuestIds: [], charters: [] };
    state = { ...state, turnOrder: [...state.turnOrder, p3], players: { ...state.players, [p3]: { ...(state.players[p2] as PlayerState), ...blank, id: p3, seat: 2 } } };
    state = withRoutes(withManor(withManor(state, p3, "s5"), p3, "s8"), p3, [routeId(5, 8)]);
    state = withPlayer(state, p3, { bonusRenown: 7 });
    // The insured leader owns 7 Routes and no bridge, all of them legal targets.
    state = withRoutes(state, p2, [routeId(2, 3), routeId(4, 5), routeId(1, 4), routeId(4, 7), routeId(2, 5)]);
    state = withPlayer(state, p2, { bonusRenown: 8, charters: ["royal_insurance_policy#1"] });
    state = withPlayer(state, p1, { hand: ["fire_bolt#1"] });

    const leaders = enumerateCardTargets(engine.ctx, state, p1, "fire_bolt#1").filter((t) => t.effect === "fire_bolt" && state.routeOwners[t.routeId] === p2);
    expect(leaders.length).toBeGreaterThan(MAX_CARD_TARGETS);
    const kept = cardCandidates(state, p1, "fire_bolt#1").map((c) => (c.target.effect === "fire_bolt" ? state.routeOwners[c.target.routeId] : undefined));
    expect(kept).toContain(p3);
    expect(decide(state, p1)).toEqual(play("fire_bolt#1", { effect: "fire_bolt", routeId: routeId(5, 8) }));
  });

  it("leaves the other cards' targets alone", () => {
    let { state, p1 } = position();
    state = withPlayer(state, p1, { hand: ["knight_errant#1"] });
    expect(cardCandidates(state, p1, "knight_errant#1")).toHaveLength(enumerateCardTargets(engine.ctx, state, p1, "knight_errant#1").length);
  });
});
