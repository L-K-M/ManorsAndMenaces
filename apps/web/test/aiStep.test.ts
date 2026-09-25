import { describe, expect, it } from "vitest";
import type { CommandIntent, GameState, PlayerId } from "@manors-menaces/rules";
import { AiPace, aiPaceDelayMs, aiStepPace, resolveAiStep, type AiStep } from "../src/lib/game/aiStep.js";
import { act, cmd, engine, setupGame, standardRuleset } from "../../../packages/rules/test/helpers.js";

const resolve = (s: GameState, actor: PlayerId, intent: CommandIntent | null) => resolveAiStep(engine, s, actor, intent, (i) => cmd(s, actor, i));

/** A 2-player game where p2 must answer p1's Wizard's Interference. */
function pendingReaction() {
  const g = setupGame(standardRuleset(2));
  let s = g.state;
  for (const [pid, card] of [[g.p1, "wizard_interference"], [g.p2, "counterspell"]] as const) {
    const r = engine.applyDebugCommand(s, { type: "debug_draw_card", commandId: "d", matchId: s.matchId, playerId: pid, targetPlayerId: pid, cardDefId: card });
    s = r.newState as GameState;
  }
  const wiz = s.players[g.p1]?.hand[0] as string;
  s = act(s, g.p1, { type: "play_card", cardId: wiz, target: { effect: "wizard_interference", bannerId: g.bannerOf(g.p2, "s3"), regionId: "R7" } }).state;
  return { s, p2: g.p2 };
}

describe("resolveAiStep", () => {
  it("commits the AI's own choice when it is legal", () => {
    const { state, p1 } = setupGame();
    const step = resolve(state, p1, { type: "end_main_phase" });
    expect(step?.command.type).toBe("end_main_phase");
    expect(step?.fellBack).toBe(false);
  });

  it("falls back to a progression move when the choice is rejected", () => {
    const { state, p1 } = setupGame();
    const step = resolve(state, p1, { type: "build_route", routeId: "r99" });
    expect(step?.command.type).toBe("end_main_phase");
    expect(step?.fellBack).toBe(true);
  });

  // Regression: the web client only knew the phase-based moves, so a bad
  // choice during a pending reaction stalled the game with no message.
  it("passes a pending reaction instead of stalling", () => {
    const { s, p2 } = pendingReaction();
    expect(s.pending?.kind).toBe("reaction");
    const step = resolve(s, p2, { type: "end_main_phase" });
    expect(step?.command.type).toBe("pass_reaction");
    expect(step?.fellBack).toBe(true);
  });

  // Regression: a missing decision (the AI returned null or failed) was
  // dropped silently instead of progressing.
  it("progresses when the AI produced no decision", () => {
    const { state, p1 } = setupGame();
    const step = resolve(state, p1, null);
    expect(step?.command.type).toBe("end_main_phase");
    expect(step?.fellBack).toBe(true);
  });
});

describe("AI pacing", () => {
  const paceOf = (s: GameState, actor: PlayerId, intent: CommandIntent) => aiStepPace(resolve(s, actor, intent) as AiStep);

  it("gives invisible steps no beat and visible ones a full beat", () => {
    const { state, p1, bannerOf } = setupGame();
    expect(paceOf(state, p1, { type: "end_main_phase" })).toBe(AiPace.Quiet);
    const assigning = act(state, p1, { type: "end_main_phase" }).state;
    expect(paceOf(assigning, p1, { type: "assign_banners", assignments: {} })).toBe(AiPace.Quiet);
    expect(paceOf(assigning, p1, { type: "assign_banners", assignments: { [bannerOf(p1, "s1")]: "R6" } })).toBe(AiPace.Visible);
    const ending = act(assigning, p1, { type: "assign_banners", assignments: {} }).state;
    expect(paceOf(ending, p1, { type: "end_turn" })).toBe(AiPace.Handover);
  });

  it("treats a pass that resolves the Spell as visible", () => {
    const { s, p2 } = pendingReaction();
    expect(paceOf(s, p2, { type: "pass_reaction" })).toBe(AiPace.Visible);
  });

  it("scales with the animation speed and keeps a short beat when animations are off", () => {
    expect(aiPaceDelayMs(AiPace.Visible, 1)).toBe(550);
    expect(aiPaceDelayMs(AiPace.Handover, 1)).toBe(275);
    expect(aiPaceDelayMs(AiPace.Visible, 0.45)).toBe(248);
    expect(aiPaceDelayMs(AiPace.Visible, 0)).toBe(120);
    expect(aiPaceDelayMs(AiPace.Handover, 0)).toBe(0);
    for (const scale of [0, 0.45, 1]) expect(aiPaceDelayMs(AiPace.Quiet, scale)).toBe(0);
  });
});
