import { describe, expect, it } from "vitest";
import { RIVALS } from "@manors-menaces/content";
import type { SeatConfig } from "@manors-menaces/protocol";
import { assignRivals, freeRival, rivalName, seatRival } from "../src/lib/game/rivals.js";

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

describe("seatRival", () => {
  const seat = (over: Partial<SeatConfig>): SeatConfig => ({ playerId: "P2", displayName: "Someone", kind: "ai", aiLevel: "normal", color: 1, ...over });
  const grum = RIVALS.find((r) => r.id === "grum")!;

  it("uses the stored rival id, whatever the seat is called", () => {
    expect(seatRival(seat({ rivalId: "grum", displayName: "Renamed" }))?.id).toBe("grum");
  });

  it("recognises an old or online AI seat by its rival's name", () => {
    expect(seatRival(seat({ displayName: rivalName(grum) }))?.id).toBe("grum");
    expect(seatRival(seat({ displayName: "Lord Mumble" }))?.id).toBe("lord_mumble");
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
