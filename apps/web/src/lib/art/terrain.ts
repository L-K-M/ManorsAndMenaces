// Procedural terrain illustration for the board (spec §49 "terrain
// illustration"): trees in forests, furrows and stooks in fields, boulders
// and mounds in hills, craggy peaks and a mine mouth in mines, crystals,
// toadstools and standing stones in the essence glades.
//
// Everything is derived from the map alone with a seeded PRNG per Region, so
// the art is identical on every device and never touches game state or the
// match RNG. Motifs keep clear of Region borders, the shore, Sites, Routes
// and the label cluster (name, resource disc, pips, Banner row, Menace spot).
// The output is a handful of merged <path>s per resource, so the board's
// paint cost does not grow with the number of motifs.

import type { MapDefinition, RegionDefinition } from "@manors-menaces/content";
import type { ResourceType } from "@manors-menaces/rules";
import { PASS_OFFSET, RIVER_HALF, passRidges, riverAcross, routeGeometry } from "./routes.js";
import { artRng, bounds, edgeDistance, inside, polygonPoints, segmentDistance, signedArea, type Pt } from "./geometry.js";
import { LABEL, MENACE_OFFSET, PIECE_SCALE } from "../game/board-view.js";

/** How one merged terrain path is painted. */
export interface InkStyle {
  fill?: string;
  stroke?: string;
  width?: number;
  opacity?: number;
}

/** Ink layers per resource, bottom to top. */
export const TERRAIN_INKS = {
  grain: {
    furrow: { stroke: "#997322", width: 1.1, opacity: 0.28 },
    shadow: { fill: "#5c470c", opacity: 0.22 },
    body: { fill: "#e3bd4f", stroke: "#86680f", width: 0.9 },
    detail: { stroke: "#86680f", width: 0.8 },
    light: { fill: "#f8e7a4" },
  },
  timber: {
    shadow: { fill: "#15290f", opacity: 0.26 },
    trunk: { fill: "#5b3d22" },
    under: { fill: "#294b2b" },
    crown: { fill: "#527c3b" },
    light: { fill: "#b0cf76" },
  },
  stone: {
    shadow: { fill: "#34302a", opacity: 0.24 },
    mound: { fill: "#a0978a", stroke: "#57524a", width: 1 },
    body: { fill: "#d8d2c6", stroke: "#524d46", width: 1 },
    light: { fill: "#f1ede5" },
    detail: { stroke: "#57524a", width: 0.8 },
  },
  iron: {
    shadow: { fill: "#161b22", opacity: 0.24 },
    body: { fill: "#5a6577", stroke: "#252c36", width: 1 },
    light: { fill: "#99a5b7" },
    snow: { fill: "#f2f5f8" },
    hole: { fill: "#1b1815" },
    detail: { stroke: "#8a5a2b", width: 1.4 },
  },
  essence: {
    shadow: { fill: "#281a45", opacity: 0.24 },
    menhir: { fill: "#9e94b4", stroke: "#3f3159", width: 0.9 },
    body: { fill: "#d6c5f7", stroke: "#4b3379", width: 0.9 },
    light: { fill: "#f5efff" },
    stem: { fill: "#f2e9d5", stroke: "#6b5a3a", width: 0.6 },
    cap: { fill: "#c8513f", stroke: "#6e1f16", width: 0.8 },
    dots: { fill: "#fff8ec" },
    sparkle: { fill: "#fffbe0", opacity: 0.95 },
  },
} as const satisfies Record<ResourceType, Record<string, InkStyle>>;

export type MotifKind =
  "round_tree" | "conifer" | "stook" | "haystack" | "boulder" | "mound" | "peak" | "mine" | "crystals" | "toadstools" | "menhir" | "sparkle";

/** One placed illustration; `r` is its footprint radius in board units. */
export interface Motif {
  regionId: string;
  kind: MotifKind;
  x: number;
  y: number;
  r: number;
}

export interface TerrainLayer {
  id: string;
  d: string;
  style: InkStyle;
}

