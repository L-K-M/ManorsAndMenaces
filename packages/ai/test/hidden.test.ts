import { describe, expect, it } from "vitest";
import { createRng, createRulesEngine, redactState, seedRng, type CommandIntent, type GameCommand, type GameState, type PlayerId, type PlayerState } from "@manors-menaces/rules";
import { chooseAction, evaluate } from "../src/index.js";
import { counterChance, counteredOutcome } from "../src/hidden.js";
import { CARD_WORTH, cardWorth, handValue } from "../src/evaluate.js";
import { setupGame, standardRuleset, testContent } from "../../rules/test/helpers.js";

// The AI plans on what its player may know (§105): rivals' hands, the draw
// pile and the RNG state never change its choice, and a Spell is weighed by
// the chance a Counterspell is out there, counted from public cards.
const engine = createRulesEngine(testContent());
const ctx = engine.ctx;

function withPlayer(state: GameState, playerId: PlayerId, patch: Partial<PlayerState>): GameState {
  const p = state.players[playerId] as PlayerState;
  return { ...state, players: { ...state.players, [playerId]: { ...p, ...patch } } };
}

let seq = 0;
function act(state: GameState, playerId: PlayerId, intent: CommandIntent): GameState {
  const r = engine.applyCommand(state, { ...intent, commandId: `h${++seq}`, matchId: state.matchId, playerId } as GameCommand);
  if (!r.accepted || !r.newState) throw new Error(`rejected ${intent.type}: ${r.error?.code}`);
  return r.newState;
}

const decide = (state: GameState, playerId: PlayerId): CommandIntent | null =>
  chooseAction(engine, state, playerId, { level: "normal", rng: createRng(seedRng("hidden")) });

/** p1's first Main phase with resources to spend and a Spell in hand; p2 holds one card. */
function position(rivalCard: string, spell = "arcane_exchange#1"): { state: GameState; p1: PlayerId; p2: PlayerId } {
  const g = setupGame(standardRuleset(2));
  let state = withPlayer(g.state, g.p1, { hand: [spell], resources: { grain: 2, timber: 1, stone: 0, iron: 1, essence: 2 } });
  state = withPlayer(state, g.p2, { hand: [rivalCard] });
  // Keep every copy accounted for: the rival's card leaves the draw pile.
  state = { ...state, cardDeck: state.cardDeck.filter((c) => c !== rivalCard && c !== spell) };
  return { state, p1: g.p1, p2: g.p2 };
}

describe("hidden information", () => {
  // Planning on the full state, the AI cast both of these only when the
  // rival held no Counterspell.
  it.each(["druids_blessing#1", "transmutation_magic#1"])("casts %s whether or not a rival secretly holds a Counterspell", (spell) => {
    const withCounter = position("counterspell#1", spell);
    const without = position("knight_errant#1", spell);
    const choice = decide(without.state, without.p1);
    expect(choice).toMatchObject({ type: "play_card", cardId: spell });
    expect(decide(withCounter.state, withCounter.p1)).toEqual(choice);
  });

  it("ignores the order of the draw pile and the RNG state", () => {
    const { state, p1 } = position("knight_errant#1");
    const shuffled: GameState = { ...state, cardDeck: [...state.cardDeck].reverse(), rngState: [1, 2, 3, 4] };
    expect(decide(shuffled, p1)).toEqual(decide(state, p1));
  });

  it("values a card it cannot see at the average of the deck", () => {
    const { state, p1 } = position("knight_errant#1");
    const view = redactState(state, p1);
    const unknown = cardWorth(ctx, view, "hidden");
    expect(unknown).toBeGreaterThan(0);
    expect(unknown).toBeLessThan(Math.max(...Object.values(CARD_WORTH)));
    expect(handValue(ctx, withPlayer(view, p1, { hand: ["hidden", "hidden"] }), p1)).toBeCloseTo(2 * unknown);
  });
});

