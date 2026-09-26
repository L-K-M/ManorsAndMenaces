import { describe, expect, it } from "vitest";
import { GREENVALE_MAP as map } from "@manors-menaces/content";
import { RULESET_VERSION, standardRuleset, type GameEvent, type GameState } from "@manors-menaces/rules";
import { engineFor } from "../src/lib/game/engine.js";
import { DIGEST_MIN_ITEMS, awayDigest, feedItemsFor, listText, routeName, siteName, type FeedBatch } from "../src/lib/game/feed.js";

const state: GameState = engineFor(map.id).createGame({
  matchId: "feed-test",
  seed: "feed-test",
  rulesetVersion: RULESET_VERSION,
  ruleset: standardRuleset(3),
  players: [
    { id: "P1", displayName: "Alice" },
    { id: "P2", displayName: "Bertram" },
    { id: "P3", displayName: "Cordelia" },
  ],
});

const site = map.sites.find((s) => !s.landmarkId)!;
const [r1, r2] = map.regions as [(typeof map.regions)[number], (typeof map.regions)[number]];

const manor = (playerId: string): GameEvent => ({ type: "holding_built", playerId, holdingId: `h-${playerId}`, siteId: site.id, free: false });

describe("feedItemsFor", () => {
  it("tells another player's build with its place and board point", () => {
    const [item] = feedItemsFor([manor("P2")], state, map, "P1");

    expect(item).toMatchObject({ actorId: "P2", text: `Bertram built a Manor at ${siteName(map, site.id)}`, at: { x: site.x, y: site.y } });
  });

  it("leaves out the viewer's own actions", () => {
    expect(feedItemsFor([manor("P1")], state, map, "P1")).toEqual([]);
  });

  it("names Routes by the Region their ends share", () => {
    const route = map.routes[0]!;
    const [item] = feedItemsFor([{ type: "route_built", playerId: "P3", routeId: route.id, free: false }], state, map, "P1");

    expect(item?.text).toBe(`Cordelia built a Route by ${routeName(map, route.id)}`);
    expect(item?.at).not.toBeNull();
  });

  it("speaks to the viewer when a Writ sends their Banner home", () => {
    const writ: GameEvent = {
      type: "banner_displaced",
      byPlayerId: "P3",
      ownerId: "P1",
      bannerId: "b1",
      fromRegionId: r1.id,
      toRegionId: null,
      cause: "royal_writ",
    };

    const [mine] = feedItemsFor([writ], state, map, "P1");
    const [theirs] = feedItemsFor([writ], state, map, "P2");

    expect(mine).toMatchObject({ text: `Cordelia sent your Banner home from ${r1.name} with a Royal Writ`, againstViewer: true });
    expect(theirs).toMatchObject({ text: `Cordelia sent Alice's Banner home from ${r1.name} with a Royal Writ`, againstViewer: false });
  });

  it("groups one player's Banner moves into one line", () => {
    const events: GameEvent[] = [
      { type: "banner_assigned", playerId: "P2", bannerId: "b1", fromRegionId: null, toRegionId: r1.id },
      { type: "banner_assigned", playerId: "P2", bannerId: "b2", fromRegionId: null, toRegionId: r2.id },
    ];

    const items = feedItemsFor(events, state, map, "P1");

    expect(items.map((i) => i.text)).toEqual([`Bertram planted Banners in ${r1.name} and ${r2.name}`]);
  });

  it("tells both the planted and the recalled Banners of one reassignment", () => {
    const events: GameEvent[] = [
      { type: "banner_assigned", playerId: "P2", bannerId: "b1", fromRegionId: null, toRegionId: r1.id },
      { type: "banner_assigned", playerId: "P2", bannerId: "b2", fromRegionId: r2.id, toRegionId: null },
    ];

    const items = feedItemsFor(events, state, map, "P1");

    expect(items.map((i) => i.text)).toEqual([`Bertram planted a Banner in ${r1.name}`, "Bertram brought a Banner home"]);
  });

  it("shows a rival's harvest and the viewer's own harvest", () => {
    const events = (playerId: string): GameEvent[] => [
      { type: "banner_harvested", playerId, bannerId: "b1", regionId: r1.id, produced: "grain", amount: 2, notes: [] },
      { type: "harvest_completed", playerId, total: 2, byType: { grain: 2 } },
    ];

    const [rival] = feedItemsFor(events("P2"), state, map, "P1");
    const [own] = feedItemsFor(events("P1"), state, map, "P1");

    expect(rival).toMatchObject({ text: "Bertram harvested 2 Grain", self: false, gains: { resources: { grain: 2 } } });
    expect(own).toMatchObject({ text: "Your harvest: 2 Grain", self: true });
  });

  it("reports payments only to the players involved", () => {
    const paid: GameEvent = { type: "resource_transferred", fromPlayerId: "P2", toPlayerId: "P1", resource: "stone", amount: 1, reason: "royal_writ" };

    expect(feedItemsFor([paid], state, map, "P1").map((i) => i.text)).toEqual(["Bertram paid you 1 Stone"]);
    expect(feedItemsFor([paid], state, map, "P3")).toEqual([]);
  });

  it("leaves out the payer's own Writ bribe", () => {
    const paid: GameEvent = { type: "resource_transferred", fromPlayerId: "P2", toPlayerId: "P1", resource: "stone", amount: 1, reason: "royal_writ" };

    expect(feedItemsFor([paid], state, map, "P2")).toEqual([]);
  });
});