export interface TerrainArt {
  motifs: Motif[];
  /** Merged paths, bottom to top: at most one per Region and ink. */
  layers: TerrainLayer[];
  /** All Region outlines as one path, for the soft painted edge. */
  edges: string;
  /** Streams under bridges: water, then a highlight line. */
  streams: [string, string];
  /** Little peaks beside mountain passes: rock, then sunlit faces. */
  ridges: [string, string];
}

// ------------------------------------------------------------------ keep-out zones

/** Clearance kept around labels, pieces and Routes (board units). */
export const CLEARANCE = {
  /** Resource disc and capacity pips at the label point. */
  disc: 24,
  /** Where a Menace stands in a Region (see menacePos in Board.svelte). */
  menace: { dx: MENACE_OFFSET.region.x, dy: MENACE_OFFSET.region.y - 6 * PIECE_SCALE, r: 26 * PIECE_SCALE },
  /** Region name: above the disc, about 3.6 units per character each side. */
  name: { top: -42, bottom: -14, perChar: 3.6, pad: 8 },
  /** Capacity pips and the Banner row under the disc (flags stand at LABEL.bannerY, poles end 4 below). */
  banners: { x: -30, y: 2, w: 56, h: LABEL.bannerY + 8 },
  /** A Site with its Holding, emblem, Trading Post and landmark art. */
  site: { dy: -8 * PIECE_SCALE, r: 25 * PIECE_SCALE },
  landmark: { dx: -22 * PIECE_SCALE, dy: -4 - 15 * PIECE_SCALE, r: 22 * PIECE_SCALE },
  post: { dx: -22, dy: -18, r: 13 },
  route: 8,
  /** Route midpoints, where the Highwayman stands. */
  routeMid: 20 * PIECE_SCALE,
  shore: 10,
} as const;

interface Zones {
  circles: { x: number; y: number; r: number }[];
  rects: { x0: number; y0: number; x1: number; y1: number }[];
  segments: { a: Pt; b: Pt }[];
}

function keepOutZones(map: MapDefinition): Zones {
  const z: Zones = { circles: [], rects: [], segments: [] };
  const C = CLEARANCE;
  for (const r of map.regions) {
    z.circles.push({ x: r.labelX, y: r.labelY, r: C.disc });
    z.circles.push({ x: r.labelX + C.menace.dx, y: r.labelY + C.menace.dy, r: C.menace.r });
    const half = r.name.length * C.name.perChar + C.name.pad;
    z.rects.push({ x0: r.labelX - half, y0: r.labelY + C.name.top, x1: r.labelX + half, y1: r.labelY + C.name.bottom });
    z.rects.push({
      x0: r.labelX + C.banners.x,
      y0: r.labelY + C.banners.y,
      x1: r.labelX + C.banners.x + C.banners.w,
      y1: r.labelY + C.banners.y + C.banners.h,
    });
  }
  for (const s of map.sites) {
    z.circles.push({ x: s.x, y: s.y + C.site.dy, r: C.site.r });
    if (s.landmarkId) z.circles.push({ x: s.x + C.landmark.dx, y: s.y + C.landmark.dy, r: C.landmark.r });
    if (s.tradePost) z.circles.push({ x: s.x + C.post.dx, y: s.y + C.post.dy, r: C.post.r });
  }
  const sites = new Map(map.sites.map((s) => [s.id, s]));
  for (const route of map.routes) {
    const a = sites.get(route.siteA);
    const b = sites.get(route.siteB);
    if (!a || !b) continue;
    const geometry = routeGeometry(route, a, b);
    z.segments.push(...geometry.segments);
    const mid = geometry.mid;
    z.circles.push({ ...mid, r: C.routeMid });
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const n = { x: (a.y - b.y) / len, y: (b.x - a.x) / len };
    if (route.kind === "bridge") {
      z.segments.push({ a: { x: mid.x - n.x * RIVER_HALF, y: mid.y - n.y * RIVER_HALF }, b: { x: mid.x + n.x * RIVER_HALF, y: mid.y + n.y * RIVER_HALF } });
    }
    if (route.kind === "pass") {
      // The middle 90% of each side, where passRidges stands its peaks.
      for (const side of [-1, 1]) {
        const o = { x: n.x * PASS_OFFSET * side, y: n.y * PASS_OFFSET * side };
        z.segments.push({
          a: { x: mid.x + (a.x - mid.x) * 0.45 + o.x, y: mid.y + (a.y - mid.y) * 0.45 + o.y },
          b: { x: mid.x + (b.x - mid.x) * 0.45 + o.x, y: mid.y + (b.y - mid.y) * 0.45 + o.y },
        });
      }
    }
  }
  return z;
}

