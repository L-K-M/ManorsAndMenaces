import { describe, expect, it } from "vitest";
import { BoardAlign, LABEL, bannerSlot, boardToScreen, labelLod, screenScale, strokeWidth, wrapLabel } from "../src/lib/game/board-view.js";

const MAP = { w: 1600, h: 1000 };
// Board element sizes measured in the current layout.
const DESKTOP_1280 = { w: 930, h: 440 };
const PHONE = { w: 412, h: 428 };

describe("screenScale", () => {
  it("fits the viewBox inside the board like preserveAspectRatio meet", () => {
    expect(screenScale({ w: 800, h: 1000 }, MAP)).toBeCloseTo(0.5);
    expect(screenScale({ w: 3200, h: 1000 }, MAP)).toBeCloseTo(1);
  });

  it("maps board points to screen pixels for both alignments", () => {
    const box = { x: 0, y: 0, ...MAP };
    const board = { w: 800, h: 1000 };
    expect(boardToScreen({ x: 800, y: 500 }, box, board, BoardAlign.Middle)).toEqual({ x: 400, y: 500 });
    expect(boardToScreen({ x: 800, y: 500 }, box, board, BoardAlign.Top)).toEqual({ x: 400, y: 250 });
  });
});

describe("labelLod", () => {
  const onScreen = (size: number, k: number) => size * k;

  it("keeps Region names at least 10 px at 1280x720", () => {
    const k = screenScale(DESKTOP_1280, MAP);
    expect(onScreen(labelLod(k, 1).name, k)).toBeGreaterThanOrEqual(10);
  });

  it("grows names with the Text size setting", () => {
    const k = screenScale(DESKTOP_1280, MAP);
    expect(labelLod(k, 1.5).name).toBeGreaterThanOrEqual(labelLod(k, 1).name * 1.3);
  });

  it("hides names and notes on a phone's default view and shows names once zoomed in", () => {
    const k = screenScale(PHONE, MAP);
    const far = labelLod(k, 1);
    expect(far.name).toBe(0);
    expect(far.minor).toBe(0);
    expect(onScreen(far.badge, k)).toBeGreaterThanOrEqual(12);

    const zoomed = k * 1.25 * 1.25;
    expect(onScreen(labelLod(zoomed, 1).name, zoomed)).toBeGreaterThanOrEqual(10);
  });

  it("never shrinks labels below their base size when zoomed far in", () => {
    const near = labelLod(4, 1);
    expect(near.name).toBe(13);
    expect(near.landmark).toBe(11);
  });

  it("shows landmarks only when zoomed in past the default desktop view", () => {
    expect(labelLod(screenScale(DESKTOP_1280, MAP), 1).landmark).toBe(0);
    expect(labelLod(1, 1).landmark).toBeGreaterThan(0);
  });

  it("treats a missing text scale as 1", () => {
    expect(labelLod(0.6, Number.NaN)).toEqual(labelLod(0.6, 1));
  });
});

describe("strokeWidth", () => {
  it("keeps a minimum on-screen width and a minimum board width", () => {
    expect(strokeWidth(3, 0.25, 4)).toBe(12);
    expect(strokeWidth(3, 2, 4)).toBe(4);
  });
});

describe("wrapLabel", () => {
  it("balances lines", () => {
    expect(wrapLabel("Blocked by the Toll Troll", 20)).toEqual(["Blocked by the", "Toll Troll"]);
    expect(wrapLabel("Elderbough Thicket", 11)).toEqual(["Elderbough", "Thicket"]);
  });

  it("keeps short labels and long words on one line", () => {
    expect(wrapLabel("Brackenwold", 40)).toEqual(["Brackenwold"]);
    expect(wrapLabel("Shimmermere Ruins", 40)).toEqual(["Shimmermere Ruins"]);
    expect(wrapLabel("Supercalifragilistic", 8)).toEqual(["Supercalifragilistic"]);
  });
});

describe("bannerSlot", () => {
  // Flag geometry relative to its origin (Board.svelte): pole at x -6, tip at
  // x 12, hit area from y -26 to 4.
  const flag = (p: { x: number; y: number }) => ({ left: p.x - 6, right: p.x + 12, top: p.y - 26, bottom: p.y + 4 });

  it("places Banners below the capacity pips", () => {
    const pipBottom = LABEL.pipY + 4;
    for (let n = 1; n <= 3; n++) {
      for (let i = 0; i < n; i++) expect(flag(bannerSlot({ x: 0, y: 0 }, i, n)).top).toBeGreaterThan(pipBottom);
    }
  });

  it("centres Banners under the label without overlapping each other", () => {
    const slots = [0, 1, 2].map((i) => flag(bannerSlot({ x: 100, y: 0 }, i, 3)));
    expect((slots[0]!.left + slots[2]!.right) / 2).toBeCloseTo(100);
    expect(slots[1]!.left).toBeGreaterThan(slots[0]!.right);
  });

  it("keeps Banners clear of a Menace at x+40 (radius 19)", () => {
    const right = flag(bannerSlot({ x: 0, y: 0 }, 2, 3));
    const menaceBottom = 4 + 19;
    expect(right.top).toBeGreaterThan(menaceBottom);
  });
});
