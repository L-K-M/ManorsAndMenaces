// Board view geometry that needs no DOM: camera scale, label level of detail
// (LOD) and Banner slots. Board units are SVG user units; "px" are CSS pixels
// on screen.

/** Shared by board pieces, their targets and the terrain's keep-out zones. */
export const PIECE_SCALE = 1.3;
export const MENACE_OFFSET = {
  region: { x: 52, y: 20 },
  site: { x: -34, y: 28 },
} as const;

export interface Size {
  w: number;
  h: number;
}

export interface Box extends Size {
  x: number;
  y: number;
}

/** CSS px per board unit for an SVG drawn with preserveAspectRatio "meet". */
export function screenScale(board: Size, box: Size): number {
  // A board element that measures 0 (collapsed layout) would turn
  // every px→board conversion into Infinity; the `> 0` form also rejects NaN.
  if (!(board.w > 0 && board.h > 0 && box.w > 0 && box.h > 0)) return 1;
  return Math.min(board.w / box.w, board.h / box.h);
}

/** Vertical alignment of the viewBox inside the SVG (preserveAspectRatio). */
export enum BoardAlign {
  Middle = "xMidYMid",
  Top = "xMidYMin",
}

/** Board point → CSS px relative to the SVG element's top-left corner. */
export function boardToScreen(p: { x: number; y: number }, box: Box, board: Size, align: BoardAlign): { x: number; y: number } {
  const k = screenScale(board, box);
  const offX = (board.w - box.w * k) / 2;
  const offY = align === BoardAlign.Top ? 0 : (board.h - box.h * k) / 2;
  return { x: (p.x - box.x) * k + offX, y: (p.y - box.y) * k + offY };
}

interface LabelSpec {
  /** Smallest font size in board units (reached when zoomed far in). */
  base: number;
  /** Desired on-screen size at text scale 1. */
  targetPx: number;
  /** Largest font size in board units (at text scale 1) before labels crowd their Region. */
  max: number;
  /** Below this on-screen size the label is hidden instead. */
  minPx: number;
}

// Region names grow to stay readable as the camera zooms out, up to the
// point where they would spill far over neighbouring Regions; past that the
// map is too small for them and they hide (the hover card and the inspector
// still name every Region).
const NAME: LabelSpec = { base: 13, targetPx: 12, max: 36, minPx: 10.5 };
// Harvest notes.
const MINOR: LabelSpec = { base: 11, targetPx: 10.5, max: 22, minPx: 9 };
// Landmark names sit at Sites between Regions and would collide with Region
// names, so they wait until the camera is zoomed in a little.
const LANDMARK: LabelSpec = { base: 11, targetPx: 10.5, max: 15, minPx: 10 };
/** On-screen diameter of the warning badge that replaces hidden notes. */
const BADGE_PX = 15;

// The Text size setting multiplies a label wherever it shows, and whether it
// shows depends on the zoom alone. Larger text grows the dock and so shrinks
// the board; scaling only the target would let the fixed cap bind and make
// names smaller at Text size 1.5 than at 1.25.
function capped(spec: LabelSpec, k: number, textScale: number): number {
  return textScale * Math.min(spec.max, Math.max(spec.base, spec.targetPx / k));
}

function fit(spec: LabelSpec, k: number, textScale: number): number {
  const size = capped(spec, k, textScale);
  return size * k >= spec.minPx * textScale ? size : 0;
}

export interface LabelLod {
  /** Region name font size in board units; 0 hides names. */
  name: number;
  /** Name size for the few Regions that stay named when `name` is 0 (targets, focus). */
  nameCapped: number;
  /** Font size for harvest notes in board units; 0 swaps them for a badge. */
  minor: number;
  /** Font size for landmark names in board units; 0 hides them. */
  landmark: number;
  /** Diameter of screen-sized badges, in board units. */
  badge: number;
}

/** Label sizes for a camera scale `k` (px per board unit) and the Text size setting. */
export function labelLod(k: number, textScale: number): LabelLod {
  const scale = Number.isFinite(textScale) && textScale > 0 ? textScale : 1;
  return { name: fit(NAME, k, scale), nameCapped: capped(NAME, k, scale), minor: fit(MINOR, k, scale), landmark: fit(LANDMARK, k, scale), badge: BADGE_PX / k };
}

/** A stroke width that is at least `px` on screen and never thinner than `min` board units. */
export function strokeWidth(px: number, k: number, min: number): number {
  return Math.max(min, px / k);
}

