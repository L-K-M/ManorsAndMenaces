// Scenery that explains Route kinds (spec §49): a stream under every bridge,
// ridges beside every mountain pass, and the bridge's rails. Pure geometry
// from the two end Sites of a Route.

import { polyline, type Pt } from "./geometry.js";
import type { RouteDefinition } from "@manors-menaces/content";

/** The same road geometry drives its drawing, hit area and attached markers. */
export function routeGeometry(route: RouteDefinition, a: Pt, b: Pt) {
  const points = route.points ?? [a, b];
  const segments = points.slice(1).map((point, i) => ({ a: points[i]!, b: point }));
  const lengths = segments.map((s) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y));
  let remaining = lengths.reduce((sum, n) => sum + n, 0) / 2;
  let mid = a;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    const length = lengths[i]!;
    if (remaining <= length && length > 0) {
      const t = remaining / length;
      mid = { x: segment.a.x + (segment.b.x - segment.a.x) * t, y: segment.a.y + (segment.b.y - segment.a.y) * t };
      break;
    }
    remaining -= length;
  }
  return { d: polyline(points), mid, segments };
}

/** Half the length of the stream crossing a bridge (board units). */
export const RIVER_HALF = 46;
const RIVER_WIDTH = 5.5;
/** How far the ridge peaks stand from a pass, to either side (board units). */
export const PASS_OFFSET = 17;

interface Frame {
  mid: Pt;
  /** Unit vector along the Route. */
  u: Pt;
  /** Unit normal to the Route. */
  n: Pt;
  len: number;
}

function frame(a: Pt, b: Pt): Frame {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, u, n: { x: -u.y, y: u.x }, len };
}

const at = (f: Frame, along: number, across: number): Pt => ({
  x: f.mid.x + f.u.x * along + f.n.x * across,
  y: f.mid.y + f.u.y * along + f.n.y * across,
});

/** A tapered, gently winding stream across the Route's midpoint: [water, highlight]. */
export function riverAcross(a: Pt, b: Pt): [string, string] {
  const f = frame(a, b);
  const STEPS = 16;
  const left: Pt[] = [];
  const right: Pt[] = [];
  const centre: Pt[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const s = (i / STEPS) * 2 - 1;
    const across = s * RIVER_HALF;
    const along = Math.sin(s * Math.PI) * 5;
    const w = RIVER_WIDTH * Math.pow(1 - s * s, 0.45);
    left.push(at(f, along - w, across));
    right.push(at(f, along + w, across));
    if (Math.abs(s) < 0.8) centre.push(at(f, along - w * 0.25, across));
  }
  return [polyline([...left, ...right.reverse()], true), polyline(centre)];
}

/** Upright little peaks on both sides of a mountain pass: [rock, sunlit faces]. */
export function passRidges(a: Pt, b: Pt): [string, string] {
  const f = frame(a, b);
  let rock = "";
  let lit = "";
  for (const t of [-0.2, 0.2]) {
    for (const side of [-1, 1]) {
      const c = at(f, t * f.len, side * PASS_OFFSET);
      const p = (dx: number, dy: number): Pt => ({ x: c.x + dx, y: c.y + dy });
      rock += polyline([p(-8, 4), p(-1, -8), p(3, -2), p(6, -6), p(12, 4)], true);
      lit += polyline([p(-8, 4), p(-1, -8), p(-3, 4)], true) + polyline([p(6, -6), p(3, -2), p(4, 4), p(7, 4)], true);
    }
  }
  return [rock, lit];
}

/** The two parapets of a bridge, drawn over the Route at its midpoint. */
export function bridgeRails(a: Pt, b: Pt): string {
  const f = frame(a, b);
  const HALF = 11;
  let d = "";
  for (const side of [-1, 1]) {
    const p0 = at(f, -HALF, side * 7.5);
    const c = at(f, 0, side * 10);
    const p1 = at(f, HALF, side * 7.5);
    d += `M${p0.x.toFixed(1)},${p0.y.toFixed(1)}Q${c.x.toFixed(1)},${c.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
  }
  return d;
}
