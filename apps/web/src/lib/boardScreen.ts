// Where things are on screen, for effects drawn outside the board's SVG:
// board coordinates to client pixels, and the counters tokens fly into.

import type { PlayerId, ResourceType } from "@manors-menaces/rules";
import type { Point } from "./game/harvestFlights.js";

/**
 * Board units to client pixels. Read from a layer inside the board's camera,
 * so it holds however the camera is implemented (viewBox or a transform).
 */
export function boardMatrix(): DOMMatrix | null {
  const layer = document.querySelector<SVGGraphicsElement>("svg.board .layer-regions");
  return layer?.getScreenCTM() ?? null;
}

export function boardToClient(p: Point): Point | null {
  const m = boardMatrix();
  if (!m) return null;
  const q = new DOMPoint(p.x, p.y).matrixTransform(m);
  return { x: q.x, y: q.y };
}

function onScreen(el: Element): boolean {
  if (el.closest("[inert]")) return false;
  if (typeof el.checkVisibility === "function" && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
}

/**
 * Where a resource token for this player lands: their counter for that
 * resource if one is on screen, else anything standing for the player (their
 * card, their feed toast). Null when nothing is visible.
 */
export function landingPoint(playerId: PlayerId, resource: ResourceType): Point | null {
  const counters = document.querySelectorAll(`[data-res-target="${CSS.escape(`${playerId}:${resource}`)}"]`);
  const players = document.querySelectorAll(`[data-player-target="${CSS.escape(playerId)}"]`);
  for (const el of [...counters, ...players]) {
    if (!onScreen(el)) continue;
    const r = el.getBoundingClientRect();
    // A counter: its icon, at the left. Anything else: its middle.
    const x = el.hasAttribute("data-res-target") ? r.left + Math.min(r.width, r.height) / 2 : r.left + r.width / 2;
    return { x, y: r.top + r.height / 2 };
  }
  return null;
}