describe("feedItemsFor: second-wave cards", () => {
  const route = map.routes[0]!;
  const place = siteName(map, site.id);

  it("tells a burned Route to its owner as aimed at them, with where it smoulders", () => {
    const burned: GameEvent = { type: "route_burned", byPlayerId: "P2", ownerId: "P1", routeId: route.id };

    const [mine] = feedItemsFor([burned], state, map, "P1");
    const [theirs] = feedItemsFor([burned], state, map, "P3");

    expect(mine).toMatchObject({
      actorId: "P2",
      text: `Bertram burned down your Route by ${routeName(map, route.id)}. Only you may rebuild it until your next turn ends`,
      againstViewer: true,
    });
    expect(mine?.at).toBeTruthy();
    expect(theirs).toMatchObject({ text: `Bertram burned down Alice's Route by ${routeName(map, route.id)}`, againstViewer: false });
    expect(feedItemsFor([burned], state, map, "P2")).toEqual([]);
  });

  it("tells everyone, the caster too, where the random dragon struck", () => {
    const events: GameEvent[] = [
      { type: "dragon_landed", byPlayerId: "P2", ownerId: "P1", holdingId: "h1", siteId: site.id },
      { type: "holding_destroyed", byPlayerId: "P2", ownerId: "P1", holdingId: "h1", siteId: site.id, bannerIds: ["b1"] },
    ];

    expect(feedItemsFor(events, state, map, "P2")).toEqual([
      { actorId: null, text: `A dragon burned down Alice's Manor at ${place}`, at: { x: site.x, y: site.y }, gains: null, againstViewer: false, self: false },
    ]);
    expect(feedItemsFor(events, state, map, "P1")).toMatchObject([{ text: `A dragon burned down your Manor at ${place}`, againstViewer: true }]);
  });

  it("points a policy that turned the dragon away at the landing site, for its holder too", () => {
    const events: GameEvent[] = [
      { type: "dragon_landed", byPlayerId: "P2", ownerId: "P1", holdingId: "h1", siteId: site.id },
      { type: "insurance_claimed", playerId: "P1", cardId: "royal_insurance_policy#1", against: "dragons_landing" },
    ];

    expect(feedItemsFor(events, state, map, "P1")).toMatchObject([
      { actorId: "P1", text: "Your Royal Insurance Policy protected you from Dragon's Landing", at: { x: site.x, y: site.y } },
    ]);
    expect(feedItemsFor(events, state, map, "P2")).toMatchObject([{ text: "Alice's Royal Insurance Policy protected them from Dragon's Landing" }]);
  });

  it("counts the viewer's own Banners the Plague sickened", () => {
    const banner = (id: string, ownerId: string) => ({ id, ownerId, holdingId: "h", regionId: r1.id, settled: true });
    const sickened: GameState = { ...state, banners: { b1: banner("b1", "P1"), b2: banner("b2", "P3"), b3: banner("b3", "P3") } };
    const plague: GameEvent = { type: "effect_started", effect: "plague", siteId: site.id, bannerIds: ["b1", "b2", "b3"], playerId: "P2" };

    expect(feedItemsFor([plague], sickened, map, "P1")).toMatchObject([
      { actorId: "P2", text: `Bertram spread the Plague around ${place}: 1 of your Banners fell sick`, at: { x: site.x, y: site.y }, againstViewer: true },
    ]);
    expect(feedItemsFor([plague], sickened, map, "P2")).toEqual([]);
  });

  it("tells a hand swap and a card's taking to the player they hit", () => {
    const swap: GameEvent = { type: "hands_swapped", playerId: "P2", opponentId: "P1", handSize: 4, opponentHandSize: 2 };
    const taken: GameEvent = { type: "resource_transferred", fromPlayerId: "P1", toPlayerId: "P2", resource: "grain", amount: 1, reason: "card_effect" };

    expect(feedItemsFor([swap, taken], state, map, "P1")).toMatchObject([
      { text: "Bertram swapped hands with you: you now hold 2 card(s)", againstViewer: true },
      { text: "Bertram took 1 Grain from you", againstViewer: true },
    ]);
    expect(feedItemsFor([swap, taken], state, map, "P3").map((i) => i.text)).toEqual(["Bertram swapped hands with Alice"]);
    expect(feedItemsFor([taken], state, map, "P2")).toEqual([]);
  });

  it("marks the omen for every viewer", () => {
    const omen: GameEvent = { type: "card_foretold", cardId: "ragnarok#1" };

    for (const viewer of ["P1", "P2", null]) {
      expect(feedItemsFor([omen], state, map, viewer)).toEqual([
        {
          actorId: null,
          text: "Ragnarök has been foretold! It now lies somewhere in the deck",
          at: null,
          gains: null,
          againstViewer: false,
          self: false,
          omen: true,
        },
      ]);
    }
  });
});

