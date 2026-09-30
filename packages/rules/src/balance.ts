import type { CrownLevyRules, CrownsVoiceRules, MenaceType, ResourceCost, RulesetConfig } from "./types.js";

// All tunable numbers live here (spec §121). Do not scatter numbers in code.
export const BALANCE = {
  // Default Renown goals. Keep four-player games shorter on the more crowded
  // board (spec §7). 20 (18 with four players) was rarely reached before the
  // board filled up (§129.6).
  targetRenown: { standard: 15, standardFourPlayers: 13, mvp: 10 },
  /** Renown goals a new game may be created with, besides its rules' default (§7). */
  targetRenownChoices: [15, 20, 25, 30],
  costs: {
    route: { timber: 1, stone: 1 },
    manor: { grain: 1, timber: 1, stone: 1 },
    stronghold: { grain: 2, iron: 2 },
    card: { grain: 1, iron: 1, essence: 1 },
    royalWrit: { essence: 1 },
    royalWritBribe: 1,
    warden: { essence: 1, grain: 1 },
    toll: 1,
    goblinSurcharge: 1,
  } satisfies Record<string, ResourceCost | number>,
  renown: { manor: 1, stronghold: 2 },
  banners: { manor: 1, stronghold: 2 },
  market: { give: 3, receive: 1, maxTradesPerTurn: 2 },
  tradePostGive: 2,
  writ: { maxPerTurn: 1, requireSettled: true, bribeToOwner: true },
  warden: { maxPerTurn: 1, guard: true },
  handLimit: 7,
  initialCards: 2,
  cardDrawEveryRounds: 3,
  maxNonReactionCardsPerTurn: 1,
  revealedQuestCount: 3,
  /** Rounds an unclaimed Quest stays on offer in the Standard rules (§27.2). */
  questExpiryRounds: 4,
  /** Every game ends after this round at the latest, and the most Renown wins (§7, §129.7). */
  lastRound: 30,
  initialManors: 2,
  prophecyCards: 3,
  /** Ragnarök is foretold once a player is this close to the target Renown (§19.13). */
  ragnarok: { omenGap: 3 },
  /** Dragon's Landing only strikes players with at least this many Holdings (§19.15). */
  dragonsLanding: { minHoldings: 3 },
  /** Most resources Treasure Hunter takes from the Hoard (§19.21). */
  treasureHunter: { take: 3 },
  /** How far behind a rival The Unreliable Bard's player must be (§19.20). */
  underdogGap: 2,
  /** Renown Disgrace takes from the leader, and Stolen Glory moves (§19.22, §19.25). */
  renownSwing: 1,
  /**
   * Raiders and Siege Fireball burn a Manor only of a player with at least
   * this many Holdings, as Dragon's Landing does: nobody drops below the two
   * Holdings everyone starts with (§19.24, §19.26).
   */
  raid: { minHoldings: 3 },
  /** Grain Sabotage burns (§19.27). */
  sabotage: { grain: 2 },
  /**
   * The Crown's Levy (§27.3): 5 of the named resource for 1 Renown, or 2 at
   * goals of 25 and more, which building alone rarely reaches before the
   * board fills (§129.6). The first Levy is proclaimed once the Quest deck
   * runs out, as round 15 begins at the latest.
   */
  crownLevy: { price: 5, renown: 1, highGoalRenown: 2, highGoal: 25, proclaimByRound: 15 },
  /** Sealed Charges, the lobby option (§27A). */
  sealedCharges: {
    /** Renown a met Charge scores when revealed, as much as a major Quest. */
    renown: 2,
    /** Charges drawn each time; the player keeps one. */
    drawn: 2,
    /** Recommission, once per game: discard your Charge and draw again. */
    recommission: { essence: 1 },
    /**
     * Charges a player may reveal over a game at these Renown goals and
     * above, one after another: after a reveal they draw again. One below 25.
     */
    perGame: [
      { fromGoal: 25, charges: 2 },
      { fromGoal: 30, charges: 3 },
    ],
  },
  /**
   * Starting supplies for the later seats, in turn order (§129.12): the
   * first seat's card-and-tempo edge showed in AI-vs-AI sweeps on drawn
   * islands (tools/simulate.ts) and these tables bring every seat under
   * the §68 limits. Only three-seat games get one: two-player Standard
   * games finish the round once the target is reached instead
   * (`equalTurns`, below), and four seats crowd the board enough that
   * none needs help.
   */
  seatBonus: {
    standard: [{}, { timber: 1 }, { timber: 1, stone: 1 }],
    mvp: [{}, { timber: 1 }, { timber: 1 }],
  },
  /** The Crown's Voice (experimental, §129.10). */
  crownsVoice: {
    /** Voice cards of each virtue in a deck. */
    cardsPerVirtue: 8,
    might: { manor: 1, stronghold: 2 },
    /** Highest Roads and Plenty scores. */
    maxRoads: 3,
    maxPlenty: 2,
    /** Most Favour a player gains in one round. */
    maxGainPerRound: 2,
    /** The settings a new game with the Voice gets, chosen by simulation (§129.10). */
    purse: 15,
    from: "quest_deck_empty",
  },
} as const;