function blocked(p: Pt, r: number, z: Zones): boolean {
  for (const c of z.circles) if (Math.hypot(p.x - c.x, p.y - c.y) < c.r + r) return true;
  for (const q of z.rects) {
    const dx = Math.max(q.x0 - p.x, 0, p.x - q.x1);
    const dy = Math.max(q.y0 - p.y, 0, p.y - q.y1);
    if (Math.hypot(dx, dy) < r) return true;
  }
  for (const s of z.segments) if (segmentDistance(p, s.a, s.b) < CLEARANCE.route + r) return true;
  return false;
}

// ------------------------------------------------------------------ path templates

const r1 = (v: number) => Math.round(v * 10) / 10;

interface Place {
  x: number;
  y: number;
  s: number;
  /** Mirror horizontally. */
  flip: boolean;
  /** Rotation in radians, applied before scaling. */
  rot?: number;
}

/** A point in motif space moved into place. */
function tp(at: Place, lx: number, ly: number): Pt {
  const cos = Math.cos(at.rot ?? 0);
  const sin = Math.sin(at.rot ?? 0);
  const fx = at.flip ? -lx : lx;
  return { x: at.x + (fx * cos - ly * sin) * at.s, y: at.y + (fx * sin + ly * cos) * at.s };
}

/** A template of absolute M/L/Q/C/Z commands in motif space, moved into place. */
function place(tpl: string, at: Place): string {
  let pending: number | null = null;
  let out = "";
  for (const tok of tpl.match(/[MLQCZ]|-?\d*\.?\d+/g) ?? []) {
    if (/[MLQCZ]/.test(tok)) {
      out += tok;
      continue;
    }
    if (pending === null) {
      pending = Number(tok);
      continue;
    }
    const p = tp(at, pending, Number(tok));
    out += `${/[MLQC]$/.test(out) ? "" : " "}${r1(p.x)},${r1(p.y)}`;
    pending = null;
  }
  return out;
}

function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  return `M${r1(cx - rx)},${r1(cy)}a${r1(rx)},${r1(ry)} 0 1,0 ${r1(2 * rx)},0a${r1(rx)},${r1(ry)} 0 1,0 ${r1(-2 * rx)},0Z`;
}

/** A circle in motif space. */
function dot(at: Place, cx: number, cy: number, r: number): string {
  const p = tp(at, cx, cy);
  return ellipse(p.x, p.y, r * at.s, r * at.s);
}

/** Ground shadow, cast down and to the right like every piece's. */
function shadow(at: Place, rx: number, ry: number, dy = 5): string {
  return ellipse(at.x + 2.5 * at.s, at.y + dy * at.s, rx * at.s, ry * at.s);
}

type Emit = (ink: string, d: string) => void;

// Motif art. Local space: about 20 units across, ground near y = +5.
const PRISM = "M0,-12 L3,-8.5 L3,3 L0,5 L-3,3 L-3,-8.5 Z";
const PRISM_LIGHT = "M0,-12 L0,5 L-3,3 L-3,-8.5 Z";
// One cloud-shaped outline per crown: far fewer segments than stacked circles,
// which keeps every raster tile the crown touches cheap.
const CROWN = "M-9.5,-1 Q-10.5,-7.5 -5,-8.6 Q-4,-15 1,-15 Q6.4,-14.6 6.6,-9 Q10.8,-7 9.8,-1.6 Q9.4,3 4.4,2.4 Q0,4.4 -4.4,2.4 Q-9.4,3 -9.5,-1 Z";
const CONIFER = "M0,-15 L5.5,-7.5 L3,-7.5 L7.5,-1 L4.5,-1 L8.5,5 L-8.5,5 L-4.5,-1 L-7.5,-1 L-3,-7.5 L-5.5,-7.5 Z";

