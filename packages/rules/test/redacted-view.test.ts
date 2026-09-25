// Online clients only ever hold a redacted view (spec §83, §105): opponents'
// hands and the deck are HIDDEN_CARD. Selectors and command validation must
// work on such a view, because the client computes legal actions from it.

import { describe, expect, it } from "vitest";
import { enumerateCardTargets, getLegalActions, HIDDEN_CARD, redactState, type GameState } from "../src/index.js";
import { cmd, engine, give, grant, setupGame, standardRuleset } from "./helpers.js";

const ctx = engine.ctx;

/** p1 holds an Arcane Exchange and can pay for it; p2 holds `opponentCard`. */
function spellInHand(opponentCard: string) {
  const { state, p1, p2 } = setupGame(standardRuleset(2));
  let s = give(state, p1, "arcane_exchange");
  s = give(s, p2, opponentCard);
  s = grant(s, p1, { essence: 2 });
  return { s, p1, p2, spell: s.players[p1]?.hand[0] as string };
}

describe("redacted views", () => {
  it("lets the viewer play a Spell while an opponent's hand is hidden", () => {
    for (const opponentCard of ["knight_errant", "counterspell"]) {
      const { s, p1, p2, spell } = spellInHand(opponentCard);
      const view = redactState(s, p1);
      expect(view.players[p1]?.hand).toEqual([spell]);
      expect(view.players[p2]?.hand).toEqual([HIDDEN_CARD]);

      expect(getLegalActions(ctx, view, p1).playableCards).toEqual([spell]);
      expect(enumerateCardTargets(ctx, view, p1, spell).length).toBeGreaterThan(0);
      const r = engine.applyCommand(
        view,
        cmd(view, p1, { type: "play_card", cardId: spell, target: { effect: "arcane_exchange", give: "essence", receive: "iron" } }),
      );
      expect(r.error).toBeUndefined();
      expect(r.accepted).toBe(true);
    }
  });

  it("computes legal actions after a local buy draws a hidden card", () => {
    const { s, p1, spell } = spellInHand("knight_errant");
    const view = redactState(grant(s, p1, { grain: 1, iron: 1, essence: 1 }), p1);
    const r = engine.applyCommand(view, cmd(view, p1, { type: "buy_card" }));
    expect(r.accepted).toBe(true);
    const after = r.newState as GameState;
    expect(after.players[p1]?.hand).toContain(HIDDEN_CARD);

    const legal = getLegalActions(ctx, after, p1);
    expect(legal.mode).toBe("main");
    expect(legal.playableCards).toEqual([spell]);
  });

  it("computes reaction options when the reacting hand is hidden", () => {
    const { s, p1, p2, spell } = spellInHand("counterspell");
    const r = engine.applyCommand(s, cmd(s, p1, { type: "play_card", cardId: spell, target: { effect: "arcane_exchange", give: "essence", receive: "iron" } }));
    const pending = r.newState as GameState;
    expect(pending.pending?.kind).toBe("reaction");

    // A spectator (or a stale client) sees the reacting player's hand as hidden.
    const spectator = redactState(pending, null);
    const legal = getLegalActions(ctx, spectator, p2);
    expect(legal.mode).toBe("reaction");
    expect(legal.reactionCards).toEqual([]);
    // The reacting player's own view still offers the Counterspell.
    expect(getLegalActions(ctx, redactState(pending, p2), p2).reactionCards).toEqual(pending.players[p2]?.hand);
  });

  it("rejects playing a hidden card with a structured error", () => {
    const { s, p1 } = spellInHand("knight_errant");
    const view = redactState(s, null);
    const r = engine.applyCommand(
      view,
      cmd(view, p1, { type: "play_card", cardId: HIDDEN_CARD, target: { effect: "arcane_exchange", give: "essence", receive: "iron" } }),
    );
    expect(r.accepted).toBe(false);
    expect(r.error?.code).toBe("UNKNOWN_ENTITY");
  });
});
