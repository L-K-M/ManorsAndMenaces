// The Crown's Voice (experimental, spec §129.7): each round the Crown favours
// a virtue, and rival Holdings that touch the same Region contest it for
// Favour, which counts as Renown.
//
// After setupGame the first player (p1) holds Manors on s1 and s9 and the
// second (p2) on s3 and s7. The rival neighbours are s1–s3 (R5), s1–s7 (R6),
// s3–s9 (R7) and s7–s9 (R8), and every Holding touches one of its owner's
// Routes.

import { describe, expect, it } from "vitest";
import {
  clone,
  getFavourAwards,
  getRenown,
  getRenownSources,
  getRivalNeighbours,
  getVoiceStatus,
  hashState,
  holdingAt,
  isBoardFull,
  isVoiceSpeaking,
  redactState,
  seedRng,
  virtueScore,
  type CrownsVirtue,
  type CrownsVoiceRules,
  type GameEvent,
  type GameState,
  type Holding,
  type PlayerId,
  type RulesetConfig,
} from "../src/index.js";
import { act, engine, grant, mvpRuleset, newGame, passTurn, routeId, setupGame, standardRuleset } from "./helpers.js";

const ctx = engine.ctx;
const VOICE: CrownsVoiceRules = { purse: 10, from: "first_round" };
const voiceRules = (base: RulesetConfig = mvpRuleset(), voice: CrownsVoiceRules = VOICE): RulesetConfig => ({ ...base, crownsVoice: voice });

type Player = GameState["players"][string];
const player = (s: GameState, p: PlayerId): Player => s.players[p] as Player;
const at = (s: GameState, site: string): Holding => holdingAt(s, site) as Holding;

/** A copy of `s` changed in place by `change` (test-only state surgery). */
function edit(s: GameState, change: (c: GameState) => void): GameState {
  const c = clone(s);
  change(c);
  return c;
}

/** Sets the virtue the Crown favours this round. */
const favouring = (s: GameState, virtue: CrownsVirtue): GameState =>
  edit(s, (c) => {
    if (c.crownsVoice) c.crownsVoice.current = virtue;
  });

/** passTurn, keeping the End Turn's events. */
function endTurn(state: GameState): { state: GameState; events: GameEvent[] } {
  const p = state.activePlayerId;
  let s = state;
  if (s.phase === "main") s = act(s, p, { type: "end_main_phase" }).state;
  if (s.phase === "banner_assignment") s = act(s, p, { type: "assign_banners", assignments: {} }).state;
  return act(s, p, { type: "end_turn" });
}

/** Plays out the rest of the round; returns the last seat's End Turn. */
function endRound(state: GameState): { state: GameState; events: GameEvent[] } {
  let s = state;
  while (s.activePlayerId !== s.turnOrder.at(-1)) s = passTurn(s);
  return endTurn(s);
}

/** The active player upgrades their Manor on `site`. */
function upgrade(s: GameState, site: string): GameState {
  const p = s.activePlayerId;
  return act(grant(s, p, { grain: 2, iron: 2 }), p, { type: "upgrade_holding", siteId: site }).state;
}

const favourEvents = (events: GameEvent[]) => events.filter((e) => e.type === "favour_won");

describe("the Crown's Voice: neighbours", () => {
  it("pairs rival Holdings that touch the same Region, oldest first", () => {
    const { state } = setupGame(voiceRules());
    const pairs = getRivalNeighbours(ctx, state).map(([a, b]) => [a.siteId, b.siteId]);
    // Built in the order s1, s3, s7, s9.
    expect(pairs).toEqual([
      ["s1", "s3"],
      ["s1", "s7"],
      ["s3", "s9"],
      ["s7", "s9"],
    ]);
  });

  it("never pairs a player's own Holdings, and pairs two rivals once however many Regions they share", () => {
    const { state, p1, p2 } = setupGame(voiceRules());
    // s2 and s5 share R1 and R2 (state surgery: the spacing rule would forbid it).
    const s = edit(state, (c) => {
      c.holdings.h_a = { id: "h_a", siteId: "s2", ownerId: p1, type: "manor" };
      c.holdings.h_b = { id: "h_b", siteId: "s5", ownerId: p2, type: "manor" };
      player(c, p1).holdingIds.push("h_a");
      player(c, p2).holdingIds.push("h_b");
    });
    const pairs = getRivalNeighbours(ctx, s).map(([a, b]) => [a.siteId, b.siteId].sort().join("-"));
    expect(pairs.filter((p) => p === "s2-s5")).toHaveLength(1);
    // s1 and s2 are both the first player's: never a pair.
    expect(pairs).not.toContain("s1-s2");
    for (const [a, b] of getRivalNeighbours(ctx, s)) expect(a.ownerId).not.toBe(b.ownerId);
  });
});

