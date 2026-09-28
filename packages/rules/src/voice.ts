// The Crown's Voice (experimental, spec §129.10), after La Città's Voice of the
// People. Each round the Crown favours a virtue. When the round ends, every
// pair of rival neighbours (two players' Holdings that touch the same Region)
// compares its scores in that virtue, and the higher wins its owner 1 Favour:
// from the rival's Favour while they have any, otherwise from the Crown's
// purse. Favour counts as Renown. Everything here is public (§83).

import { BALANCE } from "./balance.js";
import { keepRenownFloor } from "./cards.js";
import type { RulesContext } from "./context.js";
import type { FavourSource } from "./events.js";
import { compareIds } from "./ids.js";
import type { GameRng } from "./rng.js";
import type { Tx } from "./tx.js";
import {
  CROWNS_VIRTUES,
  CROWNS_VOICE_STARTS,
  type CrownsVirtue,
  type CrownsVoiceRules,
  type CrownsVoiceState,
  type GameState,
  type Holding,
  type PlayerId,
  type QuestId,
  type SiteId,
} from "./types.js";

// ------------------------------------------------------------------ selectors

/** A Holding's score in a virtue, 0 to 3 (§129.10). */
export function virtueScore(ctx: RulesContext, state: GameState, holding: Holding, virtue: CrownsVirtue): number {
  const rules = BALANCE.crownsVoice;
  switch (virtue) {
    case "might":
      return rules.might[holding.type];
    case "roads": {
      const routes = ctx.board.routesAt(holding.siteId).filter((r) => state.routeOwners[r.id] === holding.ownerId).length;
      return Math.min(rules.maxRoads, routes);
    }
    case "plenty": {
      const harvested = (state.crownsVoice?.harvested ?? []).filter((id) => state.banners[id]?.holdingId === holding.id).length;
      return Math.min(rules.maxPlenty, harvested);
    }
  }
}

/**
 * Rival neighbours: pairs of Holdings of different players that touch the
 * same Region, each pair once, in the order the Voice resolves them. That is
 * the order the Holdings were built: by the older Holding of each pair, then
 * by the younger.
 */
export function getRivalNeighbours(ctx: RulesContext, state: GameState): [Holding, Holding][] {
  const holdings = Object.values(state.holdings).sort((a, b) => compareIds(a.id, b.id));
  const regions = new Map(holdings.map((h) => [h.id, ctx.board.site(h.siteId).adjacentRegionIds]));
  const pairs: [Holding, Holding][] = [];
  holdings.forEach((a, i) => {
    const touched = regions.get(a.id) ?? [];
    for (const b of holdings.slice(i + 1)) {
      if (a.ownerId !== b.ownerId && (regions.get(b.id) ?? []).some((r) => touched.includes(r))) pairs.push([a, b]);
    }
  });
  return pairs;
}

/**
 * When the Voice speaks (§129.10): `speaking` as this round ends;
 * `from_next_round` when the Quest deck ran out during this round, so that
 * every seat gets a round's warning; `waiting` while Quests remain.
 */
export type VoiceStatus = "speaking" | "from_next_round" | "waiting";

/** The Voice's status, or null in a game without it. */
export function getVoiceStatus(state: GameState): VoiceStatus | null {
  const voice = state.crownsVoice;
  if (!voice) return null;
  if (voice.speaking) return "speaking";
  return state.questDeck.length === 0 ? "from_next_round" : "waiting";
}

/** Whether the Voice speaks when this round ends (§129.10). */
export function isVoiceSpeaking(state: GameState): boolean {
  return getVoiceStatus(state) === "speaking";
}

/** One Favour the Voice awards: `playerId`'s Holding on `siteId` beat `rivalId`'s on `rivalSiteId`. */
export interface FavourAward {
  playerId: PlayerId;
  rivalId: PlayerId;
  source: FavourSource;
  siteId: SiteId;
  rivalSiteId: SiteId;
  score: number;
  rivalScore: number;
}

/**
 * The Favour the Voice would award if the round ended now, in the order the
 * pairs resolve (see getRivalNeighbours). Each pair is settled against the
 * Favour and purse the pairs before it left: a tie moves nothing, a winner
 * who has gained `maxGainPerRound` this round gains no more, and nothing
 * moves when the loser has no Favour and the purse is empty. Empty while the
 * Voice is silent.
 */
