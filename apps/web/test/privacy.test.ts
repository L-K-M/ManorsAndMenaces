import { describe, expect, it } from "vitest";
import { PrivacyMode, initialView, nextView, privacyMode, revealView, type PrivacyView } from "../src/lib/game/privacy.js";

const NONE: PrivacyView = { viewerId: null, curtainFor: null };

describe("privacyMode", () => {
  it("is hot-seat only with two or more humans and the curtain on", () => {
    expect(privacyMode(2, true)).toBe(PrivacyMode.HotSeat);
    expect(privacyMode(1, true)).toBe(PrivacyMode.Shared);
    expect(privacyMode(3, false)).toBe(PrivacyMode.Shared);
  });
});

describe("hot-seat view", () => {
  const mode = PrivacyMode.HotSeat;

  it("starts with no hand shown, so a reload does not reveal the first human", () => {
    expect(initialView(mode, "alice")).toEqual(NONE);
    expect(nextView(mode, NONE, "alice", true, "alice")).toEqual({ viewerId: null, curtainFor: "alice" });
  });

  it("hides the previous hand while an AI acts", () => {
    expect(nextView(mode, { viewerId: "bertram", curtainFor: null }, "cordelia", false, "cordelia")).toEqual(NONE);
  });

  it("keeps the active human's view while an AI answers their Spell (§109)", () => {
    const alice = { viewerId: "alice", curtainFor: null };
    const reacting = nextView(mode, alice, "cordelia", false, "alice");
    expect(reacting).toBe(alice);
    expect(nextView(mode, reacting, "alice", true, "alice")).toBe(alice);
  });

  it("still hides a hand when an AI reacts during someone else's turn", () => {
    expect(nextView(mode, { viewerId: "bertram", curtainFor: null }, "dora", false, "cordelia")).toEqual(NONE);
  });

  it("puts up the curtain between different humans and shows nobody behind it", () => {
    expect(nextView(mode, { viewerId: "alice", curtainFor: null }, "bertram", true, "bertram")).toEqual({ viewerId: null, curtainFor: "bertram" });
  });

  it("keeps the view while the same human keeps acting or is still being waited for", () => {
    const alice = { viewerId: "alice", curtainFor: null };
    expect(nextView(mode, alice, "alice", true, "alice")).toBe(alice);
    const waiting = { viewerId: null, curtainFor: "bertram" };
    expect(nextView(mode, waiting, "bertram", true, "bertram")).toBe(waiting);
  });

  it("shows the hand only once the human takes the device", () => {
    expect(revealView({ viewerId: null, curtainFor: "bertram" })).toEqual({ viewerId: "bertram", curtainFor: null });
    expect(revealView(NONE)).toBe(NONE);
  });

  it("keeps the view when nobody can act", () => {
    const alice = { viewerId: "alice", curtainFor: null };
    expect(nextView(mode, alice, null, false, "alice")).toBe(alice);
  });
});

describe("shared view", () => {
  const mode = PrivacyMode.Shared;

  it("follows the humans and keeps the last one through AI turns", () => {
    expect(initialView(mode, "alice")).toEqual({ viewerId: "alice", curtainFor: null });
    const alice = { viewerId: "alice", curtainFor: null };
    expect(nextView(mode, alice, "cordelia", false, "cordelia")).toBe(alice);
    expect(nextView(mode, alice, "bertram", true, "bertram")).toEqual({ viewerId: "bertram", curtainFor: null });
  });
});
