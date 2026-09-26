import type { MenaceType, ResourceCost, RulesetConfig } from "./types.js";

// All tunable numbers live here (spec §121). Do not scatter numbers in code.
export const BALANCE = {
  // Keep four-player games shorter on the more crowded board (spec §7).
  targetRenown: { standard: 15, standardFourPlayers: 13, mvp: 10 },
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
  maxNonReactionCardsPerTurn: 1,
  revealedQuestCount: 3,
  /** Rounds an unclaimed Quest stays on offer in the Standard rules (§27.2). */
  questExpiryRounds: 4,
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
} as const;

export const RULESET_VERSION = "0.5.0";

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
};

/** §91 — MVP: no cards, no Quests, Toll Troll only, 10 Renown. */
export function mvpRuleset(): RulesetConfig {
  return {
    ...common,
    name: "mvp",
    targetRenown: BALANCE.targetRenown.mvp,
    activeMenaces: ["toll_troll"],
    enableCards: false,
    enableReactionCards: false,
    enableQuests: false,
  };
}

/** Standard game with cards, reactions and Quests. */
export function standardRuleset(playerCount: number): RulesetConfig {
  return {
    ...common,
    name: "standard",
    targetRenown: playerCount >= 4 ? BALANCE.targetRenown.standardFourPlayers : BALANCE.targetRenown.standard,
    activeMenaces: standardMenaces(playerCount),
    enableCards: true,
    enableReactionCards: true,
    enableQuests: true,
    questExpiryRounds: BALANCE.questExpiryRounds,
  };
}

/** Asynchronous online play: no reaction windows (§109). */
export function asyncRuleset(playerCount: number): RulesetConfig {
  return { ...standardRuleset(playerCount), name: "async", enableReactionCards: false };
}

/** Random Menace selection from the full pool (spec §118 "later"). */
export const ALL_MENACES: readonly MenaceType[] = ["toll_troll", "highwayman", "young_dragon", "bog_witch", "goblin_tinkers"];
