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
/** A Sealed Charge definition id (§27A), e.g. "merchant_venturer". */
export type ChargeId = string;

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

/** Every card effect the engine implements (content tests check each is used). */
export const CARD_EFFECT_IDS = [
  "wizard_interference",
  "counterspell",
  "knight_errant",
  "druids_blessing",
  "teleportation_mishap",
  "bribe_the_troll",
  "arcane_exchange",
  "festival_at_the_inn",
  "very_minor_prophecy",
  "fog_of_confusion",
  "dragon_whisperer",
  "changeling",
  "ragnarok",
  "fire_bolt",
  "dragons_landing",
  "transmutation_magic",
  "the_plague",
  "royal_insurance_policy",
  "robin_of_the_glade",
  "unreliable_bard",
  "treasure_hunter",
  "disgrace",
  "siege_engines",
  "raiders",
  "stolen_glory",
  "siege_fireball",
  "sabotage",
  "the_dowager",
] as const;
export type CardEffectId = (typeof CARD_EFFECT_IDS)[number];

/** The subset of a card definition the rules engine needs. */
export interface CardRulesDefinition {
  id: CardDefId;
  type: CardType;
  timing: CardTiming[];
  effectId: CardEffectId;
  copies: number;
  /** Menace that must be active for the card to be playable. */
  requiresMenace?: MenaceType;
  /** Needs two active Menaces that stand on the same kind of place (Teleportation Mishap, §19.5). */
  requiresMenacePair?: true;
  /**
   * Kept out of the draw pile at setup and shuffled in only once the endgame
   * is foretold: a player comes within `BALANCE.ragnarok.omenGap` Renown of
   * victory (Ragnarök, §19.13).
   */
  setAside?: true;
}

/** Every Quest condition the engine implements (content tests check each is used). */
export const QUEST_CONDITION_IDS = [
  "kings_highway",
  "friend_of_the_forest",
  "monster_problems",
  "grand_tour",
  "master_builder",
  "diverse_realm",
  "patron_of_heroes",
  "arcane_scholar",
  "stone_and_timber",
  "prosperous_estates",
  "far_reaches",
  "the_safer_road",
] as const;
export type QuestConditionId = (typeof QUEST_CONDITION_IDS)[number];

export interface QuestRulesDefinition {
  id: QuestId;
  renown: number;
  conditionId: QuestConditionId;
  exclusive: boolean;
}

/** The deeds a Sealed Charge can ask for, counted from when it was drawn (§27A). */
export const CHARGE_DEEDS = ["writs", "trades", "cards_bought"] as const;
export type ChargeDeed = (typeof CHARGE_DEEDS)[number];

/** What a Sealed Charge asks for (§27A): typed code keyed by `kind`, with the numbers from content. */
export type ChargeGoal =
  /** The player's network reaches the landmark, and one of their Banners is in a Region touching its Site. */
  | { kind: "landmark"; landmarkId: LandmarkId }
  /** Banners in `count` different Regions of `resource` at the same time. */
  | { kind: "banners"; resource: ResourceType; count: number }
  /** `count` of the deed since the Charge was drawn. */
  | { kind: "deed"; deed: ChargeDeed; count: number }
  /** Move the Menace `count` times since the Charge was drawn. */
  | { kind: "menace"; menaceType: MenaceType; count: number };

export interface ChargeRulesDefinition {
  id: ChargeId;
  goal: ChargeGoal;
}

/** Everything content-specific the engine is parameterised with. */
export interface RulesContent {
  board: BoardTopology;
  cards: CardRulesDefinition[];
  quests: QuestRulesDefinition[];
  /** The Sealed Charge deck (§27A). Absent: no Charge can be dealt. */
  charges?: ChargeRulesDefinition[];
}

// ------------------------------------------------------------------ config

/** What the Crown can favour in a round (the Crown's Voice, spec §129.10). */
export const CROWNS_VIRTUES = ["might", "roads", "plenty"] as const;
export type CrownsVirtue = (typeof CROWNS_VIRTUES)[number];

/** When the Crown's Voice first speaks (§129.10). */
export const CROWNS_VOICE_STARTS = ["first_round", "quest_deck_empty"] as const;
export type CrownsVoiceStart = (typeof CROWNS_VOICE_STARTS)[number];

