// Pure board-camera math (spec §48). The camera is the rectangle of board
// units on screen. Its aspect always matches the on-screen container, so
// screen and board coordinates convert with one scale and no layout reads.
// Everything here is side-effect free; viewport.svelte.ts owns the state.

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the camera must respect: the island's extent and the container shape. */
export interface CameraLimits {
  world: ViewBox;
  /** Container width / height. */
  aspect: number;
  /** The coastline polygon; when given, the view's centre always stays on land. */
  land?: readonly Point[];
}

/** Board units of sea kept around the island in the home view. */
export const HOME_PADDING = 60;
/** The most zoomed-in view still shows this many board units on its short side. */
const MIN_SHORT_SIDE = 200;
/** How far past the home view the player may zoom out. */
const MAX_ZOOM_OUT = 1.3;
/** A press becomes a drag once it moves this far (CSS px) from where it began. */
const DRAG_THRESHOLD_PX = { mouse: 4, touch: 8 } as const;
/** Two taps this close in time (ms) and space (CSS px) are a double tap. */
const DOUBLE_TAP = { ms: 300, px: 24 } as const;
/** Pixels per wheel "line" and "page" (WheelEvent.deltaMode 1 and 2). */
const WHEEL_LINE_PX = 16;
const WHEEL_PAGE_PX = 400;
/** Zoom per wheel pixel: gentle for mouse notches, stronger for pinch deltas. */
const WHEEL_ZOOM_RATE = 0.0015;
const PINCH_ZOOM_RATE = 0.01;
/** One wheel event never zooms by more than this factor either way. */
const MAX_WHEEL_FACTOR = 2;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Bounding box of a point set, or null for none. */
export function boundsOf(points: readonly Point[]): ViewBox | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * The coordinate pairs of an absolute polyline path ("M x,y L x,y … Z"),
 * which is what the map generator emits for the coastline.
 */
export function pathPoints(d: string): Point[] {
  const nums = (d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
  const out: Point[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i]!, y: nums[i + 1]! });
  return out;
}

/** The smallest box of `aspect` that contains `rect` grown by `padding`, centred on it. */
export function fitBox(rect: ViewBox, aspect: number, padding = 0): ViewBox {
  const w0 = rect.w + padding * 2;
  const h0 = rect.h + padding * 2;
  const w = Math.max(w0, h0 * aspect);
  const h = w / aspect;
  return { x: rect.x + rect.w / 2 - w / 2, y: rect.y + rect.h / 2 - h / 2, w, h };
}

/** The view that shows the whole island. */
export function homeBox(limits: CameraLimits): ViewBox {
  return fitBox(limits.world, limits.aspect, HOME_PADDING);
}

/** Allowed view widths, most zoomed in to most zoomed out. */
export function zoomRange(limits: CameraLimits): { minW: number; maxW: number } {
  const minW = limits.aspect >= 1 ? MIN_SHORT_SIDE * limits.aspect : MIN_SHORT_SIDE;
  const maxW = homeBox(limits).w * MAX_ZOOM_OUT;
  return { minW: Math.min(minW, maxW), maxW };
}

