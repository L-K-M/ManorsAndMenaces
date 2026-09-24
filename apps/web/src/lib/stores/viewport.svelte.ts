// Board camera (spec §48): pan, zoom, reset, zoom-to-selection and framing.
// The board shows the rectangle `viewport.box` of board units. The math
// lives in camera.ts; this module owns the state.
//
// Input handlers update `current` synchronously (cheap arithmetic) and the
// reactive `viewport.box` is written at most once per animation frame, so a
// burst of pointer or wheel events costs one board update, not one each.

import { animationScale } from "./settings.svelte.js";
import {
  boundsOf,
  clampBox,
  easeInOutCubic,
  fitBox,
  frameTargets,
  homeBox,
  interpolateBox,
  panBox,
  pinchBox,
  resizeBox,
  screenToBoard,
  zoomBox,
  type CameraLimits,
  type Point,
  type Size,
  type ViewBox,
} from "./camera.js";

export type { Point, ViewBox };

/** Whether a camera move jumps or glides (glides respect reduced motion). */
export type Motion = "instant" | "animate";

export const viewport: { box: ViewBox } = $state({ box: { x: 0, y: 0, w: 1600, h: 1000 } });

const FLIGHT_MS = 320;

let world: ViewBox = { x: 0, y: 0, w: 1600, h: 1000 };
/** Container size in CSS px; null until the board has been measured. */
let size: Size | null = null;
/** The latest camera, at most one frame ahead of `viewport.box`. */
let current: ViewBox = { ...viewport.box };
/** True until the player moves the camera, so a resize can refit the island. */
let atHome = true;
let frame = 0;
let flight: { from: ViewBox; to: ViewBox; start: number | null; ms: number } | null = null;

function limits(): CameraLimits {
  return { world, aspect: size ? size.w / size.h : world.w / world.h };
}

function schedule(): void {
  if (frame) return;
  if (typeof requestAnimationFrame !== "function") {
    render(0);
    return;
  }
  frame = requestAnimationFrame(render);
}

function render(now: number): void {
  frame = 0;
  if (flight) {
    flight.start ??= now;
    const t = Math.min(1, (now - flight.start) / flight.ms);
    current = interpolateBox(flight.from, flight.to, easeInOutCubic(t));
    if (t < 1) schedule();
    else flight = null;
  }
  viewport.box = { ...current };
}

/** Where the camera is heading: the end of a running glide, else the current view. */
function target(): ViewBox {
  return flight?.to ?? current;
}

function stopFlight(): void {
  flight = null;
}

function jump(box: ViewBox, home = false): void {
  stopFlight();
  current = clampBox(box, limits());
  atHome = home;
  schedule();
}

function move(box: ViewBox, motion: Motion, home = false): void {
  const to = clampBox(box, limits());
  const ms = FLIGHT_MS * animationScale();
  if (motion === "instant" || ms === 0 || typeof requestAnimationFrame !== "function") return jump(to, home);
  flight = { from: { ...current }, to, start: null, ms };
  atHome = home;
  schedule();
}

/** The island's extent in board units; the camera keeps it in reach. */
export function setWorld(bounds: ViewBox): void {
  if (bounds.x === world.x && bounds.y === world.y && bounds.w === world.w && bounds.h === world.h) return;
  world = { ...bounds };
  jump(homeBox(limits()), true);
}

/** The board's on-screen size in CSS px; the camera box always takes its aspect. */
export function setContainer(w: number, h: number): void {
  if (w <= 0 || h <= 0) return;
  const prev = size;
  if (prev && prev.w === w && prev.h === h) return;
  const from = target();
  size = { w, h };
  if (!prev || atHome) jump(homeBox(limits()), true);
  else jump(resizeBox(from, prev, size));
}

export function resetView(motion: Motion = "animate"): void {
  move(homeBox(limits()), motion, true);
}

/** Zoom around the centre of the view (buttons and keys). */
export function zoomBy(factor: number, motion: Motion = "animate"): void {
  const b = target();
  move(zoomBox(b, factor, { x: b.x + b.w / 2, y: b.y + b.h / 2 }, limits()), motion);
}

/** Zoom around a point given in container px (wheel, double tap). */
export function zoomAtScreen(factor: number, p: Point, motion: Motion = "instant"): void {
  if (!size) return;
  move(zoomBox(current, factor, screenToBoard(current, size, p), limits()), motion);
}

/** Move the content by (dx, dy) container px, as a drag or scroll does. */
export function panScreen(dx: number, dy: number): void {
  if (!size) return;
  const k = current.w / size.w;
  jump(panBox(current, dx * k, dy * k));
}

/** One step of a two-finger gesture, in container px. */
export function pinch(prev: [Point, Point], cur: [Point, Point]): void {
  if (!size) return;
  jump(pinchBox(current, size, prev, cur, limits()));
}

/** Shift the view by a fraction of its own size (arrow keys). */
export function nudge(fx: number, fy: number): void {
  const b = target();
  move({ ...b, x: b.x + fx * b.w, y: b.y + fy * b.h }, "animate");
}

/** Fit a set of board points, e.g. the local player's Holdings. */
export function zoomTo(points: readonly Point[], padding = 140): void {
  const bounds = boundsOf(points);
  if (!bounds) return resetView();
  move(fitBox(bounds, limits().aspect, padding), "animate");
}

/** Bring targets into view if most of them are off-screen; otherwise do nothing. */
export function frameIfHidden(points: readonly Point[], padding = 90): void {
  if (!size) return;
  const next = frameTargets(target(), points, limits(), padding);
  if (next) move(next, "animate");
}
