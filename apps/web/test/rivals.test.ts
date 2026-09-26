import { describe, expect, it } from "vitest";
import { RIVALS } from "@manors-menaces/content";
import type { SeatConfig } from "@manors-menaces/protocol";
import { assignRivals, distinctRivals, freeRival, rivalName, rivalsTakenBy, seatRival } from "../src/lib/game/rivals.js";

const ids = RIVALS.map((r) => r.id);

describe("assignRivals", () => {
  it("gives every AI seat a distinct rival and humans none", () => {
    const out = assignRivals(["human", "ai", "ai", "ai"]);
    expect(out[0]).toBeUndefined();
    expect(out.slice(1)).toEqual(ids.slice(0, 3));
  });

  it("starts at the offset and wraps around the roster", () => {
    const last = RIVALS.length - 1;
    const out = assignRivals(["ai", "ai", "human", "ai"], last);
    expect(out).toEqual([ids[last], ids[0], undefined, ids[1]]);
    expect(new Set(out.filter(Boolean)).size).toBe(3);
  });

  it("stays distinct for every offset", () => {
    for (let offset = -3; offset < RIVALS.length * 2; offset++) {
      const out = assignRivals(["ai", "ai", "ai", "ai"], offset);
      expect(new Set(out).size, `offset ${offset}`).toBe(4);
      expect(out.every((id) => id && ids.includes(id))).toBe(true);
    }
  });
});

describe("freeRival", () => {
  it("skips taken rivals in roster order", () => {
    expect(freeRival([ids[0], ids[1]])).toBe(ids[2]);
    expect(freeRival([ids[2]], 2)).toBe(ids[3]);
    expect(freeRival([undefined])).toBe(ids[0]);
  });

  it("returns undefined when all are taken", () => {
    expect(freeRival(ids)).toBeUndefined();
  });
});

describe("rivalsTakenBy", () => {
  const seats = [{ kind: "human" as const }, { kind: "ai" as const, rivalId: ids[0] }, { kind: "ai" as const, rivalId: ids[1] }, { kind: "ai" as const, rivalId: ids[2] }];

  it("counts only the other AI seats in play", () => {
    expect(rivalsTakenBy(seats, 1, 2)).toEqual([]);
    expect(rivalsTakenBy(seats, 1, 3)).toEqual([ids[1]]);
    expect(rivalsTakenBy(seats, 3, 4)).toEqual([ids[0], ids[1]]);
  });
});

describe("distinctRivals", () => {
  it("gives a seat brought back into play a rival no seat in play holds", () => {
    // Seat 2 took seat 3's rival while seat 3 was out of the game.
    const seats = [{ kind: "human" as const }, { kind: "ai" as const, rivalId: ids[1] }, { kind: "ai" as const, rivalId: ids[1] }, { kind: "ai" as const, rivalId: ids[2] }];
    expect(distinctRivals(seats, 2)).toEqual(seats.map((s) => s.rivalId));
    const out = distinctRivals(seats, 4);
    expect(out[1]).toBe(ids[1]);
    expect(new Set(out.slice(1)).size).toBe(3);
  });

  it("fills an AI seat without a rival and leaves humans alone", () => {
    const out = distinctRivals([{ kind: "ai" }, { kind: "human", rivalId: ids[0] }, { kind: "ai", rivalId: ids[0] }], 3);
    expect(out[1]).toBe(ids[0]);
    expect(out[2]).toBe(ids[0]);
    expect(out[0]).toBeDefined();
    expect(out[0]).not.toBe(ids[0]);
  });
});

describe("seatRival", () => {
  const seat = (over: Partial<SeatConfig>): SeatConfig => ({ playerId: "P2", displayName: "Someone", kind: "ai", aiLevel: "normal", color: 1, ...over });
  const grum = RIVALS.find((r) => r.id === "grum")!;

  it("uses the stored rival id, whatever the seat is called", () => {
    expect(seatRival(seat({ rivalId: "grum", displayName: "Renamed" }))?.id).toBe("grum");
  });

  it("recognises an old or online AI seat by its rival's name", () => {
    expect(seatRival(seat({ displayName: rivalName(grum) }))?.id).toBe("grum");
    expect(seatRival(seat({ displayName: "Lord Mumble" }))?.id).toBe("lord_mumble");
    expect(seatRival(seat({ displayName: "Sir Brash" }))?.id).toBe("sir_brash");
    expect(seatRival(seat({ displayName: "Emperor Mumble" }))?.id).toBe("lord_mumble");
    expect(seatRival(seat({ displayName: "Dame Brash" }))?.id).toBe("sir_brash");
  });

  it("never gives a human seat a rival", () => {
    expect(seatRival(seat({ kind: "human", displayName: rivalName(grum), rivalId: "grum" }))).toBeUndefined();
  });

  it("returns undefined for an AI seat without a known rival", () => {
    expect(seatRival(seat({}))).toBeUndefined();
    expect(seatRival(seat({ rivalId: "retired" }))).toBeUndefined();
    expect(seatRival(undefined)).toBeUndefined();
  });
});