describe("listText", () => {
  it("joins with commas and a final 'and'", () => {
    expect(listText(["A"])).toBe("A");
    expect(listText(["A", "B", "C"])).toBe("A, B and C");
  });
});

describe("awayDigest", () => {
  const batch = (seq: number, playerId: string, seenBy: string[]): FeedBatch => ({ seq, events: [manor(playerId)], state, seenBy: new Set(seenBy) });

  it("stays quiet after a few actions the viewer watched", () => {
    const batches = Array.from({ length: DIGEST_MIN_ITEMS - 1 }, (_, i) => batch(i + 1, "P2", ["P1"]));

    expect(awayDigest(batches, map, "P1", 0)).toBeNull();
  });

  it("lists many actions even if the viewer watched them", () => {
    const batches = Array.from({ length: DIGEST_MIN_ITEMS }, (_, i) => batch(i + 1, "P2", ["P1"]));

    expect(awayDigest(batches, map, "P1", 0)).toHaveLength(DIGEST_MIN_ITEMS);
  });

  it("lists anything the viewer missed behind the curtain, but not their own actions", () => {
    const batches = [batch(1, "P1", ["P1"]), batch(2, "P2", [])];

    expect(awayDigest(batches, map, "P1", 0)?.map((i) => i.actorId)).toEqual(["P2"]);
  });

  it("starts after what the viewer has already caught up on", () => {
    const batches = [batch(1, "P2", []), batch(2, "P3", ["P1"])];

    expect(awayDigest(batches, map, "P1", 1)).toBeNull();
  });
});
