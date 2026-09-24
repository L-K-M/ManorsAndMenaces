// Core domain types for the Manors & Menaces rules engine.
// Framework-free: no DOM, Svelte, SVG, Tauri or server imports (spec §33).

export type PlayerId = string;
export type SiteId = string;
export type RegionId = string;
export type RouteId = string;
export type HoldingId = string;
export type BannerId = string;
export type MenaceId = string;
export type LandmarkId = string;
/** A physical card copy, e.g. "wizard_interference#2". */
export type CardId = string;
/** A card definition id, e.g. "wizard_interference". */
export type CardDefId = string;
export type QuestId = string;

export const RESOURCE_TYPES = ["grain", "timber", "stone", "iron", "essence"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];
export type Resources = Record<ResourceType, number>;
export type ResourceCost = Partial<Record<ResourceType, number>>;

export type TurnPhase = "harvest" | "main" | "banner_assignment" | "end";

export type MenaceType = "toll_troll" | "highwayman" | "young_dragon" | "bog_witch" | "goblin_tinkers";

export type MenaceLocation =
  | { kind: "region"; regionId: RegionId }
  | { kind: "route"; routeId: RouteId }
  | { kind: "site"; siteId: SiteId };

// ------------------------------------------------------------------ board

/** Rules-relevant board topology. Contains no geometry (spec §103). */
export interface BoardTopology {
  id: string;
  sites: SiteTopology[];
  routes: RouteTopology[];
  regions: RegionTopology[];
  landmarks: { id: LandmarkId; siteId: SiteId }[];
  menaceStarts: { menaceType: MenaceType; location: MenaceLocation }[];
  questParams: { kingsHighway: [SiteId, SiteId] };
}

export interface TradePost {
  resource: ResourceType;
  give: number;
}

export interface SiteTopology {
  id: SiteId;
  adjacentRegionIds: RegionId[];
  landmarkId?: LandmarkId;
  tradePost?: TradePost;
}

export interface RouteTopology {
  id: RouteId;
  siteA: SiteId;
  siteB: SiteId;
  kind: "road" | "bridge" | "trail" | "pass";
}

export interface RegionTopology {
  id: RegionId;
  resource: ResourceType;
  capacity: number;
  adjacentSiteIds: SiteId[];
}

// ------------------------------------------------------------------ content

export type CardType = "spell" | "hero" | "trick" | "charter" | "story";
export type CardTiming = "main" | "reaction";

export type CardEffectId =
  | "wizard_interference"
  | "counterspell"
  | "knight_errant"
  | "druids_blessing"
  | "teleportation_mishap"
  | "bribe_the_troll"
  | "arcane_exchange"
  | "festival_at_the_inn"
  | "very_minor_prophecy"
  | "fog_of_confusion"
  | "dragon_whisperer";

/** The subset of a card definition the rules engine needs. */
export interface CardRulesDefinition {
  id: CardDefId;
  type: CardType;
  timing: CardTiming[];
  effectId: CardEffectId;
  copies: number;
  /** Menace that must be active for the card to be playable. */
  requiresMenace?: MenaceType;
}

export type QuestConditionId =
  | "kings_highway"
  | "friend_of_the_forest"
  | "monster_problems"
  | "grand_tour"
  | "master_builder"
  | "diverse_realm"
  | "patron_of_heroes"
  | "arcane_scholar"
  | "stone_and_timber"
  | "prosperous_estates"
  | "far_reaches"
  | "the_safer_road";

export interface QuestRulesDefinition {
  id: QuestId;
  renown: number;
  conditionId: QuestConditionId;
  exclusive: boolean;
}

/** Everything content-specific the engine is parameterised with. */
export interface RulesContent {
  board: BoardTopology;
  cards: CardRulesDefinition[];
  quests: QuestRulesDefinition[];
}

// ------------------------------------------------------------------ config

export interface RulesetConfig {
  name: string;
  targetRenown: number;
  activeMenaces: MenaceType[];
  enableCards: boolean;
  enableReactionCards: boolean;
  enableQuests: boolean;
  enableTradePosts: boolean;
  market: { give: number; receive: number; maxTradesPerTurn: number };
  writ: { enabled: boolean; requireSettled: boolean; bribeToOwner: boolean; maxPerTurn: number };
  warden: { enabled: boolean; maxPerTurn: number; guard: boolean };
  handLimit: number;
  maxNonReactionCardsPerTurn: number;
  revealedQuestCount: number;
  /**
   * When someone reaches the target, finish the round so every player has had
   * the same number of turns (a first-player-advantage lever, spec §129.4).
   * Off by default: §7 ends the game at the end of that player's turn.
   */
  equalTurns?: boolean;
}

export interface PlayerConfig {
  id: PlayerId;
  displayName: string;
}

export interface GameConfig {
  matchId: string;
  seed: string;
  rulesetVersion: string;
  ruleset: RulesetConfig;
  /** In seat order. The first player is chosen at random from these. */
  players: PlayerConfig[];
}