const MOTIFS: Record<MotifKind, { r: number; draw: (at: Place, emit: Emit, rng: () => number) => void }> = {
  round_tree: {
    r: 10,
    draw(at, emit) {
      emit("shadow", shadow(at, 8, 2.8, 6));
      emit("trunk", place("M-1.4,6 L-1,-1 L1,-1 L1.4,6 Z", at));
      emit("under", place(CROWN, { ...at, x: at.x + 0.9 * at.s, y: at.y + 1.1 * at.s }));
      emit("crown", place(CROWN, at));
      emit("light", place("M-5.6,-8.6 Q-5,-12.8 -0.8,-13.2 Q-3.4,-11.4 -3.6,-7.8 Z", at));
    },
  },
  conifer: {
    r: 10,
    draw(at, emit) {
      emit("shadow", shadow(at, 8, 2.6, 7));
      emit("trunk", place("M-1.3,8 L-1.3,4 L1.3,4 L1.3,8 Z", at));
      emit("under", place(CONIFER, { ...at, x: at.x + 0.9 * at.s, y: at.y + 1 * at.s }));
      emit("crown", place(CONIFER, at));
      emit("light", place("M0,-15 L-5.5,-7.5 L-3,-7.5 L-1,-11 Z M-2.6,-5.6 L-7.5,-1 L-4.5,-1 L-1.2,-4 Z M-3.4,1.4 L-8.5,5 L-3,5 Z", at));
    },
  },
  stook: {
    r: 8,
    draw(at, emit) {
      emit("shadow", shadow(at, 6.5, 2.2, 5));
      emit("body", place("M-6,5 Q-4,0 -3,-2 L-5,-8 Q-2,-11 0,-8 Q2,-11 5,-8 L3,-2 Q4,1 6,5 Q0,7 -6,5 Z", at));
      emit("light", place("M-4,-8 Q-2,-10 -1,-7 L-1,-2 L-3,5 L-5,5 L-2,-2 Z", at));
      emit("detail", place("M-3.5,-1 Q0,1 3.5,-1 M-3.5,0.8 Q0,2 3.5,0.8 M0,-7 L0,-2 M-2,3 L-3,5 M2,3 L3,5", at));
    },
  },
  haystack: {
    r: 9,
    draw(at, emit) {
      emit("shadow", shadow(at, 8, 2.4, 4.5));
      emit("body", place("M-8,4.5 Q-8,-4 -2,-7 Q1,-10 4,-6 Q8,-4 8,4.5 Q0,7 -8,4.5 Z", at));
      emit("light", place("M-6.4,1 Q-6.4,-4.6 -1,-5.8 Q-4.2,-2.8 -4.2,1.8 Z", at));
      emit("detail", place("M-6,-0.6 Q0,-2.4 6,-0.6 M-7,3 Q0,1 7,3 M-2,-5 l-1,2 M2,-5 l1,2", at));
    },
  },
  boulder: {
    r: 10,
    draw(at, emit, rng) {
      emit("shadow", shadow(at, 9, 2.8, 4.5));
      emit("body", place("M-8,4 L-8.6,-1 L-4,-6 L3,-6.6 L8,-1.2 L7,4 Z", at));
      emit("light", place("M-4,-6 L3,-6.6 L1,-2 L-5.6,-1.4 Z", at));
      emit("detail", place("M1,-2 L2.4,1.8 M1,-2 L7.6,-1", at));
      if (rng() < 0.6) {
        const small = { ...at, x: at.x + 8 * at.s * (at.flip ? -1 : 1), y: at.y + 2.5 * at.s, s: at.s * 0.5 };
        emit("body", place("M-8,4 L-8.6,-1 L-4,-6 L3,-6.6 L8,-1.2 L7,4 Z", small));
        emit("light", place("M-4,-6 L3,-6.6 L1,-2 L-5.6,-1.4 Z", small));
      }
    },
  },
  mound: {
    r: 12,
    draw(at, emit) {
      emit("mound", place("M-12,5 Q-8,-7.5 0,-7.5 Q8,-7.5 12,5 Z", at));
      emit("light", place("M-9.2,1.4 Q-6.4,-5.2 0,-5.6 Q-5,-3.2 -6,2.4 Z", at));
      emit("detail", place("M-3,3 L-2,0.6 M-1,3 L-1.2,0.8 M4,2.8 L5,0.8", at));
    },
  },
  peak: {
    r: 12,
    draw(at, emit) {
      emit("shadow", shadow(at, 11, 2.6, 5));
      emit("body", place("M-12,5 L-4,-8 L-0.8,-2.8 L3,-13 L12,5 Z", at));
      emit("light", place("M-12,5 L-4,-8 L-5.6,5 Z M3,-13 L-0.8,-2.8 L-2,5 L4.6,5 Z", at));
      emit("snow", place("M3,-13 L5,-8.8 L3.4,-9.6 L2,-8.2 L1.2,-9.2 Z M-4,-8 L-2.6,-5.6 L-3.8,-6.2 L-5,-5.4 Z", at));
    },
  },
  mine: {
    r: 12,
    draw(at, emit) {
      emit("shadow", shadow(at, 11, 2.6, 5));
      emit("body", place("M-11,5 Q-9,-8.5 0,-8.5 Q9,-8.5 11,5 Z", at));
      emit("light", place("M-9,1 Q-7,-6.4 -1,-7.2 Q-6,-4.4 -6.4,2 Z", at));
      emit("hole", place("M-4,5 L-4,-0.5 Q-4,-4.6 0,-4.6 Q4,-4.6 4,-0.5 L4,5 Z", at));
      emit("detail", place("M-4.6,5 L-4.6,-1.2 M4.6,5 L4.6,-1.2 M-6,-1.8 L6,-1.8 M4,5 L12,7.4", at));
    },
  },
  crystals: {
    r: 10,
    draw(at, emit) {
      emit("shadow", shadow(at, 8.5, 2.6, 5.5));
      const prisms: Place[] = [
        { ...at, x: at.x - 4.6 * at.s, y: at.y + 1.2 * at.s, s: at.s * 0.72, rot: -0.38 },
        { ...at, x: at.x + 4.4 * at.s, y: at.y + 1.6 * at.s, s: at.s * 0.62, rot: 0.42 },
        at,
      ];
      for (const p of prisms) {
        emit("body", place(PRISM, p));
        emit("light", place(PRISM_LIGHT, p));
      }
    },
  },
  toadstools: {
    r: 9,
    draw(at, emit, rng) {
      const caps: Place[] = [at];
      if (rng() < 0.7) caps.unshift({ ...at, x: at.x + 6.5 * at.s * (at.flip ? -1 : 1), y: at.y + 1.5 * at.s, s: at.s * 0.62 });
      emit("shadow", shadow(at, 8, 2.2, 5));
      for (const c of caps) {
        emit("stem", place("M-1.7,5 L-1.2,-1.6 L1.2,-1.6 L1.7,5 Z", c));
        emit("cap", place("M-6,-0.6 Q-6.6,-8.4 0,-8.8 Q6.6,-8.4 6,-0.6 Z", c));
        emit("dots", dot(c, -2.6, -4.6, 1.1));
        emit("dots", dot(c, 1.8, -6.2, 0.9));
        emit("dots", dot(c, 3.4, -2.8, 0.8));
      }
    },
  },
  menhir: {
    r: 8,
    draw(at, emit) {
      emit("shadow", shadow(at, 6, 2.2, 5));
      emit("menhir", place("M-3,5 L-3.4,-7 Q0,-10.5 3.4,-7 L3,5 Z", at));
      emit("light", place("M-3.4,-7 Q-1.8,-9.4 -0.4,-9.6 L-1,4.6 L-2.9,4.6 Z", at));
      emit("sparkle", place("M0.8,-4.6 L1.4,-3 L3,-2.4 L1.4,-1.8 L0.8,-0.2 L0.2,-1.8 L-1.4,-2.4 L0.2,-3 Z", at));
    },
  },
  sparkle: {
    r: 5,
    draw(at, emit) {
      emit("sparkle", place("M0,-4.5 L1,-1 L4.5,0 L1,1 L0,4.5 L-1,1 L-4.5,0 L-1,-1 Z", at));
    },
  },
};

