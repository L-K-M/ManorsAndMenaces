import type { CardEffectId } from "@manors-menaces/rules";
import type { CardDefinition } from "./types.js";

// The 51-card deck (spec §19): the 24-card prototype, the second wave
// (§19.12–19.21), the third wave of attacks on Renown and Grain (§19.22–19.27)
// and a Counterspell more with each wave. Each card's id is its effect id, so
// a typo fails the type check instead of producing a card with no effect.
const card = (
  id: CardEffectId,
  type: CardDefinition["type"],
  copies: number,
  extra: Partial<CardDefinition> = {},
): CardDefinition => ({
  id,
  nameKey: `card.${id}.name`,
  type,
  rulesTextKey: `card.${id}.rules`,
  flavorTextKey: `card.${id}.flavor`,
  timing: ["main"],
  tags: [],
  effectId: id,
  copies,
  ...extra,
});

export const CARDS: CardDefinition[] = [
  card("wizard_interference", "spell", 3, { tags: ["banner", "interference"] }),
  // Four copies keep Counterspell's share of the deck (3 of 40 before the
  // third wave, 4 of 51 after) as the second and third waves add hostile
  // Spells (§19.2).
  card("counterspell", "spell", 4, { timing: ["reaction"], tags: ["reaction"] }),
  card("knight_errant", "hero", 3, { tags: ["menace"] }),
  card("druids_blessing", "spell", 2, { tags: ["harvest"] }),
  card("teleportation_mishap", "spell", 2, { tags: ["menace"], requiresMenacePair: true }),
  card("bribe_the_troll", "trick", 2, { tags: ["menace"], requiresMenace: "toll_troll" }),
  card("arcane_exchange", "spell", 2, { tags: ["economy"] }),
  card("festival_at_the_inn", "story", 2, { tags: ["economy"] }),
  card("very_minor_prophecy", "spell", 2, { tags: ["deck"] }),
  card("fog_of_confusion", "spell", 2, { tags: ["route", "interference"] }),
  card("dragon_whisperer", "hero", 2, { tags: ["menace"], requiresMenace: "young_dragon" }),
  card("changeling", "spell", 1, { tags: ["hand", "interference"] }),
  card("ragnarok", "spell", 1, { tags: ["endgame"], setAside: true }),
  card("fire_bolt", "spell", 2, { tags: ["route", "interference"] }),
  card("dragons_landing", "story", 1, { tags: ["holding", "random"] }),
  card("transmutation_magic", "spell", 2, { tags: ["economy"] }),
  card("the_plague", "spell", 2, { tags: ["harvest", "interference"] }),
  card("royal_insurance_policy", "charter", 2, { tags: ["protection"] }),
  card("robin_of_the_glade", "hero", 2, { tags: ["economy", "catch_up"] }),
  card("unreliable_bard", "hero", 1, { tags: ["renown", "catch_up"] }),
  card("treasure_hunter", "hero", 1, { tags: ["menace"], requiresMenace: "young_dragon" }),
  // The third wave (§19.22–19.27): Spells that take Renown or Grain.
  card("disgrace", "spell", 2, { tags: ["renown", "interference"] }),
  card("siege_engines", "spell", 2, { tags: ["holding", "interference"] }),
  card("raiders", "spell", 2, { tags: ["holding", "interference"] }),
  card("stolen_glory", "spell", 1, { tags: ["renown", "catch_up"] }),
  card("siege_fireball", "spell", 1, { tags: ["holding", "catch_up"] }),
  card("sabotage", "spell", 2, { tags: ["economy", "interference"] }),
];