export const RULESET_VERSION = "0.11.0";

/** The Crown's Voice as a new game gets it (§129.10). */
export function crownsVoiceRules(): CrownsVoiceRules {
  return { purse: BALANCE.crownsVoice.purse, from: BALANCE.crownsVoice.from };
}

/** Fixed Menace sets by player count (spec §118). */
export function standardMenaces(playerCount: number): MenaceType[] {
  switch (playerCount) {
    case 2:
      return ["toll_troll", "highwayman"];
    case 3:
      return ["toll_troll", "young_dragon"];
    default:
      return ["toll_troll", "young_dragon", "bog_witch"];
  }
}

const common = {
  enableTradePosts: true,
  market: { ...BALANCE.market },
  writ: { enabled: true, ...BALANCE.writ },
  warden: { enabled: true, ...BALANCE.warden },
  handLimit: BALANCE.handLimit,
  maxNonReactionCardsPerTurn: BALANCE.maxNonReactionCardsPerTurn,
  revealedQuestCount: BALANCE.revealedQuestCount,
  endOnFullBoard: true,
  lastRound: BALANCE.lastRound,
};

/** The rules a new game can be created with, by `RulesetConfig.name`. */
export type RulesetName = "standard" | "async" | "mvp";

export interface RulesetOptions {
  /**
   * The Renown needed to win: one of `targetRenownChoices()` for these rules
   * and players. Absent: the rules' default (§7).
   */
  targetRenown?: number;
  /** Deal Sealed Charges (§27A), the lobby option. Absent: off. */
  sealedCharges?: boolean;
}

/** The Renown goal a new game has unless another is chosen (§7). The Core goal does not depend on the player count. */
export function defaultTargetRenown(rules: RulesetName, playerCount: number): number {
  if (rules === "mvp") return BALANCE.targetRenown.mvp;
  return playerCount >= 4 ? BALANCE.targetRenown.standardFourPlayers : BALANCE.targetRenown.standard;
}

/** A default goal and the fixed choices, lowest first. */
function goalsAround(fallback: number): number[] {
  return [...new Set([fallback, ...BALANCE.targetRenownChoices])].sort((a, b) => a - b);
}

/** The Renown goals a new game may be created with, lowest first (§7). */
export function targetRenownChoices(rules: RulesetName, playerCount: number): number[] {
  return goalsAround(defaultTargetRenown(rules, playerCount));
}

/** Whether a new game with these rules and players may be created with this goal; for checking untrusted input. */
export function isTargetRenownChoice(rules: RulesetName, playerCount: number, target: unknown): target is number {
  return typeof target === "number" && targetRenownChoices(rules, playerCount).includes(target);
}

/**
 * The chosen goal, or the default. Entry points check untrusted input with
 * `isTargetRenownChoice()` first, so a goal not on offer here is a
 * programming error.
 */