// ------------------------------------------------------------------ per-resource recipes

interface Recipe {
  /** Motif kinds and their relative weights. */
  kinds: [MotifKind, number][];
  /** A kind placed once per Region before the rest (e.g. the mine mouth). */
  feature?: MotifKind;
  /** Centre spacing as a multiple of the two footprints (below 1 overlaps). */
  pack: number;
  /** Dart-throwing attempts per 1000 square units of Region. */
  tries: number;
  /** Gather motifs around a few Region-local centres (groves, outcrops). */
  clusters?: { count: number; radius: number };
  /** Furrowed field rows. */
  rows?: boolean;
  /** Most motifs per Region. */
  max: number;
}

const RECIPES: Record<ResourceType, Recipe> = {
  timber: {
    kinds: [
      ["round_tree", 3],
      ["conifer", 2],
    ],
    pack: 0.78,
    tries: 14,
    clusters: { count: 3, radius: 70 },
    max: 46,
  },
  grain: {
    kinds: [
      ["stook", 3],
      ["haystack", 1],
    ],
    pack: 2.6,
    tries: 3,
    rows: true,
    max: 7,
  },
  stone: {
    kinds: [
      ["boulder", 3],
      ["mound", 2],
    ],
    pack: 1.05,
    tries: 9,
    clusters: { count: 3, radius: 90 },
    max: 22,
  },
  iron: { kinds: [["peak", 1]], feature: "mine", pack: 0.95, tries: 8, clusters: { count: 3, radius: 75 }, max: 18 },
  essence: {
    kinds: [
      ["crystals", 3],
      ["toadstools", 3],
      ["menhir", 1],
      ["sparkle", 3],
    ],
    pack: 1.25,
    tries: 6,
    max: 22,
  },
};