export function getFavourAwards(ctx: RulesContext, state: GameState): FavourAward[] {
  const voice = state.crownsVoice;
  if (!voice || !isVoiceSpeaking(state)) return [];
  const favour = new Map(state.turnOrder.map((id) => [id, state.players[id]?.favour ?? 0]));
  const gained = new Map<PlayerId, number>();
  let purse = voice.purse;
  const awards: FavourAward[] = [];
  for (const [a, b] of getRivalNeighbours(ctx, state)) {
    const scoreA = virtueScore(ctx, state, a, voice.current);
    const scoreB = virtueScore(ctx, state, b, voice.current);
    if (scoreA === scoreB) continue;

    const [winner, loser, score, rivalScore] = scoreA > scoreB ? [a, b, scoreA, scoreB] : [b, a, scoreB, scoreA];
    const won = gained.get(winner.ownerId) ?? 0;
    if (won >= BALANCE.crownsVoice.maxGainPerRound) continue;

    const loserFavour = favour.get(loser.ownerId) ?? 0;
    let source: FavourSource;
    if (loserFavour > 0) {
      source = "rival";
      favour.set(loser.ownerId, loserFavour - 1);
    } else if (purse > 0) {
      source = "purse";
      purse -= 1;
    } else continue;

    favour.set(winner.ownerId, (favour.get(winner.ownerId) ?? 0) + 1);
    gained.set(winner.ownerId, won + 1);
    awards.push({ playerId: winner.ownerId, rivalId: loser.ownerId, source, siteId: winner.siteId, rivalSiteId: loser.siteId, score, rivalScore });
  }
  return awards;
}

// ------------------------------------------------------------------ engine steps

/**
 * Checks the settings a game is created with. A ruleset can arrive from a
 * saved game or a command line, so a malformed one is refused here rather
 * than played wrong.
 */
export function checkCrownsVoiceRules(rules: unknown): asserts rules is CrownsVoiceRules {
  const r = rules as Partial<CrownsVoiceRules> | null;
  const valid =
    typeof r === "object" &&
    r !== null &&
    Number.isInteger(r.purse) &&
    (r.purse as number) >= 0 &&
    (CROWNS_VOICE_STARTS as readonly unknown[]).includes(r.from);
  if (!valid) throw new Error(`The Crown's Voice needs a whole, non-negative purse and a start of ${CROWNS_VOICE_STARTS.join(" or ")}`);
}

function fullDeck(): Record<CrownsVirtue, number> {
  const n = BALANCE.crownsVoice.cardsPerVirtue;
  return { might: n, roads: n, plenty: n };
}

/** Turns the top card of the Voice deck (a random one of those left), starting a fresh deck when it is empty. */
function drawVirtue(rng: GameRng, deck: Record<CrownsVirtue, number>): CrownsVirtue {
  if (CROWNS_VIRTUES.every((v) => deck[v] === 0)) Object.assign(deck, fullDeck());
  let k = rng.nextInt(CROWNS_VIRTUES.reduce((n, v) => n + deck[v], 0));
  for (const v of CROWNS_VIRTUES) {
    if (k < deck[v]) {
      deck[v] -= 1;
      return v;
    }
    k -= deck[v];
  }
  throw new Error("The Voice deck count is inconsistent");
}

/** The Voice at game creation: the first two cards are turned and on show. */
export function createCrownsVoice(rng: GameRng, rules: CrownsVoiceRules, questDeck: readonly QuestId[]): CrownsVoiceState {
  const deck = fullDeck();
  const current = drawVirtue(rng, deck);
  const next = drawVirtue(rng, deck);
  const speaking = rules.from === "first_round" || questDeck.length === 0;
  return { current, next, deck, purse: rules.purse, harvested: [], speaking };
}

/** The Voice speaks as the round ends (§129.10): Favour moves between rival neighbours. */
export function crownSpeaks(tx: Tx): void {
  const voice = tx.s.crownsVoice;
  if (!voice) return;
  for (const award of getFavourAwards(tx.ctx, tx.s)) {
    const winner = tx.player(award.playerId);
    winner.favour = (winner.favour ?? 0) + 1;
    if (award.source === "purse") voice.purse -= 1;
    else {
      const rival = tx.player(award.rivalId);
      rival.favour = (rival.favour ?? 0) - 1;
      keepRenownFloor(tx, award.rivalId);
    }
    tx.emit({ type: "favour_won", ...award, virtue: voice.current });
  }
}

/**
 * A new round begins, before its first Harvest: last round's Harvests are
 * forgotten, and a Voice that spoke turns to the next virtue and shows the
 * one after. A silent Voice starts to speak when the round begins with the
 * Quest deck empty, favouring the virtue it showed while it waited.
 */
export function turnVoice(tx: Tx): void {
  const voice = tx.s.crownsVoice;
  if (!voice) return;
  voice.harvested = [];
  if (!voice.speaking) {
    voice.speaking = tx.s.questDeck.length === 0;
    return;
  }
  voice.current = voice.next;
  voice.next = drawVirtue(tx.rng, voice.deck);
  tx.emit({ type: "crowns_voice_turned", virtue: voice.current, next: voice.next });
}
