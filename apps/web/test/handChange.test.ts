import { describe, expect, it } from "vitest";
import { GREENVALE_MAP as map } from "@manors-menaces/content";
import { RULESET_VERSION, standardRuleset, type GameEvent, type GameState } from "@manors-menaces/rules";
import { engineFor } from "../src/lib/game/engine.js";
import { handSwapFor, nextHandSwaps } from "../src/lib/game/handChange.js";

const start: GameState = engineFor(map.id).createGame({
  matchId: "hand-change-test",
  seed: "hand-change-test",
  rulesetVersion: RULESET_VERSION,
  ruleset: standardRuleset(3),
  players: [
    { id: "P1", displayName: "Alice" },
    { id: "P2", displayName: "Bertram" },
    { id: "P3", displayName: "Cordelia" },
  ],
});

function withHands(hands: Record<string, string[]>): GameState {
  const s = structuredClone(start);
  for (const [id, hand] of Object.entries(hands)) s.players[id]!.hand = hand;
  return s;
}

const mine = ["unreliable_bard#1", "wizard_interference#3"];
const theirs = ["dragons_landing#1", "arcane_exchange#2"];
const before = withHands({ P1: mine, P2: [...theirs, "changeling#1"], P3: [] });
const after = withHands({ P1: theirs, P2: mine, P3: [] });
const swapped: GameEvent[] = [
  { type: "card_played", playerId: "P2", cardId: "changeling#1" },
  { type: "hands_swapped", playerId: "P2", opponentId: "P1", handSize: 2, opponentHandSize: 2 },
];

describe("handSwapFor", () => {
  it("tells the player whose hand was taken what they gave up and what they got", () => {
    expect(handSwapFor(swapped, before, after, "P1")).toEqual({ by: "P2", gave: mine, got: theirs });
  });

  it("tells nobody else: the player who swapped chose to, and others did not lose cards", () => {
    expect(handSwapFor(swapped, before, after, "P2")).toBeNull();
    expect(handSwapFor(swapped, before, after, "P3")).toBeNull();
  });

  it("does not count cards dealt in the same batch as part of the swap", () => {
    const dealt = withHands({ P1: [...theirs, "fire_bolt#2"], P2: mine, P3: [] });
    const events: GameEvent[] = [...swapped, { type: "cards_dealt", playerId: "P1", cardIds: ["fire_bolt#2"], count: 1, reason: "round" }];

    expect(handSwapFor(events, before, dealt, "P1")).toEqual({ by: "P2", gave: mine, got: theirs });
  });

  it("is null when no hands were swapped", () => {
    const events: GameEvent[] = [{ type: "cards_dealt", playerId: "P1", cardIds: ["fire_bolt#2"], count: 1, reason: "round" }];

    expect(handSwapFor(events, before, withHands({ P1: [...mine, "fire_bolt#2"] }), "P1")).toBeNull();
  });
});

describe("nextHandSwaps", () => {
  const none = new Map();
  const notice = { by: "P2", gave: mine, got: theirs };

  it("adds a notice for the player whose hand was taken", () => {
    expect(nextHandSwaps(none, { events: swapped, state: after }, before, null)).toEqual(new Map([["P1", notice]]));
  });

  it("keeps it through other players' batches and drops it when that player's own turn ends", () => {
    const shown = new Map([["P1", notice]]);
    const quiet = { events: [] as GameEvent[], state: after };

    expect(nextHandSwaps(shown, quiet, after, null)).toBe(shown);
    expect(nextHandSwaps(shown, quiet, after, "P3")).toBe(shown);
    expect(nextHandSwaps(shown, quiet, after, "P1")).toEqual(new Map());
  });

  it("shows a swap that resolves in the player's own batch, such as passing on a reaction", () => {
    expect(nextHandSwaps(none, { events: swapped, state: after }, before, "P1")).toEqual(new Map([["P1", notice]]));
  });
});