function pickKind(kinds: [MotifKind, number][], rng: () => number): MotifKind {
  const total = kinds.reduce((a, [, w]) => a + w, 0);
  let roll = rng() * total;
  for (const [k, w] of kinds) {
    roll -= w;
    if (roll <= 0) return k;
  }
  return kinds[0]![0];
}

interface Ctx {
  poly: Pt[];
  coast: Pt[];
  /** Shore segments near this Region, for the cheap distance check. */
  shore: { a: Pt; b: Pt }[];
  /** Keep-out zones near this Region. */
  zones: Zones;
}

/** Whether a motif of radius `r` at `p` fits: inside its Region and the shore, clear of every zone. */
function fits(p: Pt, r: number, c: Ctx): boolean {
  if (!inside(p, c.poly) || edgeDistance(p, c.poly) < r + 2) return false;
  if (blocked(p, r, c.zones)) return false;
  for (const s of c.shore) if (segmentDistance(p, s.a, s.b) < r + CLEARANCE.shore) return false;
  return inside(p, c.coast);
}

/** The context for one Region, with the shore and zones cut down to what can matter there. */
function regionCtx(region: RegionDefinition, coast: Pt[], zones: Zones): Ctx {
  const poly = polygonPoints(region.path);
  const b = bounds(poly);
  const M = 60;
  const near = (x0: number, y0: number, x1: number, y1: number) => x1 >= b.x0 - M && x0 <= b.x1 + M && y1 >= b.y0 - M && y0 <= b.y1 + M;
  const shore: Ctx["shore"] = [];
  for (let i = 0, j = coast.length - 1; i < coast.length; j = i++) {
    const a = coast[j]!;
    const e = coast[i]!;
    if (near(Math.min(a.x, e.x), Math.min(a.y, e.y), Math.max(a.x, e.x), Math.max(a.y, e.y))) shore.push({ a, b: e });
  }
  return {
    poly,
    coast,
    shore,
    zones: {
      circles: zones.circles.filter((c) => near(c.x - c.r, c.y - c.r, c.x + c.r, c.y + c.r)),
      rects: zones.rects.filter((q) => near(q.x0, q.y0, q.x1, q.y1)),
      segments: zones.segments.filter((s) => near(Math.min(s.a.x, s.b.x), Math.min(s.a.y, s.b.y), Math.max(s.a.x, s.b.x), Math.max(s.a.y, s.b.y))),
    },
  };
}

