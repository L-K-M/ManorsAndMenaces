import type { CardDefinition } from "./types.js";

// The 24-card prototype deck (spec §19).
const card = (
  id: string,
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
  effectId: id as CardDefinition["effectId"],
  copies,
  ...extra,
});

export const CARDS: CardDefinition[] = [
  card("wizard_interference", "spell", 3, { tags: ["banner", "interference"] }),
  card("counterspell", "spell", 2, { timing: ["reaction"], tags: ["reaction"] }),
  card("knight_errant", "hero", 3, { tags: ["menace"] }),
  card("druids_blessing", "spell", 2, { tags: ["harvest"] }),
  card("teleportation_mishap", "spell", 2, { tags: ["menace"] }),
  card("bribe_the_troll", "trick", 2, { tags: ["menace"], requiresMenace: "toll_troll" }),
  card("arcane_exchange", "spell", 2, { tags: ["economy"] }),
  card("festival_at_the_inn", "story", 2, { tags: ["economy"] }),
  card("very_minor_prophecy", "spell", 2, { tags: ["deck"] }),
  card("fog_of_confusion", "spell", 2, { tags: ["route", "interference"] }),
  card("dragon_whisperer", "hero", 2, { tags: ["menace"], requiresMenace: "young_dragon" }),
];
