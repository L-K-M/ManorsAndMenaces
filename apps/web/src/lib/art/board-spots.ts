// Where each Region's marks stand: its Banners, a Menace in it and its
// capacity pips. Each mark has a default spot at a fixed offset from the
// Region's label point (board-view.ts), which suits most Regions. In a narrow
// or oddly shaped Region that offset can reach over the border into a
// neighbour or the sea, so a mark that does not fit there moves to the
// nearest spot that does. The label point itself stays: layouts choose where
// Region Menaces start by it (packages/content/src/layout.ts), so saved games
// depend on it.
//
// Derived from the map alone with no randomness, so every device agrees, and
// cached per map object like the terrain art, which keeps clear of these spots.

import type { MapDefinition, RegionDefinition } from "@manors-menaces/content";
import {
  DISC_FOOTPRINT,
  FLAG_FOOTPRINT,
  LABEL,
  MENACE_BODY,
  MENACE_FOOTPRINT,
  MENACE_OFFSET,
  bannerSlot,
  nameFootprint,
  pipsFootprint,
  pointRectDistance,
  segmentRectDistance,
  type BoxFootprint,
  type Footprint,
  type Rect,
  type Segment,
} from "../game/board-view.js";
import { bounds, edgeDistance, inside, polygonPoints, type Pt } from "./geometry.js";

export interface RegionSpots {
  /** `banners[n - 1][i]`: where the `i`-th of `n` Banners stands (the flag's origin). */
  banners: Pt[][];
  /** Where a Menace in the Region stands. */
  menace: Pt;
  /** The centre of the capacity pip row. */
  pips: Pt;
}

/** Room every mark keeps from its Region's border, in board units. */
export const EDGE_CLEARANCE = 3;

/** Room a moved mark leaves around the label and the other marks. */
const MARK_GAP = 2;

// A moved mark searches a coarse grid around its default spot, nearest
// points first, then finer grids around the best point found down to
// FINE_STEP. Two flags placed together, which only the thinnest Regions need,
// search a PAIR_STEP grid, as the room they share may be narrower than a
// coarse step.
const COARSE_STEP = 8;
const FINE_STEP = 1;
const PAIR_STEP = 2;

/** How much room a moved mark asks for; each is tried in turn until one fits. */
enum Room {
  /** EDGE_CLEARANCE from the border, MARK_GAP from the label, its name and the other marks. */
  Clear,
  /** Touching the other marks, and under the name if need be (names are drawn above every piece). */
  Crowded,
  /** As Crowded, and touching the border, for Regions too thin for anything else. */
  Tight,
}

const ROOMS = [Room.Clear, Room.Crowded, Room.Tight] as const;

const RULES: Record<Room, { edge: number; gap: number; name: boolean }> = {
  [Room.Clear]: { edge: EDGE_CLEARANCE, gap: MARK_GAP, name: true },
  [Room.Crowded]: { edge: EDGE_CLEARANCE, gap: 0, name: false },
  [Room.Tight]: { edge: 0, gap: 0, name: false },
};

/** The most Banners a Region is laid out for: layouts may raise any Region's capacity to 2. */
function mostBanners(region: RegionDefinition): number {
  return Math.max(2, region.capacity);
}

/** Every mark at its fixed offset from the Region's label point. */
export function defaultSpots(region: RegionDefinition): RegionSpots {
  const label = { x: region.labelX, y: region.labelY };
  const banners = Array.from({ length: mostBanners(region) }, (_, k) => Array.from({ length: k + 1 }, (_, i) => bannerSlot(label, i, k + 1)));
  return {
    banners,
    menace: { x: label.x + MENACE_OFFSET.region.x, y: label.y + MENACE_OFFSET.region.y },
    pips: { x: label.x, y: label.y + LABEL.pipY },
  };
}

const cache = new WeakMap<MapDefinition, ReadonlyMap<string, RegionSpots>>();

/** Each Region's spots, by Region id. */
export function boardSpots(map: MapDefinition): ReadonlyMap<string, RegionSpots> {
  let spots = cache.get(map);
  if (!spots) {
    spots = new Map(map.regions.map((r) => [r.id, regionSpots(r)]));
    cache.set(map, spots);
  }
  return spots;
}

// ------------------------------------------------------------------ geometry

/** A border edge with its bounding box, which rules most edges out cheaply. */
interface Edge extends Segment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Outline {
  poly: Pt[];
  edges: Edge[];
  bounds: ReturnType<typeof bounds>;
}