function scatter(region: RegionDefinition, recipe: Recipe, c: Ctx, rng: () => number): Motif[] {
  const b = bounds(c.poly);
  const area = Math.abs(signedArea(c.poly));
  const out: Motif[] = [];
  const centres: Pt[] = [];
  if (recipe.clusters) {
    for (let i = 0; i < 40 && centres.length < recipe.clusters.count; i++) {
      const p = { x: b.x0 + rng() * (b.x1 - b.x0), y: b.y0 + rng() * (b.y1 - b.y0) };
      if (inside(p, c.poly)) centres.push(p);
    }
  }
  const density = (p: Pt) => {
    if (!recipe.clusters || centres.length === 0) return 1;
    const R = recipe.clusters.radius;
    return Math.max(...centres.map((q) => 1 - Math.hypot(p.x - q.x, p.y - q.y) / R)) * 1.6;
  };
  const tryPlace = (kind: MotifKind, attempts: number, distribution: "clustered" | "uniform" = "clustered") => {
    for (let i = 0; i < attempts && out.length < recipe.max; i++) {
      const p = { x: b.x0 + rng() * (b.x1 - b.x0), y: b.y0 + rng() * (b.y1 - b.y0) };
      const s = 0.85 + rng() * 0.3;
      const r = MOTIFS[kind].r * s;
      if (rng() > (distribution === "uniform" ? 1 : density(p))) continue;
      if (out.some((m) => Math.hypot(m.x - p.x, m.y - p.y) < (m.r + r) * recipe.pack)) continue;
      if (!fits(p, r, c)) continue;
      out.push({ regionId: region.id, kind, x: r1(p.x), y: r1(p.y), r });
      return true;
    }
    return false;
  };
  if (recipe.feature) tryPlace(recipe.feature, 400);
  const tries = Math.round((area / 1000) * recipe.tries);
  for (let i = 0; i < tries && out.length < recipe.max; i++) tryPlace(pickKind(recipe.kinds, rng), 1);
  // Bays can leave usable pockets outside the random clusters. Give sparse
  // Regions a bounded, uniform pass, preserving all gameplay clearances.
  for (let i = 0; i < 800 && out.length < 2; i++) tryPlace(pickKind(recipe.kinds, rng), 1, "uniform");
  return out;
}

/** The parameter intervals where the line o + t·u runs inside the polygon. */
function crossings(o: Pt, u: Pt, poly: readonly Pt[]): [number, number][] {
  const ts: number[] = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j]!;
    const e = { x: poly[i]!.x - a.x, y: poly[i]!.y - a.y };
    const den = u.x * e.y - u.y * e.x;
    if (Math.abs(den) < 1e-9) continue;
    const wx = a.x - o.x;
    const wy = a.y - o.y;
    const s = (wx * u.y - wy * u.x) / den;
    if (s < 0 || s >= 1) continue;
    ts.push((wx * e.y - wy * e.x) / den);
  }
  ts.sort((x, y) => x - y);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < ts.length; i += 2) out.push([ts[i]!, ts[i + 1]!]);
  return out;
}

/**
 * Furrows: parallel dashes at a Region-specific angle, in two patches split
 * through the label point so the field reads as a patchwork.
 */
