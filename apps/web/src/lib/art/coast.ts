// The shoreline and the sea's ornaments (spec §47 board, §49 terrain): ripple
// lines around the island and quiet corners of sea for the map's cartouche,
// a compass rose and a ship. Derived from the map alone and cached.

import type { MapDefinition } from "@manors-menaces/content";
import { bounds, edgeDistance, inside, offsetPolygon, polyline, polygonPoints, type Pt } from "./geometry.js";

export interface SeaSpot {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CoastArt {
  /** Dashed ripple lines at increasing distance from the shore. */
  ripples: string[];
  /** Centre and reach of the island, for the deep-water gradient. */
  centre: Pt;
  reach: number;
  /** Open sea for the name cartouche, the compass rose and a ship, or null when there is no room. */
  cartouche: SeaSpot | null;
  compass: SeaSpot | null;
  ship: SeaSpot | null;
}

/** Distances of the ripple lines from the shore (board units). */
export const RIPPLES = [24, 44] as const;
/** The cartouche's size; its text is sized to fit. */
export const CARTOUCHE = { w: 230, h: 46 } as const;
const COMPASS = { w: 64, h: 64 } as const;
const SHIP = { w: 44, h: 40 } as const;
/** How far ornaments keep from the shore and from each other. */
const SEA_MARGIN = 18;

/**
 * The open-sea rectangle of the given size nearest to `corner` (a fraction of
 * the island's bounds, so 1,1 is its bottom-right), inside those bounds so
 * the home view shows it, clear of the shore and of `taken`.
 */
function seaSpot(coast: Pt[], size: { w: number; h: number }, corner: Pt, taken: SeaSpot[]): SeaSpot | null {
  const b = bounds(coast);
  const target = { x: b.x0 + corner.x * (b.x1 - b.x0), y: b.y0 + corner.y * (b.y1 - b.y0) };
  const STEP = 10;
  const candidates: Pt[] = [];
  for (let x = b.x0 + size.w / 2; x <= b.x1 - size.w / 2; x += STEP) {
    for (let y = b.y0 + size.h / 2; y <= b.y1 - size.h / 2; y += STEP) candidates.push({ x, y });
  }
  candidates.sort((p, q) => Math.hypot(p.x - target.x, p.y - target.y) - Math.hypot(q.x - target.x, q.y - target.y));
  const border = (c: Pt): Pt[] => {
    const pts: Pt[] = [];
    for (let i = 0; i <= 8; i++) {
      const fx = c.x - size.w / 2 + (size.w * i) / 8;
      const fy = c.y - size.h / 2 + (size.h * i) / 8;
      pts.push({ x: fx, y: c.y - size.h / 2 }, { x: fx, y: c.y + size.h / 2 }, { x: c.x - size.w / 2, y: fy }, { x: c.x + size.w / 2, y: fy });
    }
    return pts;
  };
  const overlaps = (c: Pt, s: SeaSpot) => Math.abs(c.x - s.x) < (size.w + s.w) / 2 + SEA_MARGIN && Math.abs(c.y - s.y) < (size.h + s.h) / 2 + SEA_MARGIN;
  for (const c of candidates) {
    if (inside(c, coast) || taken.some((s) => overlaps(c, s))) continue;
    if (border(c).every((p) => !inside(p, coast) && edgeDistance(p, coast) >= SEA_MARGIN)) return { x: c.x, y: c.y, w: size.w, h: size.h };
  }
  return null;
}

function build(map: MapDefinition): CoastArt {
  const coast = polygonPoints(map.coastline);
  const b = bounds(coast);
  const taken: SeaSpot[] = [];
  const claim = (spot: SeaSpot | null) => {
    if (spot) taken.push(spot);
    return spot;
  };
  return {
    ripples: RIPPLES.map((d) => polyline(offsetPolygon(coast, d), true)),
    centre: { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 },
    reach: Math.hypot(b.x1 - b.x0, b.y1 - b.y0) / 2,
    cartouche: claim(seaSpot(coast, CARTOUCHE, { x: 1, y: 1 }, taken)),
    compass: claim(seaSpot(coast, COMPASS, { x: 1, y: 0 }, taken)),
    ship: claim(seaSpot(coast, SHIP, { x: 0, y: 1 }, taken)),
  };
}

const cache = new WeakMap<MapDefinition, CoastArt>();

/** The shoreline art for a map, computed once per map object. */
export function coastArt(map: MapDefinition): CoastArt {
  let art = cache.get(map);
  if (!art) {
    art = build(map);
    cache.set(map, art);
  }
  return art;
}
