import { describe, expect, it } from "vitest";
import {
  HOME_PADDING,
  clampBox,
  fitBox,
  frameTargets,
  homeBox,
  interpolateBox,
  isDoubleTap,
  isDrag,
  panBox,
  pathPoints,
  pinchBox,
  resizeBox,
  screenToBoard,
  visibleFraction,
  wheelIntent,
  zoomBox,
  zoomRange,
  type CameraLimits,
  type ViewBox,
} from "../src/lib/stores/camera.js";

const world: ViewBox = { x: 100, y: 80, w: 1400, h: 840 };
const landscape: CameraLimits = { world, aspect: 1400 / 800 };
const portrait: CameraLimits = { world, aspect: 412 / 428 };

const wheel = (deltaX: number, deltaY: number, extra: { deltaMode?: number; ctrlKey?: boolean } = {}) =>
  wheelIntent({ deltaX, deltaY, deltaMode: extra.deltaMode ?? 0, ctrlKey: extra.ctrlKey ?? false });

describe("fitting", () => {
  it("fits the island to the container aspect with padding", () => {
    const home = homeBox(portrait);
    expect(home.w / home.h).toBeCloseTo(portrait.aspect, 9);
    expect(home.w).toBeCloseTo(world.w + 2 * HOME_PADDING, 9);
    expect(home.x + home.w / 2).toBeCloseTo(world.x + world.w / 2, 9);
    expect(home.y + home.h / 2).toBeCloseTo(world.y + world.h / 2, 9);
  });

  it("frames a tall selection by its height in a portrait container", () => {
    const box = fitBox({ x: 500, y: 300, w: 100, h: 300 }, 412 / 428, 90);
    expect(box.h).toBeCloseTo(300 + 2 * 90, 9);
    expect(box.w / box.h).toBeCloseTo(412 / 428, 9);
  });

  it("reads coastline coordinates", () => {
    expect(pathPoints("M1544,500L1547.1,516L-3.5,1e2Z")).toEqual([
      { x: 1544, y: 500 },
      { x: 1547.1, y: 516 },
      { x: -3.5, y: 100 },
    ]);
  });
});

describe("limits", () => {
  it("never zooms past the range, whatever the factor", () => {
    const { minW, maxW } = zoomRange(landscape);
    const home = homeBox(landscape);
    const centre = { x: home.x + home.w / 2, y: home.y + home.h / 2 };
    expect(zoomBox(home, 1000, centre, landscape).w).toBeCloseTo(minW, 9);
    expect(zoomBox(home, 0.001, centre, landscape).w).toBeCloseTo(maxW, 9);
    // The short side keeps at least 200 board units in either orientation.
    expect(minW / landscape.aspect).toBeCloseTo(200, 9);
    expect(zoomRange(portrait).minW).toBe(200);
  });

  it("cannot pan the island off-screen", () => {
    // Whatever the zoom and however far the pan, at least half the view on
    // each axis is island (or the whole island shows).
    const { minW, maxW } = zoomRange(landscape);
    const overlap = (a: number, aw: number, b: number, bw: number) => Math.min(a + aw, b + bw) - Math.max(a, b);
    for (const w of [minW, 800, homeBox(landscape).w, maxW]) {
      for (const [x, y] of [
        [99999, -99999],
        [-99999, 99999],
      ] as const) {
        const b = clampBox({ x, y, w, h: w / landscape.aspect }, landscape);
        expect(overlap(b.x, b.w, world.x, world.w)).toBeGreaterThanOrEqual(Math.min(0.5 * b.w, world.w) - 1e-9);
        expect(overlap(b.y, b.h, world.y, world.h)).toBeGreaterThanOrEqual(Math.min(0.5 * b.h, world.h) - 1e-9);
      }
    }
  });

  it("leaves a legal view unchanged", () => {
    const home = homeBox(landscape);
    expect(clampBox(home, landscape)).toEqual(home);
  });
});

describe("zoom and pan", () => {
  it("keeps the anchor point fixed on screen when zooming", () => {
    const box = homeBox(landscape);
    const size = { w: 1400, h: 800 };
    const screen = { x: 300, y: 200 };
    const anchor = screenToBoard(box, size, screen);
    const zoomed = zoomBox(box, 1.5, anchor, landscape);
    const after = screenToBoard(zoomed, size, screen);
    expect(after.x).toBeCloseTo(anchor.x, 9);
    expect(after.y).toBeCloseTo(anchor.y, 9);
    expect(zoomed.w).toBeCloseTo(box.w / 1.5, 9);
  });

  it("pans the content with the pointer", () => {
    const box = { x: 10, y: 20, w: 300, h: 200 };
    expect(panBox(box, 30, -5)).toEqual({ x: -20, y: 25, w: 300, h: 200 });
  });

  it("pinch keeps the board point under the fingers and follows their midpoint", () => {
    const size = { w: 412, h: 428 };
    const box = zoomBox(homeBox(portrait), 2, { x: 800, y: 500 }, portrait);
    const prev: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 150, y: 200 },
      { x: 250, y: 200 },
    ];
    const cur: typeof prev = [
      { x: 130, y: 280 },
      { x: 290, y: 280 },
    ];
    const under = screenToBoard(box, size, { x: 200, y: 200 });
    const next = pinchBox(box, size, prev, cur, portrait);
    const now = screenToBoard(next, size, { x: 210, y: 280 });
    expect(now.x).toBeCloseTo(under.x, 6);
    expect(now.y).toBeCloseTo(under.y, 6);
    expect(next.w).toBeCloseTo(box.w / 1.6, 6);
  });
});

