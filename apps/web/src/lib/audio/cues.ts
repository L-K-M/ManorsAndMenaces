import type { GameEvent } from "@manors-menaces/rules";

export const CUES = {
  resource: 0.75, banner: 0.7, route: 0.75, manor: 0.85, upgrade: 0.85,
  spell: 0.65, menace: 0.75, card: 0.65, quest: 0.75, turn: 0.4,
  error: 0.55, win: 0.85, writ: 0.7,
} as const;
export type Cue = keyof typeof CUES;
export const cueUrl = (cue: Cue): string => `./audio/${cue}.wav`;
export const MUSIC_URL = "./audio/old-tower-inn.mp3";

/** Pick at most one cue per event batch so sounds do not pile up. */
export function cueForEvents(events: readonly GameEvent[]): Cue | null {
  const types = new Set(events.map((e) => e.type));
  if (types.has("game_won")) return "win";
  // Calamities and the omen outrank the card that caused them.
  if (types.has("card_foretold") || types.has("dragon_landed") || types.has("route_burned")) return "menace";
  if (types.has("quest_claimed") || types.has("renown_gained")) return "quest";
  // A policy paying out is paperwork, like a Writ.
  if (types.has("royal_writ_issued") || types.has("insurance_claimed")) return "writ";
  if (types.has("menace_moved")) return "menace";
  // A Spell resolved after a reaction window arrives without its card_played.
  if (types.has("card_played") || types.has("hands_swapped") || types.has("effect_started")) return "spell";
  if (types.has("holding_upgraded")) return "upgrade";
  if (types.has("holding_built")) return "manor";
  if (types.has("route_built")) return "route";
  if (types.has("card_bought")) return "card";
  if (types.has("banner_assigned")) return "banner";
  if (types.has("turn_started")) return "turn";
  if (types.has("resource_gained") || types.has("market_traded")) return "resource";
  return null;
}
