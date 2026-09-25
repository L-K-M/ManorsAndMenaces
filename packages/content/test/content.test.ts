import { describe, expect, it } from "vitest";
import {
  CARD_EFFECT_IDS,
  HARVEST_NOTES,
  QUEST_CONDITION_IDS,
  RULESET_VERSION,
  clone,
  createRulesEngine,
  enumerateCardTargets,
  evaluateQuestCondition,
  standardRuleset,
  type CardType,
  type QuestConditionId,
  type GameState,
} from "@manors-menaces/rules";
import { CARDS, EN, GREENVALE_MAP, MAPS, MENACES, QUESTS, rulesContentFor, type MapDefinition } from "../src/index.js";

const content = rulesContentFor();
const engine = createRulesEngine(content);

function newGame(players: number): GameState {
  return engine.createGame({
    matchId: `m${players}`,
    seed: `content-${players}`,
    rulesetVersion: RULESET_VERSION,
    ruleset: standardRuleset(players),
    players: Array.from({ length: players }, (_, i) => ({ id: `P${i + 1}`, displayName: `P${i + 1}` })),
  });
}

const expectKey = (key: string | undefined): void => {
  expect(key, "missing key").toBeDefined();
  expect(EN[key as string], `EN has no text for ${key}`).toBeTruthy();
};

describe("card definitions (§19, §39)", () => {
  it("have unique ids and text for every key", () => {
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
    for (const c of CARDS) {
      expectKey(c.nameKey);
      expectKey(c.rulesTextKey);
      expectKey(c.flavorTextKey);
      expectKey(`card.type.${c.type}`);
    }
  });
  it("use every effect the engine implements, once each", () => {
    expect(CARDS.map((c) => c.effectId).sort()).toEqual([...CARD_EFFECT_IDS].sort());
  });
  it("make up the 24-card prototype deck", () => {
    expect(CARDS.reduce((n, c) => n + c.copies, 0)).toBe(24);
  });
  it("reach the rules engine with their requirements", () => {
    for (const c of CARDS) {
      const rules = content.cards.find((r) => r.id === c.id);
      expect(rules).toMatchObject({ effectId: c.effectId, copies: c.copies, type: c.type });
      expect(rules?.requiresMenace).toBe(c.requiresMenace);
      expect(rules?.requiresMenacePair).toBe(c.requiresMenacePair);
    }
  });
});

describe("standard decks by player count", () => {
  const deckOf = (players: number) => newGame(players).cardDeck.map((c) => c.split("#")[0]);
  it("2 players: no Dragon Whisperer and no Teleportation Mishap", () => {
    const deck = deckOf(2);
    expect(deck).toHaveLength(20);
    expect(deck).not.toContain("dragon_whisperer");
    expect(deck).not.toContain("teleportation_mishap");
  });
  it.each([3, 4])("%i players: the full deck, since two Region Menaces can swap", (players) => {
    const deck = deckOf(players);
    expect(deck).toHaveLength(24);
    expect(deck.filter((c) => c === "teleportation_mishap")).toHaveLength(2);
  });
  // Checked through target enumeration, not the predicate setup uses. A
  // Menace's kind of place never changes, so the opening board decides it.
  it.each([2, 3, 4])("%i players: deals Teleportation Mishap only when it has a target", (players) => {
    const s = newGame(players);
    const dealt = s.cardDeck.some((c) => c.startsWith("teleportation_mishap#"));
    const targets = enumerateCardTargets(engine.ctx, s, "P1", "teleportation_mishap#1");
    expect(targets.length > 0).toBe(dealt);
  });
});

