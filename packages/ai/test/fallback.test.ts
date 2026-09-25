import { describe, expect, it } from "vitest";
import type { CommandIntent, GameState, PlayerId } from "@manors-menaces/rules";
import { fallbackIntents } from "../src/index.js";
import { act, cmd, engine, newGame, setupGame, standardRuleset } from "../../rules/test/helpers.js";

/** The first fallback the engine accepts for `playerId`, or null. */
function firstAccepted(s: GameState, playerId: PlayerId): string | null {
  for (const intent of fallbackIntents(engine.ctx, s, playerId)) {
    if (engine.applyCommand(s, cmd(s, playerId, intent)).accepted) return intent.type;
  }
  return null;
}

function drawCard(s: GameState, playerId: PlayerId, cardDefId: string): GameState {
  const r = engine.applyDebugCommand(s, { type: "debug_draw_card", commandId: "d", matchId: s.matchId, playerId, targetPlayerId: playerId, cardDefId });
  if (!r.newState) throw new Error(r.error?.code);
  return r.newState;
}

describe("fallbackIntents", () => {
  it("covers every setup step", () => {
    let s = newGame();
    const seen = new Set<string>();
    while (s.status === "setup") {
      const actor = s.activePlayerId;
      const type = firstAccepted(s, actor);
      expect(type, `setup step ${seen.size}`).not.toBeNull();
      seen.add(type as string);
      s = act(s, actor, fallbackIntents(engine.ctx, s, actor).find((i) => i.type === type) as CommandIntent).state;
    }
    expect([...seen].sort()).toEqual(["assign_initial_banners", "place_initial_manor", "place_initial_route"]);
  });

  it("advances the main phase, the Banner assignment and the end of turn", () => {
    const { state, p1 } = setupGame();
    let s = state;
    expect(firstAccepted(s, p1)).toBe("end_main_phase");
    s = act(s, p1, { type: "end_main_phase" }).state;
    expect(firstAccepted(s, p1)).toBe("assign_banners");
    s = act(s, p1, { type: "assign_banners", assignments: {} }).state;
    expect(firstAccepted(s, p1)).toBe("end_turn");
  });

  it("passes a pending reaction", () => {
    const g = setupGame(standardRuleset(2));
    let s = drawCard(drawCard(g.state, g.p1, "wizard_interference"), g.p2, "counterspell");
    const wiz = s.players[g.p1]?.hand[0] as string;
    s = act(s, g.p1, { type: "play_card", cardId: wiz, target: { effect: "wizard_interference", bannerId: g.bannerOf(g.p2, "s3"), regionId: "R7" } }).state;
    expect(s.pending?.kind).toBe("reaction");
    expect(firstAccepted(s, g.p2)).toBe("pass_reaction");
  });

  it("resolves a pending prophecy", () => {
    const g = setupGame(standardRuleset(2));
    let s = drawCard(g.state, g.p1, "very_minor_prophecy");
    s = act(s, g.p1, { type: "play_card", cardId: s.players[g.p1]?.hand[0] as string, target: { effect: "very_minor_prophecy" } }).state;
    expect(s.pending?.kind).toBe("prophecy");
    expect(firstAccepted(s, g.p1)).toBe("resolve_prophecy");
  });

  it("discards down to the hand limit before ending the turn", () => {
    const g = setupGame(standardRuleset(2));
    let s = g.state;
    for (const card of s.cardDeck.slice(0, s.ruleset.handLimit + 1)) s = drawCard(s, g.p1, card.split("#")[0] as string);
    s = act(s, g.p1, { type: "end_main_phase" }).state;
    s = act(s, g.p1, { type: "assign_banners", assignments: {} }).state;
    expect(firstAccepted(s, g.p1)).toBe("discard_cards");
  });
});