describe("the Crown's Voice: virtues", () => {
  it("scores Might 1 for a Manor and 2 for a Stronghold", () => {
    const { state } = setupGame(voiceRules());
    expect(virtueScore(ctx, state, at(state, "s1"), "might")).toBe(1);
    const s = upgrade(state, "s1");
    expect(virtueScore(ctx, s, at(s, "s1"), "might")).toBe(2);
  });

  it("scores Roads by the owner's Routes that touch the Holding's Site, at most 3", () => {
    const { state, p1, p2 } = setupGame(voiceRules());
    expect(virtueScore(ctx, state, at(state, "s1"), "roads")).toBe(1);
    const built = act(grant(state, p1, { timber: 1, stone: 1 }), p1, { type: "build_route", routeId: routeId(1, 4) }).state;
    expect(virtueScore(ctx, built, at(built, "s1"), "roads")).toBe(2);
    // A rival's Route to the Site does not count.
    const rival = edit(state, (c) => {
      c.routeOwners[routeId(1, 4)] = p2;
      player(c, p2).routeIds.push(routeId(1, 4));
    });
    expect(virtueScore(ctx, rival, at(rival, "s1"), "roads")).toBe(1);
    // Four Routes reach s5; the score stops at 3.
    const hub = edit(state, (c) => {
      c.holdings.h_hub = { id: "h_hub", siteId: "s5", ownerId: p1, type: "manor" };
      player(c, p1).holdingIds.push("h_hub");
      for (const r of [routeId(2, 5), routeId(4, 5), routeId(5, 6), routeId(5, 8)]) {
        c.routeOwners[r] = p1;
        player(c, p1).routeIds.push(r);
      }
    });
    expect(virtueScore(ctx, hub, at(hub, "s5"), "roads")).toBe(3);
  });

  it("scores Plenty by the Holding's Banners that harvested this round, at most 2", () => {
    const { state, p1, bannerOf } = setupGame(voiceRules());
    expect(virtueScore(ctx, state, at(state, "s1"), "plenty")).toBe(0);
    const s = edit(upgrade(state, "s1"), (c) => {
      if (c.crownsVoice) c.crownsVoice.harvested = Object.values(c.banners).filter((b) => b.ownerId === p1).map((b) => b.id);
    });
    expect(virtueScore(ctx, s, at(s, "s1"), "plenty")).toBe(2);
    expect(virtueScore(ctx, s, at(s, "s9"), "plenty")).toBe(1);
    expect(s.crownsVoice?.harvested).toContain(bannerOf(p1, "s9"));
  });

  it("records the Banners that produce at each Harvest and forgets them as a round begins", () => {
    const { state, p1, p2, bannerOf } = setupGame(voiceRules());
    // Round 1 skips everyone's first Harvest.
    let s = passTurn(state);
    expect(s.crownsVoice?.harvested).toEqual([]);
    // The Toll Troll blocks p2's Banner in R5 from round 2 on.
    s = engine.applyDebugCommand(s, { type: "debug_move_menace", commandId: "m", matchId: s.matchId, playerId: p2, menaceId: "menace_toll_troll", destination: { kind: "region", regionId: "R5" } }).newState as GameState;
    s = passTurn(s);
    expect(s.round).toBe(2);
    expect(new Set(s.crownsVoice?.harvested)).toEqual(new Set([bannerOf(p1, "s1"), bannerOf(p1, "s9")]));
    s = passTurn(s);
    expect(new Set(s.crownsVoice?.harvested)).toEqual(new Set([bannerOf(p1, "s1"), bannerOf(p1, "s9"), bannerOf(p2, "s7")]));
    // Plenty: s3 harvested nothing, so s1 and s9 win against it; s7 ties.
    const plenty = favouring(s, "plenty");
    expect(getFavourAwards(ctx, plenty).map((a) => [a.siteId, a.rivalSiteId])).toEqual([
      ["s1", "s3"],
      ["s9", "s3"],
    ]);
    const { state: next } = endTurn(plenty);
    expect(next.round).toBe(3);
    expect(player(next, p1).favour).toBe(2);
    // The next round's first Harvest (p1's) is the only one recorded.
    expect(new Set(next.crownsVoice?.harvested)).toEqual(new Set([bannerOf(p1, "s1"), bannerOf(p1, "s9")]));
  });
});

