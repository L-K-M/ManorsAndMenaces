// Board view geometry that needs no DOM: camera scale, label level of detail
// (LOD) and Banner slots. Board units are SVG user units; "px" are CSS pixels
// on screen.

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
  if (box.w <= 0 || box.h <= 0) return 1;
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
  /** Largest font size in board units before labels crowd their Region. */
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

function capped(spec: LabelSpec, k: number, textScale: number): number {
  return Math.min(spec.max, Math.max(spec.base, (spec.targetPx * textScale) / k));
}

function fit(spec: LabelSpec, k: number, textScale: number): number {
  const size = capped(spec, k, textScale);
  return size * k >= spec.minPx ? size : 0;
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

/** Where the `i`-th of `n` Banners stands in a Region (the flag's pole is at x-6). */
export function bannerSlot(label: { x: number; y: number }, i: number, n: number): { x: number; y: number } {
  return { x: label.x - 3 + (i - (n - 1) / 2) * LABEL.bannerGap, y: label.y + LABEL.bannerY };
}