describe("quest definitions (§27, §40)", () => {
  it("have unique ids and text for every key", () => {
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(QUESTS.length);
    for (const q of QUESTS) {
      expectKey(q.nameKey);
      expectKey(q.descriptionKey);
    }
  });
  it("use every condition the engine implements, once each", () => {
    expect(QUESTS.map((q) => q.conditionId).sort()).toEqual([...QUEST_CONDITION_IDS].sort());
  });
  it("state the same number the engine checks", () => {
    const s = newGame(3);
    const counted = [
      "friend_of_the_forest",
      "monster_problems",
      "grand_tour",
      "diverse_realm",
      "patron_of_heroes",
      "arcane_scholar",
      "prosperous_estates",
      "far_reaches",
    ] as const;
    for (const id of counted) {
      const { target } = evaluateQuestCondition(engine.ctx, s, "P1", id);
      expect(EN[`quest.${id}.description`], id).toMatch(new RegExp(`\\b${target}\\b`));
    }
  });

  // "Play N <type> cards" Quests must be reachable with the cards actually in
  // the deck. Model a player who draws CARDS_DRAWN cards over a match
  // (hypergeometric, ignoring reshuffles, which only help) and require a fair
  // chance of drawing enough of that type. With 3 Heroes in the 2-player deck,
  // Patron of Heroes at 3 gave under 2%; at 2 it gives about 20%.
  const CARDS_DRAWN = 6;
  const MIN_CHANCE = 0.15;
  const choose = (n: number, k: number): number => (k < 0 || k > n ? 0 : Array.from({ length: k }, (_, i) => (n - i) / (i + 1)).reduce((a, b) => a * b, 1));
  const atLeast = (deck: number, hits: number, draws: number, need: number): number => {
    let p = 0;
    for (let k = need; k <= Math.min(hits, draws); k++) p += (choose(hits, k) * choose(deck - hits, draws - k)) / choose(deck, draws);
    return p;
  };
  const playQuests: [QuestConditionId, CardType][] = [
    ["patron_of_heroes", "hero"],
    ["arcane_scholar", "spell"],
  ];
  it.each([2, 3, 4])("card-play Quests are reachable with %i players", (players) => {
    const s = newGame(players);
    const typeOf = (id: string) => content.cards.find((c) => id.startsWith(`${c.id}#`))?.type;
    for (const [quest, type] of playQuests) {
      const need = evaluateQuestCondition(engine.ctx, s, "P1", quest).target;
      const hits = s.cardDeck.filter((c) => typeOf(c) === type).length;
      expect(atLeast(s.cardDeck.length, hits, CARDS_DRAWN, need), `${quest} with ${players} players`).toBeGreaterThanOrEqual(MIN_CHANCE);
    }
  });
});

describe("other text keys", () => {
  it("cover every Menace, Harvest note, landmark, Route kind and resource", () => {
    for (const m of MENACES) {
      expectKey(m.nameKey);
      expectKey(m.rulesTextKey);
      expectKey(m.flavorTextKey);
    }
    for (const note of HARVEST_NOTES) expectKey(`harvest.${note}`);
    for (const map of Object.values(MAPS)) {
      for (const l of map.landmarks) expectKey(`landmark.${l.id}`);
      for (const r of map.routes) expectKey(`route.${r.kind}`);
      for (const r of map.regions) expectKey(`resource.${r.resource}`);
    }
  });
  it('call Routes "Routes" in rules and help text (the spec\'s term)', () => {
    // Names and flavour text may say "road"; rules, help and tutorial text may not.
    const offenders = Object.entries(EN).filter(([key, text]) => key !== "route.road" && !/\.(name|flavor)$/.test(key) && /\broads?\b/i.test(text));
    expect(offenders).toEqual([]);
  });
});

describe("rulesContentFor", () => {
  it("refuses a map that fails validation", () => {
    const broken: MapDefinition = { ...clone(GREENVALE_MAP), id: "broken", questParams: { kingsHighway: ["site_01", "site_01"] } };
    MAPS[broken.id] = broken;
    try {
      expect(() => rulesContentFor(broken.id)).toThrow(/Map broken is invalid: .*King's Highway/);
    } finally {
      delete MAPS[broken.id];
    }
  });
});