describe("counterChance", () => {
  it("is zero for anything but a Spell, and with reactions off", () => {
    const { state, p1 } = position("knight_errant#1");
    const view = redactState(state, p1);
    expect(counterChance(ctx, view, p1, "knight_errant#2")).toBe(0);
    expect(counterChance(ctx, view, p1, "arcane_exchange#1")).toBeGreaterThan(0);
    const off = { ...view, ruleset: { ...view.ruleset, enableReactionCards: false } };
    expect(counterChance(ctx, off, p1, "arcane_exchange#1")).toBe(0);
  });

  it("is zero once every Counterspell is in sight, and when rivals hold no cards", () => {
    const { state, p1, p2 } = position("knight_errant#1");
    const copies = ctx.card("counterspell").copies;
    const seen = Array.from({ length: copies }, (_, i) => `counterspell#${i + 1}`);
    const allSeen = redactState({ ...state, discardPile: seen, cardDeck: state.cardDeck.filter((c) => !seen.includes(c)) }, p1);
    expect(counterChance(ctx, allSeen, p1, "arcane_exchange#1")).toBe(0);
    const emptyHanded = redactState(withPlayer(state, p2, { hand: [] }), p1);
    expect(counterChance(ctx, emptyHanded, p1, "arcane_exchange#1")).toBe(0);
  });

  it("grows with the rival's hand", () => {
    const { state, p1, p2 } = position("knight_errant#1");
    const one = counterChance(ctx, redactState(state, p1), p1, "arcane_exchange#1");
    // Every copy stays accounted for: the rival's cards leave the draw pile.
    const bigHand = ["knight_errant#1", "knight_errant#2", "knight_errant#3"];
    const grown = withPlayer({ ...state, cardDeck: state.cardDeck.filter((c) => !bigHand.includes(c)) }, p2, { hand: bigHand });
    const three = counterChance(ctx, redactState(grown, p1), p1, "arcane_exchange#1");
    expect(three).toBeGreaterThan(one);
    expect(three).toBeLessThan(1);
  });
});

describe("counteredOutcome", () => {
  it("is the state after the Spell is countered: card gone, nothing resolved", () => {
    const { state, p1 } = position("knight_errant#1");
    const view = redactState(state, p1);
    const intent = { type: "play_card", cardId: "arcane_exchange#1", target: { effect: "arcane_exchange", give: "grain", receive: "essence" } } as const;
    const countered = counteredOutcome(engine, view, p1, intent);
    expect(countered).not.toBeNull();
    expect(countered?.players[p1]?.hand).toEqual([]);
    expect(countered?.players[p1]?.resources).toEqual(view.players[p1]?.resources);
    expect(countered?.discardPile).toContain("arcane_exchange#1");
    expect(countered?.pending).toBeUndefined();
    // Losing the card for nothing is worse than keeping it.
    expect(evaluate(ctx, countered as GameState, p1)).toBeLessThan(evaluate(ctx, view, p1));
  });
});

describe("card economy", () => {
  it("discards its least valuable cards, keeping a Counterspell", () => {
    const g = setupGame(standardRuleset(2));
    const hand = ["counterspell#1", "fog_of_confusion#1", "knight_errant#1", "druids_blessing#1", "arcane_exchange#1", "wizard_interference#1", "festival_at_the_inn#1", "very_minor_prophecy#1"];
    let state = withPlayer({ ...g.state, cardDeck: g.state.cardDeck.filter((c) => !hand.includes(c)) }, g.p1, { hand });
    state = act(state, g.p1, { type: "end_main_phase" });
    state = act(state, g.p1, { type: "assign_banners", assignments: {} });
    const choice = decide(state, g.p1);
    expect(choice?.type).toBe("discard_cards");
    const dropped = choice?.type === "discard_cards" ? choice.cardIds : [];
    expect(dropped).toHaveLength(1);
    expect(dropped[0]).not.toBe("counterspell#1");
    expect(Math.min(...hand.map((c) => cardWorth(ctx, state, c)))).toBe(cardWorth(ctx, state, dropped[0] as string));
  });
});