describe("the Crown's Voice: Favour", () => {
  it("gives the higher score 1 Favour from the Crown's purse when the rival has none", () => {
    const { state, p1, p2 } = setupGame(voiceRules());
    const s = favouring(upgrade(state, "s1"), "might");
    const { state: after, events } = endRound(s);
    expect(favourEvents(events)).toEqual([
      { type: "favour_won", playerId: p1, rivalId: p2, source: "purse", virtue: "might", siteId: "s1", rivalSiteId: "s3", score: 2, rivalScore: 1 },
      { type: "favour_won", playerId: p1, rivalId: p2, source: "purse", virtue: "might", siteId: "s1", rivalSiteId: "s7", score: 2, rivalScore: 1 },
    ]);
    expect(player(after, p1).favour).toBe(2);
    expect(after.crownsVoice?.purse).toBe(8);
    expect(getRenown(ctx, after, p1)).toBe(getRenown(ctx, s, p1) + 2);
  });

  it("takes Favour from the rival while they have any, then from the purse", () => {
    const { state, p1, p2 } = setupGame(voiceRules());
    const s = edit(favouring(upgrade(state, "s1"), "might"), (c) => (player(c, p2).favour = 1));
    const { state: after, events } = endRound(s);
    expect(favourEvents(events).map((e) => e.type === "favour_won" && e.source)).toEqual(["rival", "purse"]);
    expect(player(after, p1).favour).toBe(2);
    expect(player(after, p2).favour).toBe(0);
    expect(after.crownsVoice?.purse).toBe(9);
    expect(getRenown(ctx, after, p2)).toBe(getRenown(ctx, s, p2) - 1);
  });

  it("gives a player at most 2 Favour a round; later pairs move nothing", () => {
    const { state, p1, p2 } = setupGame(voiceRules());
    // Strongholds on s1 and s9 out-might all four of the second player's pairs.
    const s = favouring(upgrade(upgrade(state, "s1"), "s9"), "might");
    expect(getRivalNeighbours(ctx, s)).toHaveLength(4);
    const { state: after, events } = endRound(s);
    // The two oldest pairs pay; s3–s9 and s7–s9 do not.
    expect(favourEvents(events).map((e) => e.type === "favour_won" && e.rivalSiteId)).toEqual(["s3", "s7"]);
    expect(player(after, p1).favour).toBe(2);
    expect(player(after, p2).favour ?? 0).toBe(0);
    expect(after.crownsVoice?.purse).toBe(8);
  });

  it("moves nothing on a tie", () => {
    const { state } = setupGame(voiceRules());
    // Every Holding is a Manor with one Route: Might and Roads tie everywhere.
    for (const virtue of ["might", "roads", "plenty"] as const) {
      const { state: after, events } = endRound(favouring(state, virtue));
      expect(favourEvents(events)).toEqual([]);
      expect(after.crownsVoice?.purse).toBe(10);
    }
  });

  it("moves nothing once the purse is empty and the rival has no Favour", () => {
    const { state, p1 } = setupGame(voiceRules());
    const s = edit(favouring(upgrade(state, "s1"), "might"), (c) => {
      if (c.crownsVoice) c.crownsVoice.purse = 1;
    });
    const { state: after, events } = endRound(s);
    expect(favourEvents(events)).toHaveLength(1);
    expect(player(after, p1).favour).toBe(1);
    expect(after.crownsVoice?.purse).toBe(0);
  });

  it("counts Favour as Renown, itemised as its own part", () => {
    const { state, p1 } = setupGame(voiceRules());
    const s = edit(state, (c) => (player(c, p1).favour = 3));
    expect(getRenown(ctx, s, p1)).toBe(getRenown(ctx, state, p1) + 3);
    const sources = getRenownSources(ctx, s, p1);
    expect(sources.favour).toBe(3);
    expect(sources.manors.renown + sources.strongholds.renown + sources.bonus - sources.lost + sources.favour).toBe(sources.total);
  });

  it("keeps Renown at 0 or above when Favour is taken", () => {
    const { state, p2 } = setupGame(voiceRules());
    // p2: two Manors and 1 Favour, less 3 lost for good: 0 Renown.
    const s = edit(favouring(upgrade(state, "s1"), "might"), (c) => {
      player(c, p2).favour = 1;
      player(c, p2).lostRenown = 3;
    });
    expect(getRenown(ctx, s, p2)).toBe(0);
    const { state: after } = endRound(s);
    expect(player(after, p2).favour).toBe(0);
    expect(getRenown(ctx, after, p2)).toBe(0);
    expect(player(after, p2).lostRenown).toBe(2);
  });

  it("speaks before the victory check, so Favour can win the game at the round's end", () => {
    const { state, p1 } = setupGame(voiceRules());
    let s = favouring(upgrade(state, "s1"), "might");
    s = edit(s, (c) => (player(c, p1).bonusRenown += c.ruleset.targetRenown - 1 - getRenown(ctx, c, p1)));
    s = passTurn(s);
    expect(s.status).toBe("playing");
    const { state: after, events } = endTurn(s);
    expect(after.status).toBe("finished");
    expect(after.winnerId).toBe(p1);
    const won = events.findIndex((e) => e.type === "game_won");
    expect(events.findIndex((e) => e.type === "favour_won")).toBeLessThan(won);
  });

  it("speaks before the full-board end, so Favour can decide it", () => {
    const { state, p1, p2 } = setupGame(voiceRules({ ...mvpRuleset(), endOnFullBoard: true }));
    // State surgery: every Holding a Stronghold, and the second player's
    // Stronghold on s5 fills the board. s5 touches none of its owner's
    // Routes, so s1 and s9 out-score it in Roads.
    const s = edit(favouring(state, "roads"), (c) => {
      for (const h of Object.values(c.holdings)) h.type = "stronghold";
      c.holdings.h_s5 = { id: "h_s5", siteId: "s5", ownerId: p2, type: "stronghold" };
      player(c, p2).holdingIds.push("h_s5");
      player(c, p1).bonusRenown += 1;
    });
    expect(isBoardFull(ctx, s)).toBe(true);
    // Without the Voice the second player would win the full board, 6 to 5.
    expect(getRenown(ctx, s, p1)).toBe(5);
    expect(getRenown(ctx, s, p2)).toBe(6);
    const { state: after, events } = endRound(s);
    expect(favourEvents(events).map((e) => e.type === "favour_won" && [e.siteId, e.rivalSiteId])).toEqual([
      ["s1", "s5"],
      ["s9", "s5"],
    ]);
    expect(after.status).toBe("finished");
    expect(after.endCause).toBe("full_board");
    expect(after.winnerId).toBe(p1);
    expect(events.map((e) => e.type).lastIndexOf("favour_won")).toBeLessThan(events.findIndex((e) => e.type === "game_won"));
  });
});