function chosenTargetRenown(fallback: number, options: RulesetOptions): number {
  const target = options.targetRenown ?? fallback;
  const choices = goalsAround(fallback);
  if (!choices.includes(target)) throw new RangeError(`${target} Renown is not a goal these rules offer; choose one of ${choices.join(", ")}`);
  return target;
}

/** Whether a request's Sealed Charges option (§27A) is valid: absent, true or false; for checking untrusted input. */
export function isSealedChargesChoice(option: unknown): option is boolean | undefined {
  return option === undefined || typeof option === "boolean";
}

/** The option as a ruleset field: present only when on, so rulesets without it stay as they were. */
function sealedChargesOption(options: RulesetOptions): Pick<RulesetConfig, "sealedCharges"> {
  return options.sealedCharges ? { sealedCharges: true } : {};
}

/** The ruleset field, fresh copies: a ruleset must not share the constant's objects. */
function seatBonusOption(rules: "standard" | "mvp", playerCount: number): Pick<RulesetConfig, "seatBonus"> {
  if (playerCount !== 3) return {};
  return { seatBonus: BALANCE.seatBonus[rules].map((b) => ({ ...b })) };
}

/** Three-seat rulesets draw which seat opens the placement draft (§129.13). */
function setupDraftRotationOption(playerCount: number): Pick<RulesetConfig, "setupDraftRotation"> {
  return playerCount === 3 ? { setupDraftRotation: true } : {};
}

/** §91 — MVP: no cards, no Quests, Toll Troll only, 10 Renown unless another goal is chosen. */
export function mvpRuleset(playerCount = 2, options: RulesetOptions = {}): RulesetConfig {
  return {
    ...common,
    name: "mvp",
    targetRenown: chosenTargetRenown(BALANCE.targetRenown.mvp, options),
    activeMenaces: ["toll_troll"],
    enableCards: false,
    enableReactionCards: false,
    enableQuests: false,
    ...sealedChargesOption(options),
    ...seatBonusOption("mvp", playerCount),
    ...setupDraftRotationOption(playerCount),
  };
}

/** The Crown's Levy a new Standard or async game with this goal gets (§27.3). */
export function crownLevyRules(targetRenown: number): CrownLevyRules {
  const { price, renown, highGoalRenown, highGoal, proclaimByRound } = BALANCE.crownLevy;
  return { price, renown: targetRenown >= highGoal ? highGoalRenown : renown, proclaimByRound };
}

/** Standard game with cards, reactions, Quests and the Crown's Levy. */
export function standardRuleset(playerCount: number, options: RulesetOptions = {}): RulesetConfig {
  const targetRenown = chosenTargetRenown(defaultTargetRenown("standard", playerCount), options);
  return {
    ...common,
    name: "standard",
    targetRenown,
    activeMenaces: standardMenaces(playerCount),
    enableCards: true,
    enableReactionCards: true,
    enableQuests: true,
    questExpiryRounds: BALANCE.questExpiryRounds,
    initialCards: BALANCE.initialCards,
    cardDrawEveryRounds: BALANCE.cardDrawEveryRounds,
    crownLevy: crownLevyRules(targetRenown),
    // Two seats: once someone reaches the target the round still plays
    // out, so both seats see the same number of turns (§129.12).
    ...(playerCount === 2 ? { equalTurns: true } : {}),
    ...seatBonusOption("standard", playerCount),
    ...setupDraftRotationOption(playerCount),
    ...sealedChargesOption(options),
  };
}

/** Asynchronous online play: no reaction windows (§109). Offers the Standard goals. */
export function asyncRuleset(playerCount: number, options: RulesetOptions = {}): RulesetConfig {
  return { ...standardRuleset(playerCount, options), name: "async", enableReactionCards: false };
}

/** Random Menace selection from the full pool (spec §118 "later"). */
export const ALL_MENACES: readonly MenaceType[] = ["toll_troll", "highwayman", "young_dragon", "bog_witch", "goblin_tinkers"];
