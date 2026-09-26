// Recorded cues keep their text equivalents in the Chronicle. Audio is optional.
import type { GameEvent } from "@manors-menaces/rules";
import { settings } from "../stores/settings.svelte.js";
import { cueForEvents, type Cue } from "./cues.js";
import { Soundscape, type AudioPreferences } from "./soundscape.js";

let soundscape: Soundscape | null = null;

/** One app-owned audio lifecycle, including settings restored on startup. */
export function initializeAudio(): () => void {
  const player = new Soundscape(() => new AudioContext());
  soundscape = player;
  player.setPreferences(settings);
  player.setVisible(!document.hidden);
  const unlock = () => player.unlock();
  const visibility = () => player.setVisible(!document.hidden);
  document.addEventListener("pointerdown", unlock, { capture: true, passive: true });
  document.addEventListener("keydown", unlock, { capture: true });
  document.addEventListener("visibilitychange", visibility);
  return () => {
    document.removeEventListener("pointerdown", unlock, true);
    document.removeEventListener("keydown", unlock, true);
    document.removeEventListener("visibilitychange", visibility);
    player.dispose();
    if (soundscape === player) soundscape = null;
  };
}

export function configureAudio(preferences: AudioPreferences): void {
  soundscape?.setPreferences(preferences);
}

export function play(cue: Cue): void {
  void soundscape?.play(cue).catch(() => {});
}

export function playForEvents(events: GameEvent[]): void {
  const cue = cueForEvents(events);
  if (cue) play(cue);
}
