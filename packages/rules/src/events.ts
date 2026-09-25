import type {
  BannerId,
  CardId,
  HoldingId,
  MenaceId,
  MenaceLocation,
  PlayerId,
  QuestId,
  RegionId,
  ResourceType,
  RouteId,
  SiteId,
  TurnPhase,
} from "./types.js";

// Events are emitted by the engine after applying a valid command (§35).
// They are serializable and describe what happened, for logs and animation.
// Hidden information (card identities) is carried only in events that the
// protocol layer filters per recipient (see views.ts: redactEvent).

/** Why a Banner's Harvest differs from its Region's plain yield (UI key `harvest.<note>`). */
export const HARVEST_NOTES = ["blocked_by_troll", "converted_by_witch", "taken_by_dragon", "druids_blessing"] as const;
export type HarvestNote = (typeof HARVEST_NOTES)[number];

export type GameEvent =
  | { type: "resource_gained"; playerId: PlayerId; resource: ResourceType; amount: number; reason: ResourceReason }
  | { type: "resource_spent"; playerId: PlayerId; resource: ResourceType; amount: number; reason: ResourceReason }
  | {
      type: "resource_transferred";
      fromPlayerId: PlayerId;
      toPlayerId: PlayerId;
      resource: ResourceType;
      amount: number;
      reason: ResourceReason;
    }
  | {
      type: "banner_harvested";
      playerId: PlayerId;
      bannerId: BannerId;
      regionId: RegionId;
      produced: ResourceType | null;
      amount: number;
      notes: HarvestNote[];
    }
  | { type: "harvest_completed"; playerId: PlayerId; total: number; byType: Partial<Record<ResourceType, number>> }
  | { type: "harvest_skipped"; playerId: PlayerId }
  | { type: "route_built"; playerId: PlayerId; routeId: RouteId; free: boolean }
  | { type: "holding_built"; playerId: PlayerId; holdingId: HoldingId; siteId: SiteId; free: boolean }
  | { type: "holding_upgraded"; playerId: PlayerId; holdingId: HoldingId; siteId: SiteId; newBannerId: BannerId }
  | { type: "banner_created"; playerId: PlayerId; bannerId: BannerId; holdingId: HoldingId }
  | {
      type: "banner_assigned";
      playerId: PlayerId;
      bannerId: BannerId;
      fromRegionId: RegionId | null;
      toRegionId: RegionId | null;
    }
  | {
      type: "banner_displaced";
      byPlayerId: PlayerId;
      ownerId: PlayerId;
      bannerId: BannerId;
      fromRegionId: RegionId;
      toRegionId: RegionId | null;
      cause: "royal_writ" | "wizard_interference";
    }
  | { type: "menace_moved"; byPlayerId: PlayerId | null; menaceId: MenaceId; from: MenaceLocation; to: MenaceLocation }
  | { type: "hoard_changed"; menaceId: MenaceId; resource: ResourceType; delta: number }
  | { type: "card_bought"; playerId: PlayerId; cardId: CardId | null }
  | { type: "deck_reshuffled"; size: number }
  | { type: "card_played"; playerId: PlayerId; cardId: CardId }
  | { type: "card_resolved"; playerId: PlayerId; cardId: CardId }
  | { type: "card_cancelled"; playerId: PlayerId; cardId: CardId; byPlayerId: PlayerId; counterCardId: CardId }
  | { type: "card_discarded"; playerId: PlayerId; cardId: CardId }
  | { type: "reaction_requested"; playerId: PlayerId; cardId: CardId }
  | { type: "reaction_passed"; playerId: PlayerId }
  | { type: "prophecy_revealed"; playerId: PlayerId; cardIds: CardId[] | null }
  | { type: "prophecy_resolved"; playerId: PlayerId }
  | { type: "effect_started"; effect: "fog"; routeId: RouteId; playerId: PlayerId }
  | { type: "effect_started"; effect: "druids_blessing"; bannerId: BannerId; playerId: PlayerId }
  | { type: "effect_expired"; effect: "fog" | "druids_blessing"; playerId: PlayerId }
  | { type: "market_traded"; playerId: PlayerId; give: ResourceType; giveAmount: number; receive: ResourceType; tradePostSiteId: SiteId | null }
  | { type: "royal_writ_issued"; playerId: PlayerId; targetBannerId: BannerId; ownerId: PlayerId }
  | { type: "warden_hired"; playerId: PlayerId; menaceId: MenaceId }
  | { type: "quest_claimed"; playerId: PlayerId; questId: QuestId; renown: number }
  | { type: "quest_revealed"; questId: QuestId }
  /** Unclaimed for `ruleset.questExpiryRounds` rounds: back to the bottom of the Quest deck. */
  | { type: "quest_expired"; questId: QuestId }
  | { type: "phase_changed"; playerId: PlayerId; phase: TurnPhase }
  | { type: "setup_step"; playerId: PlayerId; step: "place_manor" | "place_route" | "assign_banners" }
  | { type: "turn_started"; playerId: PlayerId; turnNumber: number; round: number }
  | { type: "turn_ended"; playerId: PlayerId }
  | { type: "game_started"; firstPlayerId: PlayerId; turnOrder: PlayerId[] }
  | { type: "game_won"; playerId: PlayerId; renown: number };

export type ResourceReason =
  | "harvest"
  | "starting_resources"
  | "build_route"
  | "build_manor"
  | "upgrade_holding"
  | "buy_card"
  | "market"
  | "royal_writ"
  | "warden"
  | "toll"
  | "goblin_tinkers"
  | "card_effect"
  | "discard"
  | "debug";
