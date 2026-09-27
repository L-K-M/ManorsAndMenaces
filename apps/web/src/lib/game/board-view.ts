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

/**
 * Where the `i`-th of `n` Banners stands relative to a Region's label point
 * (the flag's pole is at x-6). This is the default; a Region too narrow for
 * it gives its Banners other spots (art/board-spots.ts).
 */
export function bannerSlot(label: { x: number; y: number }, i: number, n: number): { x: number; y: number } {
  return { x: label.x - 3 + (i - (n - 1) / 2) * LABEL.bannerGap, y: label.y + LABEL.bannerY };
}

// ------------------------------------------------------------------ footprints
// What a mark covers around the point it is drawn at: its painted shapes with
// their strokes and cast shadows, not the highlight rings that come and go.
// Board spots (art/board-spots.ts) keep these inside their Region and apart.

export type BoxFootprint = { kind: "box" } & Rect;
export type DiscFootprint = { kind: "disc" } & Circle;

/** A box or a disc around a mark's origin, in board units. */
export type Footprint = BoxFootprint | DiscFootprint;

/**
 * A Banner's flag in Board.svelte: the pole at x -6 from its finial (top -28)
 * to its foot at y 4, where the unsettled ring reaches x -9; the cloth and its
 * shadow reach x 14.5 and the pole's shadow y 10. Two flags a bannerGap apart
 * do not touch. The Plague's mark, which rides the tip for a while, is left out.
 */
export const FLAG_FOOTPRINT: BoxFootprint = { kind: "box", x: -9, y: -28, w: 23.5, h: 38 };

/** Where a Banner takes a tap or click: wider than the flag to its left, shorter than its finial and shadow. */
export const FLAG_HIT: Rect = { x: -12, y: -26, w: 26, h: 30 };

/** The resource disc at a Region's label point. */
export const DISC = { r: 17, stroke: 2 } as const;

/** The disc's footprint, around the label point. */
export const DISC_FOOTPRINT: DiscFootprint = { kind: "disc", x: 0, y: 0, r: DISC.r + DISC.stroke / 2 };

/** Capacity pips: a row of rings `gap` apart, centred on the row's spot. */
export const PIPS = { r: 4, stroke: 1.5, gap: 12 } as const;

/** Where the `i`-th of `capacity` pips sits along its row. */
export function pipX(i: number, capacity: number): number {
  return (i - (capacity - 1) / 2) * PIPS.gap;
}

/** The pip row of a Region of this capacity, around the row's centre. */
export function pipsFootprint(capacity: number): BoxFootprint {
  const r = PIPS.r + PIPS.stroke / 2;
  const half = pipX(capacity - 1, capacity) + r;
  return { kind: "box", x: -half, y: -r, w: 2 * half, h: 2 * r };
}

/** A Menace's hit area in figure units (MenaceFigure.svelte, drawn at PIECE_SCALE). */
export const MENACE_HIT_R = 22;

/**
 * Where a Menace stands: the vector figures' base (MenaceFigure.svelte, x
 * -16.5 to 16.5 and y 8.8 to 19.5 in figure units), where the painted figures
 * have their feet. This is what must be on the Menace's Region; the figure
 * above it may lean over a border, as the whole figure (about 68 across)
 * would not fit the narrowest Regions.
 */
export const MENACE_FOOTPRINT: BoxFootprint = { kind: "box", x: -16.5 * PIECE_SCALE, y: 8.8 * PIECE_SCALE, w: 33 * PIECE_SCALE, h: 10.7 * PIECE_SCALE };

/** A Menace's body, its hit area, which the label and other marks keep clear of. */
export const MENACE_BODY: DiscFootprint = { kind: "disc", x: 0, y: 0, r: MENACE_HIT_R * PIECE_SCALE };

/**
 * Where a Region's name may reach, relative to its label point: above the
 * disc, about 3.6 units per character each side. Names grow as the camera
 * zooms out; this is their reach at close range, which terrain art, Banners
 * and pips keep clear of.
 */
export const NAME_AREA = { top: -42, bottom: -14, perChar: 3.6, pad: 8 } as const;

/** The name area of a Region called `name`, around its label point. */
export function nameFootprint(name: string): BoxFootprint {
  const half = name.length * NAME_AREA.perChar + NAME_AREA.pad;
  return { kind: "box", x: -half, y: NAME_AREA.top, w: 2 * half, h: NAME_AREA.bottom - NAME_AREA.top };
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

/** Distance from a point to a rectangle (0 inside it). */
export function pointRectDistance(px: number, py: number, r: Rect): number {
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

/** Distance between a segment (its `r` ignored) and a rectangle (0 where they meet). */
export function segmentRectDistance(s: Segment, r: Rect): number {
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
