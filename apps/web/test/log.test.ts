import { describe, expect, it } from "vitest";
import { clone, mvpRuleset, type GameEvent } from "@manors-menaces/rules";
import { mapFor } from "../src/lib/game/engine.js";
import { endCauseOf, formatEvents, rebuildLog, routeName, siteName } from "../src/lib/game/log.js";
import { engine, playGame } from "./helpers.js";

// Regression: after Continue or Load the Chronicle was empty, although the
// save holds the full command history.
describe("rebuildLog", () => {
  const map = mapFor("greenvale");
  const game = playGame(mvpRuleset(), "chronicle", 2, 120);

  it("rebuilds the Chronicle of a saved game from its history", () => {
    const r = rebuildLog(engine, map, game.initial, game.commands, game.final);

    expect(r.complete).toBe(true);
    expect(r.entries.some((e) => e.kind === "turn")).toBe(true);
    expect(r.entries.some((e) => /harvested/.test(e.text))).toBe(true);
    expect(r.entries.every((e) => !e.provisional)).toBe(true);
  });

  it("keeps what it could replay and says the rest is unavailable when the history diverges", () => {
    // Dropping a command (as unrecorded debug commands do) breaks the replay.
    const broken = [...game.commands.slice(0, 40), ...game.commands.slice(41)];
    const r = rebuildLog(engine, map, game.initial, broken, game.final);

    expect(r.complete).toBe(false);
    expect(r.entries.length).toBeGreaterThan(1);
    expect(r.entries.at(-1)?.text).toMatch(/could not be restored/);
  });

  // Regression (review): loading replays the history, so a save whose initial
  // state the engine cannot apply commands to (damaged, or from an older
  // version) threw out of GameSession.fromSave and could not be loaded.
  it("does not throw when the engine cannot apply a damaged history", () => {
    const damaged = clone(game.initial);
    for (const p of Object.values(damaged.players)) delete (p as Partial<typeof p>).stats;
    const r = rebuildLog(engine, map, damaged, game.commands, game.final);

    expect(r.complete).toBe(false);
    expect(r.entries.at(-1)?.text).toMatch(/could not be restored/);
  });

  it("detects a saved state the history does not reach", () => {
    const r = rebuildLog(engine, map, game.initial, game.commands.slice(0, 60), game.final);
    expect(r.complete).toBe(false);
  });
});

describe("formatEvents: second-wave cards", () => {
  const map = mapFor("greenvale");
  const state = playGame(mvpRuleset(), "second-wave", 2, 0).initial;
  const site = map.sites.find((s) => !s.landmarkId)!;
  const place = siteName(map, site.id);
  const lines = (events: GameEvent[]) => formatEvents(events, state, map).map((e) => [e.kind, e.text, e.playerId]);

  it("tells where Dragon's Landing came down and what it did, as nobody's own action", () => {
    // Formatted against the state after the batch, where the Stronghold is already a Manor.
    const reduced: GameEvent[] = [
      { type: "dragon_landed", byPlayerId: "P1", ownerId: "P2", holdingId: "h9", siteId: site.id },
      { type: "holding_reduced", byPlayerId: "P1", ownerId: "P2", holdingId: "h9", siteId: site.id, bannerId: "b9" },
    ];
    expect(lines(reduced)).toEqual([
      ["important", `A dragon landed on Player 2's Stronghold at ${place}!`, null],
      ["important", `Player 2's Stronghold at ${place} was knocked back to a Manor and lost a Banner.`, null],
    ]);
    const razed: GameEvent = { type: "holding_destroyed", byPlayerId: "P1", ownerId: "P2", holdingId: "h9", siteId: site.id, bannerIds: ["b9"] };
    expect(lines([razed])).toEqual([["important", `Player 2's Manor at ${place} burned to the ground.`, null]]);
  });

  it("names the burned Route by its kind and place, and says when anyone may rebuild it", () => {
    const route = map.routes.find((r) => r.kind === "bridge")!;
    const burned: GameEvent = { type: "route_burned", byPlayerId: "P1", ownerId: "P2", routeId: route.id };
    const cooled: GameEvent = { type: "effect_expired", effect: "smouldering", playerId: "P2" };

    expect(lines([burned, cooled])).toEqual([
      ["important", `Player 1 burned down Player 2's bridge by ${routeName(map, route.id)}.`, "P1"],
      ["info", "The embers have cooled on Player 2's burned Route(s): anyone may build there again.", "P2"],
    ]);
  });

  it("tells the Plague, its cure, a policy paying out, the Bard and a hand swap", () => {
    const events: GameEvent[] = [
      { type: "effect_started", effect: "plague", siteId: site.id, bannerIds: ["b1", "b2"], playerId: "P1" },
      { type: "insurance_claimed", playerId: "P2", cardId: "royal_insurance_policy#1", against: "the_plague" },
      { type: "effect_expired", effect: "plague", playerId: "P2" },
      { type: "renown_gained", playerId: "P2", amount: 1, cause: "unreliable_bard" },
      { type: "hands_swapped", playerId: "P2", opponentId: "P1", handSize: 3, opponentHandSize: 1 },
    ];
    expect(lines(events).map(([, text]) => text)).toEqual([
      `Player 1 brought the Plague to ${place}: 2 Banner(s) fell sick.`,
      "Player 2's Royal Insurance Policy paid out against The Plague.",
      "Player 2's sick Banners sit out this Harvest, then recover from the Plague.",
      "The Unreliable Bard sang of Player 2's deeds: +1 Renown.",
      "Player 2 swapped hands with Player 1.",
    ]);
  });

  it("says a card took what a Writ's bribe pays", () => {
    const moved = (reason: "card_effect" | "royal_writ"): GameEvent => ({
      type: "resource_transferred",
      fromPlayerId: "P2",
      toPlayerId: "P1",
      resource: "iron",
      amount: 1,
      reason,
    });
    expect(lines([moved("card_effect"), moved("royal_writ")])).toEqual([
      ["info", "Player 1 took 1 Iron from Player 2.", "P1"],
      ["info", "Player 2 paid Player 1 1 Iron.", "P2"],
    ]);
  });

  it("marks the omen and a Ragnarök ending as omens, and reads the ending back", () => {
    const entries = formatEvents(
      [
        { type: "card_foretold", cardId: "ragnarok#1" },
        { type: "game_won", playerId: "P2", renown: 9, cause: "ragnarok" },
      ],
      state,
      map,
    );
    expect(entries.map((e) => [e.kind, e.text])).toEqual([
      ["omen", "An omen! Ragnarök has been foretold and now lies somewhere in the deck."],
      ["omen", "Ragnarök! The world ends, and Player 2 is crowned with 9 Renown."],
    ]);
    expect(endCauseOf(entries)).toBe("ragnarok");
    expect(endCauseOf(formatEvents([{ type: "game_won", playerId: "P2", renown: 12 }], state, map))).toBeNull();
    expect(endCauseOf([])).toBeNull();
  });
});
