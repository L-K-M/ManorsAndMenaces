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
