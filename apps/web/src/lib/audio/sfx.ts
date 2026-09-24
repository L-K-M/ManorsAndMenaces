// Synthesized sound effects and light ambient music (spec §51). Everything is
// generated with WebAudio, so there are no audio assets to ship. Every cue has
// a text equivalent in the game log (spec §52).

import type { GameEvent } from "@manors-menaces/rules";
import { settings } from "../stores/settings.svelte.js";

type Cue = "resource" | "banner" | "route" | "manor" | "spell" | "menace" | "card" | "quest" | "turn" | "error" | "win" | "writ";

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "triangle", gain = 0.08): void {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = a.currentTime + start;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const CUES: Record<Cue, () => void> = {
  resource: () => tone(880, 0, 0.12, "sine", 0.05),
  banner: () => (tone(523, 0, 0.1), tone(659, 0.06, 0.14)),
  route: () => (tone(196, 0, 0.12, "square", 0.03), tone(247, 0.08, 0.12, "square", 0.03)),
  manor: () => (tone(392, 0, 0.18), tone(523, 0.1, 0.22)),
  spell: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.05, 0.25, "sine", 0.04)),
  menace: () => (tone(110, 0, 0.35, "sawtooth", 0.05), tone(98, 0.12, 0.35, "sawtooth", 0.04)),
  card: () => tone(1320, 0, 0.06, "square", 0.02),
  quest: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.3)),
  turn: () => (tone(440, 0, 0.12, "sine", 0.04), tone(660, 0.1, 0.16, "sine", 0.04)),
  error: () => tone(160, 0, 0.18, "square", 0.03),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.12, 0.5)),
  writ: () => (tone(330, 0, 0.1, "square", 0.03), tone(262, 0.08, 0.2, "triangle")),
};

export function play(cue: Cue): void {
  if (!settings.sound) return;
  try {
    CUES[cue]();
  } catch {
    // Audio is best-effort.
  }
}

/** Pick at most one cue per event batch so sounds do not pile up. */
export function playForEvents(events: GameEvent[]): void {
  const types = new Set(events.map((e) => e.type));
  if (types.has("game_won")) return play("win");
  if (types.has("quest_claimed")) return play("quest");
  if (types.has("royal_writ_issued")) return play("writ");
  if (types.has("menace_moved")) return play("menace");
  if (types.has("card_played")) return play("spell");
  if (types.has("holding_built") || types.has("holding_upgraded")) return play("manor");
  if (types.has("route_built")) return play("route");
  if (types.has("card_bought")) return play("card");
  if (types.has("banner_assigned")) return play("banner");
  if (types.has("turn_started")) return play("turn");
  if (types.has("resource_gained")) return play("resource");
}

// ------------------------------------------------------------------ music

let musicTimer: ReturnType<typeof setInterval> | null = null;
const SCALE = [293.66, 329.63, 369.99, 440, 493.88, 587.33]; // D major pentatonic-ish, lute-like plucks

export function setMusic(on: boolean): void {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
  if (!on) return;
  let step = 0;
  musicTimer = setInterval(() => {
    if (!settings.music) return;
    const root = SCALE[[0, 3, 4, 2][Math.floor(step / 8) % 4] ?? 0] ?? 293.66;
    const note = SCALE[(step * 3 + (step % 5)) % SCALE.length] ?? 440;
    if (step % 4 === 0) tone(root / 2, 0, 1.4, "sine", 0.025);
    tone(note, 0, 0.6, "triangle", 0.018);
    step++;
  }, 420);
}