/** The Crown's Voice settings (experimental, §129.10). */
export interface CrownsVoiceRules {
  /** Favour in the Crown's purse when the game begins. */
  purse: number;
  /**
   * `first_round`: the Voice speaks at the end of every round.
   * `quest_deck_empty`: at the end of every round from the first that
   * begins with the Quest deck empty.
   */
  from: CrownsVoiceStart;
}

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
   * the same number of turns (a first-player-advantage lever, spec §129.4,
   * §129.12). Off by default: §7 ends the game at the end of that player's
   * turn; the two-player Standard and async rules set it.
   */
  equalTurns?: boolean;
  /**
   * Extra resources granted when play begins, by position in turn order
   * (index 0 = first player). A first-player-advantage lever (spec §129.4);
   * the three-player rulesets set it (§129.12).
   */
  seatBonus?: ResourceCost[];
  /**
   * Quest expiry (§27.2, on in the Standard rules): a revealed Quest nobody
   * claims for this many rounds is swapped with the top of the Quest deck at
   * the start of a round. Absent or 0: Quests stay until claimed.
   */
  questExpiryRounds?: number;
  /** Cards dealt to each player after setup. Absent/0 preserves older games. */
  initialCards?: number;
  /** Deal one card to every player at multiples of this round. Absent/0 disables it. */
  cardDrawEveryRounds?: number;
  /**
   * A round that ends on a full board ends the game, and the most Renown wins
   * (§7, `isBoardFull`). Absent in games created before ruleset 0.7.0, which
   * play on.
   */
  endOnFullBoard?: boolean;
  /**
   * The game ends when this round ends at the latest, and the most Renown
   * wins (§7). Absent or 0 in games created before ruleset 0.8.0, which play
   * on. Otherwise 3 or more, so that both rounds that announce the end
   * (`reign_ending`) begin after setup.
   */
  lastRound?: number;
  /**
   * The Crown's Levy (§27.3): once the Quest deck runs out, each round names
   * a resource that anyone may pay for Renown. Absent in games created before
   * ruleset 0.9.0 and in the Core rules, which never hear of it.
   */
  crownLevy?: CrownLevyRules;
  /**
   * Sealed Charges (§27A): each player keeps a hidden personal goal, revealed
   * and scored at their End Turn once met. A lobby option from ruleset
   * 0.9.0; absent or false, nobody holds a Charge.
   */
  sealedCharges?: boolean;
  /**
   * The Crown's Voice (experimental, §129.10): at the end of each round rival
   * Holdings that touch the same Region contest the virtue the Crown favours,
   * for Favour that counts as Renown. Absent: off, as in every game created
   * before ruleset 0.9.0. Local games only.
   */
  crownsVoice?: CrownsVoiceRules;
}

/** How the Crown's Levy runs in a game (§27.3). */
export interface CrownLevyRules {
  /** Resources of the named kind an answer pays to the supply. */
  price: number;
  /** Renown an answer gains. */
  renown: number;
  /**
   * The first Levy is proclaimed as this round begins, for the round after,
   * if the Quest deck has not run out before.
   */
  proclaimByRound: number;
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
  /**
   * Built by The Dowager (§19.28) next to its owner's Holdings, closer than
   * the spacing rule allows. Absent on every other Holding.
   */
  dowerHouse?: true;
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
  /** Moves of each Menace type by this player, kept only with Sealed Charges (§27A). */
  menaceMoves?: Partial<Record<MenaceType, number>>;
}

/** A player's unrevealed Charge (§27A). Rivals see only that one is held. */
export interface SealedCharge {
  id: ChargeId;
  /**
   * A deed or Menace Charge: the player's count of it when the Charge was
   * drawn, since the goal counts only what comes after.
   */
  since?: number;
}

