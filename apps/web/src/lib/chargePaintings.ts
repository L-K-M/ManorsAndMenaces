import { CHARGES } from "@manors-menaces/content";
import type { ChargeDeed, ChargeId, ResourceType } from "@manors-menaces/rules";

// Charges borrow the existing scene or miniature that describes their goal.
// Paths are relative to public/art; the rendering component supplies BASE_URL.
const resourceScenes: Record<ResourceType, string> = {
  grain: "quests/prosperous_estates.webp",
  timber: "quests/friend_of_the_forest.webp",
  stone: "quests/stone_and_timber.webp",
  iron: "landmarks/dwarven_hall.png",
  essence: "quests/arcane_scholar.webp",
};
const deedScenes: Record<ChargeDeed, string> = {
  writs: "cards/royal_insurance_policy.webp",
  trades: "cards/arcane_exchange.webp",
  cards_bought: "cards/very_minor_prophecy.webp",
};

export function chargePainting(id: ChargeId): string | null {
  const goal = CHARGES.find((charge) => charge.id === id)?.goal;
  if (!goal) return null;
  switch (goal.kind) {
    case "landmark": return `landmarks/${goal.landmarkId}.png`;
    case "menace": return `menaces/${goal.menaceType.replaceAll("_", "-")}.png`;
    case "banners": return resourceScenes[goal.resource];
    case "deed": return deedScenes[goal.deed];
  }
}