function outlineOf(path: string): Outline {
  const poly = polygonPoints(path);
  const edges = poly.map((b, i): Edge => {
    const a = poly[(i + poly.length - 1) % poly.length]!;
    return { ax: a.x, ay: a.y, bx: b.x, by: b.y, r: 0, x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
  });
  return { poly, edges, bounds: bounds(poly) };
}

function moved(f: Footprint, p: Pt): Footprint {
  return { ...f, x: f.x + p.x, y: f.y + p.y };
}

/** Whether footprint `f` at `p` comes closer than `gap` to the placed footprint `o`. */
function overlaps(f: Footprint, p: Pt, o: Footprint, gap: number): boolean {
  const x = f.x + p.x;
  const y = f.y + p.y;
  if (f.kind === "disc") return o.kind === "disc" ? Math.hypot(x - o.x, y - o.y) < f.r + o.r + gap : pointRectDistance(x, y, o) < f.r + gap;
  if (o.kind === "disc") return pointRectDistance(o.x, o.y, { x, y, w: f.w, h: f.h }) < o.r + gap;
  return x < o.x + o.w + gap && o.x < x + f.w + gap && y < o.y + o.h + gap && o.y < y + f.h + gap;
}

/** Whether box `f` at `p` lies inside the outline, at least `edge` from its border (and never on it). */
function fits(f: BoxFootprint, p: Pt, o: Outline, edge: number): boolean {
  const box: Rect = { x: f.x + p.x, y: f.y + p.y, w: f.w, h: f.h };
  if (!inside(box, o.poly)) return false;
  // A corner inside and no edge meeting the box: the whole box is inside.
  for (const e of o.edges) {
    // The gap between the bounding boxes is a lower bound on the distance.
    const apart = Math.max(e.x0 - box.x - box.w, box.x - e.x1, e.y0 - box.y - box.h, box.y - e.y1);
    if (apart > 0 && apart >= edge) continue;
    const d = segmentRectDistance(e, box);
    if (d === 0 || d < edge) return false;
  }
  return true;
}

/** Calls `visit` with each grid offset `k` steps out from the centre (a square ring), in a fixed order. */
function eachOnRing(k: number, visit: (i: number, j: number) => void): void {
  if (k === 0) return visit(0, 0);
  for (let i = -k; i <= k; i++) {
    visit(i, -k);
    visit(i, k);
  }
  for (let j = 1 - k; j < k; j++) {
    visit(-k, j);
    visit(k, j);
  }
}

/** Roughly the point deepest inside the outline (its pole of inaccessibility). */
function pole(o: Outline): Pt {
  const depth = (p: Pt) => (inside(p, o.poly) ? edgeDistance(p, o.poly) : -edgeDistance(p, o.poly));
  const { x0, y0, x1, y1 } = o.bounds;
  let best = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  let bestDepth = depth(best);
  for (let x = x0; x <= x1; x += COARSE_STEP) {
    for (let y = y0; y <= y1; y += COARSE_STEP) {
      const d = depth({ x, y });
      if (d > bestDepth) [best, bestDepth] = [{ x, y }, d];
    }
  }
  for (let step = COARSE_STEP / 2; step >= FINE_STEP / 2; step /= 2) {
    const around = best;
    eachOnRing(1, (i, j) => {
      const p = { x: around.x + i * step, y: around.y + j * step };
      const d = depth(p);
      if (d > bestDepth) [best, bestDepth] = [p, d];
    });
  }
  return best;
}

// ------------------------------------------------------------------ search

/** Placed shapes a mark keeps clear of. */
type Avoid = readonly Footprint[];

interface Mark {
  /** What must lie inside the Region. */
  stands: BoxFootprint;
  /** What the label and the other marks keep clear of. */
  covers: readonly Footprint[];
  want: Pt;
  /** The size of the Banner row it belongs to; 0 for the pips and a Menace, which show with any row. */
  row: number;
  at?: Pt | undefined;
  /** Whether it stands where it always stood. */
  kept?: boolean;
}

/** Whether mark `m` at `p` comes closer than `gap` to anything in `avoid`. */
function crowds(m: Mark, p: Pt, avoid: Avoid, gap: number): boolean {
  for (const c of m.covers) for (const a of avoid) if (overlaps(c, p, a, gap)) return true;
  return false;
}

/** Whether mark `m` can stand at `p`: inside the outline and clear of everything in `avoid`. */
function canStand(m: Mark, p: Pt, o: Outline, avoid: Avoid, edge: number, gap: number): boolean {
  return !crowds(m, p, avoid, gap) && fits(m.stands, p, o, edge);
}

/** The grid steps around the mark's default that keep its footprint within the outline's bounds, or null. */
function gridRange(m: Mark, o: Outline, edge: number, step: number): { i0: number; i1: number; j0: number; j1: number } | null {
  const f = m.stands;
  const { x, y } = m.want;
  const i0 = Math.ceil((o.bounds.x0 + edge - f.x - x) / step);
  const i1 = Math.floor((o.bounds.x1 - edge - f.x - f.w - x) / step);
  const j0 = Math.ceil((o.bounds.y0 + edge - f.y - y) / step);
  const j1 = Math.floor((o.bounds.y1 - edge - f.y - f.h - y) / step);
  return i0 <= i1 && j0 <= j1 ? { i0, i1, j0, j1 } : null;
}

/** The spot nearest the mark's default where it can stand, or null. */
function nearestSpot(m: Mark, o: Outline, avoid: Avoid, edge: number, gap: number): Pt | null {
  // Room narrower than the coarse step can hide between its points, so a
  // search that finds none looks again at half the step.
  for (let step = COARSE_STEP; step >= COARSE_STEP / 2; step /= 2) {
    const best = nearestOnGrid(m, o, avoid, edge, gap, step);
    if (!best) continue;

    // Finer grids around the spot found may hold a nearer one.
    for (let fine = step / 2, reach = step; fine >= FINE_STEP; reach = fine, fine /= 2) {
      const around = best.p;
      for (let i = -reach; i <= reach; i += fine) {
        for (let j = -reach; j <= reach; j += fine) {
          const p = { x: around.x + i, y: around.y + j };
          const d = Math.hypot(p.x - m.want.x, p.y - m.want.y);
          if (d >= best.d || !canStand(m, p, o, avoid, edge, gap)) continue;
          best.p = p;
          best.d = d;
        }
      }
    }
    return best.p;
  }
  return null;
}

/** The point of a grid around the mark's default nearest it where the mark can stand, or null. */
function nearestOnGrid(m: Mark, o: Outline, avoid: Avoid, edge: number, gap: number, step: number): { p: Pt; d: number } | null {
  const range = gridRange(m, o, edge, step);
  if (!range) return null;
  const { i0, i1, j0, j1 } = range;
  const best: { p: Pt | null; d: number } = { p: null, d: Infinity };
  // Every point on ring k is at least k steps away, so the search ends once
  // a ring cannot beat the best spot found.
  const reach = Math.max(-i0, i1, -j0, j1);
  for (let k = Math.max(0, i0, -i1, j0, -j1); k <= reach && k * step < best.d; k++) {
    eachOnRing(k, (i, j) => {
      const d = Math.hypot(i, j) * step;
      if (d >= best.d || i < i0 || i > i1 || j < j0 || j > j1) return;
      const p = { x: m.want.x + i * step, y: m.want.y + j * step };
      if (!canStand(m, p, o, avoid, edge, gap)) return;
      best.p = p;
      best.d = d;
    });
  }
  return best.p ? { p: best.p, d: best.d } : null;
}

/** Every grid spot around the mark's default where it can stand, nearest first. */
function allSpots(m: Mark, o: Outline, avoid: Avoid, edge: number, gap: number, step: number): { p: Pt; d: number }[] {
  const range = gridRange(m, o, edge, step);
  if (!range) return [];
  const out: { p: Pt; d: number }[] = [];
  for (let i = range.i0; i <= range.i1; i++) {
    for (let j = range.j0; j <= range.j1; j++) {
      const p = { x: m.want.x + i * step, y: m.want.y + j * step };
      if (canStand(m, p, o, avoid, edge, gap)) out.push({ p, d: Math.hypot(i, j) * step });
    }
  }
  return out.sort((a, b) => a.d - b.d);
}

/**
 * Every PAIR_STEP grid spot where the mark can stand, nearest first. A grid
 * twice as coarse finds the room; only the points around its spots are then
 * tried, and the whole fine grid only when the coarse one finds none.
 */
function pairSpots(m: Mark, o: Outline, avoid: Avoid, edge: number, gap: number): { p: Pt; d: number }[] {
  const coarse = allSpots(m, o, avoid, edge, gap, 2 * PAIR_STEP);
  if (coarse.length === 0) return allSpots(m, o, avoid, edge, gap, PAIR_STEP);
  const tried = new Set<string>();
  const out: { p: Pt; d: number }[] = [];
  for (const { p } of coarse) {
    const ci = Math.round((p.x - m.want.x) / PAIR_STEP);
    const cj = Math.round((p.y - m.want.y) / PAIR_STEP);
    for (let i = ci - 1; i <= ci + 1; i++) {
      for (let j = cj - 1; j <= cj + 1; j++) {
        const key = `${i},${j}`;
        if (tried.has(key)) continue;
        tried.add(key);
        const q = { x: m.want.x + i * PAIR_STEP, y: m.want.y + j * PAIR_STEP };
        if (canStand(m, q, o, avoid, edge, gap)) out.push({ p: q, d: Math.hypot(i, j) * PAIR_STEP });
      }
    }
  }
  return out.sort((a, b) => a.d - b.d);
}

/**
 * Spots for two flags of one row, apart and nearest their defaults in sum.
 * Placing one and then the other can box the second in where both would
 * fit. The flags share their footprint and what they avoid, so the spots
 * where one can stand serve the other too.
 */
function nearestPair(a: Mark, b: Mark, o: Outline, avoid: Avoid, edge: number, gap: number): [Pt, Pt] | null {
  const spots = pairSpots(a, o, avoid, edge, gap);
  const forA = spots;
  const forB = spots.map(({ p }) => ({ p, d: Math.hypot(p.x - b.want.x, p.y - b.want.y) })).sort((s, t) => s.d - t.d);
  let best: [Pt, Pt] | null = null;
  let bestD = Infinity;
  for (const sa of forA) {
    if (sa.d >= bestD) break;
    const placedA = a.covers.map((c) => moved(c, sa.p));
    for (const sb of forB) {
      if (sa.d + sb.d >= bestD) break;
      if (crowds(b, sb.p, placedA, gap)) continue;
      best = [sa.p, sb.p];
      bestD = sa.d + sb.d;
    }
  }
  return best;
}

// ------------------------------------------------------------------ placement

/** Whether two marks can show at once: rows for different numbers of Banners never do. */
function together(a: Mark, b: Mark): boolean {
  return a !== b && (a.row === 0 || b.row === 0 || a.row === b.row);
}

function regionSpots(region: RegionDefinition): RegionSpots {
  const outline = outlineOf(region.path);
  const home = defaultSpots(region);
  const label = { x: region.labelX, y: region.labelY };
  const disc = moved(DISC_FOOTPRINT, label);
  const name = moved(nameFootprint(region.name), label);
  const pipRow = pipsFootprint(region.capacity);
  const pips: Mark = { stands: pipRow, covers: [pipRow], want: home.pips, row: 0 };
  const menace: Mark = { stands: MENACE_FOOTPRINT, covers: [MENACE_BODY, MENACE_FOOTPRINT], want: home.menace, row: 0 };
  const rows = home.banners.map((row, k) => row.map((want): Mark => ({ stands: FLAG_FOOTPRINT, covers: [FLAG_FOOTPRINT], want, row: k + 1 })));
  // Placement order: the small pips stay by the disc, the Banners come next
  // as every game shows them, and a Menace, the largest, takes what is left.
  const marks = [pips, ...rows.flat(), menace];
  // A Menace may stand in front of the name, which is drawn above it, as its
  // head does beside the label by default. Keeping the whole figure clear
  // would send it to the far end of its Region, and there take the room the
  // terrain art has, while the name's band is kept free of art anyway.
  const avoidFor = (m: Mark, room: Room): Avoid => [
    disc,
    ...(RULES[room].name && m !== menace ? [name] : []),
    ...marks.filter((o) => o.at && together(m, o)).flatMap((o) => o.covers.map((c) => moved(c, o.at!))),
  ];

  // Marks that fit where they always stood stay there, so a board that looked
  // right keeps its look.
  for (const m of marks) {
    if (!canStand(m, m.want, outline, avoidFor(m, Room.Clear), EDGE_CLEARANCE, 0)) continue;
    m.at = m.want;
    m.kept = true;
  }

  // The others take the nearest spot that fits, asking for less room only
  // when none does. A Region too small for even that gets the mark centred
  // on its deepest point, overlapping what it must.
  let deepest: Pt | undefined;
  for (const m of marks) {
    if (m.at) continue;
    for (const room of ROOMS) {
      const { edge, gap } = RULES[room];
      const spot = nearestSpot(m, outline, avoidFor(m, room), edge, gap);
      if (spot) {
        m.at = spot;
        break;
      }
      // The flag moved before this one in its row may have boxed it in.
      const sibling = m.row ? rows[m.row - 1]!.filter((o) => o.at && !o.kept).at(-1) : undefined;
      if (room === Room.Clear || !sibling) continue;
      const placed = sibling.at;
      sibling.at = undefined;
      const pair = nearestPair(sibling, m, outline, avoidFor(m, room), edge, gap);
      [sibling.at, m.at] = pair ?? [placed, undefined];
      if (m.at) break;
    }
    if (m.at) continue;
    deepest ??= pole(outline);
    m.at = { x: deepest.x - m.stands.x - m.stands.w / 2, y: deepest.y - m.stands.y - m.stands.h / 2 };
  }

  return { banners: rows.map((row) => row.map((m) => m.at!)), menace: menace.at!, pips: pips.at! };
}
