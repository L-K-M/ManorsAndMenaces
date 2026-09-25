import { GREENVALE_MAP } from "@manors-menaces/content";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { boundsOf, pathPoints, type Point } from "../src/lib/stores/camera.js";

// Drives the real camera store with a fake 60 fps clock. viewport.svelte.ts
// is a runes module: outside the Svelte compiler `$state` is an ordinary
// global call, so the identity stands in for it.

const FRAME_MS = 1000 / 60;
let now = 0;
let callbacks = new Map<number, FrameRequestCallback>();
let nextId = 1;

function advance(ms: number): void {
  const end = now + ms;
  while (now < end) {
    now += FRAME_MS;
    const due = [...callbacks.values()];
    callbacks = new Map();
    for (const cb of due) cb(now);
  }
}

/** Presses a key at 0 ms, auto-repeats every 33 ms from 500 ms, releases at 1000 ms. */
function holdKey(press: () => void): void {
  press();
  advance(500);
  for (let t = 500; t < 1000; t += 33) {
    press();
    advance(33);
  }
}

type Viewport = typeof import("../src/lib/stores/viewport.svelte.js");
let vp: Viewport;

beforeAll(async () => {
  vi.stubGlobal("$state", <T>(value: T) => value);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    callbacks.set(nextId, cb);
    return nextId++;
  });
  vp = await import("../src/lib/stores/viewport.svelte.js");
  const coast: Point[] = GREENVALE_MAP.regions.flatMap((r) => pathPoints(r.path));
  vp.setWorld(boundsOf(coast)!, coast);
  vp.setContainer(1400, 800);
});

describe("held camera keys", () => {
  it("keep the camera moving while an arrow key is held and stop soon after release", () => {
    vp.resetView("instant");
    vp.zoomBy(3, "instant");
    advance(100);
    const start = vp.viewport.box.x;
    holdKey(() => vp.nudge(0.1, 0));
    const atRelease = vp.viewport.box.x;
    advance(1000);
    const settled = vp.viewport.box.x;
    const width = vp.viewport.box.w;
    // Before the fix the view crawled (about 60 units in a second) and then
    // swept more than a view width after release.
    expect(atRelease - start).toBeGreaterThan(width);
    expect(settled - atRelease).toBeLessThan(0.5 * width);
  });

  it("keep zooming while + is held instead of catching up after release", () => {
    vp.resetView("instant");
    advance(100);
    const home = vp.viewport.box.w;
    holdKey(() => vp.zoomBy(1.2));
    const atRelease = home / vp.viewport.box.w;
    advance(1000);
    const settled = home / vp.viewport.box.w;
    expect(atRelease).toBeGreaterThan(0.7 * settled);
  });
});
