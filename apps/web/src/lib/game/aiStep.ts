// Turns an AI decision into the command the client commits, and decides how
// long the table should wait before showing it. Pure, so it runs the same in
// tests as in the session.

import { fallbackIntents } from "@manors-menaces/ai";
import type { CommandIntent, GameCommand, GameEvent, GameState, PlayerId, RulesEngine } from "@manors-menaces/rules";

export interface AiStep {
  command: GameCommand;
  newState: GameState;
  events: GameEvent[];
  /** True when the AI's own choice failed and a progression move replaced it. */
  fellBack: boolean;
}

/**
 * The AI's intent if the engine accepts it, otherwise the first accepted
 * progression move (the same list the server uses). Null only if nothing at
 * all is legal for `actor`.
 */
export function resolveAiStep(
  engine: RulesEngine,
  state: GameState,
  actor: PlayerId,
  intent: CommandIntent | null,
  envelope: (intent: CommandIntent) => GameCommand,
): AiStep | null {
  const candidates = [...(intent ? [intent] : []), ...fallbackIntents(engine.ctx, state, actor)];
  for (const candidate of candidates) {
    const command = envelope(candidate);
    const r = engine.applyCommand(state, command);
    if (r.accepted && r.newState) return { command, newState: r.newState, events: r.events, fellBack: candidate !== intent };
  }
  return null;
}

// ------------------------------------------------------------------ pacing

/** How much of a beat an AI step deserves before it is shown. */
export enum AiPace {
  /** Nothing on the table changes (ending a phase, an empty assignment). */
  Quiet = "quiet",
  /** The turn passes to the next seat. */
  Handover = "handover",
  /** Something the players should see happen. */
  Visible = "visible",
}

/** Beat before a visible AI step at normal animation speed. */
const VISIBLE_BEAT_MS = 550;
/** Beat when animations are off: just enough to register the change. */
const MIN_BEAT_MS = 120;

export function aiStepPace(step: Pick<AiStep, "command" | "events">): AiPace {
  const { command, events } = step;
  switch (command.type) {
    case "end_main_phase":
    case "resolve_prophecy":
      return AiPace.Quiet;
    case "pass_reaction":
      // Passing may resolve the Spell it answered, which is visible.
      return events.every((e) => e.type === "reaction_passed" || e.type === "phase_changed") ? AiPace.Quiet : AiPace.Visible;
    case "assign_banners":
      return events.some((e) => e.type === "banner_assigned") ? AiPace.Visible : AiPace.Quiet;
    case "end_turn":
      return events.some((e) => e.type === "game_won") ? AiPace.Visible : AiPace.Handover;
    default:
      return AiPace.Visible;
  }
}

/**
 * Milliseconds to wait before showing a step, given the animation scale
 * (0 when animations are off). Quiet steps never wait.
 */
export function aiPaceDelayMs(pace: AiPace, animationScale: number): number {
  if (pace === AiPace.Quiet) return 0;
  if (animationScale === 0) return pace === AiPace.Visible ? MIN_BEAT_MS : 0;
  const beat = VISIBLE_BEAT_MS * animationScale;
  return Math.round(pace === AiPace.Visible ? beat : beat / 2);
}