/** Whether `p` lies inside the polygon `poly` (even-odd rule). */
function insidePolygon(p: Point, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The point on the outline of `poly` nearest to `p`. */
function nearestOnPolygon(p: Point, poly: readonly Point[]): Point {
  let best = p;
  let bestD = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j]!;
    const b = poly[i]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len2 = ex * ex + ey * ey;
    const t = len2 > 0 ? clamp(((p.x - a.x) * ex + (p.y - a.y) * ey) / len2, 0, 1) : 0;
    const q = { x: a.x + t * ex, y: a.y + t * ey };
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

/**
 * Apply zoom limits (around the view centre) and match the aspect. Panning
 * keeps the view's centre on land (on the coastline at worst), so however
 * far the player pans, the island stays in view. Without a coastline the
 * centre is kept inside the island's bounds. Only the centre is limited: a
 * rule on how much sea may show would pin the view in place at some zoom
 * levels, which makes a pinch drift away from under the fingers.
 */
export function clampBox(box: ViewBox, limits: CameraLimits): ViewBox {
  const { minW, maxW } = zoomRange(limits);
  const w = clamp(box.w, minW, maxW);
  const h = w / limits.aspect;
  const { world, land } = limits;
  let c = { x: clamp(box.x + box.w / 2, world.x, world.x + world.w), y: clamp(box.y + box.h / 2, world.y, world.y + world.h) };
  if (land && land.length >= 3 && !insidePolygon(c, land)) c = nearestOnPolygon(c, land);
  return { x: c.x - w / 2, y: c.y - h / 2, w, h };
}

/**
 * The most board area the camera can ever show: the island's bounds grown by
 * half the widest view, since the view's centre never leaves those bounds.
 * The sea is drawn over this area so no bare edge ever shows.
 */
export function reachBox(limits: CameraLimits): ViewBox {
  const { maxW } = zoomRange(limits);
  const maxH = maxW / limits.aspect;
  const { world } = limits;
  return { x: world.x - maxW / 2, y: world.y - maxH / 2, w: world.w + maxW, h: world.h + maxH };
}

/** Container-relative CSS pixels to board units. */
export function screenToBoard(box: ViewBox, size: Size, p: Point): Point {
  return { x: box.x + (p.x * box.w) / size.w, y: box.y + (p.y * box.h) / size.h };
}

/** Move the content by (dx, dy) board units, as when dragging it. */
export function panBox(box: ViewBox, dx: number, dy: number): ViewBox {
  return { ...box, x: box.x - dx, y: box.y - dy };
}

/**
 * Zoom by `factor` (> 1 zooms in) so that the board point `anchor` stays
 * where it is on screen. The zoom range is applied here rather than in
 * clampBox so that hitting the limit does not slide the anchor.
 */
export function zoomBox(box: ViewBox, factor: number, anchor: Point, limits: CameraLimits): ViewBox {
  const { minW, maxW } = zoomRange(limits);
  const w = clamp(box.w / factor, minW, maxW);
  const h = w / limits.aspect;
  return { x: anchor.x - ((anchor.x - box.x) * w) / box.w, y: anchor.y - ((anchor.y - box.y) * h) / box.h, w, h };
}

/**
 * One step of a two-finger gesture, in container pixels: zoom by the change
 * in finger spread and pan by the movement of their midpoint, so the board
 * point that was under the fingers stays under them.
 */
export function pinchBox(box: ViewBox, size: Size, prev: [Point, Point], cur: [Point, Point], limits: CameraLimits): ViewBox {
  const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const spread = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
  const m0 = mid(prev[0], prev[1]);
  const m1 = mid(cur[0], cur[1]);
  const d0 = spread(prev[0], prev[1]);
  const d1 = spread(cur[0], cur[1]);
  const factor = d0 > 0 && d1 > 0 ? d1 / d0 : 1;
  const anchor = screenToBoard(box, size, m0);
  const { minW, maxW } = zoomRange(limits);
  const w = clamp(box.w / factor, minW, maxW);
  const h = w / limits.aspect;
  return { x: anchor.x - (m1.x * w) / size.w, y: anchor.y - (m1.y * h) / size.h, w, h };
}

export type WheelIntent = { kind: "zoom"; factor: number } | { kind: "pan"; dx: number; dy: number };

export interface WheelInput {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
}

/**
 * Interpret a wheel event. Trackpad pinches arrive as ctrl+wheel and zoom;
 * mouse wheel notches (line/page units, or large purely vertical pixel
 * steps) zoom gently, with or without ctrl; everything else is a two-finger
 * scroll and pans. The notch test is a heuristic: browsers do not say which
 * device sent the event, and a notch's pixel size varies with page zoom and
 * platform (so it need not be a whole number). Pan deltas are in CSS pixels
 * of content movement.
 */
export function wheelIntent(e: WheelInput): WheelIntent {
  const unit = e.deltaMode === 1 ? WHEEL_LINE_PX : e.deltaMode === 2 ? WHEEL_PAGE_PX : 1;
  const dx = e.deltaX * unit;
  const dy = e.deltaY * unit;
  const notch = e.deltaMode !== 0 || (Math.abs(e.deltaX) < 1 && Math.abs(e.deltaY) >= 50);
  if (e.ctrlKey || notch) {
    const rate = notch ? WHEEL_ZOOM_RATE : PINCH_ZOOM_RATE;
    return { kind: "zoom", factor: clamp(Math.exp(-dy * rate), 1 / MAX_WHEEL_FACTOR, MAX_WHEEL_FACTOR) };
  }
  return { kind: "pan", dx: -dx, dy: -dy };
}

/** Whether a press has moved far enough from where it began to be a drag. */
export function isDrag(down: Point, cur: Point, pointerType: string): boolean {
  const threshold = pointerType === "mouse" ? DRAG_THRESHOLD_PX.mouse : DRAG_THRESHOLD_PX.touch;
  return Math.hypot(cur.x - down.x, cur.y - down.y) >= threshold;
}

export interface Tap {
  at: number;
  x: number;
  y: number;
}

/** Whether `tap` completes a double tap begun by `prev`. */
export function isDoubleTap(prev: Tap | null, tap: Tap): boolean {
  if (!prev) return false;
  return tap.at - prev.at <= DOUBLE_TAP.ms && Math.hypot(tap.x - prev.x, tap.y - prev.y) <= DOUBLE_TAP.px;
}

/** Fraction of `points` inside `box` shrunk by `inset` (a fraction of its size) on each side. */
export function visibleFraction(points: readonly Point[], box: ViewBox, inset = 0): number {
  if (points.length === 0) return 1;
  const ix = box.w * inset;
  const iy = box.h * inset;
  const inside = points.filter((p) => p.x >= box.x + ix && p.x <= box.x + box.w - ix && p.y >= box.y + iy && p.y <= box.y + box.h - iy);
  return inside.length / points.length;
}

/**
 * The view that brings targets into sight, or null when at least half of
 * them are already visible (so the camera never fights the player). The
 * current zoom is kept when all targets fit at it; otherwise the view zooms
 * out just enough to frame them.
 */
export function frameTargets(box: ViewBox, points: readonly Point[], limits: CameraLimits, padding: number): ViewBox | null {
  const bounds = boundsOf(points);
  if (!bounds || visibleFraction(points, box, 0.05) >= 0.5) return null;
  const need = fitBox(bounds, limits.aspect, padding);
  if (need.w <= box.w) {
    const cx = bounds.x + bounds.w / 2;
    const cy = bounds.y + bounds.h / 2;
    return clampBox({ x: cx - box.w / 2, y: cy - box.h / 2, w: box.w, h: box.h }, limits);
  }
  return clampBox(need, limits);
}

/**
 * Tween between two views: the centre moves linearly while the width moves
 * geometrically, which reads as a steady zoom rather than a lurch.
 */
export function interpolateBox(a: ViewBox, b: ViewBox, t: number): ViewBox {
  const w = a.w * Math.pow(b.w / a.w, t);
  const h = a.h * Math.pow(b.h / a.h, t);
  const cx = a.x + a.w / 2 + (b.x + b.w / 2 - (a.x + a.w / 2)) * t;
  const cy = a.y + a.h / 2 + (b.y + b.h / 2 - (a.y + a.h / 2)) * t;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * The view after the container resizes: keep the centre and the on-screen
 * scale, so a rotated phone or a resized window shows more or less board
 * rather than jumping.
 */
export function resizeBox(box: ViewBox, from: Size, to: Size): ViewBox {
  const unitsPerPx = box.w / from.w;
  const w = to.w * unitsPerPx;
  const h = to.h * unitsPerPx;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}
