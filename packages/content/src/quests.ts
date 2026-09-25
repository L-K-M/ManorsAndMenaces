import type { QuestConditionId } from "@manors-menaces/rules";
import type { QuestDefinition } from "./types.js";

// Prototype Royal Quests (spec §27.1). Each Quest's id is its condition id,
// so a typo fails the type check.
const quest = (id: QuestConditionId, renown: number): QuestDefinition => ({
  id,
  nameKey: `quest.${id}.name`,
  renown,
  descriptionKey: `quest.${id}.description`,
  conditionId: id,
  exclusive: true,
});

export const QUESTS: QuestDefinition[] = [
  quest("kings_highway", 2),
  quest("friend_of_the_forest", 1),
  quest("monster_problems", 1),
  quest("grand_tour", 2),
  quest("master_builder", 2),
  quest("diverse_realm", 1),
  quest("patron_of_heroes", 1),
  quest("arcane_scholar", 1),
  quest("stone_and_timber", 1),
  quest("prosperous_estates", 1),
  quest("far_reaches", 2),
  quest("the_safer_road", 1),
];