describe("the Crown's Voice: the deck", () => {
  it("shows the current and the next virtue, and turns to the next as a round begins", () => {
    const { state } = setupGame(voiceRules());
    const voice = state.crownsVoice;
    expect(voice).toBeDefined();
    if (!voice) return;
    // Two of the 24 cards are turned: the current Voice and the next.
    expect(voice.deck.might + voice.deck.roads + voice.deck.plenty).toBe(22);
    const { state: after, events } = endRound(state);
    expect(after.crownsVoice?.current).toBe(voice.next);
    const turned = events.find((e) => e.type === "crowns_voice_turned");
    expect(turned).toEqual({ type: "crowns_voice_turned", virtue: voice.next, next: after.crownsVoice?.next });
    expect(after.crownsVoice?.deck).toEqual({ ...voice.deck, [after.crownsVoice?.next as CrownsVirtue]: voice.deck[after.crownsVoice?.next as CrownsVirtue] - 1 });
  });

  it("starts a fresh deck of 24 when the deck runs out", () => {
    const { state } = setupGame(voiceRules());
    const empty = edit(state, (c) => {
      if (c.crownsVoice) c.crownsVoice.deck = { might: 0, roads: 0, plenty: 0 };
    });
    const { state: after } = endRound(empty);
    const deck = after.crownsVoice?.deck;
    expect(deck && deck.might + deck.roads + deck.plenty).toBe(23);
  });

  it("draws the Voices with the match RNG: the same RNG state, the same Voices", () => {
    const voices = (seed: string): CrownsVirtue[] => {
      let s = edit(setupGame(voiceRules()).state, (c) => (c.rngState = seedRng(seed)));
      const out: CrownsVirtue[] = [];
      for (let round = 0; round < 12; round++) {
        out.push(s.crownsVoice?.current as CrownsVirtue);
        s = endRound(s).state;
      }
      return out;
    };
    expect(voices("a")).toEqual(voices("a"));
    const seeds = ["a", "b", "c", "d", "e"].map((seed) => voices(seed).join());
    expect(new Set(seeds).size).toBeGreaterThan(1);
    // Each game's first two Voices come from its own seed.
    const firsts = ["a", "b", "c", "d", "e", "f", "g", "h"].map((seed) => {
      const v = newGame(voiceRules(), seed).crownsVoice;
      return `${v?.current}/${v?.next}`;
    });
    expect(new Set(firsts).size).toBeGreaterThan(1);
  });

  it("stays silent until a round begins with the Quest deck empty when it waits for it", () => {
    const rules = voiceRules(standardRuleset(2), { purse: 10, from: "quest_deck_empty" });
    const { state, p1 } = setupGame(rules);
    const s = favouring(upgrade(state, "s1"), "might");
    expect(s.questDeck.length).toBeGreaterThan(0);
    expect(getVoiceStatus(s)).toBe("waiting");
    const silent = endRound(s);
    expect(favourEvents(silent.events)).toEqual([]);
    // Silent rounds do not turn the Voice either.
    expect(silent.state.crownsVoice?.current).toBe("might");
    expect(silent.events.some((e) => e.type === "crowns_voice_turned")).toBe(false);

    // The last seat's End Turn reveals the last Quest (state surgery: one
    // Quest left in the deck and a slot free). Nobody else could react, so
    // the Voice stays silent as this round ends and speaks from the next.
    let last = passTurn(s);
    expect(last.activePlayerId).toBe(last.turnOrder.at(-1));
    last = edit(last, (c) => {
      c.questDeck = c.questDeck.slice(0, 1);
      c.revealedQuestIds = c.revealedQuestIds.slice(1);
    });
    expect(getVoiceStatus(edit(last, (c) => (c.questDeck = [])))).toBe("from_next_round");
    const woke = endTurn(last);
    expect(woke.state.questDeck).toEqual([]);
    expect(favourEvents(woke.events)).toEqual([]);
    expect(getVoiceStatus(woke.state)).toBe("speaking");
    expect(isVoiceSpeaking(woke.state)).toBe(true);
    // The Voice favours what it showed while it waited: no card turns yet.
    expect(woke.state.crownsVoice?.current).toBe("might");
    expect(woke.events.some((e) => e.type === "crowns_voice_turned")).toBe(false);

    const spoken = endRound(woke.state);
    expect(favourEvents(spoken.events)).toHaveLength(2);
    expect(player(spoken.state, p1).favour).toBe(2);
    // Once it has spoken, the card turns as the next round begins.
    const turned = spoken.events.findIndex((e) => e.type === "crowns_voice_turned");
    expect(turned).toBeGreaterThan(spoken.events.map((e) => e.type).lastIndexOf("favour_won"));
    expect(spoken.state.crownsVoice?.current).toBe(woke.state.crownsVoice?.next);
  });

  it("speaks from the first round in Core games, which have no Quests", () => {
    const { state } = setupGame(voiceRules(mvpRuleset(), { purse: 10, from: "quest_deck_empty" }));
    expect(state.questDeck).toEqual([]);
    expect(getVoiceStatus(state)).toBe("speaking");
    expect(getVoiceStatus(setupGame(mvpRuleset()).state)).toBeNull();
  });
});

