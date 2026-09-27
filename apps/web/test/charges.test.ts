import { describe, expect, it } from "vitest";
import { EN } from "@manors-menaces/content";
import { clone, mvpRuleset, type GameEvent, type GameState, type PlayerId } from "@manors-menaces/rules";
import { mapFor } from "../src/lib/game/engine.js";
import { chargeChoices, chargeDescription, chargeName, heldCharge, revealedCharges } from "../src/lib/game/charges.js";
import { feedItemsFor } from "../src/lib/game/feed.js";
import { formatEvents } from "../src/lib/game/log.js";
import { engine, playGame } from "./helpers.js";

// Sealed Charges (§27A) on screen: your own Charge and its progress, the
// Charges drawn for you, and every Charge once revealed. What a player drew
// or kept is never named in the Chronicle or the feed, which in hot-seat
// play everyone at the device reads.

const map = mapFor("greenvale");
const game = playGame({ ...mvpRuleset(), sealedCharges: true }, "charges-ui", 2, 0);
const start = game.initial;
const [first, second] = start.turnOrder as [PlayerId, PlayerId];
const drawn = start.pending?.kind === "charge" ? start.pending.chargeIds : [];
const chargeNames = Object.keys(EN)
  .filter((k) => /^charge\.[a-z_]+\.name$/.test(k))
  .map((k) => EN[k] as string);

function keep(s: GameState, playerId: PlayerId, chargeId: string): { state: GameState; events: GameEvent[] } {
  const r = engine.applyCommand(s, { type: "choose_charge", chargeId, commandId: `keep-${playerId}`, matchId: s.matchId, playerId });
  if (!r.newState) throw new Error(r.error?.code);
  return { state: r.newState, events: r.events };
}

describe("the Charges drawn", () => {
  it("are offered to the player choosing, and to nobody else", () => {
    expect(drawn).toHaveLength(2);
    expect(chargeChoices(start, first)).toEqual(drawn);
    expect(chargeChoices(start, second)).toEqual([]);
    expect(chargeChoices(start, null)).toEqual([]);
  });

  it("have a name and a description", () => {
    for (const id of drawn) {
      expect(chargeName(id)).toBe(EN[`charge.${id}.name`]);
      expect(chargeDescription(id)).toBe(EN[`charge.${id}.description`]);
    }
  });
});

describe("your Charge", () => {
  const kept = keep(start, first, drawn[0] as string).state;

  it("shows with its progress to its holder only", () => {
    expect(heldCharge(engine.ctx, kept, first)).toMatchObject({ id: drawn[0], progress: { complete: false } });
    expect(heldCharge(engine.ctx, kept, second)).toBeNull();
    // Behind the hot-seat curtain nobody's Charge shows.
    expect(heldCharge(engine.ctx, kept, null)).toBeNull();
  });

  it("is listed for everyone once revealed, in turn order", () => {
    const s = clone(kept);
    s.players[second]!.revealedChargeIds = ["merchant_venturer"];
    s.players[first]!.revealedChargeIds = ["troll_herder", "seat_at_court"];
    expect(revealedCharges(s)).toEqual([
      { playerId: first, chargeId: "troll_herder" },
      { playerId: first, chargeId: "seat_at_court" },
      { playerId: second, chargeId: "merchant_venturer" },
    ]);
  });
});

describe("the Chronicle and the feed", () => {
  const { events } = keep(start, first, drawn[1] as string);

  it("say a Charge was drawn and kept, never which", () => {
    const lines = formatEvents(events, start, map).map((e) => e.text);
    expect(lines).toEqual(["Player 1 sealed a Charge.", "Player 2 drew 2 Sealed Charges to choose from."]);
    for (const line of lines) for (const name of chargeNames) expect(line).not.toContain(name);
    expect(feedItemsFor(events, start, map, second)).toEqual([]);
  });

  it("name a Charge once it is revealed, and tell a Recommission", () => {
    const revealed: GameEvent = { type: "charge_revealed", playerId: first, chargeId: "merchant_venturer", renown: 2 };
    const recommissioned: GameEvent = { type: "charge_recommissioned", playerId: second };
    expect(formatEvents([revealed, recommissioned], start, map).map((e) => [e.kind, e.text])).toEqual([
      ["important", "Player 1 revealed the Sealed Charge Merchant Venturer (+2 Renown)."],
      ["important", "Player 2 recommissioned their Sealed Charge, unrevealed."],
    ]);
    expect(feedItemsFor([revealed], start, map, second).map((i) => i.text)).toEqual(["Player 1 revealed the Sealed Charge Merchant Venturer (+2 Renown)"]);
    expect(feedItemsFor([recommissioned], start, map, first).map((i) => i.text)).toEqual(["Player 2 recommissioned their Sealed Charge"]);
  });
});
