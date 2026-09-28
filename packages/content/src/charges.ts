import type { ChargeGoal } from "@manors-menaces/rules";
import type { ChargeDefinition } from "./types.js";

// The Sealed Charge deck (spec §27A), a lobby option: hidden personal goals,
// each worth `BALANCE.sealedCharges.renown` when revealed. The landmark
// Charges are §8's major landmark objectives. Charges naming a Menace or
// landmark not in the game are left out of its deck.
const charge = (id: string, goal: ChargeGoal): ChargeDefinition => ({ id, nameKey: `charge.${id}.name`, descriptionKey: `charge.${id}.description`, goal });

export const CHARGES: ChargeDefinition[] = [
  charge("seat_at_court", { kind: "landmark", landmarkId: "royal_castle" }),
  charge("tower_patron", { kind: "landmark", landmarkId: "wizard_tower" }),
  charge("friend_of_the_inn", { kind: "landmark", landmarkId: "adventurers_inn" }),
  charge("guest_of_the_hall", { kind: "landmark", landmarkId: "dwarven_hall" }),
  charge("keeper_of_the_grove", { kind: "landmark", landmarkId: "sacred_grove" }),
  // No Timber Charge: the Friend of the Forest Quest asks for Timber Regions already.
  charge("granary_of_the_realm", { kind: "banners", resource: "grain", count: 3 }),
  charge("quarry_lord", { kind: "banners", resource: "stone", count: 3 }),
  charge("lord_of_the_mines", { kind: "banners", resource: "iron", count: 2 }),
  charge("wellspring_keeper", { kind: "banners", resource: "essence", count: 2 }),
  charge("kings_clerk", { kind: "deed", deed: "writs", count: 3 }),
  charge("merchant_venturer", { kind: "deed", deed: "trades", count: 5 }),
  charge("collector_of_tales", { kind: "deed", deed: "cards_bought", count: 3 }),
  charge("troll_herder", { kind: "menace", menaceType: "toll_troll", count: 2 }),
  charge("friend_of_outlaws", { kind: "menace", menaceType: "highwayman", count: 2 }),
  charge("dragon_tamer", { kind: "menace", menaceType: "young_dragon", count: 2 }),
  charge("witchs_errand", { kind: "menace", menaceType: "bog_witch", count: 2 }),
  charge("tinkers_patron", { kind: "menace", menaceType: "goblin_tinkers", count: 2 }),
];
