import type { MenaceDefinition } from "./types.js";

// Menace definitions (spec §20–25). Behaviour is typed code in the rules package.
const menace = (type: MenaceDefinition["type"], locationType: MenaceDefinition["locationType"]): MenaceDefinition => ({
  type,
  nameKey: `menace.${type}.name`,
  locationType,
  rulesTextKey: `menace.${type}.rules`,
  flavorTextKey: `menace.${type}.flavor`,
});

export const MENACES: MenaceDefinition[] = [
  menace("toll_troll", "region"),
  menace("highwayman", "route"),
  menace("young_dragon", "region"),
  menace("bog_witch", "region"),
  menace("goblin_tinkers", "site"),
];