describe("wheel", () => {
  it("pans on trackpad scrolls in both axes", () => {
    expect(wheel(40, 0)).toEqual({ kind: "pan", dx: -40, dy: -0 });
    expect(wheel(0, -2)).toEqual({ kind: "pan", dx: -0, dy: 2 });
    expect(wheel(3, 12.5)).toEqual({ kind: "pan", dx: -3, dy: -12.5 });
  });

  it("zooms gently on a mouse notch", () => {
    const i = wheel(0, -100);
    expect(i.kind).toBe("zoom");
    if (i.kind === "zoom") expect(i.factor).toBeCloseTo(Math.exp(0.15), 9);
    const out = wheel(0, 100);
    if (out.kind === "zoom") expect(out.factor).toBeLessThan(1);
    expect(wheel(0, 3, { deltaMode: 1 }).kind).toBe("zoom");
  });

  it("zooms on ctrl+wheel (trackpad pinch) and clamps the step", () => {
    const i = wheel(0, -10, { ctrlKey: true });
    if (i.kind !== "zoom") throw new Error("expected zoom");
    expect(i.factor).toBeCloseTo(Math.exp(0.1), 9);
    const huge = wheel(0, -5, { ctrlKey: true, deltaMode: 2 });
    if (huge.kind !== "zoom") throw new Error("expected zoom");
    expect(huge.factor).toBe(2);
  });

  it("normalises line and page units", () => {
    const i = wheel(0, -1, { deltaMode: 1, ctrlKey: true });
    if (i.kind !== "zoom") throw new Error("expected zoom");
    expect(i.factor).toBeCloseTo(Math.exp(0.16), 9);
  });
});

describe("drag threshold", () => {
  it("measures from where the press began, not the last move", () => {
    const down = { x: 100, y: 100 };
    expect(isDrag(down, { x: 102, y: 100 }, "mouse")).toBe(false);
    expect(isDrag(down, { x: 104, y: 100 }, "mouse")).toBe(true);
    expect(isDrag(down, { x: 106, y: 100 }, "touch")).toBe(false);
    expect(isDrag(down, { x: 106, y: 106 }, "touch")).toBe(true);
    expect(isDrag(down, { x: 106, y: 106 }, "pen")).toBe(true);
  });
});

describe("double tap", () => {
  it("needs two taps close in time and space", () => {
    const first = { at: 1000, x: 50, y: 50 };
    expect(isDoubleTap(null, first)).toBe(false);
    expect(isDoubleTap(first, { at: 1250, x: 60, y: 55 })).toBe(true);
    expect(isDoubleTap(first, { at: 1400, x: 50, y: 50 })).toBe(false);
    expect(isDoubleTap(first, { at: 1100, x: 90, y: 50 })).toBe(false);
  });
});

describe("framing targets", () => {
  const zoomedIn: ViewBox = { x: 150, y: 120, w: 350, h: 200 };

  it("leaves the camera alone when most targets are visible", () => {
    const pts = [
      { x: 200, y: 150 },
      { x: 300, y: 200 },
      { x: 1400, y: 800 },
    ];
    expect(frameTargets(zoomedIn, pts, landscape, 90)).toBeNull();
  });

  it("pans without zooming when the targets fit at the current zoom", () => {
    const pts = [
      { x: 900, y: 500 },
      { x: 1000, y: 540 },
    ];
    const next = frameTargets(zoomedIn, pts, landscape, 40);
    expect(next).not.toBeNull();
    expect(next!.w).toBeCloseTo(zoomedIn.w, 9);
    expect(visibleFraction(pts, next!)).toBe(1);
  });

  it("zooms out just enough to show far-apart targets", () => {
    const pts = [
      { x: 200, y: 900 },
      { x: 1400, y: 150 },
    ];
    const next = frameTargets(zoomedIn, pts, landscape, 60);
    expect(next).not.toBeNull();
    expect(visibleFraction(pts, next!)).toBe(1);
    // Height-bound: (750 + 2 × 60) × aspect.
    expect(next!.w).toBeCloseTo(870 * landscape.aspect, 6);
  });
});

describe("motion and resize", () => {
  it("tweens from one view to another", () => {
    const a = { x: 0, y: 0, w: 400, h: 200 };
    const b = { x: 1000, y: 500, w: 100, h: 50 };
    expect(interpolateBox(a, b, 0)).toEqual(a);
    const end = interpolateBox(a, b, 1);
    expect(end.x).toBeCloseTo(b.x, 9);
    expect(end.w).toBeCloseTo(b.w, 9);
    expect(interpolateBox(a, b, 0.5).w).toBeCloseTo(200, 9);
  });

  it("keeps the centre and scale when the container resizes", () => {
    const box = { x: 100, y: 100, w: 700, h: 400 };
    const next = resizeBox(box, { w: 1400, h: 800 }, { w: 412, h: 800 });
    expect(next.w / next.h).toBeCloseTo(412 / 800, 9);
    expect(next.w).toBeCloseTo(206, 9);
    expect(next.x + next.w / 2).toBeCloseTo(450, 9);
    expect(next.y + next.h / 2).toBeCloseTo(300, 9);
  });
});