describe("the Crown's Voice: off, public and checked", () => {
  it("is off when the ruleset leaves it out, and such games play exactly as before", () => {
    const { state } = setupGame(standardRuleset(2));
    expect(state.crownsVoice).toBeUndefined();
    let s = upgrade(state, "s1");
    const events: GameEvent[] = [];
    for (let i = 0; i < 24; i++) {
      const r = endTurn(s);
      events.push(...r.events);
      s = r.state;
    }
    expect(events.some((e) => e.type === "favour_won" || e.type === "crowns_voice_turned")).toBe(false);
    expect(Object.values(s.players).every((p) => p.favour === undefined)).toBe(true);
    // Recorded before the Crown's Voice existed (ruleset 0.7.0): 24 turns from setup.
    let plain = setupGame(standardRuleset(2)).state;
    for (let i = 0; i < 24; i++) plain = passTurn(plain);
    expect(hashState({ ...plain, rulesetVersion: "pinned" })).toBe("1b4ceae08413ab");
  });

  it("hides nothing: the Voice, the next Voice, the deck's counts, the purse and every player's Favour are public", () => {
    const { state, p1, p2 } = setupGame(voiceRules());
    const s = edit(state, (c) => (player(c, p1).favour = 2));
    expect(s.crownsVoice).toBeDefined();
    for (const viewer of [p1, p2, null]) {
      const view = redactState(s, viewer);
      expect(view.crownsVoice).toEqual(s.crownsVoice);
      expect(view.players[p1]?.favour).toBe(2);
    }
  });

  it("rejects a malformed setting when a game is created", () => {
    for (const bad of [true, { purse: -1, from: "first_round" }, { purse: 10, from: "later" }, { purse: 1.5, from: "first_round" }]) {
      expect(() => newGame({ ...mvpRuleset(), crownsVoice: bad as unknown as CrownsVoiceRules })).toThrow(/Crown's Voice/);
    }
  });
});
