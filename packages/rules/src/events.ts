import type {
  BannerId,
  CardEffectId,
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
export const HARVEST_NOTES = ["blocked_by_troll", "sick", "converted_by_witch", "taken_by_dragon", "druids_blessing"] as const;
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
  /** The Plague: `bannerIds` fall sick (their owners' insured Banners are spared). */
  | { type: "effect_started"; effect: "plague"; siteId: SiteId; bannerIds: BannerId[]; playerId: PlayerId }
  /**
   * `playerId` is the effect's source for fog and Druid's Blessing, the cured
   * owner for the Plague, and the burned Route's owner for smouldering.
   */
  | { type: "effect_expired"; effect: "fog" | "druids_blessing" | "plague" | "smouldering"; playerId: PlayerId }
  // New-card events carry everything a log line needs: destroyed entities are
  // gone from the state the log is formatted against.
  | { type: "hands_swapped"; playerId: PlayerId; opponentId: PlayerId; handSize: number; opponentHandSize: number }
  | { type: "route_burned"; byPlayerId: PlayerId; ownerId: PlayerId; routeId: RouteId }
  | { type: "dragon_landed"; byPlayerId: PlayerId; ownerId: PlayerId; holdingId: HoldingId; siteId: SiteId }
  | { type: "holding_destroyed"; byPlayerId: PlayerId; ownerId: PlayerId; holdingId: HoldingId; siteId: SiteId; bannerIds: BannerId[] }
  /** A Stronghold knocked back to a Manor; `bannerId` is the Banner it lost. */
  | { type: "holding_reduced"; byPlayerId: PlayerId; ownerId: PlayerId; holdingId: HoldingId; siteId: SiteId; bannerId: BannerId }
  | { type: "insurance_claimed"; playerId: PlayerId; cardId: CardId; against: CardEffectId }
  | { type: "renown_gained"; playerId: PlayerId; amount: number; cause: "unreliable_bard" }
  /** A set-aside card (Ragnarök) is shuffled into the draw pile. Public: the omen is announced. */
  | { type: "card_foretold"; cardId: CardId }
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
  /** `cause` is absent for the normal §7 win (reaching the target). */
  | { type: "game_won"; playerId: PlayerId; renown: number; cause?: "ragnarok" };

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