export interface PlayerState {
  id: PlayerId;
  seat: number;
  displayName: string;
  resources: Resources;
  hand: CardId[];
  bonusRenown: number;
  /**
   * Renown lost for the rest of the game (Disgrace, Stolen Glory), taken off
   * the total. Never more than keeps the total at 0 or above. Absent in older
   * saves and until the first loss.
   */
  lostRenown?: number;
  /** Renown from answering the Crown's Levy (§27.3), kept for the game. Absent until the first answer. */
  levyRenown?: number;
  /** Favour won through the Crown's Voice (§129.10); counts as Renown. Absent until first won or lost. */
  favour?: number;
  holdingIds: HoldingId[];
  routeIds: RouteId[];
  claimedQuestIds: QuestId[];
  /** Charter cards kept face up in front of the player (§18.1). Absent in older saves. */
  charters?: CardId[];
  /** Sealed Charges (§27A): the Charge the player holds face down, if any. */
  sealedCharge?: SealedCharge;
  /** Sealed Charges met and revealed, in order; each is worth `BALANCE.sealedCharges.renown`. */
  revealedChargeIds?: ChargeId[];
  /** The player has used their one Recommission (§27A). */
  recommissioned?: boolean;
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
  | { kind: "druids_blessing"; bannerId: BannerId; sourcePlayerId: PlayerId }
  /** The Plague: the Banner produces nothing at its owner's next Harvest. */
  | { kind: "sick"; bannerId: BannerId; sourcePlayerId: PlayerId }
  /** Fire Bolt: only the burned Route's former owner may rebuild it until the end of their next turn. */
  | { kind: "smouldering"; routeId: RouteId; ownerId: PlayerId; sourcePlayerId: PlayerId }
  /**
   * Raiders: only the burned Manor's owner may build on the Site, or next to
   * it, until the end of their next turn.
   */
  | {
      kind: "razed";
      siteId: SiteId;
      ownerId: PlayerId;
      sourcePlayerId: PlayerId;
      /** The burned Manor was a Dower House (§19.28): its owner's rebuild there is one again. */
      dowerHouse?: true;
      /**
       * The burned Manor was a Dower House or stood beside one of its
       * owner's Holdings (§19.28): the owner's rebuild there waives the
       * spacing rule toward their own Holdings.
       */
      besideOwnHoldings?: true;
    };

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
    }
  | {
      /** Sealed Charges (§27A): keep one of the Charges drawn; the rest go to the bottom of the deck. */
      kind: "charge";
      playerId: PlayerId;
      /** The Charges drawn (hidden from others). */
      chargeIds: ChargeId[];
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
  | { effect: "dragon_whisperer"; destination: MenaceLocation; take?: ResourceType }
  | { effect: "changeling"; opponentId: PlayerId }
  | { effect: "ragnarok" }
  | { effect: "fire_bolt"; routeId: RouteId }
  | { effect: "dragons_landing" }
  | { effect: "transmutation_magic"; give: [ResourceType, ResourceType]; receive: [ResourceType, ResourceType] }
  | { effect: "the_plague"; siteId: SiteId }
  | { effect: "royal_insurance_policy" }
  | { effect: "robin_of_the_glade"; resource: ResourceType }
  | { effect: "unreliable_bard" }
  | { effect: "treasure_hunter"; take: ResourceType; destination: MenaceLocation }
  | { effect: "disgrace"; opponentId: PlayerId }
  | { effect: "siege_engines"; siteId: SiteId }
  | { effect: "raiders"; siteId: SiteId }
  | { effect: "stolen_glory"; opponentId: PlayerId }
  | { effect: "siege_fireball"; siteId: SiteId }
  | { effect: "sabotage"; opponentId: PlayerId }
  /** The Manor's toll and surcharge, when due, as for `build_manor`. */
  | { effect: "the_dowager"; siteId: SiteId; tollPayment?: ResourceType; extraPayment?: ResourceType };

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
  /** Face-up cards waiting outside the draw pile for the endgame omen (see CardRulesDefinition.setAside). */
  setAsideCardIds?: CardId[];

  questDeck: QuestId[];
  revealedQuestIds: QuestId[];
  /** Sealed Charges (§27A): the face-down Charge deck, top first. Absent when the option is off. */
  chargeDeck?: ChargeId[];
  /** First round each revealed Quest can be claimed in (§27.2); kept only when `ruleset.questExpiryRounds` is on. */
  revealedQuestRounds?: Record<QuestId, number>;

  activeEffects: ActiveEffect[];
  /** Sites a Siege Fireball left in ruins: nobody may build on them again. Absent in older saves. */
  ruinedSiteIds?: SiteId[];
  /** The Crown's Levy (§27.3), public; absent until the first Levy is proclaimed. */
  crownLevy?: CrownLevyState;
  pending?: PendingDecision;
  nextIds: { holding: number; banner: number };
  winnerId?: PlayerId;
  /** How a finished game ended, when not by reaching the target (§7). */
  endCause?: GameEndCause;
  /** equalTurns: the target has been reached; the game ends with this round. */
  endTriggered?: boolean;
  /** The Crown's Voice (§129.10), present when `ruleset.crownsVoice` is on. All of it is public. */
  crownsVoice?: CrownsVoiceState;
}

export interface CrownsVoiceState {
  /** The virtue the Crown favours when this round ends. */
  current: CrownsVirtue;
  /** The virtue it favours next, on show one round ahead. */
  next: CrownsVirtue;
  /**
   * Cards left in the Voice deck, by virtue. Each card is drawn from these
   * with the match RNG as it is turned: the odds of a shuffled deck, with no
   * hidden order kept in the state.
   */
  deck: Record<CrownsVirtue, number>;
  /** Favour left in the Crown's purse. */
  purse: number;
  /** Banners that produced resources at their owner's Harvest this round (Plenty). */
  harvested: BannerId[];
  /**
   * Whether the Voice speaks as this round ends. Set when the game is created
   * or as a round begins, never mid-round, so every seat knows it a round
   * ahead; once set it stays set.
   */
  speaking: boolean;
}

/** The Levies proclaimed so far (§27.3). Both this round's and the next round's are public. */
export interface CrownLevyState {
  /** The resource this round's Levy names; null in the round the first Levy is proclaimed. */
  current: ResourceType | null;
  /** The resource the next round's Levy names. */
  next: ResourceType;
  /**
   * The resources called in the current cycle, oldest first, `next` last. The
   * Crown calls each of the five once before it calls any of them again.
   */
  called: ResourceType[];
  /** Players who have answered this round's Levy, in the order they did. */
  answeredBy: PlayerId[];
}

/**
 * How a game can end before anyone reaches the target (§7): Ragnarök, a round
 * that ends on a full board, or the end of the last round.
 */
export type GameEndCause = "ragnarok" | "full_board" | "last_round";

export type RngState = [number, number, number, number];
