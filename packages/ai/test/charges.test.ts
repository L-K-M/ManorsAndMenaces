import { describe, expect, it } from "vitest";
import { clone, createRng, getChargeProgress, redactState, seedRng, type ChargeId, type CommandIntent, type GameState, type PlayerId, type RulesetConfig } from "@manors-menaces/rules";
import { chooseAction, evaluate, fallbackIntents, resourceNeeds, type AiLevel } from "../src/index.js";
import { chargeHopeless, chargeOutlook, pickCharge } from "../src/charges.js";
import { act, cmd, engine, grant, mvpRuleset, newGame, passTurn, setupGame, cardTestRuleset } from "../../rules/test/helpers.js";

// Sealed Charges (§27A) for the AI: it keeps the Charge it is further
// along, works toward it, trades in one it can no longer meet, and counts
// each rival's sealed Charge as Renown to come.

const ctx = engine.ctx;
const sealed = (ruleset: RulesetConfig = mvpRuleset()): RulesetConfig => ({ ...ruleset, sealedCharges: true });
const decide = (state: GameState, playerId: PlayerId, level: AiLevel = "normal"): CommandIntent | null =>
  chooseAction(engine, state, playerId, { level, rng: createRng(seedRng("charges")) });

/** The player draws `chargeIds` now, and must keep one. */
function drawn(state: GameState, playerId: PlayerId, chargeIds: ChargeId[]): GameState {
  return { ...clone(state), pending: { kind: "charge", playerId, chargeIds } };
}

/** The player keeps `chargeId` now. */
function seal(state: GameState, playerId: PlayerId, chargeId: ChargeId): GameState {
  return act(drawn(state, playerId, [chargeId]), playerId, { type: "choose_charge", chargeId }).state;
}

/** setupGame with Sealed Charges and nobody holding one yet. */
function sealedGame(ruleset: RulesetConfig = sealed()) {
  const game = setupGame(ruleset);
  const s = clone(game.state);
  for (const p of Object.values(s.players)) delete p.sealedCharge;
  return { ...game, state: s };
}

describe("choosing a Charge", () => {
  it("keeps the one it is further along", () => {
    const { state, p1 } = sealedGame();
    // p1's Manor on s1 and Banner in R1 already meet the Royal Castle Charge.
    const s = drawn(state, p1, ["trades", "castle"]);
    expect(pickCharge(ctx, s, p1, ["trades", "castle"])).toBe("castle");
    expect(decide(s, p1)).toEqual({ type: "choose_charge", chargeId: "castle" });
  });

  it.each(["easy", "normal", "hard"] as const)("%s: keeps one of those drawn at setup, never a rival's", (level) => {
    let s = newGame(sealed(cardTestRuleset(2)), `pick-${level}`);
    while (s.pending?.kind === "charge") {
      const { playerId, chargeIds } = s.pending;
      const choice = decide(s, playerId, level);
      expect(choice?.type).toBe("choose_charge");
      expect(chargeIds).toContain(choice?.type === "choose_charge" ? choice.chargeId : "");
      s = act(s, playerId, choice as CommandIntent).state;
    }
    expect(s.status).toBe("setup");
  });

  it("falls back to keeping the first Charge drawn", () => {
    const s = newGame(sealed());
    const pending = s.pending?.kind === "charge" ? s.pending : null;
    const fallback = fallbackIntents(ctx, s, pending?.playerId as string).find((i) => engine.applyCommand(s, cmd(s, pending?.playerId as string, i)).accepted);
    expect(fallback).toEqual({ type: "choose_charge", chargeId: pending?.chargeIds[0] });
  });
});

describe("working toward a Charge", () => {
  it("places its Banners to meet a Banner Charge rather than for the best Harvest", () => {
    const { state, p1 } = sealedGame();
    let s = seal(state, p1, "grain");
    s = act(s, p1, { type: "end_main_phase" }).state;
    const choice = decide(s, p1);
    expect(choice?.type).toBe("assign_banners");
    const after = act(s, p1, choice as CommandIntent).state;
    expect(getChargeProgress(ctx, after, p1, after.players[p1]?.sealedCharge ?? { id: "" }).complete).toBe(true);
  });

  it("values each step toward its Charge", () => {
    const { state, p2 } = sealedGame();
    // p2's network is far from the Royal Castle on s1; a Route toward it helps.
    const s = seal(passTurn(state), p2, "castle");
    const before = chargeOutlook(ctx, s, p2, { id: "castle" });
    const closer = act(grant(s, p2, { timber: 1, stone: 1 }), p2, { type: "build_route", routeId: "r47" }).state;
    expect(chargeOutlook(ctx, closer, p2, { id: "castle" })).toBeGreaterThan(before);
    const reached = act(grant(closer, p2, { timber: 1, stone: 1 }), p2, { type: "build_route", routeId: "r14" }).state;
    expect(chargeOutlook(ctx, reached, p2, { id: "castle" })).toBe(1);
  });

  it("saves for the Writ, card or Warden its deed Charge needs", () => {
    const game = sealedGame(sealed(cardTestRuleset(2)));
    const p1 = game.p1;
    const state = clone(game.state);
    for (const r of Object.keys(state.players[p1]?.resources ?? {})) (state.players[p1]?.resources as Record<string, number>)[r] = 0;
    const plain = resourceNeeds(ctx, state, p1);
    const cards = resourceNeeds(ctx, seal(state, p1, "cards"), p1);
    for (const r of ["grain", "iron", "essence"] as const) expect(cards[r]).toBeGreaterThan(plain[r]);
    expect(resourceNeeds(ctx, seal(state, p1, "troll"), p1).essence).toBeGreaterThan(plain.essence);
    expect(resourceNeeds(ctx, seal(state, p1, "trades"), p1)).toEqual(plain);
  });
});

describe("Recommission", () => {
  it("trades in a Charge it can no longer meet, and only then", () => {
    const { state, p1 } = sealedGame();
    // The test board has no Dwarven Hall, so its Charge can never be met.
    const hopeless = grant(seal(state, p1, "hall"), p1, { essence: 1 });
    expect(chargeHopeless(ctx, hopeless, p1)).toBe(true);
    expect(decide(hopeless, p1)).toEqual({ type: "recommission_charge" });
    const fine = grant(seal(state, p1, "inn"), p1, { essence: 1 });
    expect(chargeHopeless(ctx, fine, p1)).toBe(false);
    expect(decide(fine, p1)).not.toEqual({ type: "recommission_charge" });
  });
});

describe("rivals' Charges", () => {
  it("counts a rival's sealed Charge as Renown to come", () => {
    const { state, p1, p2 } = sealedGame();
    expect(evaluate(ctx, seal(state, p2, "trades"), p1)).toBeLessThan(evaluate(ctx, state, p1));
  });

  it("plans the same whichever Charge a rival holds", () => {
    const { state, p1, p2 } = sealedGame(sealed(cardTestRuleset(2)));
    const base = grant(state, p1, { grain: 3, timber: 3, stone: 3, iron: 2, essence: 2 });
    const choices = ["castle", "trades", "troll"].map((id) => decide(seal(base, p2, id), p1));
    expect(choices[1]).toEqual(choices[0]);
    expect(choices[2]).toEqual(choices[0]);
    // What it sees of a rival is only that a Charge is held.
    expect(redactState(seal(base, p2, "castle"), p1).players[p2]?.sealedCharge).toEqual({ id: "hidden" });
  });
});
