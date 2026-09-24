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
    expect(nextView(mode, NONE, "alice", true)).toEqual({ viewerId: null, curtainFor: "alice" });
  });

  it("hides the previous hand while an AI acts", () => {
    expect(nextView(mode, { viewerId: "bertram", curtainFor: null }, "cordelia", false)).toEqual(NONE);
  });

  it("puts up the curtain between different humans and shows nobody behind it", () => {
    expect(nextView(mode, { viewerId: "alice", curtainFor: null }, "bertram", true)).toEqual({ viewerId: null, curtainFor: "bertram" });
  });

  it("keeps the view while the same human keeps acting or is still being waited for", () => {
    const alice = { viewerId: "alice", curtainFor: null };
    expect(nextView(mode, alice, "alice", true)).toBe(alice);
    const waiting = { viewerId: null, curtainFor: "bertram" };
    expect(nextView(mode, waiting, "bertram", true)).toBe(waiting);
  });

  it("shows the hand only once the human takes the device", () => {
    expect(revealView({ viewerId: null, curtainFor: "bertram" })).toEqual({ viewerId: "bertram", curtainFor: null });
    expect(revealView(NONE)).toBe(NONE);
  });

  it("keeps the view when nobody can act", () => {
    const alice = { viewerId: "alice", curtainFor: null };
    expect(nextView(mode, alice, null, false)).toBe(alice);
  });
});

describe("shared view", () => {
  const mode = PrivacyMode.Shared;

  it("follows the humans and keeps the last one through AI turns", () => {
    expect(initialView(mode, "alice")).toEqual({ viewerId: "alice", curtainFor: null });
    const alice = { viewerId: "alice", curtainFor: null };
    expect(nextView(mode, alice, "cordelia", false)).toBe(alice);
    expect(nextView(mode, alice, "bertram", true)).toEqual({ viewerId: "bertram", curtainFor: null });
  });
});
