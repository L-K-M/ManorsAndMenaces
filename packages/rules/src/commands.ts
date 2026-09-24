import type {
  BannerId,
  CardId,
  CardTarget,
  MenaceId,
  MenaceLocation,
  PlayerId,
  QuestId,
  RegionId,
  ResourceType,
  RouteId,
  SiteId,
} from "./types.js";

// Every player action is a serializable command (spec §34). The expected
// revision belongs to the submission batch, not the command (§32.1, §104).
export interface CommandBase {
  commandId: string;
  matchId: string;
  playerId: PlayerId;
}

// ----- setup
export interface PlaceInitialManorCommand extends CommandBase {
  type: "place_initial_manor";
  siteId: SiteId;
}
export interface PlaceInitialRouteCommand extends CommandBase {
  type: "place_initial_route";
  routeId: RouteId;
}
export interface AssignInitialBannersCommand extends CommandBase {
  type: "assign_initial_banners";
  assignments: Record<BannerId, RegionId | null>;
}

// ----- main phase
export interface BuildRouteCommand extends CommandBase {
  type: "build_route";
  routeId: RouteId;
  /** Required when the build relies on a Highwayman Route (§22). */
  tollPayment?: ResourceType;
}
export interface BuildManorCommand extends CommandBase {
  type: "build_manor";
  siteId: SiteId;
  /** Goblin Tinkers surcharge (§25). */
  extraPayment?: ResourceType;
  tollPayment?: ResourceType;
}
export interface UpgradeHoldingCommand extends CommandBase {
  type: "upgrade_holding";
  siteId: SiteId;
  extraPayment?: ResourceType;
}
export interface BuyCardCommand extends CommandBase {
  type: "buy_card";
}
export interface PlayCardCommand extends CommandBase {
  type: "play_card";
  cardId: CardId;
  target: CardTarget;
}
export interface TradeResourcesCommand extends CommandBase {
  type: "trade";
  give: ResourceType;
  receive: ResourceType;
  /** Trade at a Trading Post on this Site instead of the Market. */
  tradePostSiteId?: SiteId;
}
export interface IssueRoyalWritCommand extends CommandBase {
  type: "issue_royal_writ";
  targetBannerId: BannerId;
  bribe: ResourceType;
}
export interface HireWardenCommand extends CommandBase {
  type: "hire_warden";
  menaceId: MenaceId;
  destination: MenaceLocation;
}
export interface ClaimQuestCommand extends CommandBase {
  type: "claim_quest";
  questId: QuestId;
}
export interface EndMainPhaseCommand extends CommandBase {
  type: "end_main_phase";
}

// ----- banner assignment
export interface AssignBannersCommand extends CommandBase {
  type: "assign_banners";
  /** Full desired assignment for (a subset of) the player's Banners. */
  assignments: Record<BannerId, RegionId | null>;
}

// ----- end of turn
export interface DiscardCardsCommand extends CommandBase {
  type: "discard_cards";
  cardIds: CardId[];
}
export interface EndTurnCommand extends CommandBase {
  type: "end_turn";
}

// ----- pending decisions
export interface ReactCommand extends CommandBase {
  type: "react";
  cardId: CardId;
}
export interface PassReactionCommand extends CommandBase {
  type: "pass_reaction";
}
export interface ResolveProphecyCommand extends CommandBase {
  type: "resolve_prophecy";
  /** The revealed cards in the desired new order (first = top of deck). */
  order: CardId[];
}

export type GameCommand =
  | PlaceInitialManorCommand
  | PlaceInitialRouteCommand
  | AssignInitialBannersCommand
  | BuildRouteCommand
  | BuildManorCommand
  | UpgradeHoldingCommand
  | BuyCardCommand
  | PlayCardCommand
  | TradeResourcesCommand
  | IssueRoyalWritCommand
  | HireWardenCommand
  | ClaimQuestCommand
  | EndMainPhaseCommand
  | AssignBannersCommand
  | DiscardCardsCommand
  | EndTurnCommand
  | ReactCommand
  | PassReactionCommand
  | ResolveProphecyCommand;

export type GameCommandType = GameCommand["type"];

/** Distributive Omit so each union member keeps its own fields. */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A command without its envelope, as produced by UIs and the AI. */
export type CommandIntent = DistributiveOmit<GameCommand, keyof CommandBase>;

/**
 * Commands that may be undone locally before submission (spec §32).
 * Everything else locks the undo stack.
 */
export const UNDO_SAFE_COMMANDS: ReadonlySet<GameCommandType> = new Set<GameCommandType>([
  "build_route",
  "build_manor",
  "upgrade_holding",
  "trade",
  "assign_banners",
  "end_main_phase",
  "place_initial_manor",
  "place_initial_route",
]);

// Debug-only commands (§100). Production builds must reject them.
export type DebugCommand =
  | (CommandBase & { type: "debug_grant"; targetPlayerId: PlayerId; resources: Partial<Record<ResourceType, number>> })
  | (CommandBase & { type: "debug_set_bonus_renown"; targetPlayerId: PlayerId; value: number })
  | (CommandBase & { type: "debug_move_menace"; menaceId: MenaceId; destination: MenaceLocation })
  | (CommandBase & { type: "debug_draw_card"; targetPlayerId: PlayerId; cardDefId: string });