// ------------------------------------------------------------------ state

export interface Holding {
  id: HoldingId;
  siteId: SiteId;
  ownerId: PlayerId;
  type: "manor" | "stronghold";
}

export interface Banner {
  id: BannerId;
  ownerId: PlayerId;
  holdingId: HoldingId;
  regionId: RegionId | null;
  /** §14.6 — has been through at least one owner Harvest in its current Region. */
  settled: boolean;
}

export interface DragonState {
  hoard: Partial<Record<ResourceType, number>>;
}

export interface MenaceInstance {
  id: MenaceId;
  type: MenaceType;
  location: MenaceLocation;
  state: {
    hoard?: Partial<Record<ResourceType, number>>;
    /** §26.1: moved by this player's Warden; other Wardens cannot move it until that player's next turn. */
    guardedBy?: PlayerId;
  };
}

export interface PlayerStats {
  menacesMoved: number;
  heroesPlayed: number;
  spellsPlayed: number;
  resourcesHarvestedTotal: number;
  maxSingleHarvest: number;
  /** Most distinct resource types gained in a single Harvest (Diverse Realm). */
  maxHarvestTypes: number;
  menacesMovedOffOwnAssets: number;
  writsIssued: number;
  writsReceived: number;
  marketTrades: number;
  cardsBought: number;
}

export interface PlayerState {
  id: PlayerId;
  seat: number;
  displayName: string;
  resources: Resources;
  hand: CardId[];
  bonusRenown: number;
  holdingIds: HoldingId[];
  routeIds: RouteId[];
  claimedQuestIds: QuestId[];
  stats: PlayerStats;
  marketTradesThisTurn: number;
  nonReactionCardsPlayedThisTurn: number;
  writsIssuedThisTurn: number;
  wardensHiredThisTurn: number;
  firstHarvestSkipped: boolean;
}

export interface SetupProgress {
  placementOrder: PlayerId[];
  placementIndex: number;
  step: "place_manor" | "place_route" | "assign_banners";
  /** Holding placed at the current placement step (the free Route must touch it). */
  lastPlacedSiteId: SiteId | null;
  bannerAssignmentOrder: PlayerId[];
  bannerAssignmentIndex: number;
}

export type ActiveEffect =
  | { kind: "fog"; routeId: RouteId; sourcePlayerId: PlayerId }
  | { kind: "druids_blessing"; bannerId: BannerId; sourcePlayerId: PlayerId };

/** A decision the game is waiting on before normal play resumes (§109). */
export type PendingDecision =
  | {
      kind: "reaction";
      /** The card awaiting resolution. */
      cardId: CardId;
      sourcePlayerId: PlayerId;
      target: CardTarget;
      /** Players still to decide, in order. The first one is being asked now. */
      eligiblePlayerIds: PlayerId[];
    }
  | {
      kind: "prophecy";
      playerId: PlayerId;
      /** Top cards of the deck, in current order (hidden from others). */
      cardIds: CardId[];
    };

/** Card target payloads, discriminated by the card's effect. */
export type CardTarget =
  | { effect: "wizard_interference"; bannerId: BannerId; regionId: RegionId }
  | { effect: "knight_errant"; menaceId: MenaceId; destination: MenaceLocation }
  | { effect: "druids_blessing"; bannerId: BannerId }
  | { effect: "teleportation_mishap"; menaceIdA: MenaceId; menaceIdB: MenaceId }
  | { effect: "bribe_the_troll"; destination: MenaceLocation }
  | { effect: "arcane_exchange"; give: ResourceType; receive: ResourceType }
  | { effect: "festival_at_the_inn"; choice: ResourceType }
  | { effect: "very_minor_prophecy" }
  | { effect: "fog_of_confusion"; routeId: RouteId }
  | { effect: "dragon_whisperer"; destination: MenaceLocation; take?: ResourceType };

export interface GameState {
  revision: number;
  matchId: string;
  rulesetVersion: string;
  ruleset: RulesetConfig;
  seed: string;
  rngState: RngState;

  status: "setup" | "playing" | "finished";
  setup?: SetupProgress;
  round: number;
  turnNumber: number;
  turnOrder: PlayerId[];
  activePlayerId: PlayerId;
  phase: TurnPhase;

  holdings: Record<HoldingId, Holding>;
  /** Route ownership: routeId -> owner. Unowned routes are absent. */
  routeOwners: Record<RouteId, PlayerId>;
  players: Record<PlayerId, PlayerState>;
  banners: Record<BannerId, Banner>;
  menaces: Record<MenaceId, MenaceInstance>;

  cardDeck: CardId[];
  discardPile: CardId[];

  questDeck: QuestId[];
  revealedQuestIds: QuestId[];

  activeEffects: ActiveEffect[];
  pending?: PendingDecision;
  nextIds: { holding: number; banner: number };
  winnerId?: PlayerId;
  /** equalTurns: the target has been reached; the game ends with this round. */
  endTriggered?: boolean;
}

export type RngState = [number, number, number, number];