function greedyWrap(words: string[], limit: number): string[] {
  const lines: string[] = [];
  for (const word of words) {
    const last = lines[lines.length - 1];
    if (last !== undefined && last.length + 1 + word.length <= limit) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

/**
 * Split a label at spaces into as few lines of at most `maxChars` characters
 * as possible, with line lengths balanced ("Blocked by the / Toll Troll",
 * not "Blocked by the Toll / Troll"). Words longer than the limit keep their
 * own line.
 */
export function wrapLabel(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const fewest = greedyWrap(words, maxChars).length;
  for (let limit = Math.ceil(text.length / fewest); limit < maxChars; limit++) {
    const lines = greedyWrap(words, limit);
    if (lines.length <= fewest) return lines;
  }
  return greedyWrap(words, maxChars);
}

/** Characters per line for Region names: one line up close, wrapped when large. */
export function nameLineLength(size: number): number {
  return size > 18 ? 11 : 40;
}

// Region label layout, relative to the Region's label point: the resource
// disc (r=17) sits at 0,0, the capacity pips at y=24, Banners below the pips
// and harvest notes below the Banners. The name sits above the disc and a
// Menace to its right at x=40.
export const LABEL = {
  pipY: 24,
  bannerY: 58,
  bannerGap: 24,
  noteY: 80,
  nameBaseline: -24,
} as const;

/**
 * The Plague's mark: a queasy face whose eyes and wavy mouth are cut out
 * (fill-rule evenodd), radius 10 around 0,0. Drawn on sick Banners and on
 * their harvest badge.
 */
export const SICK_MARK = {
  color: "#a9bd45",
  glyph:
    "M-10,0 A10,10 0 1,0 10,0 A10,10 0 1,0 -10,0 Z M-5.6,-3 A1.7,1.7 0 1,0 -2.2,-3 A1.7,1.7 0 1,0 -5.6,-3 Z M2.2,-3 A1.7,1.7 0 1,0 5.6,-3 A1.7,1.7 0 1,0 2.2,-3 Z M-5.5,4.4 Q-2.75,1.9 0,4.4 Q2.75,6.9 5.5,4.4 L5.5,6.4 Q2.75,8.9 0,6.4 Q-2.75,3.9 -5.5,6.4 Z",
} as const;

/**
 * The badge on a Banner waiting at home: a small house on a parchment disc,
 * so an idle flag reads differently from one in a Region. The glyph is the
 * toolbar's home icon on its 24-unit grid.
 */
export const HOME_MARK = {
  glyph: "M3.5 11.5 L12 4 L20.5 11.5 M6.5 9.5 V20 H17.5 V9.5 M10.5 20 V15 H13.5 V20",
  /** The glyph's extent on its grid. */
  size: 17,
} as const;

/** A flame, about 16 tall around 0,0: embers on a burned Route and the Ragnarök omen. */
export const FLAME_PATH = "M0,-8 C3,-4 7,-1 5,4 C4,7 -4,7 -5,4 C-6.5,0.5 -2.5,-1.5 -1.5,-5 C-0.2,-2.5 1.5,-1 1,1.5 C2.8,-0.5 1.8,-4.5 0,-8 Z";

/** Where the `i`-th of `n` Banners stands in a Region (the flag's pole is at x-6). */
export function bannerSlot(label: { x: number; y: number }, i: number, n: number): { x: number; y: number } {
  return { x: label.x - 3 + (i - (n - 1) / 2) * LABEL.bannerGap, y: label.y + LABEL.bannerY };
}

// ------------------------------------------------------------------ note placement
// Harvest notes are drawn above every piece, so they must not land on one.
// Each note tries a few slots around its Region label and falls back to the
// warning badge on the resource disc when none is clear.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

/** A thick line from a to b, `r` wide on each side. */
export interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  r: number;
}

export interface Obstacles {
  /** Round pieces: Sites, Holdings, Menaces, Banners, Trading Posts. */
  circles: readonly Circle[];
  /** Routes. */
  segments: readonly Segment[];
  /** Region label blocks and names, and notes already placed. */
  rects: readonly Rect[];
}

/** Space kept between a note and anything it avoids, in board units. */
const NOTE_CLEARANCE = 3;

function pointRectDistance(px: number, py: number, r: Rect): number {
  return Math.hypot(Math.max(r.x - px, 0, px - (r.x + r.w)), Math.max(r.y - py, 0, py - (r.y + r.h)));
}

function pointSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Whether the segment a→b crosses the rectangle (Liang-Barsky clipping). */
function segmentCrossesRect(ax: number, ay: number, bx: number, by: number, r: Rect): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, ax - r.x],
    [dx, r.x + r.w - ax],
    [-dy, ay - r.y],
    [dy, r.y + r.h - ay],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

function segmentRectDistance(s: Segment, r: Rect): number {
  if (segmentCrossesRect(s.ax, s.ay, s.bx, s.by, r)) return 0;
  const corners = [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x, r.y + r.h],
    [r.x + r.w, r.y + r.h],
  ] as const;
  return Math.min(
    pointRectDistance(s.ax, s.ay, r),
    pointRectDistance(s.bx, s.by, r),
    ...corners.map(([x, y]) => pointSegmentDistance(x, y, s.ax, s.ay, s.bx, s.by)),
  );
}

/** Whether `r` keeps clear of every obstacle. */
export function isClear(r: Rect, obstacles: Obstacles): boolean {
  if (obstacles.circles.some((c) => pointRectDistance(c.x, c.y, r) < c.r + NOTE_CLEARANCE)) return false;
  if (obstacles.segments.some((s) => segmentRectDistance(s, r) < s.r + NOTE_CLEARANCE)) return false;
  return !obstacles.rects.some(
    (o) => r.x < o.x + o.w + NOTE_CLEARANCE && o.x < r.x + r.w + NOTE_CLEARANCE && r.y < o.y + o.h + NOTE_CLEARANCE && o.y < r.y + r.h + NOTE_CLEARANCE,
  );
}

/** Half-width of the resource disc plus its ring, which notes keep clear of. */
const DISC_CLEARANCE = 24;

/**
 * Candidate boxes for a note of `size` at a Region label point, in order of
 * preference: under the Banners, above the name (`nameTop`, relative to the
 * label point), then left and right of the resource disc.
 */
export function noteSlots(label: { x: number; y: number }, size: Size, nameTop: number): Rect[] {
  const at = (x: number, y: number): Rect => ({ x: label.x + x, y: label.y + y, w: size.w, h: size.h });
  return [
    at(-size.w / 2, LABEL.noteY),
    at(-size.w / 2, nameTop - NOTE_CLEARANCE - size.h),
    at(-DISC_CLEARANCE - size.w, -size.h / 2),
    at(DISC_CLEARANCE, -size.h / 2),
  ];
}

/** The first slot clear of every obstacle, or null when the note should become a badge. */
export function placeNote(slots: readonly Rect[], obstacles: Obstacles): Rect | null {
  return slots.find((r) => isClear(r, obstacles)) ?? null;
}
