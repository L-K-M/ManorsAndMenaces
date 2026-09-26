import { describe, expect, it } from "vitest";
import { asyncRuleset, BALANCE, HIDDEN_CARD, redactEvent, redactState } from "../src/index.js";
import { act, engine, newGame, passTurn, setupGame, standardRuleset, mvpRuleset } from "./helpers.js";

const incomeRules = () => ({ ...standardRuleset(2), initialCards: 2, cardDrawEveryRounds: 3 });
function nextRound(state: ReturnType<typeof newGame>) {
  for (let i = 0; i < state.turnOrder.length; i++) state = passTurn(state);
  return state;
}
function endRound(state: ReturnType<typeof newGame>) {
  state = passTurn(state);
  const player = state.activePlayerId;
  state = act(state, player, { type: "end_main_phase" }).state;
  state = act(state, player, { type: "assign_banners", assignments: {} }).state;
  return act(state, player, { type: "end_turn" });
}

describe("guaranteed card income", () => {
  it("deals two after setup, without spending resources or counting purchases", () => {
    const rules = incomeRules();
    expect(Object.values(newGame(rules).players).every((p) => p.hand.length === 0)).toBe(true);
    const { state } = setupGame(rules);
    const baseline = setupGame({ ...rules, initialCards: 0 }).state;
    for (const id of state.turnOrder) {
      expect(state.players[id]!.hand).toHaveLength(2);
      expect(state.players[id]!.stats.cardsBought).toBe(0);
      expect(state.players[id]!.resources).toEqual(baseline.players[id]!.resources);
    }
    const dealt = Object.values(state.players).flatMap((p) => p.hand);
    expect(new Set(dealt).size).toBe(4);
    expect(dealt.some((c) => c.startsWith("ragnarok#"))).toBe(false);
  });

  it("draws once for everyone at the start of rounds 3 and 6, including before the first seat acts", () => {
    let { state } = setupGame(incomeRules());
    for (let round = 2; round <= 6; round++) {
      const before = JSON.parse(JSON.stringify(state)) as typeof state;
      const result = endRound(state);
      expect(state).toEqual(before);
      state = result.state;
      expect(state.round).toBe(round);
      const expected = 2 + Math.floor(round / 3);
      for (const p of Object.values(state.players)) expect(p.hand).toHaveLength(expected);
      const income = result.events.filter((e) => e.type === "cards_dealt");
      expect(income).toHaveLength(round % 3 === 0 ? 2 : 0);
      const restored = JSON.parse(JSON.stringify(state)) as typeof state;
      expect(nextRound(restored)).toEqual(nextRound(state));
    }
  });

  it("keeps identities private while publishing the amount and reason", () => {
    const result = endRound(nextRound(setupGame(incomeRules()).state));
    const event = result.events.find((e) => e.type === "cards_dealt");
    expect(event).toBeDefined();
    if (!event || event.type !== "cards_dealt") return;
    expect(redactEvent(event, event.playerId)).toEqual(event);
    const other = result.state.turnOrder.find((id) => id !== event.playerId)!;
    for (const viewer of [other, null]) {
      expect(redactEvent(event, viewer)).toEqual({ ...event, cardIds: null });
      expect(redactState(result.state, viewer).players[event.playerId]!.hand).toEqual(Array(3).fill(HIDDEN_CARD));
    }
    expect(event).toMatchObject({ count: 1, reason: "round" });
  });

  it("reshuffles discards and handles an exhausted deck without blocking the round", () => {
    let state = nextRound(setupGame(incomeRules()).state);
    const card = state.cardDeck[0]!;
    state.cardDeck = [];
    state.discardPile = [card];
    const result = endRound(state);
    expect(result.state.round).toBe(3);
    expect(result.events.some((e) => e.type === "deck_reshuffled")).toBe(true);
    const draws = result.events.filter((e) => e.type === "cards_dealt");
    expect(draws).toHaveLength(1);
    expect(draws[0]).toMatchObject({ count: 1, cardIds: [card] });
    state = endRound({ ...result.state, round: 5 }).state;
    expect(state.round).toBe(6);
  });

  it("preserves old saves and Core games, and enables income in Standard and async games", () => {
    const legacy = { ...standardRuleset(2) };
    delete legacy.initialCards;
    delete legacy.cardDrawEveryRounds;
    for (const rules of [legacy, mvpRuleset()]) {
      let { state } = setupGame(rules);
      state = nextRound(nextRound(state));
      expect(Object.values(state.players).every((p) => p.hand.length === 0)).toBe(true);
    }
    for (const rules of [standardRuleset(2), standardRuleset(4), asyncRuleset(2)]) {
      expect(rules.initialCards).toBe(2);
      expect(rules.cardDrawEveryRounds).toBe(3);
    }
    expect(BALANCE.costs.card).toEqual({ grain: 1, iron: 1, essence: 1 });
    expect(standardRuleset(2).maxNonReactionCardsPerTurn).toBe(1);
  });

  it("allows an incoming card over the hand limit, then requires discard at the owner's turn end", () => {
    let { state } = setupGame(incomeRules());
    const id = state.turnOrder[0]!;
    state.players[id]!.hand.push(...state.cardDeck.splice(0, 5));
    state = nextRound(state);
    state = endRound(state).state;
    expect(state.players[id]!.hand).toHaveLength(8);
    state = act(state, id, { type: "end_main_phase" }).state;
    state = act(state, id, { type: "assign_banners", assignments: {} }).state;
    expect(engine.applyCommand(state, { type: "end_turn", playerId: id, commandId: "over", matchId: state.matchId }).error?.code).toBe("HAND_OVER_LIMIT");
    state = act(state, id, { type: "discard_cards", cardIds: [state.players[id]!.hand[0]!] }).state;
    expect(act(state, id, { type: "end_turn" }).state.activePlayerId).not.toBe(id);
  });
});
