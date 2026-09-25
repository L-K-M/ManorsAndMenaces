// Small, pure 2D helpers for the board art (terrain scatter, shoreline).
// Board units throughout; nothing here touches the DOM.

export interface Pt {
  x: number;
  y: number;
}

/**
 * The vertices of a polygon path made only of M/L/Z commands with absolute
 * coordinates, which is what tools/generate-map.mjs writes for Regions and
 * the coastline. Anything else is a programming error in the map pipeline.
 */
export function polygonPoints(d: string): Pt[] {
  if (/[^MLZ\d\s,.\-eE]/.test(d)) throw new Error(`Board art expects an M/L/Z polygon path, got: ${d.slice(0, 40)}`);
  const out: Pt[] = [];
  for (const m of d.matchAll(/(-?[\d.]+(?:e-?\d+)?)[\s,]+(-?[\d.]+(?:e-?\d+)?)/g)) out.push({ x: Number(m[1]), y: Number(m[2]) });
  return out;
}

export function bounds(poly: readonly Pt[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of poly) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}

/** Even-odd point-in-polygon test. */
export function inside(p: Pt, poly: readonly Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

export function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Distance from `p` to the polygon's outline (not signed). */
export function edgeDistance(p: Pt, poly: readonly Pt[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) best = Math.min(best, segmentDistance(p, poly[j]!, poly[i]!));
  return best;
}

/** Signed area; positive when the vertices run clockwise on screen (y down). */
export function signedArea(poly: readonly Pt[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j]!.x * poly[i]!.y - poly[i]!.x * poly[j]!.y;
  return a / 2;
}

/**
 * The polygon moved `d` units outward (negative: inward) along its vertex
 * normals. Good enough for the smooth, densely sampled coastline; not a
 * general polygon offset (sharp corners are not mitred).
 */
export function offsetPolygon(poly: readonly Pt[], d: number): Pt[] {
  const n = poly.length;
  const dir = signedArea(poly) > 0 ? 1 : -1;
  return poly.map((p, i) => {
    const prev = poly[(i - 1 + n) % n]!;
    const next = poly[(i + 1) % n]!;
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    // For a clockwise (screen) outline, (ty, -tx) points outward.
    return { x: p.x + (dir * d * ty) / len, y: p.y - (dir * d * tx) / len };
  });
}

/** A seeded PRNG for UI art (mulberry32); never used for game state. */
export function artRng(seed: string): () => number {
  // FNV-1a hash of the seed string.
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** An SVG path through the points, closed when `close` is set. */
export function polyline(pts: readonly Pt[], close = false): string {
  return pts.map((p, i) => `${i ? "L" : "M"}${r1(p.x)},${r1(p.y)}`).join("") + (close ? "Z" : "");
}