function furrows(region: RegionDefinition, c: Ctx, motifs: Motif[], rng: () => number): string {
  const SPACING = 11;
  const STEP = 3;
  const b = bounds(c.poly);
  const theta = (rng() - 0.5) * 1.6;
  const split = theta + Math.PI / 2 + (rng() - 0.5) * 0.8;
  const patches = [theta, theta + 1.1 + rng() * 0.5];
  const cx = region.labelX;
  const cy = region.labelY;
  const diag = Math.hypot(b.x1 - b.x0, b.y1 - b.y0);
  const ok = (p: Pt) => fits(p, 2, c) && !motifs.some((m) => Math.hypot(m.x - p.x, m.y - p.y) < m.r + 2);
  let d = "";
  patches.forEach((angle, patch) => {
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const side = (p: Pt) => ((p.x - cx) * Math.cos(split) + (p.y - cy) * Math.sin(split) > 0 ? 0 : 1);
    for (let off = -diag / 2; off <= diag / 2; off += SPACING) {
      // Row through (cx, cy) + off * normal, walked along its direction.
      const ox = cx - uy * off;
      const oy = cy + ux * off;
      let run: Pt[] = [];
      const flush = () => {
        if (run.length >= 4) d += `M${r1(run[0]!.x)},${r1(run[0]!.y)}L${r1(run.at(-1)!.x)},${r1(run.at(-1)!.y)}`;
        run = [];
      };
      let dashLeft = 18 + rng() * 26;
      for (const [t0, t1] of crossings({ x: ox, y: oy }, { x: ux, y: uy }, c.poly)) {
        for (let t = t0 + STEP; t <= t1 - STEP; t += STEP) {
          const p = { x: ox + ux * t, y: oy + uy * t };
          if (side(p) !== patch || !ok(p)) {
            flush();
            continue;
          }
          run.push(p);
          dashLeft -= STEP;
          if (dashLeft <= 0) {
            flush();
            dashLeft = 18 + rng() * 26;
            t += 4 + rng() * 8;
          }
        }
        flush();
      }
    }
  });
  return d;
}

// ------------------------------------------------------------------ build

function build(map: MapDefinition): TerrainArt {
  const coast = polygonPoints(map.coastline);
  const zones = keepOutZones(map);
  const motifs: Motif[] = [];
  // Paths are merged per Region and ink rather than across the whole map: a
  // path's bounds decide which raster tiles must redraw it, so island-wide
  // paths would make every tile repaint every motif whenever anything on
  // the board animates.
  const paths = new Map<string, string[]>();
  const emitFor =
    (regionId: string): Emit =>
    (ink, d) => {
      const key = `${regionId}.${ink}`;
      const list = paths.get(key) ?? [];
      list.push(d);
      paths.set(key, list);
    };

  for (const region of map.regions) {
    const rng = artRng(`${map.id}:${region.id}`);
    const c = regionCtx(region, coast, zones);
    const recipe = RECIPES[region.resource];
    const placed = scatter(region, recipe, c, rng);
    const emit = emitFor(region.id);
    if (recipe.rows) emit("furrow", furrows(region, c, placed, rng));
    for (const m of placed) {
      const at: Place = { x: m.x, y: m.y, s: m.r / MOTIFS[m.kind].r, flip: rng() < 0.5 };
      MOTIFS[m.kind].draw(at, emit, rng);
    }
    motifs.push(...placed);
  }

  const layers: TerrainLayer[] = [];
  for (const region of map.regions) {
    for (const [ink, style] of Object.entries(TERRAIN_INKS[region.resource]) as [string, InkStyle][]) {
      const d = paths.get(`${region.id}.${ink}`)?.join("");
      if (d) layers.push({ id: `${region.id}.${ink}`, d, style });
    }
  }
  const sites = new Map(map.sites.map((site) => [site.id, site]));
  const water: string[] = [];
  const shine: string[] = [];
  const ridges: [string, string] = ["", ""];
  for (const route of map.routes) {
    const a = sites.get(route.siteA);
    const b = sites.get(route.siteB);
    if (!a || !b) continue;
    if (route.kind === "bridge") {
      const [w, h] = riverAcross(a, b);
      water.push(w);
      shine.push(h);
    }
    if (route.kind === "pass") {
      const [rock, lit] = passRidges(a, b);
      ridges[0] += rock;
      ridges[1] += lit;
    }
  }
  return { motifs, layers, edges: map.regions.map((r) => r.path).join(""), streams: [water.join(""), shine.join("")], ridges };
}

const cache = new WeakMap<MapDefinition, TerrainArt>();

/** The terrain illustration for a map, computed once per map object. */
export function terrainArt(map: MapDefinition): TerrainArt {
  let art = cache.get(map);
  if (!art) {
    art = build(map);
    cache.set(map, art);
  }
  return art;
}
